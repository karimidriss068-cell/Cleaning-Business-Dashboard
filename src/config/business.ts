// What the business sells right now. Residential, recurring and move-out work is hidden, not deleted:
// the rows and the code stay, and widening this list brings them back to every picker and the board.
export const BUSINESS_FOCUS = "commercial" as const;
export const SHOWN_SERVICE_TYPES = ["commercial"] as const;

/**
 * Default wording under the price on a printed bid. A starting point to review, not legal advice: change
 * it here (one place) once you have your own terms. Payment terms follow the project's milestone split.
 */
export const BID_TERMS: readonly string[] = [
  "Price covers the scope listed above, performed during agreed access times.",
  "A deposit is due to schedule the work, with the balance due on completion.",
  "Extra areas or repeat visits outside this scope are quoted separately.",
  "A certificate of insurance is available on request.",
];
