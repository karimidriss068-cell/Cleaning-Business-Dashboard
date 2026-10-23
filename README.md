# Cleaning Ops

Operations platform for a residential and commercial cleaning company in New York City that works with 1099 subcontractors. Next.js 16 (App Router) on Supabase.

This repo was previously MAKI Ops, which is archived on branch `archive/maki-ops-final`.

Read [CLAUDE.md](CLAUDE.md) first: stack, conventions, the database rules, how to run and test, and the hard rule never to touch the archived MAKI database.

```bash
npm install
cp .env.example .env.local   # fill in the cleaning project's keys
npm run dev                  # http://localhost:3000
```

- Schema: `supabase/migrations/` (applied to `lijsaulkeaqlriwqgxty`)
- Database behavior tests: `supabase/tests/` (see its README)
- Scripts: `scripts/` (owner bootstrap, anon function check, demo seed/purge, linked-CLI wrapper)
