import { directionIds } from "@/config/brand";

export const DIRECTION_STORAGE_KEY = "kc:direction";

/**
 * Inline script for <head>. The server already set data-direction from the
 * cookie mirror of the member's saved choice. Only when there was no cookie
 * (data-direction-source="default") does this apply the browser's
 * localStorage choice before first paint; AppearanceSync then sets the cookie
 * and refreshes so that direction's fonts load too.
 * Static string built from brand.ts (no user input).
 */
export function directionBootScript(): string {
  const allowed = JSON.stringify(directionIds);
  return `(function(){var h=document.documentElement;if(h.getAttribute("data-direction-source")!=="default")return;try{var s=localStorage.getItem(${JSON.stringify(DIRECTION_STORAGE_KEY)});if(${allowed}.indexOf(s)>=0)h.setAttribute("data-direction",s)}catch(e){}})()`;
}
