import { StatusPill } from "@/components/system/status-pill";

/** Shown while demo rows (ids starting 5eed0000-) are in the database; gone with the purge. */
export function DemoDataPill() {
  return (
    <span title="Some numbers come from demo data (seeded customers, leads, invoices or ad spend). They are not real results and disappear when the demo data is purged.">
      <StatusPill tone="warning">Includes demo data</StatusPill>
    </span>
  );
}
