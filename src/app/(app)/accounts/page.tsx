import Link from "next/link";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { NewAccountDialog } from "@/components/forms/new-account-dialog";
import { EmptyState } from "@/components/empty-state";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";
import { CardShell } from "@/components/dashboard/card-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Internal and client accounts."
      >
        <NewAccountDialog />
      </PageHeader>

      <StaggerPage>
        <FadeInSection>
        <CardShell className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead className="text-right">Price / appt</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accounts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Building2}
                      title="No accounts yet"
                      description="Accounts are where campaigns, spend, and appointments roll up — internal or client. Create your first one to start tracking."
                      action={<NewAccountDialog />}
                    />
                  </TableCell>
                </TableRow>
              )}
              {(accounts ?? []).map((a) => (
                <TableRow key={a.id} className="group">
                  <TableCell className="font-medium">
                    <Link
                      href={`/accounts/${a.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {a.type}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.niche ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(a.price_per_appointment)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {shortDate(a.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardShell>
        </FadeInSection>
      </StaggerPage>
    </>
  );
}
