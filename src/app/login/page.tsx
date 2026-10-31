"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLockup, BrandMark } from "@/components/system/brand-mark";
import { Ambient } from "@/components/system/ambient";
import { DirectionSwitcher } from "@/components/system/direction-switcher";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "That email and password don't match. Try again." : error.message);
      setLoading(false);
      return;
    }
    router.replace("/command-center");
    router.refresh();
  }

  return (
    <main className="relative grid min-h-dvh overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Ambient />
      <div className="absolute top-4 right-4 z-20">
        <DirectionSwitcher compact />
      </div>

      <section className="relative z-10 hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <BrandLockup />
        <div className="kc-enter max-w-lg space-y-5">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-text uppercase">Operations cockpit</p>
          <p className="font-heading text-[48px] leading-[52px] font-semibold tracking-[-0.02em] text-ink">Every home and office, precisely on schedule.</p>
          <p className="text-[15px] leading-6 text-ink-muted">{brand.loginTagline}</p>
        </div>
        <p className="text-[13px] text-ink-muted">Residential and commercial cleaning · New York City</p>
        <BrandMark className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] opacity-[0.06]" />
      </section>

      <section className="relative z-10 flex items-center justify-center px-4 py-12">
        <div className="kc-enter w-full max-w-[400px] rounded-lg border glass-modal p-8" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="mb-8 lg:hidden">
            <BrandLockup />
          </div>
          <h1 className="font-heading text-[28px] leading-8 font-semibold text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-muted">For the {brand.shortName} office team and crew members.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
                className="h-11"
              />
            </div>
            <p id="login-error" role="alert" aria-live="polite" className="min-h-5 text-sm text-danger">
              {error}
            </p>
            <Button type="submit" className="h-11 w-full text-[15px]" loading={loading}>
              {loading ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
