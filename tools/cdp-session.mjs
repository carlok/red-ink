/**
 * Shared headless Chrome + static server for QA probes.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHROME } from "./chrome.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".glb": "model/gltf-binary",
};

export function createStaticServer(root = ROOT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const path = normalize(join(root, rel));
    if (!path.startsWith(root)) {
      res.writeHead(403);
      res.end("no");
      return;
    }
    try {
      const body = readFileSync(path);
      res.writeHead(200, {
        "content-type": TYPES[extname(path)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("missing");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, awaitPromise = false) {
    const out = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails.exception?.description;
      throw new Error(d || JSON.stringify(out.exceptionDetails));
    }
    return out.result.value;
  }
}

/**
 * @param {(cdp: CDP) => Promise<void>} fn
 * @param {{ file?: boolean, url?: string }} [opts]
 */
export async function withPage(fn, opts = {}) {
  const server = opts.url ? null : await createStaticServer();
  const url = opts.url || `http://127.0.0.1:${server.address().port}/index.html`;
  const debugPort = 9800 + Math.floor(Math.random() * 120);
  const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userData}`,
      "--remote-allow-origins=*",
      "--no-first-run",
      "--disable-background-networking",
      "--hide-scrollbars",
      ...(opts.file ? ["--allow-file-access-from-files"] : []),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let ws;
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      } catch { /* boot */ }
      if (!page) await new Promise((r) => setTimeout(r, 100));
    }
    if (!page) throw new Error("no Chrome page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    const cdp = new CDP(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url });
    await fn(cdp);
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
    server?.close();
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
}

export function fileIndexUrl() {
  return pathToFileURL(join(ROOT, "index.html")).href;
}

export async function bootSublevel(cdp, ms = 15000) {
  await cdp.eval(
    `(async () => {
    const t = performance.now();
    while (!window.__sublevel) {
      if (performance.now() - t > ${ms}) throw new Error("boot timeout");
      await new Promise((r) => requestAnimationFrame(r));
    }
  })()`,
    true,
  );
}

export async function waitFight(cdp, bout, ms = 8000) {
  return cdp.eval(
    `(async () => {
    const S = window.__sublevel;
    document.getElementById("wrap").hidden = true;
    document.getElementById("tutor").hidden = true;
    S.startBout(${bout});
    const t = performance.now();
    while (S.G.state !== "fight" && performance.now() - t < ${ms}) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { state: S.G.state, bout: S.G.bout };
  })()`,
    true,
  );
}
