/*
 * OpenCAD DWG·DXF 서비스 워커. 빌드가 공용 사이트 도구(opencad-site-kit의 serviceWorker, 설정은 tools/site.mjs)로 dist/sw.js를 만든다(__…__ 자리는 빌드 때 채운다).
 *
 * - 처음 설치: 앱 껍데기(다섯 언어 쪽·앱 정보·아이콘)와 편집기에 꼭 필요한 빌드 결과(시작 스크립트·스타일·편집기·해석 워커·저장 모듈·글꼴 해석기)를
 *   이 판의 캐시에 담는다. 내용 지문 이름(assets/)은 앞 판 캐시나 브라우저 캐시에서 먼저 찾아 같은 파일을 두 번 받지 않는다.
 * - 쪽(HTML)은 네트워크 먼저(새 배포가 곧바로 보이게), 안 되면 담아 둔 쪽(주소 인자는 무시 — ?sample·?open=도 오프라인에서 열린다).
 * - 빌드 결과(assets/)는 담아 둔 것 먼저, 없으면 받아서 담는다(다른 언어 사전·PDF 해석기처럼 쓸 때만 받는 것).
 * - 글꼴(fonts/)·PDF 자료(pdfjs/)·예제 도면(samples/)은 크다(합쳐 10MB 남짓). 미리 담지 않고 쓴 것만 따로 담는다.
 *   이 캐시는 그 파일들의 내용 지문(STATIC)이 바뀔 때만 비운다.
 * - 그 밖(같은 출처의 ?open= 도면 등)과 앱 범위 밖 주소는 손대지 않는다(바뀐 파일이 옛것으로 열리거나 큰 파일이 쌓이지 않게).
 * - 새 판은 설치만 하고 기다린다. 앱이 "새 버전" 알림에서 새로 고침을 고르면 SKIP_WAITING으로 바꾼다.
 * - 앱이 CACHE_URLS로 서비스 워커가 맡기 전에 받은 파일 주소를 보내면, 위 규칙에 맞는 것만 담는다(첫 방문의 언어 사전·글꼴).
 * - 공유 받기(Android share_target): POST …/share-target의 도면을 최근 문서 IndexedDB(opencad-2d, recent)에 넣고
 *   그 언어 쪽 ?recent=<id>로 보낸다. 파일은 서버로 가지 않는다. 60MB보다 크면 ?share-error=too-big.
 */
'use strict';
const VERSION = '__VERSION__';
const STATIC = '__STATIC__';
const PRECACHE = __PRECACHE__;
const ASSETS = __ASSETS__;
const APP_PREFIX = 'opencad-dwgdxf-app-';
const STATIC_PREFIX = 'opencad-dwgdxf-static-';
const CACHE = APP_PREFIX + VERSION;
const STATIC_CACHE = STATIC_PREFIX + STATIC;
const SCOPE = self.registration.scope;
const SCOPE_PATH = new URL(SCOPE).pathname;
const PRECACHE_PATHS = new Set(PRECACHE.map((u) => new URL(u, SCOPE).pathname));
/** 이 판의 빌드 결과 전부(앞 판 캐시에서 같은 이름을 옮겨 올 때 본다) */
const ASSET_PATHS = new Set(ASSETS.map((u) => new URL(u, SCOPE).pathname));
const STATIC_DIRS = ['fonts/', 'pdfjs/', 'samples/'];
const RECENT_DB = 'opencad-2d';
const RECENT_STORE = 'recent';
const RECENT_MAX = 8;
const RECENT_MAX_SIZE = 60 * 1024 * 1024;

const rel = (url) => url.pathname.slice(SCOPE_PATH.length);
/** 이 주소를 담아 둘 캐시 이름(담지 않으면 null) */
function cacheFor(url) {
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return null;
  const r = rel(url);
  if (PRECACHE_PATHS.has(url.pathname) || r.startsWith('assets/')) return CACHE;
  if (STATIC_DIRS.some((d) => r.startsWith(d))) return STATIC_CACHE;
  return null;
}
const storable = (res) => res && res.ok && res.status === 200 && res.type === 'basic';

/** 앞 판 캐시에 같은 이름의 빌드 결과가 있으면 그것(내용 지문 이름은 내용이 같다) */
async function fromOldCache(url) {
  for (const key of await caches.keys()) {
    if (!key.startsWith(APP_PREFIX) || key === CACHE) continue;
    const hit = await (await caches.open(key)).match(url);
    if (hit) return hit;
  }
  return null;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (u) => {
          const url = new URL(u, SCOPE);
          const immutable = rel(url).startsWith('assets/');
          const old = immutable ? await fromOldCache(url.href) : null;
          if (old) return cache.put(url.href, old);
          // 내용 지문 이름은 브라우저 캐시를 그대로 쓰고(첫 방문에 방금 받은 것), 쪽·앱 정보·아이콘은 서버에 바뀌었는지 묻는다
          const res = await fetch(new Request(url.href, { cache: immutable ? 'default' : 'no-cache' }));
          if (!res.ok) throw new Error(`precache ${url.href} ${res.status}`);
          return cache.put(url.href, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const key of await caches.keys()) {
        if (key.startsWith(APP_PREFIX) && key !== CACHE) {
          // 앞 판이 쓸 때 받아 둔 빌드 결과 가운데 이 판에도 있는 것(다른 언어 사전 등)은 옮긴다
          const old = await caches.open(key);
          for (const req of await old.keys()) {
            const path = new URL(req.url).pathname;
            if (ASSET_PATHS.has(path) && !(await cache.match(req.url))) {
              const res = await old.match(req);
              if (res) await cache.put(req.url, res);
            }
          }
          await caches.delete(key);
        } else if (key.startsWith(STATIC_PREFIX) && key !== STATIC_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) event.waitUntil(cacheUrls(data.urls));
});

/** 서비스 워커가 맡기 전에 받은 파일 가운데 담을 것만 담는다(이미 있으면 그대로) */
async function cacheUrls(urls) {
  const seen = new Set();
  for (const raw of urls.slice(0, 400)) {
    let url;
    try {
      url = new URL(String(raw), SCOPE);
    } catch (e) {
      continue;
    }
    url.hash = '';
    const name = cacheFor(url);
    if (!name || seen.has(url.href)) continue;
    seen.add(url.href);
    try {
      const cache = await caches.open(name);
      if (await cache.match(url.href)) continue;
      const res = await fetch(url.href);
      if (storable(res)) await cache.put(url.href, res);
    } catch (e) {
      /* 받지 못하면 다음에 쓸 때 담는다 */
    }
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    event.respondWith(page(req, url));
    return;
  }
  const name = cacheFor(url);
  if (!name) return;
  event.respondWith(cacheFirst(req, url, name));
});

/** 쪽 주소를 캐시 열쇠로(주소 인자·index.html·끝 / 없는 언어 쪽을 맞춘다) */
function pageKey(url) {
  let path = url.pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/') && PRECACHE_PATHS.has(path + '/')) path += '/';
  return url.origin + path;
}

async function page(req, url) {
  const key = pageKey(url);
  try {
    const res = await fetch(req);
    if (res.ok && PRECACHE_PATHS.has(new URL(key).pathname)) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
    }
    return res;
  } catch (e) {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(key)) || (await cache.match(SCOPE));
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, url, name) {
  const cache = await caches.open(name);
  // 범위 요청(Range)은 담아 둔 전체 파일로 답하지 않는다
  if (req.headers.has('range')) return fetch(req);
  const hit = await cache.match(req, { ignoreSearch: url.pathname.endsWith('.webmanifest') });
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) cache.put(req, res.clone()).catch(() => {});
  return res;
}

function openRecent() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(RECENT_DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(RECENT_STORE)) r.result.createObjectStore(RECENT_STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('IndexedDB'));
  });
}

function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** 최근 문서에 넣고(앱 recent.ts와 같은 꼴: id = 이름:크기, data = ArrayBuffer) 새것부터 8개만 남긴다 */
async function putRecent(name, data) {
  const db = await openRecent();
  try {
    const id = `${name}:${data.byteLength}`;
    await request(db.transaction(RECENT_STORE, 'readwrite').objectStore(RECENT_STORE).put({ id, name, size: data.byteLength, time: Date.now(), data }));
    const all = await request(db.transaction(RECENT_STORE, 'readonly').objectStore(RECENT_STORE).getAll());
    const extra = (all || []).sort((a, b) => b.time - a.time).slice(RECENT_MAX);
    if (extra.length) {
      const store = db.transaction(RECENT_STORE, 'readwrite').objectStore(RECENT_STORE);
      await Promise.all(extra.map((e) => request(store.delete(e.id))));
    }
    return id;
  } finally {
    db.close();
  }
}

async function receiveShare(req) {
  const back = new URL('./', req.url);
  const go = (key, value) => {
    back.searchParams.set(key, value);
    return Response.redirect(back.href, 303);
  };
  try {
    const form = await req.formData();
    const file = form.getAll('file').find((f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function');
    if (!file) return go('share-error', 'no-file');
    if (file.size > RECENT_MAX_SIZE) return go('share-error', 'too-big');
    const name = String(file.name || 'shared.dwg').replace(/^.*[\\/]/, '') || 'shared.dwg';
    return go('recent', await putRecent(name, await file.arrayBuffer()));
  } catch (e) {
    return go('share-error', 'store');
  }
}
