// Page logic for the in-browser checkers. Files are read with the File API and handed to a
// Web Worker that runs the Python checker in Pyodide. No uploads, no analytics, no cookies.
"use strict";
(function () {
  const cfg = JSON.parse(document.getElementById("page-config").textContent);
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ theme toggle
  $("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // ------------------------------------------------------------ file selection
  const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "bower_components", "jspm_packages",
    ".venv", "venv", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".cache",
    ".turbo", ".parcel-cache", ".yarn", ".pnpm-store", "coverage", ".nyc_output", "target", "Pods",
    ".gradle", ".idea", ".terraform", ".serverless", ".vercel", ".netlify", ".firebase", ".angular", ".expo"]);
  const BUILD_DIRS = new Set(["dist", "build", "out", ".next", ".nuxt", ".output", ".svelte-kit", "storybook-static"]);
  const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|psd|mp[34]|mov|webm|avi|mkv|wav|ogg|flac|woff2?|ttf|otf|eot|zip|gz|tgz|bz2|xz|7z|rar|jar|war|pdf|docx?|xlsx?|pptx?|exe|dll|so|dylib|bin|wasm|class|pyc|o|a|lib|sqlite3?|db|parquet|pkl|pt|onnx|h5|DS_Store)$/i;
  const MAX_TOTAL = cfg.maxTotalMB * 1024 * 1024;
  const MAX_FILE = 5 * 1024 * 1024;

  let tool = cfg.tool;
  let picked = [];          // [{path, file}]
  let skipped = { dirs: 0, binary: 0, large: 0, limit: 0 };

  function scanBuild() {
    return cfg.tools[tool].build_option && $("opt-build").checked;
  }
  function skipDir(name) {
    if (SKIP_DIRS.has(name)) return true;
    if (BUILD_DIRS.has(name) && !scanBuild()) return true;
    return false;
  }
  function pathAllowed(path) {
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (skipDir(parts[i])) return "dirs";
      if (parts[i] === "cache" && parts[i - 1] === ".next") return "dirs";
    }
    if (BINARY_EXT.test(parts[parts.length - 1])) return "binary";
    return null;
  }

  function resetPicked() { picked = []; skipped = { dirs: 0, binary: 0, large: 0, limit: 0 }; }

  function addFile(path, file) {
    path = path.replace(/\\/g, "/").replace(/^\/+/, "");
    const why = pathAllowed(path);
    if (why) { skipped[why]++; return; }
    if (file.size > MAX_FILE) { skipped.large++; return; }
    const total = picked.reduce((s, f) => s + f.file.size, 0);
    if (picked.length >= cfg.maxFiles || total + file.size > MAX_TOTAL) { skipped.limit++; return; }
    picked.push({ path, file });
  }

  // If every file sits under one top folder (folder picker / dropped folder), strip it so the
  // project root is the scan root, as when running `scan .` inside the folder.
  function stripCommonRoot() {
    if (picked.length < 1) return;
    const first = picked[0].path.split("/");
    if (first.length < 2) return;
    const top = first[0] + "/";
    if (picked.every((f) => f.path.startsWith(top))) picked.forEach((f) => { f.path = f.path.slice(top.length); });
  }

  function showSelected() {
    const el = $("selected");
    if (!picked.length && !Object.values(skipped).some(Boolean)) { el.hidden = true; return; }
    const total = picked.reduce((s, f) => s + f.file.size, 0);
    const parts = [];
    if (skipped.dirs) parts.push(skipped.dirs + " in skipped folders");
    if (skipped.binary) parts.push(skipped.binary + " binary");
    if (skipped.large) parts.push(skipped.large + " over 5 MB");
    if (skipped.limit) parts.push(skipped.limit + " over the size/file limit");
    el.hidden = false;
    el.textContent = "";
    const s = document.createElement("span");
    s.textContent = picked.length + " file(s) selected (" + (total / 1024).toFixed(0) + " KB)" +
      (parts.length ? "; skipped: " + parts.join(", ") : "") + ". ";
    el.appendChild(s);
    const clear = document.createElement("button");
    clear.type = "button"; clear.className = "linklike"; clear.textContent = "Clear";
    clear.addEventListener("click", () => { resetPicked(); showSelected(); });
    el.appendChild(clear);
  }

  function fromInput(input) {
    resetPicked();
    for (const f of input.files) addFile(f.webkitRelativePath || f.name, f);
    stripCommonRoot();
    input.value = "";
    showSelected();
    warmUp();
  }
  $("pick-folder").addEventListener("change", (e) => fromInput(e.target));
  $("pick-files").addEventListener("change", (e) => fromInput(e.target));

  // Drag and drop (folders via webkitGetAsEntry; skipped folders are never even listed).
  function readEntry(entry, prefix, out) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => { out.push({ path: prefix + f.name, file: f }); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        if (skipDir(entry.name)) { skipped.dirs++; resolve(); return; }
        const reader = entry.createReader();
        const all = [];
        const next = () => reader.readEntries(async (batch) => {
          if (!batch.length) {
            for (const child of all) await readEntry(child, prefix + entry.name + "/", out);
            resolve();
          } else { all.push(...batch); next(); }
        }, () => resolve());
        next();
      } else resolve();
    });
  }
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    resetPicked();
    const items = [...(e.dataTransfer.items || [])];
    const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    const out = [];
    if (entries.length) {
      for (const en of entries) await readEntry(en, "", out);
    } else {
      for (const f of e.dataTransfer.files) out.push({ path: f.name, file: f });
    }
    out.forEach((f) => addFile(f.path, f.file));
    stripCommonRoot();
    showSelected();
    warmUp();
  });

  // ------------------------------------------------------------ examples
  function expandSample(text) {
    const alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const rnd = new Uint32Array(1);
    const pick = () => { crypto.getRandomValues(rnd); return alnum[rnd[0] % alnum.length]; };
    text = text.replace(/\{\{RAND:([^:}]*):(\d+)\}\}/g, (_, p, n) => p + Array.from({ length: +n }, pick).join(""));
    return text.replace(/\{\{TAGS:([^}]*)\}\}/g, (_, s) =>
      [...s].filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f)
        .map((c) => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join(""));
  }
  function applyTool() {
    const t = cfg.tools[tool];
    $("opt-tests-wrap").hidden = !t.include_tests;
    $("opt-build-wrap").hidden = !t.build_option;
    if (t.build_option) $("opt-build").checked = !!cfg.build_default;
    const sample = cfg.samples[tool];
    $("paste-name").placeholder = sample ? sample.name : "path/to/file";
    $("load-example").hidden = !sample;
  }
  $("load-example").addEventListener("click", () => {
    const sample = cfg.samples[tool];
    if (!sample) return;
    $("paste-name").value = sample.name;
    $("paste-text").value = expandSample(sample.content);
    warmUp();
  });
  const sel = $("tool-select");
  if (sel) {
    sel.value = tool;
    sel.addEventListener("change", () => { tool = sel.value; applyTool(); $("results").hidden = true; });
  }
  applyTool();

  // ------------------------------------------------------------ worker
  let worker = null;
  let pending = null;
  const status = (t) => { $("status").textContent = t; };

  function getWorker() {
    if (worker) return worker;
    const sv = (document.querySelector('script[src*="app.js"]').src.split("?v=")[1]) || "";
    worker = new Worker(new URL("worker.js?v=" + sv, document.querySelector('script[src*="app.js"]').src));
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "ready") { if (!pending) status("Python engine ready. Nothing leaves this tab."); }
      else if (m.type === "progress") status(m.text);
      else if (m.type === "result" || m.type === "error") {
        const p = pending; pending = null;
        if (p) (m.type === "result" ? p.resolve(m.result) : p.reject(new Error(m.error)));
      }
    };
    worker.onerror = (e) => {
      const p = pending; pending = null;
      if (p) p.reject(new Error(e.message || "worker error"));
    };
    return worker;
  }
  let warmed = false;
  function warmUp() {
    if (warmed) return;
    warmed = true;
    status("Loading the Python engine...");
    getWorker().postMessage({ type: "init", cdn: cfg.pyodide });
  }
  $("checker").addEventListener("focusin", warmUp, { once: true });

  // ------------------------------------------------------------ run
  $("run").addEventListener("click", async () => {
    if (pending) return;
    const files = [];
    for (const f of picked) files.push({ path: f.path, data: await f.file.arrayBuffer() });
    const text = $("paste-text").value;
    if (text.trim()) {
      let name = ($("paste-name").value.trim() || $("paste-name").placeholder || "pasted.txt")
        .replace(/\\/g, "/").replace(/^\/+/, "");
      name = name.split("/").filter((p) => p && p !== "." && p !== "..").join("/") || "pasted.txt";
      files.push({ path: name, data: new TextEncoder().encode(text).buffer });
    }
    if (!files.length) { status("Choose a folder or files, or paste a file first."); return; }
    const t = cfg.tools[tool];
    const args = [];
    if (t.include_tests && $("opt-tests").checked) args.push("--include-tests");
    if (t.build_option && !scanBuild()) args.push("--no-include-build");
    warmed = true;
    status("Starting...");
    $("run").disabled = true;
    try {
      const result = await new Promise((resolve, reject) => {
        pending = { resolve, reject };
        getWorker().postMessage({ type: "scan", cdn: cfg.pyodide, tool, package: t.package, zip: t.zip,
          files, args }, files.map((f) => f.data));
      });
      if (!result.stdout) throw new Error(result.stderr || "the checker produced no output");
      const report = JSON.parse(result.stdout);
      renderReport(report);
      status("Done. Scanned in this tab; nothing was uploaded.");
    } catch (e) {
      status("Error: " + e.message);
    } finally {
      $("run").disabled = false;
    }
  });

  // ------------------------------------------------------------ results
  const SEVS = ["critical", "high", "medium", "low", "info"];
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function renderReport(r) {
    const box = $("results");
    box.textContent = "";
    box.hidden = false;
    const head = el("div", "res-head");
    head.appendChild(el("h3", null, r.findings.length ? r.findings.length + " finding(s)" : "No findings"));
    const counts = el("div", "counts");
    SEVS.forEach((s) => {
      const n = (r.summary || {})[s];
      if (n) counts.appendChild(el("span", "sev sev-" + s, n + " " + s));
    });
    head.appendChild(counts);
    box.appendChild(head);
    const meta = [];
    if (r.files_scanned != null) meta.push(r.files_scanned + " file(s) scanned by " + r.tool + " " + r.version);
    if (r.frameworks && r.frameworks.length) meta.push("frameworks: " + r.frameworks.join(", "));
    box.appendChild(el("p", "muted", meta.join(" · ")));
    if (!r.findings.length) {
      box.appendChild(el("p", null, "None of this checker's patterns were found. This is not a guarantee: " +
        "it is a static check for known mistakes. Make sure the files you selected are the ones this check reads."));
    }
    const list = el("ol", "findings");
    r.findings.forEach((f) => {
      const li = el("li", "finding");
      const top = el("div", "f-top");
      top.appendChild(el("span", "sev sev-" + f.severity, f.severity));
      top.appendChild(el("code", "rule", f.rule_id));
      top.appendChild(el("strong", "f-title", f.title));
      if (f.heuristic) top.appendChild(el("span", "tag", "heuristic"));
      li.appendChild(top);
      if (f.file) li.appendChild(el("div", "loc", f.file + (f.line ? ":" + f.line : "")));
      li.appendChild(el("p", "msg", f.message));
      if (f.evidence) { const pre = el("pre", "evidence"); pre.appendChild(el("code", null, f.evidence)); li.appendChild(pre); }
      if (f.fix) {
        const d = el("details", "fix"); d.open = true;
        d.appendChild(el("summary", null, "How to fix"));
        const pre = el("pre"); pre.appendChild(el("code", null, f.fix)); d.appendChild(pre);
        li.appendChild(d);
      }
      if (f.why) {
        const d = el("details", "why");
        d.appendChild(el("summary", null, "Why it matters"));
        d.appendChild(el("p", null, f.why));
        li.appendChild(d);
      }
      list.appendChild(li);
    });
    box.appendChild(list);
    const actions = el("div", "res-actions");
    const dl = el("button", "btn small", "Download JSON report");
    dl.type = "button";
    dl.addEventListener("click", () => {
      const clean = Object.assign({}, r);
      delete clean.targets; delete clean.target;
      const url = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2) + "\n"], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.tool + "-report.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    actions.appendChild(dl);
    const repo = el("a", null, "Run it in CI: " + r.tool + " on GitHub");
    repo.href = cfg.repo[r.tool]; repo.rel = "noopener";
    actions.appendChild(repo);
    box.appendChild(actions);
    const cta = el("aside", "cta");
    cta.innerHTML = cfg.cta;   // static text from the build, not user data
    box.appendChild(cta);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
