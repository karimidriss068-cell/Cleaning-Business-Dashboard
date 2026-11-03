// Computed-color text contrast for every visible text node inside <main>; glass backdrops are covered by src/config/brand.test.ts.
// Pass the minimum ratio for normal text (4.5 office, 7 crew AAA) as the argument to page.evaluate.
export const contrastInPage = (minNormal = 4.5) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "rgba(0,0,0,0)";
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const canvasBg = rgba(getComputedStyle(document.documentElement).getPropertyValue("--kc-canvas").trim() || "rgb(0,0,0)");
  const bad = [];
  let checked = 0;
  for (const el of document.querySelectorAll(document.querySelector("main") ? "main *" : "body *")) {
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    if (el.closest("svg") || el.closest("[aria-hidden=true]")) continue; // decorative previews are not read // chart labels: covered by the chart colors in brand.test.ts
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!own) continue;
    const cs = getComputedStyle(el);
    let bg = [0, 0, 0, 0];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) bg = over(bg, c);
      if (bg[3] >= 0.999) break;
    }
    bg = over(bg, canvasBg);
    const fg = over(rgba(cs.color), bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    checked++;
    if (ratio < (large ? Math.min(3, minNormal) : minNormal)) bad.push(`${own.slice(0, 40)} ${ratio.toFixed(2)}`);
  }
  return { checked, bad };
};
