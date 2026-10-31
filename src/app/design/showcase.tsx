"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  ClipboardList,
  Command as CommandIcon,
  FilePlus2,
  Inbox,
  Megaphone,
  PanelRightOpen,
  Receipt,
  Settings,
  UserPlus,
  Users,
  Workflow,
  Gauge,
  KanbanSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultDirection, directionIds, directions, radius, type DirectionId, type ThemeName } from "@/config/brand";
import { DIRECTION_STORAGE_KEY } from "@/lib/theme/direction";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { tokenVar } from "@/lib/theme/tokens-css";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { invoiceLabel, invoiceTone, jobLabel, jobTone, leadLabel, leadTone, type JobStatus, type LeadStage } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusPill } from "@/components/system/status-pill";
import { StatTile } from "@/components/system/stat-tile";
import { KanbanCard } from "@/components/system/kanban-card";
import { CalendarEvent, CalendarNowLine } from "@/components/system/calendar-event";
import { AreaChart } from "@/components/system/area-chart";
import { EmptyState } from "@/components/system/empty-state";
import { DataTable } from "@/components/system/data-table";
import { Drawer } from "@/components/system/drawer";
import { CommandPalette, openCommandPalette, type Command } from "@/components/system/command-palette";
import type { Palette } from "@/config/brand";

// Fictional sample data for the showcase only.
const INVOICES = Array.from({ length: 14 }, (_, i) => ({
  number: 1040 + i,
  client: ["Maria Lopez", "Gowanus Dental Studio", "James Chen", "Aisha Patel", "Astoria Yoga Collective", "Daniel Cohen", "Wei Park"][i % 7],
  due: ["2026-10-12", "2026-10-20", "2026-10-28", "2026-11-03", "2026-11-15"][i % 5],
  status: (["paid", "open", "open", "paid", "draft", "void", "paid"] as const)[i % 7],
  totalCents: [18500, 112000, 24500, 32000, 96000, 15000, 28000][i % 7],
}));
const TODAY = "2026-10-23";

const SERVICE_OPTIONS = [
  { value: "standard", label: "Standard clean" },
  { value: "deep", label: "Deep clean" },
  { value: "move", label: "Move-in/move-out" },
  { value: "office", label: "Office cleaning" },
];

const BOARD: { stage: LeadStage; cards: { name: string; service: string; value: number | null; age: string; source: string }[] }[] = [
  { stage: "new", cards: [{ name: "Nadia Rivera", service: "Deep clean · 2BR", value: 31000, age: "12m", source: "google" }, { name: "Omar Ali", service: "Standard · 1BR", value: null, age: "40m", source: "nextdoor" }] },
  { stage: "contacted", cards: [{ name: "Chloe Murphy", service: "Move-out · 3BR", value: 52000, age: "1d", source: "meta" }] },
  { stage: "quoted", cards: [{ name: "Bay Ridge Coworking", service: "Office · 12 visits/mo", value: 432000, age: "3d", source: "referral" }, { name: "Ethan Kim", service: "Deep clean · 3BR", value: 38500, age: "2d", source: "yelp" }] },
  { stage: "won", cards: [{ name: "Leah Goldberg", service: "Standard · biweekly", value: 19500, age: "5d", source: "repeat" }] },
];

const EVENTS: { start: string; end: string; client: string; crew: string; status: JobStatus }[] = [
  { start: "2026-11-04T13:00:00Z", end: "2026-11-04T15:30:00Z", client: "Maria Lopez · Park Slope", crew: "Brooklyn Crew A", status: "completed" },
  { start: "2026-11-04T14:00:00Z", end: "2026-11-04T15:00:00Z", client: "Airbnb turnover · Astoria", crew: "Ana R.", status: "no_access" },
  { start: "2026-11-04T16:00:00Z", end: "2026-11-04T20:00:00Z", client: "Chen move-out · UWS", crew: "Luis F., Priya N.", status: "in_progress" },
  { start: "2026-11-04T18:30:00Z", end: "2026-11-04T19:00:00Z", client: "Key pickup · Flatiron", crew: "Joseph K.", status: "cancelled" },
  { start: "2026-11-04T23:30:00Z", end: "2026-11-05T02:30:00Z", client: "Gowanus Dental Studio", crew: "Brooklyn Crew A", status: "scheduled" },
];

const PALETTE_COMMANDS: Command[] = [
  { id: "cc", label: "Command Center", group: "Go to", icon: Gauge, href: "/command-center" },
  { id: "leads", label: "Leads & Pipeline", group: "Go to", icon: KanbanSquare, href: "/leads" },
  { id: "schedule", label: "Schedule", group: "Go to", icon: CalendarDays, href: "/schedule" },
  { id: "crews", label: "Crews", group: "Go to", icon: Users, href: "/crews" },
  { id: "money", label: "Invoices & Payouts", group: "Go to", icon: Receipt, href: "/money" },
  { id: "marketing", label: "Marketing", group: "Go to", icon: Megaphone, href: "/marketing" },
  { id: "automations", label: "Automations", group: "Go to", icon: Workflow, href: "/automations" },
  { id: "settings", label: "Settings", group: "Go to", icon: Settings, href: "/settings" },
  { id: "new-lead", label: "New lead", group: "Create", icon: UserPlus, onSelect: () => toast.info("New lead form opens here") },
  { id: "new-job", label: "New job", group: "Create", icon: ClipboardList, onSelect: () => toast.info("New job form opens here") },
  { id: "new-invoice", label: "New invoice", group: "Create", icon: FilePlus2, onSelect: () => toast.info("New invoice form opens here") },
];

export function DesignCommandPalette() {
  return <CommandPalette commands={PALETTE_COMMANDS} />;
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="font-heading text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

const SWATCH_GROUPS: { label: string; tokens: (keyof Palette)[] }[] = [
  { label: "Surfaces", tokens: ["canvas", "surface", "surfaceRaised", "highlight"] },
  { label: "Text and brand", tokens: ["text", "textMuted", "accent", "accentText", "primary"] },
  { label: "Status", tokens: ["successText", "successSoft", "warningText", "warningFill", "dangerText", "dangerSoft", "infoSoft"] },
  { label: "Lines and charts", tokens: ["borderSubtle", "borderInput", "focus", "chart1", "chart2", "chart3"] },
];

export function Showcase({ theme }: { theme: ThemeName }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  const [direction] = useStoredChoice<DirectionId>(DIRECTION_STORAGE_KEY, directionIds, defaultDirection);
  const p = directions[direction].palettes[theme];

  return (
    <div className={cn(theme, "min-w-0 space-y-10 px-4 py-8 text-foreground md:px-6", theme === "dark" ? "bg-background/70" : "bg-background")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-text uppercase">{directions[direction].label}</p>
          <h1 className="font-heading text-[32px] leading-9 font-semibold">{theme === "light" ? "Light (secondary)" : "Dark (primary)"}</h1>
        </div>
        <span className="text-[13px] text-ink-muted">
          {directions[direction].fonts.display} + {directions[direction].fonts.body} · {directions[direction].mood}
        </span>
      </div>

      <Section title="Color">
        <div className="space-y-4">
          {SWATCH_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase">{g.label}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {g.tokens.map((t) => (
                  <div key={t} className="overflow-hidden rounded-sm border border-hairline bg-surface">
                    <div className="h-10 border-b border-border" style={{ background: `var(${tokenVar(t)})` }} />
                    <div className="px-2 py-1.5">
                      <div className="truncate text-[12px] font-medium text-ink">{t}</div>
                      <div className="font-mono text-[11px] text-ink-muted">{p[t]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-2 rounded-md border glass-card p-5 shadow-e1">
          <div className="font-heading text-[28px] leading-8 font-semibold">Display · Command Center</div>
          <div className="font-heading text-[40px] leading-[44px] font-medium tracking-[-0.02em] tabular text-glow">$48,215.50</div>
          <div className="font-heading text-xl font-semibold">H2 · Today&apos;s schedule</div>
          <div className="text-[15px] font-semibold">H3 · Brooklyn Crew A</div>
          <p className="text-sm">Body · Deep clean for a 2-bedroom in Park Slope, keys with the doorman.</p>
          <p className="text-[13px] text-ink-muted">Small · Updated 4 minutes ago</p>
          <div className="text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase">Label · Outstanding</div>
          <div className="font-mono text-[13px]">Mono · INV-001052</div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="link">Link</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="icon" variant="secondary" aria-label="Open drawer"><PanelRightOpen /></Button>
        </div>
        <div className="max-w-sm">
          <Button size="crew">Mark job complete</Button>
        </div>
      </Section>

      <Section title="Inputs and selects">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${theme}`}>Client name</Label>
            <Input id={`name-${theme}`} placeholder="e.g. Maria Lopez" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`price-${theme}`}>Price</Label>
            <Input id={`price-${theme}`} defaultValue="12.345" aria-invalid aria-describedby={`price-err-${theme}`} />
            <p id={`price-err-${theme}`} className="text-[13px] text-danger">Enter dollars with at most two decimals.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select items={SERVICE_OPTIONS} defaultValue="deep">
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`disabled-${theme}`}>Account (locked)</Label>
            <Input id={`disabled-${theme}`} defaultValue="Gowanus Dental Studio" disabled />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`notes-${theme}`}>Crew notes</Label>
            <Textarea id={`notes-${theme}`} placeholder="Access, pets, priorities…" />
          </div>
        </div>
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          {(["scheduled", "in_progress", "completed", "no_access", "cancelled"] as JobStatus[]).map((s) => (
            <StatusPill key={s} tone={jobTone(s)}>{jobLabel[s]}</StatusPill>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["new", "contacted", "quoted", "won", "lost"] as LeadStage[]).map((s) => (
            <StatusPill key={s} tone={leadTone(s)}>{leadLabel[s]}</StatusPill>
          ))}
          <StatusPill tone="danger">Overdue</StatusPill>
          <StatusPill tone="warning">COI expires in 12 days</StatusPill>
        </div>
      </Section>

      <Section title="Stat tiles and sparklines">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Jobs today" value="14" hint="9 done · 5 to go" spark={[9, 11, 10, 13, 12, 15, 14]} delta={{ label: "+2 vs last Thu", direction: "up", good: true }} />
          <StatTile label="Revenue this month" value="$48,215" spark={[2, 5, 9, 14, 20, 27, 31, 38, 44, 48]} delta={{ label: "+12% vs Sept pace", direction: "up", good: true }} />
          <StatTile label="Open leads" value="23" hint="median reply 9m" spark={[30, 28, 26, 27, 25, 24, 23]} delta={{ label: "−4 this week", direction: "down", good: true }} />
          <StatTile label="Outstanding" value="$6,840" spark={[4, 5, 5, 6, 7, 6, 7]} delta={{ label: "+$1,120 overdue", direction: "up", good: false }} />
        </div>
      </Section>

      <Section title="Area chart">
        <div className="rounded-md border glass-card p-5 shadow-e1">
          <AreaChart
            values={[42, 18, 64, 51, 70, 38, 0, 55, 81, 66, 90, 47, 72, 104, 88, 61, 0, 77, 95, 112, 84, 69, 120, 99, 58, 0, 101, 118, 93, 131].map((v) => v * 1000)}
            labels={Array.from({ length: 30 }, (_, i) => `Oct ${i + 1}`)}
            formatValue={(c) => (c >= 100000 ? `$${(c / 100000).toFixed(1)}k` : `$${Math.round(c / 100)}`)}
            ariaLabel="Sample revenue over 30 days"
            height={180}
          />
        </div>
      </Section>

      <Section title="Table (sticky header, density toggle)">
        <DataTable title="Invoices" description="Scroll inside the table: the header stays put." storageKey={`kc:density:design-${theme}`}>
          <Table containerClassName="max-h-[320px]" stackOnMobile>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INVOICES.map((inv) => (
                <TableRow key={inv.number}>
                  <TableCell label="Invoice" className="font-mono text-[13px]">INV-{String(inv.number).padStart(6, "0")}</TableCell>
                  <TableCell label="Client" className="max-w-[180px] truncate max-md:max-w-none">{inv.client}</TableCell>
                  <TableCell label="Due" className="tabular">{formatCalendarDate(inv.due)}</TableCell>
                  <TableCell label="Status"><StatusPill tone={invoiceTone(inv.status, inv.due, TODAY)}>{invoiceLabel(inv.status, inv.due, TODAY)}</StatusPill></TableCell>
                  <TableCell label="Total" className="text-right font-medium tabular">{formatCents(inv.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>
      </Section>

      <Section title="Kanban cards">
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {BOARD.map((col) => (
            <div key={col.stage} className="w-64 shrink-0 snap-start space-y-2 rounded-md border border-hairline bg-canvas/50 p-2">
              <div className="flex items-center justify-between px-1">
                <StatusPill tone={leadTone(col.stage)}>{leadLabel[col.stage]}</StatusPill>
                <span className="text-[13px] text-ink-muted tabular">{col.cards.length}</span>
              </div>
              {col.cards.map((c) => (
                <KanbanCard key={c.name} name={c.name} service={c.service} valueCents={c.value} age={c.age} source={c.source} stage={col.stage} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Calendar events">
        <div className="relative h-[588px] overflow-hidden rounded-md border glass-card">
          {Array.from({ length: 13 }, (_, i) => (
            <div key={i} className="absolute inset-x-0 flex border-t border-border" style={{ top: 12 + i * 44 }}>
              <span className="w-14 shrink-0 -translate-y-2 bg-surface pr-2 text-right text-[11px] text-ink-muted tabular">
                {((8 + i - 1) % 12) + 1} {8 + i < 12 ? "AM" : "PM"}
              </span>
            </div>
          ))}
          <CalendarNowLine top={12 + 4.6 * 44} label="12:36 PM" />
          {EVENTS.map((e, i) => {
            const startMin = (new Date(e.start).getTime() - new Date("2026-11-04T13:00:00Z").getTime()) / 60000;
            const minutes = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000;
            // Overlapping visits split into two lanes.
            const lane = i === 1 || i === 3 ? 1 : 0;
            const split = i <= 3;
            const height = Math.max(32, (minutes / 60) * 44 - 2);
            return (
              <CalendarEvent
                key={e.client}
                {...e}
                height={height}
                className="absolute"
                style={{ top: 12 + (startMin / 60) * 44 + 1, height, left: lane ? "calc(60px + (100% - 68px) / 2 + 2px)" : 60, right: lane ? 8 : split ? "calc((100% - 68px) / 2 + 10px)" : 8 }}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Empty state">
        <div className="rounded-md border glass-card">
          <EmptyState icon={Inbox} title="No leads waiting" action={<Button variant="secondary" size="sm">Add a lead</Button>}>
            New web, Google and Nextdoor leads land here the moment they come in.
          </EmptyState>
        </div>
      </Section>

      <Section title="Overlays and feedback">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast.success("Job marked complete")}>Success toast</Button>
          <Button variant="secondary" onClick={() => toast.error("Payment failed: card declined")}>Error toast</Button>
          <Button variant="secondary" onClick={() => toast.info("Ana R. is on the way")}>Info toast</Button>
          <Button variant="secondary" onClick={openCommandPalette}><CommandIcon /> Command palette <kbd className="font-mono text-[11px] text-ink-muted">⌘K</kbd></Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}><PanelRightOpen /> Drawer</Button>
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" />}>Modal</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">Cancel this visit?</DialogTitle>
                <DialogDescription>Maria Lopez, Wed Nov 4 at 9:00 AM. The crew is notified by text.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="danger">Cancel visit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Job details" description="Deep clean · Wed Nov 4" footer={<><Button variant="secondary" onClick={() => setDrawerOpen(false)}>Close</Button><Button>Save</Button></>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-ink-muted">Client</dt><dd>Maria Lopez</dd>
            <dt className="text-ink-muted">Address</dt><dd>410 5th Ave, Apt 3B, Brooklyn</dd>
            <dt className="text-ink-muted">Crew</dt><dd>Brooklyn Crew A</dd>
            <dt className="text-ink-muted">Price</dt><dd className="tabular">{formatCents(31000)}</dd>
            <dt className="text-ink-muted">Status</dt><dd><StatusPill tone="info">Scheduled</StatusPill></dd>
          </dl>
        </Drawer>
      </Section>

      <Section title="Radius, elevation and motion">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {(Object.keys(radius) as (keyof typeof radius)[]).map((r) => (
            <div key={r} className="space-y-1 text-center">
              <div className="mx-auto size-14 border border-border-input bg-surface" style={{ borderRadius: `var(--kc-radius-${r})` }} />
              <div className="text-[12px] text-ink-muted">{r} · {radius[r] === "9999px" ? "full" : radius[r]}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["e0", "e1", "e2", "e3"] as const).map((e) => (
            <div key={e} className={cn("flex h-16 items-center justify-center rounded-md border border-border bg-surface text-[13px] text-ink-muted", { e0: "shadow-e0", e1: "shadow-e1", e2: "shadow-e2", e3: "shadow-e3" }[e])}>
              elevation {e.slice(1)}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" onClick={() => setMoved((m) => !m)}>Play motion</Button>
          <div className="relative h-8 flex-1 rounded-full bg-surface-raised">
            <div className={cn("absolute top-1 size-6 rounded-full bg-brand transition-transform duration-slow ease-standard", moved ? "translate-x-[calc(100%*4)]" : "translate-x-1")} />
          </div>
          <span className="text-[12px] text-ink-muted">240ms · none with reduced motion</span>
        </div>
      </Section>
    </div>
  );
}
