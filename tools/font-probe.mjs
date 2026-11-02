/**
 * Are the fonts local? Boots the game over file:// and over http and reports, for each @font-face, whether it loaded, plus every
 * network request the page made to another host (there should be none). Usage: node tools/font-probe.mjs
 */
import { withPage, bootSublevel, fileIndexUrl } from "./cdp-session.mjs";

async function run(label, opts) {
  const hosts = new Set(), failed = [];
  await withPage(async (cdp) => {
    cdp.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Network.requestWillBeSent") { try { const u = new URL(m.params.request.url); if (!/^(127\.0\.0\.1|localhost)?$/.test(u.hostname) && u.protocol.startsWith("http")) hosts.add(u.host); } catch {} }
      if (m.method === "Network.loadingFailed") failed.push(m.params.errorText + " " + (m.params.type || ""));
    });
    await cdp.send("Network.enable");
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    const r = await cdp.eval(`(async () => {
      const wants = [["800 40px 'Big Shoulders Stencil Display'", "SUBLEVEL"], ["500 12px 'IBM Plex Mono'", "J jab"], ["600 12px 'IBM Plex Mono'", "J jab"], ["400 14px 'IBM Plex Sans Condensed'", "Totals"], ["500 14px 'IBM Plex Sans Condensed'", "Totals"], ["600 14px 'IBM Plex Sans Condensed'", "Totals"]];
      for (const [f, t] of wants) await document.fonts.load(f, t);
      const faces = [...document.fonts].map((f) => f.family.replace(/['"]/g, "") + " " + f.weight + " " + f.status);
      return { faces, bodyFont: getComputedStyle(document.getElementById("cBody")).fontFamily.slice(0, 40), allLoaded: [...document.fonts].every((f) => f.status === "loaded") };
    })()`, true);
    console.log(label, JSON.stringify({ ...r, otherHosts: [...hosts], failedRequests: failed }));
  }, opts);
}
await run("file", { url: fileIndexUrl(), file: true });
await run("http", {});
