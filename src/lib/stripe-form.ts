// Stripe's API takes form-encoded bodies with bracketed keys for nesting:
// { metadata: { invoice_id: "x" }, line_items: [{ quantity: 1 }] } becomes
// metadata[invoice_id]=x&line_items[0][quantity]=1. Pure so it can be tested.

export type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

export function encodeForm(input: { [key: string]: FormValue }): string {
  const pairs: string[] = [];
  const walk = (key: string, value: FormValue) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${key}[${i}]`, v));
    else if (typeof value === "object") Object.entries(value).forEach(([k, v]) => walk(`${key}[${k}]`, v));
    else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  Object.entries(input).forEach(([k, v]) => walk(k, v));
  return pairs.join("&");
}

/** Test mode only for now: a live key (sk_live_ / rk_live_) is refused outright. */
export function assertTestModeKey(key: string | undefined): string {
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) {
    throw new Error("Stripe is in test mode only for now: STRIPE_SECRET_KEY must be a test key (sk_test_...)");
  }
  return key;
}
