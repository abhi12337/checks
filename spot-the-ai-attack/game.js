"use strict";
(function () {
  const R = window.ROUNDS;
  const URL_SELF = "https://abhi12337.github.io/checks/spot-the-ai-attack/";
  const $ = (id) => document.getElementById(id);
  let i = 0, score = 0, picks = [];

  const len = (s) => Array.from(s).length;
  const decodeTags = (s) => Array.from(s).map((c) => {
    const cp = c.codePointAt(0);
    return cp >= 0xE0020 && cp <= 0xE007E ? `<span class="hidden-tag">${escapeHtml(String.fromCodePoint(cp - 0xE0000))}</span>` : escapeHtml(c);
  }).join("");
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function show(id) {
    for (const s of ["intro", "play", "end"]) $(s).hidden = s !== id;
    window.scrollTo({ top: 0 });
  }

  function renderRound() {
    const r = R[i];
    $("progress").textContent = `Round ${i + 1} of ${R.length}`;
    $("bar-fill").style.width = `${(i / R.length) * 100}%`;
    $("score-live").textContent = `Score ${score}`;
    $("kind").textContent = r.kind;
    $("setup").textContent = r.setup;
    const box = $("lines");
    box.innerHTML = "";
    r.lines.forEach((text, n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "line";
      b.dataset.n = n;
      b.innerHTML = `<span class="txt">${escapeHtml(text)}</span>` +
        (r.showLength ? `<span class="count">${len(text)} chars</span>` : "");
      b.addEventListener("click", () => choose(n));
      box.appendChild(b);
    });
    $("feedback").hidden = true;
    $("lines").classList.remove("done");
  }

  function choose(n) {
    const r = R[i];
    if ($("lines").classList.contains("done")) return;
    $("lines").classList.add("done");
    const ok = n === r.answer;
    if (ok) score++;
    picks.push(ok);
    const btns = $("lines").querySelectorAll(".line");
    btns.forEach((b) => { b.disabled = true; });
    btns[r.answer].classList.add("right");
    if (!ok) btns[n].classList.add("wrong");
    if (r.showLength) {   // reveal what was hidden
      btns[r.answer].querySelector(".txt").innerHTML = decodeTags(r.lines[r.answer]);
    }
    $("verdict").textContent = ok ? "Spotted it." : "Missed it.";
    $("verdict").className = ok ? "verdict ok" : "verdict miss";
    $("how").textContent = r.how;
    $("real").textContent = r.real;
    $("next").textContent = i === R.length - 1 ? "See my score" : "Next round";
    $("score-live").textContent = `Score ${score}`;
    $("feedback").hidden = false;
    $("next").focus({ preventScroll: true });
    $("feedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function rank(s) {
    if (s === 10) return "AI security reviewer. Nothing got past you.";
    if (s >= 8) return "Hard to fool. Your agents are in good hands.";
    if (s >= 5) return "You'd catch the obvious ones. The quiet ones would get through.";
    return "Your AI agent would have done what the attacker asked.";
  }

  function end() {
    $("bar-fill").style.width = "100%";
    $("final").textContent = `${score}/${R.length}`;
    $("rank").textContent = rank(score);
    $("grid").textContent = picks.map((p) => (p ? "🟩" : "🟥")).join("");
    const text = `I spotted ${score}/${R.length} AI attacks.\n${picks.map((p) => (p ? "🟩" : "🟥")).join("")}\n\nCan you beat it?`;
    $("share-x").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(URL_SELF);
    $("copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + URL_SELF); $("copy").textContent = "Copied"; }
      catch { $("copy").textContent = "Copy failed"; }
    };
    show("end");
  }

  $("start").addEventListener("click", () => { i = 0; score = 0; picks = []; renderRound(); show("play"); });
  $("next").addEventListener("click", () => { if ($("feedback").hidden) return; i++; if (i < R.length) renderRound(); else end(); });
  $("again").addEventListener("click", () => { i = 0; score = 0; picks = []; $("copy").textContent = "Copy result"; renderRound(); show("play"); });
})();
