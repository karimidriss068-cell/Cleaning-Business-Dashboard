import { redirect } from "next/navigation";
import { getMember } from "@/lib/member";

// Crew screens are for subcontractor logins only; office members belong on the
// Command Center. (A login with no team profile falls through to the page's
// "not on the team yet" message.)
export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getMember();
  if (!user) redirect("/login");
  if (profile && profile.role !== "subcontractor") redirect("/command-center");
  return children;
}
