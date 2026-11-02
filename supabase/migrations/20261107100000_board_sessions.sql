-- Roast Room (/board): saved sessions of AI advisors critiquing a business question.
-- Owner/admin read only; every write is a function (require_admin, one transaction, a finance_log row).
-- The model calls themselves go through callModel() in the app and are metered in ai_usage; this table
-- only keeps the result and what the session cost.

alter table public.finance_log drop constraint finance_log_entity_check;
alter table public.finance_log add constraint finance_log_entity_check
  check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings', 'growth', 'ghl', 'ai', 'board'));

create table public.board_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  question text not null check (length(btrim(question)) > 0 and length(question) <= 4000),
  advisors text[] not null check (cardinality(advisors) between 1 and 8),
  rounds smallint not null check (rounds between 1 and 2),
  use_context boolean not null default false,
  -- sha256 of the whole input (question, advisors, rounds, context), for the 24-hour repeat cache.
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  -- done: advisors and synthesis finished; partial: stopped early (a cap, the kill switch or a provider error).
  status text not null check (status in ('done', 'partial')),
  advisor_outputs jsonb not null default '[]',
  synthesis jsonb,
  est_micros bigint not null check (est_micros >= 0),
  cost_micros bigint not null check (cost_micros >= 0),
  run_id uuid,
  logged_decision_id uuid references public.growth_decisions (id) on delete set null
);
create index board_sessions_hash_idx on public.board_sessions (input_hash, created_at desc);
create index board_sessions_created_idx on public.board_sessions (created_at desc);
create index board_sessions_created_by_idx on public.board_sessions (created_by);
create index board_sessions_decision_idx on public.board_sessions (logged_decision_id);

alter table public.board_sessions enable row level security;
revoke all on public.board_sessions from anon;
revoke insert, update, delete on public.board_sessions from authenticated;
create policy "board_sessions: admin read" on public.board_sessions for select to authenticated using ((select private.is_admin()));

create function private.save_board_session(
  p_question text, p_advisors text[], p_rounds integer, p_use_context boolean, p_input_hash text, p_status text,
  p_advisor_outputs jsonb, p_synthesis jsonb, p_est_micros bigint, p_cost_micros bigint, p_run_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_question is null or length(btrim(p_question)) = 0 or length(p_question) > 4000
     or p_advisors is null or cardinality(p_advisors) not between 1 and 8 or p_rounds not between 1 and 2
     or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$' or p_status not in ('done', 'partial')
     or p_est_micros is null or p_est_micros < 0 or p_cost_micros is null or p_cost_micros < 0 then
    raise exception 'that session is not valid' using errcode = 'KC005';
  end if;
  insert into public.board_sessions (created_by, question, advisors, rounds, use_context, input_hash, status, advisor_outputs, synthesis, est_micros, cost_micros, run_id)
  values ((select auth.uid()), btrim(p_question), p_advisors, p_rounds, coalesce(p_use_context, false), p_input_hash, p_status,
          coalesce(p_advisor_outputs, '[]'), p_synthesis, p_est_micros, p_cost_micros, p_run_id)
  returning id into v_id;
  perform private.log_finance('board', v_id, 'session_saved', jsonb_build_object('status', p_status, 'advisors', p_advisors, 'rounds', p_rounds, 'cost_micros', p_cost_micros));
  return v_id;
end;
$$;

create function private.delete_board_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.board_sessions where id = p_id;
  if not found then
    raise exception 'that session was already removed' using errcode = 'KC001';
  end if;
  perform private.log_finance('board', p_id, 'session_deleted', '{}');
end;
$$;

-- Writes the session's verdict summary and the chosen next action to the Go/No-go decision log
-- (growth_decisions). The summary comes from the saved synthesis, never from the browser, so the
-- log can only hold what the advisors actually said. Once per session.
create function private.log_board_decision(p_session_id uuid, p_action_index integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.board_sessions;
  v_action text;
  v_verdict text;
  v_id uuid;
begin
  perform private.require_admin();
  select * into s from public.board_sessions where id = p_session_id for update;
  if not found then
    raise exception 'that session no longer exists' using errcode = 'KC001';
  end if;
  if s.logged_decision_id is not null then
    raise exception 'this session is already in the decision log' using errcode = 'KC010';
  end if;
  if s.status <> 'done' or s.synthesis is null or jsonb_typeof(s.synthesis -> 'actions') <> 'array' then
    raise exception 'only a finished session with a synthesis can be logged' using errcode = 'KC004';
  end if;
  if p_action_index is null or p_action_index < 0 or p_action_index >= jsonb_array_length(s.synthesis -> 'actions') then
    raise exception 'pick one of the suggested actions' using errcode = 'KC005';
  end if;
  v_action := btrim(s.synthesis -> 'actions' -> p_action_index ->> 'title');
  v_verdict := btrim(coalesce(s.synthesis ->> 'verdict', ''));
  if v_action is null or v_action = '' or v_verdict = '' then
    raise exception 'that synthesis has no usable summary' using errcode = 'KC004';
  end if;
  insert into public.growth_decisions (decided_on, kind, note, decision, created_by)
  values ((now() at time zone 'America/New_York')::date, 'general',
          left('Roast Room (AI advisors, not real people): ' || v_verdict, 2000), left(v_action, 300), (select auth.uid()))
  returning id into v_id;
  update public.board_sessions set logged_decision_id = v_id where id = p_session_id;
  perform private.log_finance('growth', v_id, 'decision_logged', jsonb_build_object('kind', 'general', 'decision', left(v_action, 300), 'source', 'board', 'session_id', p_session_id));
  perform private.log_finance('board', p_session_id, 'decision_logged', jsonb_build_object('decision_id', v_id));
  return v_id;
end;
$$;

create function public.save_board_session(
  p_question text, p_advisors text[], p_rounds integer, p_use_context boolean, p_input_hash text, p_status text,
  p_advisor_outputs jsonb, p_synthesis jsonb, p_est_micros bigint, p_cost_micros bigint, p_run_id uuid default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.save_board_session(p_question, p_advisors, p_rounds, p_use_context, p_input_hash, p_status, p_advisor_outputs, p_synthesis, p_est_micros, p_cost_micros, p_run_id) $$;
create function public.delete_board_session(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_board_session(p_id) $$;
create function public.log_board_decision(p_session_id uuid, p_action_index integer)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.log_board_decision(p_session_id, p_action_index) $$;

revoke execute on function
  private.save_board_session(text, text[], integer, boolean, text, text, jsonb, jsonb, bigint, bigint, uuid),
  private.delete_board_session(uuid), private.log_board_decision(uuid, integer),
  public.save_board_session(text, text[], integer, boolean, text, text, jsonb, jsonb, bigint, bigint, uuid),
  public.delete_board_session(uuid), public.log_board_decision(uuid, integer)
  from public, anon;
grant execute on function
  private.save_board_session(text, text[], integer, boolean, text, text, jsonb, jsonb, bigint, bigint, uuid),
  private.delete_board_session(uuid), private.log_board_decision(uuid, integer),
  public.save_board_session(text, text[], integer, boolean, text, text, jsonb, jsonb, bigint, bigint, uuid),
  public.delete_board_session(uuid), public.log_board_decision(uuid, integer)
  to authenticated;
