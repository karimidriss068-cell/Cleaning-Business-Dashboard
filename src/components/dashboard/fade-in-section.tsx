"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUpItem } from "./motion-variants";

/** Wraps a plain section (heading + table, a form, etc.) so it participates
 * in the parent StaggerPage's entrance sequence like the CardShells do. */
export function FadeInSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUpItem} className={cn(className)}>
      {children}
    </motion.div>
  );
}
