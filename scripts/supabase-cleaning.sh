#!/bin/zsh
# Runs a Supabase CLI command that only supports --linked (db push, db query,
# db advisors, ...) against the cleaning project, never anything else.
# Re-links with the ref named explicitly, verifies the link, then runs.
#
#   scripts/supabase-cleaning.sh db advisors --type security --level info
set -e
REF=lijsaulkeaqlriwqgxty
cd "$(dirname "$0")/.."
supabase link --project-ref "$REF" </dev/null >/dev/null 2>&1
linked=$(cat supabase/.temp/project-ref)
if [[ "$linked" != "$REF" ]]; then
  echo "ABORT: linked ref is '$linked', expected $REF" >&2
  exit 1
fi
echo "[target verified: $linked]" >&2
supabase "$@" --linked 2>&1 | grep -v -e "new version of Supabase CLI" -e "recommend updating"
exit ${pipestatus[1]}
