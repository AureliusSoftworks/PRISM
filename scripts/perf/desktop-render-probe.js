/**
 * Paste into the PRISM desktop app's Web Inspector console while a Coffee table
 * is live and lagging. Reports, in one object:
 *
 *   msPerRender   — cost of one whole-app React render, forced deliberately.
 *                   This is executed work, so it is valid whether or not the
 *                   window is visible. Chromium production reads 2.8ms.
 *   elements      — React elements created per render (webpack cache patch;
 *                   null in a production build where the module id differs).
 *   fps / p95Gap  — real frame pacing over 3s.
 *   blockedPct    — main thread blocking by timer drift, the metric that does
 *                   not lie when durations do.
 *   dpr/viewport  — paint area. Fullscreen retina is 4x a 1440x900 window.
 *
 * Nothing here mutates app state: the forced render dispatches a fresh empty
 * array into a useState([]) hook, which is a new identity with identical
 * contents — React cannot bail out, and nothing else changes.
 */
(async () => {
  const yieldTask = () => new Promise((res) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => res();
    c.port2.postMessage(0);
  });

  // 1. Find the app component without relying on names (production is minified):
  //    it is the function component with by far the most hooks (2163).
  const fiberKey = Object.keys(document.body).find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return "no react fiber on body";
  let root = document.body[fiberKey];
  while (root.return) root = root.return;
  let best = null;
  const stack = [root];
  let visited = 0;
  while (stack.length && visited < 300000) {
    const n = stack.pop();
    visited++;
    if (typeof n.type === "function" && n.memoizedState) {
      let h = n.memoizedState, c = 0;
      while (h && c < 4000) { c++; h = h.next; }
      if (!best || c > best.count) best = { fiber: n, count: c };
    }
    if (n.child) stack.push(n.child);
    if (n.sibling) stack.push(n.sibling);
  }
  if (!best) return "no component fiber found";

  // 2. A useState([]) hook is the safe churn target.
  let h = best.fiber.memoizedState, dispatch = null;
  while (h) {
    if (h.queue && h.queue.dispatch && Array.isArray(h.memoizedState) && h.memoizedState.length === 0) {
      dispatch = h.queue.dispatch;
      break;
    }
    h = h.next;
  }
  if (!dispatch) return "no empty-array state hook found";
  const force = async (n) => { for (let i = 0; i < n; i++) { dispatch([]); await yieldTask(); await yieldTask(); } };

  // 3. Frame pacing, measured before we add load of our own.
  const gaps = [];
  await new Promise((res) => {
    let last = performance.now(), n = 0;
    const tick = (t) => { gaps.push(t - last); last = t; if (++n < 180) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
  const sorted = gaps.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;

  // 4. Main-thread blocking by timer drift over ~3s of 16ms ticks.
  let blocked = 0, ticks = 0;
  const driftStart = performance.now();
  await new Promise((res) => {
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const over = now - last - 16;
      if (over > 0) blocked += over;
      last = now;
      if (++ticks < 180 && now - driftStart < 3000) setTimeout(step, 16); else res();
    };
    setTimeout(step, 16);
  });
  const driftSpan = performance.now() - driftStart;

  // 5. Element count, when the dev module id is present.
  let elements = null;
  try {
    const chunk = Object.keys(window).find((k) => /^webpackChunk/.test(k));
    let req = null;
    if (chunk) window[chunk].push([["prism-probe-" + Math.random()], {}, (r) => { req = r; }]);
    const modId = req && Object.keys(req.c).find((id) => req.c[id] && req.c[id].exports && typeof req.c[id].exports.jsxDEV === "function" && /jsx-dev-runtime\.js$/.test(id));
    if (modId) {
      const mod = req.c[modId].exports;
      const orig = mod.jsxDEV;
      let count = 0;
      Object.defineProperty(mod, "jsxDEV", { value: function (...a) { count++; return orig.apply(this, a); }, writable: true, configurable: true });
      await force(3);
      Object.defineProperty(mod, "jsxDEV", { value: orig, writable: true, configurable: true });
      elements = Math.round(count / 3);
    }
  } catch (e) { elements = "probe failed: " + e; }

  // 6. Render cost. Warm first, then measure.
  await force(3);
  const t0 = performance.now();
  await force(10);
  const msPerRender = (performance.now() - t0) / 10;

  const out = {
    msPerRender: +msPerRender.toFixed(1),
    elements,
    fps: median ? +(1000 / median).toFixed(1) : null,
    medianGapMs: +median.toFixed(1),
    p95GapMs: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
    blockedPct: +((blocked / driftSpan) * 100).toFixed(1),
    hooks: best.count,
    domNodes: document.getElementsByTagName("*").length,
    dpr: window.devicePixelRatio,
    viewport: window.innerWidth + "x" + window.innerHeight,
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
    lifecycle: document.documentElement.getAttribute("data-prism-visual-lifecycle"),
    ua: navigator.userAgent.slice(0, 90),
  };
  console.log(JSON.stringify(out, null, 2));
  return JSON.stringify(out);
})();
