import type { Variants } from "framer-motion";

/** Parent wrapper — staggers its direct motion children in on mount. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

/** Standard entrance for a card/section within a staggered group. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

/** Hover lift shared by every dashboard card. */
export const cardHover = {
  y: -3,
  boxShadow:
    "0 32px 60px -20px rgba(0, 0, 0, 0.7), 0 1px 0 0 rgba(255, 255, 255, 0.08) inset",
  transition: { duration: 0.2, ease: "easeOut" as const },
};
