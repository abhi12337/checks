// Applies the saved light/dark choice before first paint. No network, no tracking.
(function () {
  var t = null;
  try { t = localStorage.getItem("theme"); } catch (e) {}
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
})();
