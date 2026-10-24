import {
  CalendarDays,
  ClipboardCheck,
  Gauge,
  KanbanSquare,
  Megaphone,
  Receipt,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short: string;
  icon: LucideIcon;
  /** Shown as a bottom-bar tab on phones; the rest live under "More". */
  tab?: boolean;
  keywords?: string;
};

/** Office navigation, in DESIGN.md order. */
export const officeNav: NavItem[] = [
  { href: "/command-center", label: "Command Center", short: "Home", icon: Gauge, tab: true, keywords: "dashboard home today" },
  { href: "/leads", label: "Leads & Pipeline", short: "Leads", icon: KanbanSquare, tab: true, keywords: "pipeline quotes prospects" },
  { href: "/schedule", label: "Schedule", short: "Schedule", icon: CalendarDays, tab: true, keywords: "calendar jobs dispatch" },
  { href: "/crews", label: "Crews", short: "Crews", icon: Users, keywords: "subcontractors team cleaners" },
  { href: "/money", label: "Invoices & Payouts", short: "Money", icon: Receipt, tab: true, keywords: "invoices payments payouts billing" },
  { href: "/marketing", label: "Marketing", short: "Marketing", icon: Megaphone, keywords: "campaigns ads" },
  { href: "/automations", label: "Automations", short: "Automations", icon: Workflow, keywords: "workflows texts reminders" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, keywords: "account team integrations" },
];

/** Crew (subcontractor) navigation. The crew view arrives with its own step. */
export const crewNav: NavItem[] = [
  { href: "/my-jobs", label: "My jobs", short: "Jobs", icon: ClipboardCheck, tab: true, keywords: "today schedule" },
];

export type MemberRole = "owner" | "admin" | "staff" | "subcontractor";

export function navFor(role: MemberRole | null): NavItem[] {
  if (role === "subcontractor") return crewNav;
  if (role === null) return [];
  return officeNav;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
