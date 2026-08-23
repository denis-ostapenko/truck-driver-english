const CACHE_VERSION = "v38";
const SHELL_CACHE = `truck-driver-english-shell-${CACHE_VERSION}`;
const MEDIA_CACHE = `truck-driver-english-media-${CACHE_VERSION}`;
const MEDIA_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const MEDIA_CACHE_MAX_ENTRIES = 192;
const CACHE_SIZE_HEADER = "X-Truck-Cache-Size";
const CACHE_TIME_HEADER = "X-Truck-Cache-Time";
let lastCacheTouch = 0;
let mediaMutationQueue = Promise.resolve();

const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=13",
  "./app.js?v=31",
  "./app-core.js?v=5",
  "./learning-evaluator.js?v=6",
  "./state-store.js?v=6",
  "./recorder-controller.js?v=1",
  "./data/course-data.js?v=12",
  "./data/listening-data.js?v=2",
  "./assets/icon.svg",
  "./manifest.webmanifest",
  "./guide.html",
  "./LICENSE",
  "./NOTICE",
  "./USER_GUIDE_RU.md",
  "./USER_GUIDE_UK.md",
  "./USER_GUIDE_BE.md",
  "./images/equipment/fifth-wheel-v01.webp",
  "./images/equipment/gladhands-red-blue-v01.webp",
  "./images/equipment/landing-gear-raised-v01.webp",
  "./images/equipment/trailer-tandems-v01.webp",
  "./images/equipment/gooseneck-coupling-v01.webp",
  "./images/actions/check-seal-v01.webp",
  "./images/actions/open-hood-inspection-v01.webp",
  "./images/actions/hand-documents-inspector-v01.webp",
  "./images/actions/check-tire-sidewall-v01.webp",
  "./images/situations/roadside-inspection-v01.webp",
  "./images/situations/level-two-walkaround-v01.webp",
  "./images/situations/security-gate-checkin-v01.webp",
  "./images/situations/roadside-breakdown-v01.webp",
  "./images/situations/hotshot-car-hauler-v01.webp",
  "./images/situations/hotshot-winch-loading-v01.webp",
  "./images/situations/hotshot-enclosed-loading-v01.webp",
  "./assets/signs/R1-1.svg",
  "./assets/signs/R1-2.svg",
  "./assets/signs/R2-1-50.svg",
  "./assets/signs/R3-4.svg",
  "./assets/signs/R3-7L.svg",
  "./assets/signs/R4-1.svg",
  "./assets/signs/R4-2.svg",
  "./assets/signs/R4-3.svg",
  "./assets/signs/R4-7.svg",
  "./assets/signs/R5-1.svg",
  "./assets/signs/R5-1a.svg",
  "./assets/signs/R5-2.svg",
  "./assets/signs/R6-1.svg",
  "./assets/signs/R10-11.svg",
  "./assets/signs/R14-1.svg",
  "./assets/signs/R16-3.svg",
  "./assets/signs/R02-06aP.svg",
  "./assets/signs/R04-05.svg",
  "./assets/signs/R07-01.svg",
  "./assets/signs/R12-01.svg",
  "./assets/signs/R12-02.svg",
  "./assets/signs/R14-03.svg",
  "./assets/signs/W03-01.svg",
  "./assets/signs/W03-04.svg",
  "./assets/signs/W04-01R.svg",
  "./assets/signs/W04-02R.svg",
  "./assets/signs/W05-02.svg",
  "./assets/signs/W06-02.svg",
  "./assets/signs/W07-01.svg",
  "./assets/signs/W07-02bP.svg",
  "./assets/signs/W08-04.svg",
  "./assets/signs/W08-05.svg",
  "./assets/signs/W08-06.svg",
  "./assets/signs/W08-13.svg",
  "./assets/signs/W08-14.svg",
  "./assets/signs/W08-21.svg",
  "./assets/signs/W12-02.svg",
  "./assets/signs/W20-01.svg",
  "./assets/signs/W20-02.svg",
  "./assets/signs/W20-04.svg",
  "./assets/signs/W20-05L.svg",
  "./assets/signs/W20-05R.svg",
  "./assets/signs/W20-07a.svg",
  "./assets/signs/W21-05bR.svg",
  "./assets/signs/G20-02.svg",
  "./assets/signs/D05-01.svg",
  "./assets/signs/D08-01a.svg",
  "./assets/signs/D09-16.svg",
  "./assets/signs/D09-17P.svg",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const current = new Set([SHELL_CACHE, MEDIA_CACHE]);
    const keys = await caches.keys();
    const stale = keys.filter(key => (
      key.startsWith("truck-driver-english-shell-") ||
      key.startsWith("truck-driver-english-media-")
    ) && !current.has(key));
    await Promise.all(stale.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function responseCanBeCached(response) {
  return Boolean(response && response.ok && (response.type === "basic" || response.type === "default"));
}

function nextCacheTouch() {
  lastCacheTouch = Math.max(Date.now(), lastCacheTouch + 1);
  return lastCacheTouch;
}

function serializeMediaMutation(operation) {
  const result = mediaMutationQueue.then(operation, operation);
  mediaMutationQueue = result.catch(() => {});
  return result;
}

async function cacheableMediaResponse(response, cachedAt = nextCacheTouch()) {
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(CACHE_SIZE_HEADER, String(body.byteLength));
  headers.set(CACHE_TIME_HEADER, String(cachedAt));
  headers.set("Content-Length", String(body.byteLength));
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function enforceMediaBudget(cache, protectedUrl = "") {
  if (typeof cache.keys !== "function" || typeof cache.delete !== "function") return;
  const requests = await cache.keys();
  const entries = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    let size = Number(response.headers.get(CACHE_SIZE_HEADER));
    if (!Number.isFinite(size) || size < 0) size = (await response.arrayBuffer()).byteLength;
    const touchedAt = Number(response.headers.get(CACHE_TIME_HEADER)) || 0;
    entries.push({ request, url: request.url, size, touchedAt });
  }
  entries.sort((left, right) => left.touchedAt - right.touchedAt || left.url.localeCompare(right.url));
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  let totalEntries = entries.length;
  for (const entry of entries) {
    if (totalEntries <= MEDIA_CACHE_MAX_ENTRIES && totalBytes <= MEDIA_CACHE_MAX_BYTES) break;
    if (entry.url === protectedUrl && entries.length > 1) continue;
    if (await cache.delete(entry.request)) {
      totalEntries -= 1;
      totalBytes -= entry.size;
    }
  }
  if (totalEntries > MEDIA_CACHE_MAX_ENTRIES || totalBytes > MEDIA_CACHE_MAX_BYTES) {
    const protectedEntry = entries.find(entry => entry.url === protectedUrl);
    if (protectedEntry && await cache.delete(protectedEntry.request)) {
      totalEntries -= 1;
      totalBytes -= protectedEntry.size;
    }
  }
}

async function putMediaResponse(cache, request, response) {
  return serializeMediaMutation(async () => {
    const cached = await cacheableMediaResponse(response.clone());
    await cache.put(request, cached);
    await enforceMediaBudget(cache, request.url || String(request));
  });
}

async function touchMediaResponse(cache, request, response) {
  try {
    await serializeMediaMutation(async () => {
      await cache.put(request, await cacheableMediaResponse(response.clone()));
      await enforceMediaBudget(cache, request.url || String(request));
    });
  } catch (_error) {
    // A failed metadata refresh must not make warm offline media unavailable.
  }
}

function requestWithoutRange(request) {
  const headers = new Headers(request.headers);
  headers.delete("range");
  return new Request(request, { headers });
}

function parseRangeHeader(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return [Math.max(0, size - suffix), size - 1];
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null;
  if (start >= size || requestedEnd < start) return null;
  return [start, Math.min(requestedEnd, size - 1)];
}

async function partialResponse(request, cache, bounded = false) {
  const fullRequest = requestWithoutRange(request);
  let fullResponse = await cache.match(fullRequest);
  const wasCached = Boolean(fullResponse);
  if (!fullResponse) {
    fullResponse = await fetch(fullRequest);
    if (!responseCanBeCached(fullResponse)) return fullResponse;
    if (bounded) await putMediaResponse(cache, fullRequest, fullResponse);
    else await cache.put(fullRequest, fullResponse.clone());
  }
  if (bounded && wasCached) await touchMediaResponse(cache, fullRequest, fullResponse);

  const buffer = await fullResponse.arrayBuffer();
  const range = parseRangeHeader(request.headers.get("range"), buffer.byteLength);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${buffer.byteLength}`,
        "Content-Length": "0",
      },
    });
  }

  const [start, end] = range;
  const headers = new Headers(fullResponse.headers);
  headers.delete(CACHE_SIZE_HEADER);
  headers.delete(CACHE_TIME_HEADER);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${buffer.byteLength}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

function offlineMediaResponse() {
  return new Response("Offline media is not cached", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Truck-Driver-Offline": "media-miss",
    },
  });
}

async function serveMedia(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  const mediaCache = await caches.open(MEDIA_CACHE);
  const completeRequest = requestWithoutRange(request);

  const shellResponse = await shellCache.match(completeRequest);
  if (shellResponse) {
    if (request.headers.has("range")) {
      const temporaryCache = {
        match: async () => shellResponse.clone(),
        put: async () => {},
      };
      return partialResponse(request, temporaryCache);
    }
    return shellResponse;
  }

  if (request.headers.has("range")) {
    try {
      return await partialResponse(request, mediaCache, true);
    } catch (_error) {
      return offlineMediaResponse();
    }
  }

  const cached = await mediaCache.match(request);
  if (cached) {
    await touchMediaResponse(mediaCache, request, cached);
    return cached;
  }
  try {
    const response = await fetch(request);
    if (responseCanBeCached(response)) await putMediaResponse(mediaCache, request, response);
    return response;
  } catch (_error) {
    return offlineMediaResponse();
  }
}

async function serveNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (responseCanBeCached(response)) {
      await cache.put(new URL("./index.html", self.registration.scope).href, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await cache.match(new URL("./index.html", self.registration.scope).href);
    if (cached) return cached;
    return new Response("Offline shell is not ready", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function serveStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (responseCanBeCached(response)) await cache.put(request, response.clone());
    return response;
  } catch (_error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _error;
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(serveNavigation(event.request));
    return;
  }

  const isMedia = event.request.destination === "audio" ||
    ["/audio/", "/images/", "/assets/signs/"].some(part => url.pathname.includes(part));
  event.respondWith(isMedia ? serveMedia(event.request) : serveStatic(event.request));
});
