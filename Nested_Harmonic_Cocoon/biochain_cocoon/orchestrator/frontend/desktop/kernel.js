// Desktop kernel: the one place that talks to the hub. Modules never fetch
// directly. They receive a ctx from here with api(), live feeds, their own
// settings, and toasts. That keeps modules isolated from each other and from
// auth, and means one shared poller per feed, however many modules watch it.

const FEEDS = {
  status: { path: "/api/status", every: 1000 },
  nodes: { path: "/api/nodes", every: 2000 },
  events: { path: "/api/events", every: 1500 },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createKernel({ token, onUnauthorized, toast }) {
  const subs = { status: new Set(), nodes: new Set(), events: new Set() };
  const latest = { status: null, nodes: null, events: [] };
  const timers = {};
  let eventCursor = 0;

  async function api(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const t = await token();
    if (t) headers.Authorization = "Bearer " + t;
    const r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) onUnauthorized?.(data.error);
    if (!r.ok) throw new ApiError(r.status, data.error || r.statusText);
    return data;
  }

  async function pollOnce(feed) {
    try {
      if (feed === "events") {
        const batch = await api("GET", `${FEEDS.events.path}?since=${eventCursor}`);
        if (batch.length) {
          eventCursor = batch[batch.length - 1].id;
          latest.events = latest.events.concat(batch).slice(-300);
          subs.events.forEach((fn) => safe(fn, batch));
        }
      } else {
        latest[feed] = await api("GET", FEEDS[feed].path);
        subs[feed].forEach((fn) => safe(fn, latest[feed]));
      }
    } catch (e) { if (!(e instanceof ApiError && e.status === 401)) console.warn("[kernel]", feed, e.message); }
  }

  function schedule(feed) {
    clearTimeout(timers[feed]);
    if (!subs[feed].size) return;
    const slow = document.hidden ? 4 : 1;                   // back off in background tabs
    timers[feed] = setTimeout(async () => { await pollOnce(feed); schedule(feed); }, FEEDS[feed].every * slow);
  }

  function subscribe(feed, fn) {
    if (!subs[feed]) throw new Error("unknown feed " + feed);
    subs[feed].add(fn);
    if (feed === "events") { if (latest.events.length) safe(fn, latest.events); }
    else if (latest[feed]) safe(fn, latest[feed]);
    if (subs[feed].size === 1) pollOnce(feed).then(() => schedule(feed));
    return () => { subs[feed].delete(fn); if (!subs[feed].size) clearTimeout(timers[feed]); };
  }

  function safe(fn, arg) { try { fn(arg); } catch (e) { console.error("[module]", e); } }

  function stop() { Object.values(timers).forEach(clearTimeout); Object.values(subs).forEach((s) => s.clear()); }

  // ctx for one module instance
  function context({ instance, manifest, user, getSettings, setSettings, getSize }) {
    const unsubs = [];
    return {
      instance, manifest, user,
      role: user.role,
      isOwner: ["owner", "service", "local"].includes(user.role),
      api: (m, p, b) => api(m, p, b),
      on(feed, fn) { const u = subscribe(feed, fn); unsubs.push(u); return u; },
      latest: (feed) => latest[feed],
      refresh: (feed) => pollOnce(feed),
      settings: { get: getSettings, set: setSettings },
      size: getSize,
      toast,
      _dispose() { unsubs.splice(0).forEach((u) => u()); },
    };
  }

  document.addEventListener("visibilitychange", () => Object.keys(subs).forEach(schedule));
  return { api, subscribe, context, stop, latest };
}
