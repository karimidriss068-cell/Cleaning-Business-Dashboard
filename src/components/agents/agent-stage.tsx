"use client";

import { useMemo } from "react";
import { buildFloorSvg } from "./floor-svg";
import { AGENTS, type Agent } from "./agent-data";

const VARS = {
  "--top": "#2A3443", "--left": "#161C25", "--right": "#1F2733", "--floor": "#273241",
  "--tan": "#8EC5FF", "--tan2": "#7FE3F0", "--cream": "#E8EDF3", "--cream2": "#C3CCD8", "--muted": "#A0ADBE",
} as React.CSSProperties;

const CSS = `
.kc-floor .pulse{animation:kcf-pulse 2.4s ease-in-out infinite}.kc-floor .breathe{animation:kcf-pulse 5s ease-in-out infinite}
.kc-floor .bob{animation:kcf-bob 3s ease-in-out infinite}.kc-floor .holo{animation:kcf-holo 4s ease-in-out infinite}
.kc-floor .flow{stroke-dasharray:6 14;animation:kcf-flow 3s linear infinite}
.kc-floor g.bot{cursor:pointer}.kc-floor g.bot:hover ellipse{opacity:.7}
.kc-floor g.wing{transition:opacity .6s cubic-bezier(.22,1,.36,1)}.kc-floor g.wing.dim{opacity:.22}
@keyframes kcf-pulse{50%{opacity:.35}}@keyframes kcf-bob{50%{transform:translateY(-3px)}}@keyframes kcf-holo{50%{opacity:.75}}@keyframes kcf-flow{to{stroke-dashoffset:-40}}
@media (prefers-reduced-motion:reduce){.kc-floor *{animation:none!important}}
`;

const TEAM: Record<string, string> = { All: "", Command: "ceo", Marketing: "mkt", Sales: "sal", CRM: "crm" };

/** The isometric live floor from the Agents Vault mock-up. Click a bot to open its sheet. */
export function AgentStage({ desk, onOpen }: { desk: string; onOpen: (a: Agent) => void }) {
  const html = useMemo(() => {
    const svg = buildFloorSvg();
    const team = TEAM[desk];
    return team ? svg.replace(/<g class="wing" data-team="(\w+)">/g, (m, t) => (t === team ? m : `<g class="wing dim" data-team="${t}">`)) : svg;
  }, [desk]);
  return (
    <div
      className="kc-floor relative h-[560px] w-full overflow-hidden rounded-md border glass-card lg:h-[680px]"
      style={{ ...VARS, background: "radial-gradient(1100px 700px at 50% 40%, #273241, #131820 55%, #0C0F14)" }}
      onClick={(e) => {
        const g = (e.target as Element).closest("g.bot");
        const a = g && AGENTS.find((x) => x.name === g.getAttribute("data-name"));
        if (a) onOpen(a);
      }}
      data-testid="agent-stage"
    >
      <style>{CSS}</style>
      <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="pointer-events-none absolute top-4 left-4 max-w-[260px] rounded-md bg-black/35 p-4 text-[13px] text-[#E8EDF3] ring-1 ring-white/10 backdrop-blur-md">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-[#A0ADBE] uppercase">Atlas briefing · 8:00 AM</p>
        <p className="mt-1 font-heading text-lg">$61.2k of $65k Nov goal</p>
        <p className="text-[#A0ADBE]">94% of pace · 2 days ahead on bookings</p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[12px] text-[#C3CCD8]">
          <li>Launch UES move-out ad test</li><li>Close 3 office quotes in Midtown</li><li>Win back 14 lapsed clients</li>
        </ol>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-full bg-black/35 px-4 py-2 text-[11px] text-[#C3CCD8] ring-1 ring-white/10 backdrop-blur-md">
        {[["#7FE3F0", "Working"], ["#B8D9FF", "Needs you"], ["#F0B54A", "Blocked"], ["#7C8796", "Idle"]].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>
        ))}
        <span className="text-[#A0ADBE]">· click a bot</span>
      </div>
    </div>
  );
}
