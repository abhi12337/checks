// Web Worker: loads Pyodide from the pinned CDN URL, unpacks the checker zip served next to
// the page, writes the visitor's files into Pyodide's in-memory file system and runs the scan.
// Nothing is sent anywhere: the only network requests are the Pyodide runtime and our static files.
"use strict";
let pyodide = null;
let ready = null;
const unpacked = new Set();
let scanCounter = 0;

function init(cdn) {
  if (!ready) {
    ready = (async () => {
      importScripts(cdn + "pyodide.js");
      pyodide = await loadPyodide({ indexURL: cdn, stdout: () => {}, stderr: () => {} });
      const src = await (await fetch(new URL("runner.py", self.location))).text();
      pyodide.FS.mkdirTree("/checks");
      pyodide.FS.writeFile("/checks/runner.py", src);
      pyodide.runPython("import sys; sys.path.insert(0, '/checks'); import runner");
    })();
  }
  return ready;
}

async function ensureTool(tool, zipPath) {
  if (unpacked.has(tool)) return;
  const res = await fetch(new URL("../" + zipPath, self.location));
  if (!res.ok) throw new Error("Could not load the checker (" + res.status + ")");
  const buf = await res.arrayBuffer();
  pyodide.unpackArchive(buf, "zip", { extractDir: "/checks/tools/" + tool });
  unpacked.add(tool);
}

function writeFiles(root, files) {
  for (const f of files) {
    const path = root + "/" + f.path;
    const dir = path.slice(0, path.lastIndexOf("/"));
    pyodide.FS.mkdirTree(dir);
    pyodide.FS.writeFile(path, new Uint8Array(f.data));
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "init") {
      await init(msg.cdn);
      self.postMessage({ type: "ready" });
      return;
    }
    if (msg.type === "scan") {
      await init(msg.cdn);
      self.postMessage({ type: "progress", text: "Loading " + msg.tool + "..." });
      await ensureTool(msg.tool, msg.zip);
      const base = "/tmp/scan-" + (++scanCounter);
      const root = base + "/project";
      pyodide.FS.mkdirTree(root);
      writeFiles(root, msg.files);
      self.postMessage({ type: "progress", text: "Scanning " + msg.files.length + " file(s)..." });
      const runner = pyodide.pyimport("runner");
      let raw;
      try {
        raw = runner.run_scan(msg.package, "/checks/tools/" + msg.tool, root, JSON.stringify(msg.args || []));
      } finally {
        runner.remove_tree(base);
        runner.destroy();
      }
      self.postMessage({ type: "result", id: msg.id, result: JSON.parse(raw) });
    }
  } catch (e) {
    self.postMessage({ type: "error", id: msg.id, error: String((e && e.message) || e) });
  }
};
