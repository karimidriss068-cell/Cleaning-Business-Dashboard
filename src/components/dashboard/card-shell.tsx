"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUpItem, cardHover } from "./motion-variants";

/**
 * Shared glass-panel wrapper for every card on the reinvented dashboard.
 * Entrance (fade+rise) comes from the parent's stagger container via
 * `variants` inheritance — this component only owns the hover lift.
 */
export function CardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUpItem}
      whileHover={cardHover}
      className={cn("panel-glass relative", className)}
    >
      {children}
    </motion.div>
  );
}
