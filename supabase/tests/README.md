# Database behavior tests

Each file is one `do $$ ... $$` block that sets up throwaway rows (users use
`@test.invalid` emails), exercises RLS, triggers and functions as different
roles, then **always rolls back** by raising `RESULTS: ...` as an exception.
The exception text is the test output; any `ALLOWED(BAD)` in it is a failure.

Run one against the cleaning project only:

    scripts/supabase-cleaning.sh db query -f supabase/tests/04_operations.sql

Temporary until the Vitest + local Supabase RLS suite exists (see CLAUDE.md to-do).
