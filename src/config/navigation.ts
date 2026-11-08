import {
  HardHat,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Database,
  Gauge,
  Handshake,
  KanbanSquare,
  Megaphone,
  MessagesSquare,
  Receipt,
  TrendingUp,
  Wallet,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { prototypeRoutesEnabled } from "@/lib/flags";

export type NavItem = {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short: string;
  icon: LucideIcon;
  /** Shown as a bottom-bar tab on phones; the rest live under "More". */
  tab?: boolean;
  /** Owner and admin only (payouts and 1099 data). */
  adminOnly?: boolean;
  /** Sidebar group. */
  section: "Operate" | "Business" | "Crew";
  keywords?: string;
  /** Unplanned prototype screen: hidden from navigation and routing unless NEXT_PUBLIC_PROTOTYPE_ROUTES=1. */
  prototype?: boolean;
};

/** Office navigation, in DESIGN.md order. */
const allOfficeNav: NavItem[] = [
  { href: "/command-center", label: "Command Center", short: "Home", icon: Gauge, tab: true, section: "Operate", keywords: "dashboard home today" },
  { href: "/leads", label: "Pipeline", short: "Pipeline", icon: KanbanSquare, tab: true, section: "Operate", keywords: "pipeline leads bids prospects opportunities" },
  { href: "/projects", label: "Projects", short: "Projects", icon: HardHat, section: "Operate", adminOnly: true, keywords: "projects won jobs contracts milestones deposit profit" },
  { href: "/schedule", label: "Schedule", short: "Schedule", icon: CalendarDays, tab: true, section: "Operate", keywords: "calendar jobs dispatch" },
  { href: "/crews", label: "Crews", short: "Crews", icon: Users, section: "Operate", keywords: "subcontractors team cleaners" },
  { href: "/sales", label: "Sales", short: "Sales", icon: Handshake, section: "Operate", keywords: "dials sms close rate reps bots pipeline forecast", prototype: true },
  { href: "/invoices", label: "Invoices", short: "Invoices", icon: Receipt, tab: true, section: "Business", keywords: "invoices payments billing stripe collect" },
  { href: "/payouts", label: "Payouts", short: "Payouts", icon: Wallet, section: "Business", adminOnly: true, keywords: "payouts pay subcontractors 1099 w-9 zelle" },
  { href: "/growth", label: "Growth", short: "Growth", icon: TrendingUp, section: "Business", keywords: "goal pace milestones ad spend meta cac capacity cash runway scale" },
  { href: "/board", label: "Roast Room", short: "Board", icon: MessagesSquare, section: "Business", adminOnly: true, keywords: "board advisors decision roast critique ai council" },
  { href: "/marketing", label: "Marketing", short: "Marketing", icon: Megaphone, section: "Business", keywords: "campaigns ads" },
  { href: "/automations", label: "Automations", short: "Automations", icon: Workflow, section: "Business", keywords: "workflows texts reminders" },
  { href: "/agents", label: "Agent room", short: "Agents", icon: Bot, section: "Business", keywords: "agents vault floor atlas bots ops approvals", prototype: true },
  { href: "/data-room", label: "Agent data room", short: "Data room", icon: Database, section: "Business", keywords: "agents feeds roi ai data", prototype: true },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, section: "Business", keywords: "account team integrations" },
];

export const officeNav: NavItem[] = allOfficeNav.filter((i) => !i.prototype || prototypeRoutesEnabled());

/** Crew (subcontractor) navigation. The crew view arrives with its own step. */
export const crewNav: NavItem[] = [
  { href: "/my-jobs", label: "My jobs", short: "Jobs", icon: ClipboardCheck, tab: true, section: "Crew", keywords: "today schedule" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, tab: true, section: "Crew", keywords: "appearance theme" },
];

export type MemberRole = "owner" | "admin" | "staff" | "subcontractor";

export function navFor(role: MemberRole | null): NavItem[] {
  if (role === "subcontractor") return crewNav;
  if (role === null) return [];
  return role === "staff" ? officeNav.filter((i) => !i.adminOnly) : officeNav;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
