/** Open-access mode: OPEN_ACCESS=1 lets anyone into the dashboard as the owner account. Unset/0 restores sign-in. */
export function isOpenAccess() {
  const v = (process.env.OPEN_ACCESS ?? "").toLowerCase();
  return v === "1" || v === "true";
}
