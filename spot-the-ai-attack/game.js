"use strict";
(function () {
  const R = window.ROUNDS;
  const URL_SELF = "https://abhi12337.github.io/checks/spot-the-ai-attack/";
  const $ = (id) => document.getElementById(id);
  // Window title shown above each round, by round kind.
  const TITLES = {
    "Email": "Inbox · Invoice INV-2291",
    "Chatbot reply": "Support chat · assistant",
    ".cursorrules": "my-app / .cursorrules",
    "MCP tool": "tools/list · weather-utils",
    "Package update": "postmark-mcp · 1.0.15 → 1.0.16",
    "GitHub issue": "your-org/public-repo · Issue #212",
    "Web page": "store.example · reviews",
    "Web form": "CRM · new lead",
    "Agent instructions": "extension / agent-prompt.md",
    "Calendar invite": "Calendar · Today",
  };
  let i = 0, score = 0, picks = [];

  const len = (s) => Array.from(s).length;
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const decodeTags = (s) => Array.from(s).map((c) => {
    const cp = c.codePointAt(0);
    return cp >= 0xE0020 && cp <= 0xE007E ? `<span class="hidden-tag">${escapeHtml(String.fromCodePoint(cp - 0xE0000))}</span>` : escapeHtml(c);
  }).join("");

  function show(id) {
    for (const s of ["intro", "play", "end"]) $(s).hidden = s !== id;
    window.scrollTo({ top: 0 });
  }

  function renderSteps() {
    $("steps").innerHTML = R.map((_, n) =>
      `<i class="${n < picks.length ? (picks[n] ? "ok" : "bad") : n === i ? "cur" : ""}"></i>`).join("");
  }

  function renderRound() {
    const r = R[i];
    $("progress").innerHTML = `Round ${i + 1} <span>of ${R.length}</span>`;
    $("score-live").textContent = `${score} spotted`;
    renderSteps();
    $("kind").textContent = r.kind;
    $("win-title").textContent = TITLES[r.kind] || r.kind;
    $("setup").textContent = r.setup;
    const box = $("lines");
    box.innerHTML = "";
    r.lines.forEach((text, n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "line";
      b.innerHTML = `<span class="ln">${n + 1}</span><span class="txt">${escapeHtml(text)}</span>` +
        (r.showLength ? `<span class="count">${len(text)} chars</span>` : "");
      b.addEventListener("click", () => choose(n));
      box.appendChild(b);
    });
    box.classList.remove("done");
    $("tap-hint").hidden = false;
    $("feedback").hidden = true;
  }

  function choose(n) {
    const r = R[i];
    const box = $("lines");
    if (box.classList.contains("done")) return;
    box.classList.add("done");
    const ok = n === r.answer;
    if (ok) score++;
    picks.push(ok);
    const btns = box.querySelectorAll(".line");
    btns.forEach((b) => { b.disabled = true; });
    btns[r.answer].classList.add("right");
    if (!ok) btns[n].classList.add("wrong");
    if (r.showLength) btns[r.answer].querySelector(".txt").innerHTML = decodeTags(r.lines[r.answer]);   // reveal the hidden text
    $("verdict").textContent = ok ? "Spotted it" : `Missed it. It was line ${r.answer + 1}`;
    $("verdict").className = ok ? "verdict ok" : "verdict miss";
    $("how").textContent = r.how;
    $("real").textContent = r.real;
    $("next").textContent = i === R.length - 1 ? "See my score →" : "Next round →";
    $("score-live").textContent = `${score} spotted`;
    renderSteps();
    $("tap-hint").hidden = true;
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
    $("final").innerHTML = `${score}<small>/${R.length}</small>`;
    $("rank").textContent = rank(score);
    $("grid").innerHTML = picks.map((p) => `<i class="${p ? "" : "bad"}"></i>`).join("");
    const squares = picks.map((p) => (p ? "🟩" : "🟥")).join("");
    const text = `I spotted ${score}/${R.length} AI attacks.\n${squares}\n\nCan you beat it?`;
    $("share-x").href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(URL_SELF);
    $("copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text + "\n" + URL_SELF); $("copy").textContent = "Copied ✓"; }
      catch { $("copy").textContent = "Copy failed"; }
    };
    show("end");
  }

  function restart() { i = 0; score = 0; picks = []; $("copy").textContent = "Copy result"; renderRound(); show("play"); }
  $("start").addEventListener("click", restart);
  $("next").addEventListener("click", () => { if ($("feedback").hidden) return; i++; if (i < R.length) renderRound(); else end(); });
  $("again").addEventListener("click", restart);
})();
