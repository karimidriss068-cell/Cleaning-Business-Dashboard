"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { staggerContainer } from "./motion-variants";

/**
 * Standard root wrapper for every redesigned page — orchestrates the
 * staggered entrance for whatever CardShell/FadeInSection children it's
 * given. Same container every page uses, so timing/easing never drifts
 * between pages.
 */
export function StaggerPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={cn("space-y-10 p-6 sm:space-y-12 sm:p-8", className)}
    >
      {children}
    </motion.div>
  );
}
