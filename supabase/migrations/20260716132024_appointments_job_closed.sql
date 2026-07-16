-- Phase 1 of the job-closed revenue loop: whether a booked appointment
-- actually became a paid job, and for how much. Collected via a follow-up
-- SMS (see /api/webhooks/job-followup-send + job-followup-reply) a few days
-- after the appointment date, not assumed from appointment status alone.
alter table appointments add column job_closed boolean;
alter table appointments add column job_revenue numeric;
alter table appointments add column closed_recorded_at timestamptz;
-- Gates the follow-up SMS to at most one send per appointment.
alter table appointments add column follow_up_sent_at timestamptz;

create index appointments_followup_pending_idx on appointments (status, appointment_date)
  where job_closed is null;
