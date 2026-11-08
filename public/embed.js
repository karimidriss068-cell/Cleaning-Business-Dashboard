/*
 * Keystone Clean lead form embed. Put this where the form should appear:
 *   <script src="https://YOUR-APP-URL/embed.js" async></script>
 * It adds the form as a frame, passes along the page address and any utm_ tags in the visitor's
 * address bar (so ad clicks are attributed), and sizes the frame to the form.
 */
(function () {
  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;
  var src = new URL("/lead-form", origin);
  var here = new URLSearchParams(window.location.search);
  ["source", "medium", "campaign", "term", "content"].forEach(function (k) {
    var v = here.get("utm_" + k);
    if (v) src.searchParams.set("utm_" + k, v.slice(0, 200));
  });
  src.searchParams.set("page", window.location.href.split("#")[0].slice(0, 300));

  var frame = document.createElement("iframe");
  frame.src = src.toString();
  frame.title = "Request a commercial cleaning bid";
  frame.loading = "lazy";
  frame.style.cssText = "width:100%;max-width:640px;height:640px;border:0;display:block;margin:0 auto;color-scheme:normal;";
  script.parentNode.insertBefore(frame, script.nextSibling);

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || e.source !== frame.contentWindow) return;
    var d = e.data;
    if (d && d.type === "kc-lead-form-height" && typeof d.height === "number" && d.height > 100 && d.height < 4000) {
      frame.style.height = d.height + "px";
    }
  });
})();
