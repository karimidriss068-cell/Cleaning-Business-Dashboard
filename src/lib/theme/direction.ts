import { defaultDirection, directionIds } from "@/config/brand";

export const DIRECTION_STORAGE_KEY = "kc:direction";

/**
 * Inline script for <head>: applies the saved visual direction to <html>
 * before first paint, so the page never flashes the wrong palette or fonts.
 * Static string built from brand.ts (no user input).
 */
export function directionBootScript(): string {
  const allowed = JSON.stringify(directionIds);
  const fallback = JSON.stringify(defaultDirection);
  return `(function(){var d=${fallback};try{var s=localStorage.getItem(${JSON.stringify(DIRECTION_STORAGE_KEY)});if(${allowed}.indexOf(s)>=0)d=s}catch(e){}document.documentElement.setAttribute("data-direction",d)})()`;
}
