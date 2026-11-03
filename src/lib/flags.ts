/**
 * Prototype screens (Sales, Agent room, Agent data room) were added without a plan.
 * They stay out of navigation and routing until this is switched on. The value is
 * not secret, so the NEXT_PUBLIC_ name is fine and the client menu agrees with the server.
 */
export function prototypeRoutesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PROTOTYPE_ROUTES === "1";
}
