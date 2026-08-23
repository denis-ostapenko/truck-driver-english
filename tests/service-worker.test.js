const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SW_SOURCE = fs.readFileSync(path.join(ROOT, "app", "sw.js"), "utf8");
const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
const APP_SOURCE = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
const SCOPE = "http://127.0.0.1:8127/";

function cacheKey(request) {
  return typeof request === "string" ? new URL(request, SCOPE).href : request.url;
}

class MemoryCache {
  constructor(fetchImpl) {
    this.fetchImpl = fetchImpl;
    this.entries = new Map();
  }

  async addAll(urls) {
    for (const url of urls) {
      const request = new Request(new URL(url, SCOPE));
      const response = await this.fetchImpl(request);
      if (!response.ok) throw new Error(`Unable to precache ${request.url}`);
      this.entries.set(request.url, response.clone());
    }
  }

  async match(request) {
    const response = this.entries.get(cacheKey(request));
    return response ? response.clone() : undefined;
  }

  async put(request, response) {
    this.entries.set(cacheKey(request), response.clone());
  }

  async keys() {
    return [...this.entries.keys()].map(url => new Request(url));
  }

  async delete(request) {
    return this.entries.delete(cacheKey(request));
  }
}

function loadWorker(fetchImpl, source = SW_SOURCE) {
  const listeners = new Map();
  const stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache(fetchImpl));
      return stores.get(name);
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  const self = {
    location: { origin: new URL(SCOPE).origin },
    registration: { scope: SCOPE },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  vm.runInNewContext(source, {
    caches,
    fetch: fetchImpl,
    Headers,
    Request,
    Response,
    URL,
    self,
  }, { filename: "sw.js" });
  return { caches, listeners, stores };
}

async function dispatchFetch(worker, request) {
  let responsePromise;
  worker.listeners.get("fetch")({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    },
  });
  assert.ok(responsePromise, "service worker did not handle same-origin GET");
  return responsePromise;
}

test("shell manifest tracks the current runtime versions", () => {
  for (const asset of [
    "./styles.css?v=13",
    "./app.js?v=31",
    "./app-core.js?v=5",
    "./learning-evaluator.js?v=6",
    "./state-store.js?v=6",
    "./data/course-data.js?v=12",
    "./data/listening-data.js?v=2",
  ]) {
    assert.match(SW_SOURCE, new RegExp(asset.replace(/[.?]/g, "\\$&")));
    assert.ok(INDEX_SOURCE.includes(asset.slice(2)), `${asset} must match index.html`);
  }
  assert.match(SW_SOURCE, /CACHE_VERSION = "v38"/);
  assert.match(APP_SOURCE, /serviceWorker\.register\("sw\.js\?v=38"\)/);
  assert.match(APP_SOURCE, /script\.src = "data\/audio-data\.js\?v=6"/);
  assert.equal(INDEX_SOURCE.includes('src="data/audio-data.js?v=6"'), false);
  assert.equal(SW_SOURCE.includes('"./data/audio-data.js?v=6"'), false);
});

test("precache installation includes all 16 shell images and 49 FHWA SVGs", () => {
  const shellBlock = SW_SOURCE.match(/const SHELL = \[([\s\S]*?)\n\];/)[1];
  assert.equal((shellBlock.match(/\.\/images\//g) || []).length, 16);
  assert.equal((shellBlock.match(/\.\/assets\/signs\//g) || []).length, 49);
});

test("pre-cached image returns 200 offline with an empty media cache", async () => {
  const worker = loadWorker(async () => { throw new Error("offline"); });
  const shell = await worker.caches.open("truck-driver-english-shell-v38");
  const imageUrl = new URL("images/equipment/fifth-wheel-v01.webp", SCOPE).href;
  await shell.put(imageUrl, new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "image/webp" },
  }));

  const response = await dispatchFetch(worker, new Request(imageUrl));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
});

test("pre-cached official SVG returns 200 offline with an empty media cache", async () => {
  const worker = loadWorker(async () => { throw new Error("offline"); });
  const shell = await worker.caches.open("truck-driver-english-shell-v38");
  const svgUrl = new URL("assets/signs/R1-1.svg", SCOPE).href;
  await shell.put(svgUrl, new Response("<svg></svg>", {
    status: 200,
    headers: { "Content-Type": "image/svg+xml" },
  }));

  const response = await dispatchFetch(worker, new Request(svgUrl));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/svg+xml");
  assert.equal(await response.text(), "<svg></svg>");
});

test("warm audio Range request returns exact 206 bytes offline", async () => {
  const worker = loadWorker(async () => { throw new Error("offline"); });
  const media = await worker.caches.open("truck-driver-english-media-v38");
  const audioUrl = new URL("audio/warm.mp3", SCOPE).href;
  await media.put(audioUrl, new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  }));

  const response = await dispatchFetch(worker, new Request(audioUrl, {
    headers: { Range: "bytes=2-5" },
  }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/8");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [2, 3, 4, 5]);
});

test("uncached media returns an explicit offline fallback instead of rejecting", async () => {
  const worker = loadWorker(async () => { throw new Error("offline"); });
  const audioUrl = new URL("audio/not-warmed.mp3", SCOPE).href;
  const response = await dispatchFetch(worker, new Request(audioUrl));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Truck-Driver-Offline"), "media-miss");
  assert.equal(await response.text(), "Offline media is not cached");
});

test("uncached offline Range request returns the same explicit fallback", async () => {
  const worker = loadWorker(async () => { throw new Error("offline"); });
  const audioUrl = new URL("audio/not-warmed.mp3", SCOPE).href;
  const response = await dispatchFetch(worker, new Request(audioUrl, {
    headers: { Range: "bytes=0-31" },
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("X-Truck-Driver-Offline"), "media-miss");
});

test("lazy audio metadata is cached after first use and remains available offline", async () => {
  let online = true;
  const worker = loadWorker(async request => {
    if (!online) throw new Error("offline");
    return new Response("self.TRUCK_AUDIO_DATA={};", {
      status: 200,
      headers: { "Content-Type": "text/javascript" },
    });
  });
  const dataUrl = new URL("data/audio-data.js?v=6", SCOPE).href;
  const first = await dispatchFetch(worker, new Request(dataUrl));
  assert.equal(first.status, 200);
  online = false;
  const warmOffline = await dispatchFetch(worker, new Request(dataUrl));
  assert.equal(warmOffline.status, 200);
  assert.equal(await warmOffline.text(), "self.TRUCK_AUDIO_DATA={};");
});

test("media cache enforces an entry LRU cap while preserving the newest warm audio", async () => {
  let sequence = 0;
  const worker = loadWorker(async request => new Response(new Uint8Array([sequence++ % 255]), {
    status: 200,
    headers: { "Content-Type": request.url.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream" },
  }));
  for (let index = 0; index < 194; index += 1) {
    const url = new URL(`audio/lru-${String(index).padStart(3, "0")}.mp3`, SCOPE).href;
    const response = await dispatchFetch(worker, new Request(url));
    assert.equal(response.status, 200);
  }
  const media = await worker.caches.open("truck-driver-english-media-v38");
  assert.ok((await media.keys()).length <= 192);
  assert.equal(Boolean(await media.match(new URL("audio/lru-193.mp3", SCOPE).href)), true);
  assert.equal(Boolean(await media.match(new URL("audio/lru-000.mp3", SCOPE).href)), false);
});

test("media cache enforces its byte budget without evicting the just-warmed response", async () => {
  const tinyBudgetSource = SW_SOURCE.replace("64 * 1024 * 1024", "6");
  const worker = loadWorker(async () => new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  }), tinyBudgetSource);
  for (let index = 0; index < 3; index += 1) {
    await dispatchFetch(worker, new Request(new URL(`audio/bytes-${index}.mp3`, SCOPE)));
  }
  const media = await worker.caches.open("truck-driver-english-media-v38");
  assert.equal((await media.keys()).length, 1);
  assert.equal(Boolean(await media.match(new URL("audio/bytes-2.mp3", SCOPE).href)), true);
});

test("a single response larger than the byte budget is not retained", async () => {
  const tinyBudgetSource = SW_SOURCE.replace("64 * 1024 * 1024", "3");
  let online = true;
  const worker = loadWorker(async () => {
    if (!online) throw new Error("offline");
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }, tinyBudgetSource);
  const audioUrl = new URL("audio/oversized.mp3", SCOPE).href;
  assert.equal((await dispatchFetch(worker, new Request(audioUrl))).status, 200);
  const media = await worker.caches.open("truck-driver-english-media-v38");
  assert.equal((await media.keys()).length, 0);
  online = false;
  assert.equal((await dispatchFetch(worker, new Request(audioUrl))).status, 503);
});

test("concurrent media writes still obey the entry cap", async () => {
  const worker = loadWorker(async () => new Response(new Uint8Array([1]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  }));
  await Promise.all(Array.from({ length: 220 }, (_, index) => {
    const url = new URL(`audio/concurrent-${String(index).padStart(3, "0")}.mp3`, SCOPE).href;
    return dispatchFetch(worker, new Request(url));
  }));
  const media = await worker.caches.open("truck-driver-english-media-v38");
  assert.ok((await media.keys()).length <= 192);
});

test("a warm Range read refreshes LRU priority", async () => {
  const twoEntrySource = SW_SOURCE.replace("MEDIA_CACHE_MAX_ENTRIES = 192", "MEDIA_CACHE_MAX_ENTRIES = 2");
  const worker = loadWorker(async () => new Response(new Uint8Array([0, 1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  }), twoEntrySource);
  const first = new URL("audio/lru-first.mp3", SCOPE).href;
  const second = new URL("audio/lru-second.mp3", SCOPE).href;
  const third = new URL("audio/lru-third.mp3", SCOPE).href;
  await dispatchFetch(worker, new Request(first));
  await dispatchFetch(worker, new Request(second));
  const partial = await dispatchFetch(worker, new Request(first, { headers: { Range: "bytes=1-2" } }));
  assert.equal(partial.status, 206);
  await dispatchFetch(worker, new Request(third));
  const media = await worker.caches.open("truck-driver-english-media-v38");
  assert.equal(Boolean(await media.match(first)), true);
  assert.equal(Boolean(await media.match(second)), false);
  assert.equal(Boolean(await media.match(third)), true);
});

test("offline navigation returns the cached application shell with status 200", async () => {
  const worker = loadWorker(async () => { throw new Error("offline"); });
  const shell = await worker.caches.open("truck-driver-english-shell-v38");
  const shellUrl = new URL("index.html", SCOPE).href;
  await shell.put(shellUrl, new Response("<!doctype html><title>Offline</title>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }));
  const navigation = new Request(new URL("today", SCOPE));
  Object.defineProperty(navigation, "mode", { value: "navigate" });
  const response = await dispatchFetch(worker, navigation);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Offline/);
});

test("activation removes only stale app caches and preserves an unrelated cache", async () => {
  const worker = loadWorker(async () => new Response("ok", { status: 200 }));
  await worker.caches.open("truck-driver-english-shell-v28");
  await worker.caches.open("truck-driver-english-media-v28");
  await worker.caches.open("unrelated-application-cache");
  let activation;
  worker.listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;
  const keys = await worker.caches.keys();
  assert.equal(keys.includes("truck-driver-english-shell-v28"), false);
  assert.equal(keys.includes("truck-driver-english-media-v28"), false);
  assert.equal(keys.includes("unrelated-application-cache"), true);
});
