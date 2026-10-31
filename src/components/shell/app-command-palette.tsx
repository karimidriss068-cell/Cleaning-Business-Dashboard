"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { ClipboardList, FilePlus2, Moon, Sun, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { openQuickAddLead } from "@/components/leads/quick-add-lead";
import { navFor, type MemberRole } from "@/config/navigation";
import { CommandPalette, type Command } from "@/components/system/command-palette";

/** The app's Cmd+K palette: every page the member can reach, plus actions. */
export function AppCommandPalette({ role }: { role: MemberRole | null }) {
  const { resolvedTheme, setTheme } = useTheme();
  const canCreate = role !== null && role !== "subcontractor";
  const commands = useMemo<Command[]>(() => {
    const go: Command[] = navFor(role).map((i) => ({ id: i.href, label: i.label, group: "Go to", icon: i.icon, href: i.href, keywords: i.keywords }));
    const soon = (what: string) => () => toast.info(`${what} arrives with its screen.`);
    const create: Command[] = canCreate
      ? [
          { id: "new-lead", label: "New lead", group: "Create", icon: UserPlus, onSelect: openQuickAddLead, keywords: "add lead new customer inquiry" },
          { id: "new-job", label: "New job", group: "Create", icon: ClipboardList, onSelect: soon("Creating jobs") },
          { id: "new-invoice", label: "New invoice", group: "Create", icon: FilePlus2, onSelect: soon("Creating invoices") },
        ]
      : [];
    const theme: Command = {
      id: "theme",
      label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      group: "Go to",
      icon: resolvedTheme === "dark" ? Sun : Moon,
      keywords: "theme dark light mode",
      onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    };
    return [...go, theme, ...create];
  }, [role, canCreate, resolvedTheme, setTheme]);
  return <CommandPalette commands={commands} />;
}
