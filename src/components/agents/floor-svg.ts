/* eslint-disable */
// @ts-nocheck
/**
 * Isometric "live floor" SVG, ported from docs/design/agents/index.html (Agents
 * Vault mock-up). Pure string builder, deterministic (seeded particles) so the
 * server and client render the same markup.
 */
let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const NS="http://www.w3.org/2000/svg";const S=26;const CX=800,CY=250;
const P=(x,y,z=0)=>[CX+(x-y)*S*0.866,CY+(x+y)*S*0.5-z*S];
const pts=a=>a.map(p=>P(...p).join(",")).join(" ");

function box(x,y,z,w,d,h,id,glow){const t=z+h;
 return `<g>
 <polygon points="${pts([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,t],[x,y+d,t]])}" fill="var(--left)"/>
 <polygon points="${pts([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,t],[x+w,y,t]])}" fill="var(--right)"/>
 <polygon points="${pts([[x,y,t],[x+w,y,t],[x+w,y+d,t],[x,y+d,t]])}" fill="var(--top)" stroke="rgba(142,197,255,.35)"/>
 ${glow?`<polyline points="${pts([[x,y+d,t],[x+w,y+d,t],[x+w,y,t]])}" fill="none" stroke="var(--tan2)" stroke-width="1.5" opacity=".7" class="breathe"/>`:''}</g>`}
function grid(x,y,z,w,d){let g='';for(let i=1;i<w;i+=2)g+=`<line x1="${P(x+i,y,z)[0]}" y1="${P(x+i,y,z)[1]}" x2="${P(x+i,y+d,z)[0]}" y2="${P(x+i,y+d,z)[1]}"/>`;for(let j=1;j<d;j+=2)g+=`<line x1="${P(x,y+j,z)[0]}" y1="${P(x,y+j,z)[1]}" x2="${P(x+w,y+j,z)[0]}" y2="${P(x+w,y+j,z)[1]}"/>`;return `<g stroke="rgba(142,197,255,.12)">${g}</g>`}
const STATE={working:'#7FE3F0',waiting:'#B8D9FF',blocked:'#F0B54A',idle:'#7C8796',paused:'#4E5663'};
function bot(x,y,z,state,name,task,scale=1){const [px,py]=P(x,y,z);const c=STATE[state];const k=scale;
 const cls=state==='working'?'pulse':state==='waiting'?'breathe':'';
 return `<g class="bot" transform="translate(${px},${py}) scale(${k})" data-name="${name}">
 <ellipse cx="0" cy="0" rx="14" ry="6" fill="${c}" opacity=".35" class="${cls}"/>
 <g class="bob">
 <rect x="-5" y="-14" width="4" height="12" rx="2" fill="#CDD5DF"/><rect x="1" y="-14" width="4" height="12" rx="2" fill="#C0C9D4"/>
 <path d="M-9 -32 Q-10 -14 0 -13 Q10 -14 9 -32 Q0 -37 -9 -32Z" fill="#E9EEF3"/>
 <path d="M3 -32 Q9 -30 9 -22 Q8 -15 1 -13Z" fill="#CAD3DD"/>
 <rect x="-13" y="-30" width="4" height="13" rx="2" fill="#D8DFE7" transform="rotate(${state==='working'?-25:8} -11 -30)"/>
 <rect x="9" y="-30" width="4" height="13" rx="2" fill="#C6CFDA" transform="rotate(${state==='working'?-40:-8} 11 -30)"/>
 <ellipse cx="0" cy="-45" rx="10" ry="9.5" fill="#F2F5F8"/>
 <path d="M-7 -47 Q0 -51 7 -47 L6 -42 Q0 -40 -6 -42Z" fill="#1a1411"/>
 <circle cx="-3" cy="-45" r="1.4" fill="${c}" class="${cls}"/><circle cx="3" cy="-45" r="1.4" fill="${c}" class="${cls}"/>
 <circle cx="0" cy="-56" r="1.8" fill="${c}" class="${cls}"/>
 </g>
 <g transform="translate(0,${-74/k})" font-size="${11/k}" text-anchor="middle"><text fill="var(--cream)" font-weight="600">${name}</text></g>
 <title>${name} · ${state} · ${task}</title></g>`}
function holo(x,y,z,w,h,kind,label){const [px,py]=P(x,y,z);let inner='';
 if(kind==='bars')inner=[18,30,22,40,34].map((v,i)=>`<rect x="${8+i*14}" y="${h-10-v}" width="9" height="${v}" rx="2" fill="var(--tan2)" opacity="${.5+i*.1}"/>`).join('');
 if(kind==='funnel')inner=[0,1,2,3].map(i=>`<rect x="${10+i*8}" y="${14+i*12}" width="${w-20-i*16}" height="8" rx="3" fill="var(--tan2)" opacity="${.9-i*.15}"/>`).join('');
 if(kind==='ad')inner=`<rect x="8" y="12" width="${w-16}" height="${h*.45}" rx="4" fill="rgba(127,227,240,.35)"/><circle cx="${w*.3}" cy="${12+h*.22}" r="7" fill="var(--cream2)" opacity=".7"/><rect x="8" y="${h*.65}" width="${w*.7}" height="4" rx="2" fill="var(--cream2)"/><rect x="8" y="${h*.75}" width="${w*.45}" height="4" rx="2" fill="var(--cream2)" opacity=".6"/>`;
 if(kind==='quote')inner=`${[0,1,2,3].map(i=>`<rect x="10" y="${14+i*11}" width="${w*.5}" height="4" rx="2" fill="var(--cream2)" opacity=".7"/><rect x="${w-30}" y="${14+i*11}" width="20" height="4" rx="2" fill="var(--tan2)"/>`).join('')}<text x="${w-10}" y="${h-8}" text-anchor="end" font-size="11" fill="var(--cream)" font-weight="600">$2,480</text>`;
 if(kind==='kanban')inner=[0,1,2].map(c=>[0,1,2].slice(0,3-c%2).map(r=>`<rect x="${8+c*((w-16)/3)}" y="${12+r*14}" width="${(w-28)/3}" height="10" rx="2" fill="var(--tan2)" opacity="${.4+r*.15}"/>`).join('')).join('');
 if(kind==='globe')inner=`<circle cx="${w/2}" cy="${h/2}" r="${h*.36}" fill="none" stroke="var(--tan2)"/><ellipse cx="${w/2}" cy="${h/2}" rx="${h*.15}" ry="${h*.36}" fill="none" stroke="var(--tan2)" opacity=".6"/><line x1="${w/2-h*.36}" y1="${h/2}" x2="${w/2+h*.36}" y2="${h/2}" stroke="var(--tan2)" opacity=".6"/><text x="${w/2}" y="${h-4}" font-size="10" text-anchor="middle" fill="var(--cream)">94% pace</text>`;
 return `<g class="holo" transform="translate(${px-w/2},${py-h})"><path d="M${w/2-10} ${h} L${w/2} ${h+30} L${w/2+10} ${h}Z" fill="url(#beam)"/>
 <rect width="${w}" height="${h}" rx="8" fill="rgba(127,227,240,.10)" stroke="rgba(142,197,255,.45)"/>${inner}
 <text x="8" y="-6" font-size="10" fill="var(--muted)" letter-spacing=".08em">${label}</text></g>`}
function desk(x,y,z){return box(x,y,z,1.6,.8,.5)+`<polygon points="${pts([[x+.3,y+.1,z+.5],[x+1.2,y+.1,z+.5],[x+1.2,y+.1,z+1.1],[x+.3,y+.1,z+1.1]])}" fill="rgba(127,227,240,.4)" stroke="var(--tan2)" stroke-width=".6"/>`}
function plant(x,y,z){const [px,py]=P(x,y,z);return `<g transform="translate(${px},${py})"><path d="M-6 0 L6 0 L4 -10 L-4 -10Z" fill="#3A4A5E"/><ellipse cx="0" cy="-16" rx="9" ry="8" fill="#3F7F9C"/><ellipse cx="-5" cy="-22" rx="5" ry="6" fill="#5FA8C8"/></g>`}
function lamp(x,y,z){const [px,py]=P(x,y,z);return `<g transform="translate(${px},${py})"><line y2="-34" stroke="#6E7A8A" stroke-width="2"/><circle cy="-36" r="5" fill="#BFE0FF"/><circle cy="-36" r="18" fill="url(#warm)" class="breathe"/></g>`}
function capTag(x,y,z){const [px,py]=P(x,y,z);return `<g transform="translate(${px+26},${py-8})" style="cursor:pointer" data-guardrail="sms"><rect x="0" y="-14" width="128" height="34" rx="9" fill="rgba(12,15,20,.7)" stroke="#F0B54A" stroke-opacity=".6"/><path d="M10 -6 l7 -3 l7 3 v6 c0 5 -4 8 -7 9 c-3 -1 -7 -4 -7 -9z" fill="none" stroke="#F0B54A" stroke-width="1.4"/><text x="30" y="-1" font-size="10" fill="#F0B54A" font-weight="600">CAP HIT · 500 SMS</text><text x="30" y="12" font-size="9.5" fill="#C3CCD8">auto-paused · 1 alert</text></g>`}
function label(x,y,z,t,sub){const [px,py]=P(x,y,z);return `<g transform="translate(${px},${py})"><text font-size="13" font-weight="600" fill="var(--cream)" letter-spacing=".12em" text-anchor="middle">${t}</text><text y="16" font-size="11" fill="var(--muted)" text-anchor="middle">${sub}</text></g>`}
function path(id,a){return `<path id="${id}" d="M${a.map(p=>P(...p).join(' ')).join(' L')}" fill="none" stroke="var(--tan2)" stroke-width="2" opacity=".55" class="flow"/>`}
function pkt(id,dur,delay){return `<g class="pkt"><rect x="-6" y="-12" width="12" height="9" rx="2" fill="#BFE0FF" stroke="var(--tan)"/><animateMotion dur="${dur}s" begin="${delay}s" repeatCount="indefinite" rotate="0"><mpath href="#${id}"/></animateMotion></g>`}

export function buildFloorSvg(): string {
  seed = 7;
  let svg = "";
// layout (iso units)
const W={ceo:{x:-4,y:-4,z:5,w:8,d:8},mkt:{x:-7,y:12,z:0,w:9,d:8},sal:{x:8,y:9,z:0,w:9,d:8},crm:{x:13,y:-7,z:0,w:8,d:9}};
svg+=`<defs><linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#7FE3F0" stop-opacity=".0"/><stop offset="1" stop-color="#7FE3F0" stop-opacity=".5"/></linearGradient><radialGradient id="warm"><stop offset="0" stop-color="#BFE0FF" stop-opacity=".45"/><stop offset="1" stop-color="#BFE0FF" stop-opacity="0"/></radialGradient></defs>`;
// particles
for(let i=0;i<40;i++){const x=rnd()*1600,y=rnd()*1000;svg+=`<circle cx="${x}" cy="${y}" r="${rnd()*1.6+.4}" fill="#B8D9FF" opacity=".25"><animate attributeName="cy" values="${y};${y-40};${y}" dur="${10+rnd()*10}s" repeatCount="indefinite"/></circle>`}
// pillars + bridges
svg+=`<g opacity=".9">${box(3.2,3.2,0,.8,.8,5)}</g>`;
svg+=path('p1',[[-2,4,5],[-2,9,2],[-1,12,0.6]])+path('p2',[[2,4,5],[6,8,2],[9,9,0.6]])+path('p3',[[4,0,5],[9,-1,2],[13,-2,0.6]])+path('p4',[[2,17,0.6],[8,14,0.6]])+path('p5',[[13,9,0.6],[16,2,0.6]]);
const wings=[
 ['ceo',W.ceo,'ATLAS · CEO','Orchestrating 3 teams'],
 ['mkt',W.mkt,'MARKETING','Lead: Lumen · 2 members'],
 ['sal',W.sal,'SALES','Lead: Quill · 2 members'],
 ['crm',W.crm,'CRM','Lead: Ledger · 2 members']];
const content={
 ceo:w=>desk(w.x+3,w.y+3,w.z+.5)+holo(w.x+4,w.y+2,w.z+3.6,110,80,'globe','REVENUE PACE')+bot(w.x+4,w.y+5,w.z+.5,'working','Atlas','Synthesizing daily brief',1.25)+lamp(w.x+1,w.y+1,w.z+.5)+plant(w.x+7,w.y+1,w.z+.5),
 mkt:w=>desk(w.x+1,w.y+2,w.z+.5)+desk(w.x+5,w.y+5,w.z+.5)+holo(w.x+2,w.y+1.5,w.z+3,110,74,'ad','AD CREATIVE · UES MOVE-OUT')+holo(w.x+7,w.y+1,w.z+3,96,60,'bars','CTR · 3 VARIANTS')+bot(w.x+2,w.y+4,w.z+.5,'working','Lumen','Drafting 3 ad variants')+bot(w.x+6,w.y+7,w.z+.5,'waiting','Prism','Waiting: approve test')+bot(w.x+8,w.y+5,w.z+.5,'idle','Echo','Scheduling posts')+plant(w.x+.5,w.y+7,w.z+.5),
 sal:w=>desk(w.x+1,w.y+2,w.z+.5)+desk(w.x+5,w.y+4,w.z+.5)+holo(w.x+2,w.y+1.5,w.z+3,104,70,'quote','QUOTE · HUDSON YARDS')+holo(w.x+7.2,w.y+.8,w.z+3,96,66,'funnel','PIPELINE · 23 LEADS')+bot(w.x+2,w.y+4.5,w.z+.5,'waiting','Quill','Quote awaits you',1.1)+bot(w.x+6,w.y+6.5,w.z+.5,'working','Vector','Building call list')+lamp(w.x+8,w.y+7,w.z+.5),
 crm:w=>desk(w.x+1,w.y+2,w.z+.5)+holo(w.x+2,w.y+1.5,w.z+3,110,66,'kanban','CLIENT BOARD · 412')+holo(w.x+7,w.y+1.2,w.z+3,90,60,'bars','WIN-BACK REPLIES')+bot(w.x+2,w.y+5,w.z+.5,'working','Ledger','Cleaning 412 records')+bot(w.x+6.5,w.y+6,w.z+.5,'blocked','Relay','Auto-paused: SMS cap 500/500')+capTag(w.x+6.5,w.y+6,w.z+.5)+plant(w.x+1,w.y+8,w.z+.5)};
for(const [k,w,t,s] of wings){svg+=`<g class="wing" data-team="${k}">${box(w.x,w.y,w.z-.6,w.w,w.d,.6,null,true)}${box(w.x+.2,w.y+.2,w.z,w.w-.4,w.d-.4,.5)}${grid(w.x+.2,w.y+.2,w.z+.5,w.w-.4,w.d-.4)}${content[k](w)}${label(w.x+w.w/2,w.y+w.d+1.4,w.z-.6,t,s)}</g>`}
svg+=pkt('p1',6,0)+pkt('p2',5,1.5)+pkt('p3',7,3)+pkt('p4',4,.5)+pkt('p5',4.5,2);

  return `<svg viewBox="80 40 1440 900" preserveAspectRatio="xMidYMid meet" role="img" style="width:100%;height:100%;display:block"><title>Agent teams floor</title>${svg}</svg>`;
}
