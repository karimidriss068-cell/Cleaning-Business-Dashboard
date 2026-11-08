// What the business sells right now. Residential, recurring and move-out work is hidden, not deleted:
// the rows and the code stay, and widening this list brings them back to every picker and the board.
export const BUSINESS_FOCUS = "commercial" as const;
export const SHOWN_SERVICE_TYPES = ["commercial"] as const;
