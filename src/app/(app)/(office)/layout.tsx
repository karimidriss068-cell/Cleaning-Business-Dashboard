import { redirect } from "next/navigation";
import { getMember } from "@/lib/member";

// Office screens are for the owner, admins and staff. A crew login that types
// an office address lands on its own screen instead; the database refuses
// their reads regardless (RLS), this just keeps the experience clean.
export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getMember();
  if (!user) redirect("/login");
  if (profile?.role === "subcontractor") redirect("/my-jobs");
  return children;
}
