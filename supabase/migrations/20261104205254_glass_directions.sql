-- Five Glass color schemes (code.xr Admin Dashboard V2 direction). Glass Cyan
-- becomes the default for new members; existing rows keep what they saved.
alter table public.user_preferences drop constraint if exists user_preferences_direction_check;
alter table public.user_preferences add constraint user_preferences_direction_check
  check (direction in ('glass-cyan-dark', 'glass-ice-light', 'glass-titanium', 'glass-midnight-violet', 'glass-emerald', 'vault', 'titanium', 'ocean', 'midnight'));
alter table public.user_preferences alter column direction set default 'glass-cyan-dark';
