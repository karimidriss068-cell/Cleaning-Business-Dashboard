-- Vault joins the visual directions and becomes the default for new members.
-- Existing rows keep whatever they saved.
alter table public.user_preferences drop constraint if exists user_preferences_direction_check;
alter table public.user_preferences add constraint user_preferences_direction_check
  check (direction in ('vault', 'titanium', 'ocean', 'midnight'));
alter table public.user_preferences alter column direction set default 'vault';
