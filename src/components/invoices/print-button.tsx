"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="h-11 sm:h-9">
      <Printer aria-hidden /> Print or save as PDF
    </Button>
  );
}
