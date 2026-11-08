"use client";

import { useEffect, useId, useRef, useState } from "react";
import Script from "next/script";
import { CheckCircle2, Loader2 } from "lucide-react";
import { BOROUGHS, boroughLabel } from "@/lib/leads";
import { CONSENT_VERSION, CONSENT_WORDING, HONEYPOT_FIELD, intakeSchema, type IntakeResponse } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassPanel } from "@/components/system/glass-panel";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

const boroughItems = BOROUGHS.map((b) => ({ value: b, label: boroughLabel(b) }));
const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/** The campaign tags and page address, read from this page's own address (the embed script copies the host page's onto it). */
function readTracking() {
  const q = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = q.get(`utm_${k}`);
    if (v) utm[k] = v.slice(0, 200);
  }
  const fromParam = q.get("page");
  const page = [fromParam, document.referrer].find((p) => p && /^https?:\/\//i.test(p))?.slice(0, 300);
  return { utm, page };
}

type Fields = Partial<Record<"name" | "phone" | "email" | "borough" | "serviceType" | "consent" | "form", string>>;

export function LeadForm({ siteKey }: { siteKey: string | null }) {
  const uid = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [borough, setBorough] = useState("");
  // Residential work is hidden (src/config/business.ts); the form takes commercial bid requests only.
  const serviceType = "commercial";
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Fields>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ message: string; first: string } | null>(null);
  const startedAt = useRef(0);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  // Tell an embedding page how tall the form is, so its frame never scrolls inside itself.
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "kc-lead-form-height", height: Math.ceil(document.documentElement.scrollHeight) }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    post();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!siteKey || !scriptReady || !widget.current || widgetId.current !== undefined || !window.turnstile) return;
    widgetId.current = window.turnstile.render(widget.current, {
      sitekey: siteKey,
      callback: setToken,
      "expired-callback": () => setToken(null),
      "error-callback": () => setToken(null),
    });
  }, [siteKey, scriptReady]);

  useEffect(() => {
    if (done) headingRef.current?.focus();
  }, [done]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const { utm, page } = readTracking();
    const payload = {
      name, phone: phone || undefined, email: email || undefined,
      borough: borough || undefined, serviceType, consent,
      consentVersion: consent ? CONSENT_VERSION : undefined,
      page, utm,
      [HONEYPOT_FIELD]: trap || undefined,
      elapsedMs: Math.round(performance.now() - startedAt.current),
      turnstileToken: token ?? undefined,
    };
    const local = intakeSchema.safeParse(payload);
    if (!local.success) {
      const next: Fields = {};
      for (const issue of local.error.issues) {
        const key = (issue.path[0] === "consent" ? "consent" : issue.path[0]) as keyof Fields;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    if (siteKey && !token) {
      setErrors({ form: "Please wait for the security check to finish, then send again." });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch("/api/public/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const out = (await res.json()) as IntakeResponse;
      if (out.ok) {
        setDone({ message: out.message, first: name.trim().split(/\s+/)[0] ?? "" });
        return;
      }
      const next: Fields = {};
      for (const [k, msgs] of Object.entries(out.fields ?? {})) if (msgs?.[0]) next[k as keyof Fields] = msgs[0];
      if (Object.keys(next).length === 0) next.form = out.message;
      setErrors(next);
      if (siteKey) {
        window.turnstile?.reset(widgetId.current);
        setToken(null);
      }
    } catch {
      setErrors({ form: "We couldn't send that. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <GlassPanel level="card" role="status" className="kc-enter space-y-3 p-6 text-center sm:p-8" data-testid="thank-you">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <h2 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold text-ink outline-none">
          Thank you{done.first ? `, ${done.first}` : ""}
        </h2>
        <p className="text-base text-ink" data-testid="reply-promise">We got your request. {done.message}</p>
        <p className="text-sm text-ink-muted">We&apos;ll call or text from our office number. You can ignore this page now.</p>
      </GlassPanel>
    );
  }

  const err = (k: keyof Fields) => errors[k];
  return (
    <>
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setScriptReady(true)} />}
      <GlassPanel level="card" className="p-5 sm:p-8">
        <form onSubmit={submit} noValidate className="space-y-5" aria-describedby={errors.form ? `${uid}-form-error` : undefined}>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold text-ink">Request a commercial cleaning bid</h1>
            <p className="text-sm text-ink-muted">Tell us about the building or project. It takes under a minute.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-name`}>Your name</Label>
            <Input id={`${uid}-name`} name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!err("name")} aria-describedby={err("name") ? `${uid}-name-e` : undefined} className="h-12" />
            {err("name") && <p id={`${uid}-name-e`} role="alert" className="text-[13px] text-danger">{err("name")}</p>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-phone`}>Mobile phone</Label>
              <Input id={`${uid}-phone`} name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="(332) 555-0142" aria-invalid={!!err("phone")} aria-describedby={err("phone") ? `${uid}-phone-e` : undefined} className="h-12" />
              {err("phone") && <p id={`${uid}-phone-e`} role="alert" className="text-[13px] text-danger">{err("phone")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-email`}>Email</Label>
              <Input id={`${uid}-email`} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!err("email")} aria-describedby={err("email") ? `${uid}-email-e` : undefined} className="h-12" />
              {err("email") && <p id={`${uid}-email-e`} role="alert" className="text-[13px] text-danger">{err("email")}</p>}
            </div>
          </div>

          <div className="grid gap-5">
            <div className="space-y-1.5">
              <Label id={`${uid}-borough-l`}>Borough</Label>
              <Select items={boroughItems} value={borough || null} onValueChange={(v) => v && setBorough(v)}>
                <SelectTrigger className="h-12 w-full" aria-labelledby={`${uid}-borough-l`} aria-invalid={!!err("borough")} data-testid="borough"><SelectValue placeholder="Choose one" /></SelectTrigger>
                <SelectContent>{boroughItems.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
              </Select>
              {err("borough") && <p role="alert" className="text-[13px] text-danger">{err("borough")}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <Checkbox id={`${uid}-consent`} checked={consent} onCheckedChange={(c) => setConsent(c === true)} aria-labelledby={`${uid}-consent-t`} aria-invalid={!!err("consent")} className="mt-0.5 size-6" data-testid="consent" />
              <label id={`${uid}-consent-t`} htmlFor={`${uid}-consent`} className="text-[13px] leading-snug text-ink-muted">
                {CONSENT_WORDING} <span className="text-ink">(Optional.)</span>
              </label>
            </div>
            {err("consent") && <p role="alert" className="text-[13px] text-danger">{err("consent")}</p>}
          </div>

          {/* Bot trap: invisible and unreachable for people, tempting for form-filling scripts. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor={`${uid}-trap`}>Leave this field empty</label>
            <input id={`${uid}-trap`} name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </div>

          {siteKey && <div ref={widget} data-testid="turnstile" className="min-h-[65px]" />}

          {errors.form && <p id={`${uid}-form-error`} role="alert" className="text-sm text-danger" data-testid="form-error">{errors.form}</p>}
          <Button type="submit" disabled={pending} className="h-14 w-full text-base" data-testid="submit">
            {pending ? <><Loader2 className="animate-spin" aria-hidden /> Sending…</> : "Request a bid"}
          </Button>
        </form>
      </GlassPanel>
    </>
  );
}
