import Link from "next/link";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { NewCampaignDialog } from "@/components/forms/new-campaign-dialog";
import { SyncMetaButton } from "@/components/forms/sync-meta-button";
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

export default async function CampaignsPage() {
  const supabase = await createClient();

  const [{ data: campaigns }, { data: accounts }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, account:accounts(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("accounts").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHeader title="Campaigns" description="All campaigns across accounts.">
        <div className="flex gap-2">
          <SyncMetaButton />
          <NewCampaignDialog accounts={accounts ?? []} />
        </div>
      </PageHeader>

      <StaggerPage>
        <FadeInSection>
        <CardShell className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Daily budget</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Megaphone}
                      title="No campaigns yet"
                      description={
                        (accounts ?? []).length === 0
                          ? "Create an account first, then launch a campaign under it."
                          : "Launch your first campaign to start tracking spend, inquiries, and consults."
                      }
                      action={
                        (accounts ?? []).length > 0 ? (
                          <NewCampaignDialog accounts={accounts ?? []} />
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {(campaigns ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.account ? (
                      <Link
                        href={`/accounts/${c.account.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {c.account.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {c.platform}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(c.budget_daily)}
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
