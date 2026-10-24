import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-info-soft">
        <Compass className="h-6 w-6 text-brand-text" />
      </div>
      <div className="space-y-1">
        <p className="font-heading text-3xl font-medium tracking-tight">
          Page not found
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          That page doesn&apos;t exist, or it moved. Let&apos;s get you back on track.
        </p>
      </div>
      <Link href="/dashboard">
        <Button size="sm">Go to Dashboard</Button>
      </Link>
    </div>
  );
}
