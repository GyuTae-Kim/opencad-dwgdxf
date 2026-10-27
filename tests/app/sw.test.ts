/** 오프라인 서비스 워커(공용 사이트 도구가 tools/site.mjs 설정과 tools/sw-template.js로 만드는 dist/sw.js)를 가짜 self·caches·fetch·indexedDB로 돌린다 */
import { readFileSync } from 'node:fs';
import { fillTemplate, lazyFiles as kitLazyFiles, serviceWorkerValues, type BundleItem } from 'opencad-site-kit/pwa/sw-plugin';
import { describe, expect, it } from 'vitest';
import { lazy as lazyRules, offline, precache } from '../../tools/site.mjs';
import { createFakeIndexedDB } from './fake-idb';

const precacheable = (f: string, lazy = new Set<string>()) => precache(f, { lazy });
const precacheUrls = (files: string[], lazy = new Set<string>()) => serviceWorkerValues(files, () => '', { ...offline, lazy }).precache;
const lazyFiles = (bundle: Record<string, BundleItem>) => kitLazyFiles(bundle, lazyRules);
const template = readFileSync(new URL('../../tools/sw-template.js', import.meta.url), 'utf8');
const serviceWorkerSource = (values: Parameters<typeof fillTemplate>[1]) => fillTemplate(template, values);

const SCOPE = 'https://x.test/app/';

type Listener = (e: Record<string, unknown>) => void;

function runSw(opts: { network?: (req: Request) => Response | Promise<Response>; version?: string; staticVersion?: string; precache?: string[]; assets?: string[]; caches?: Map<string, Map<string, Response>>; idb?: ReturnType<typeof createFakeIndexedDB> } = {}) {
  const listeners = new Map<string, Listener>();
  const stores = opts.caches ?? new Map<string, Map<string, Response>>();
  const key = (r: unknown) => {
    const u = new URL(typeof r === 'string' ? r : (r as { url: string }).url);
    return u.href;
  };
  const cacheOf = (name: string) => {
    let m = stores.get(name);
    if (!m) stores.set(name, (m = new Map()));
    const store = m;
    return {
      put: async (r: unknown, res: Response) => void store.set(key(r), res),
      match: async (r: unknown, o?: { ignoreSearch?: boolean }) => {
        const k = key(r);
        const hit = store.get(k) ?? (o?.ignoreSearch ? [...store.entries()].find(([kk]) => kk.split('?')[0] === k.split('?')[0])?.[1] : undefined);
        return hit?.clone();
      },
      keys: async () => [...store.keys()].map((url) => ({ url })),
    };
  };
  const caches = {
    open: async (n: string) => cacheOf(n),
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  const fetched: { url: string; cache: string }[] = [];
  const network = opts.network ?? ((req: Request) => new Response(`net ${req.url}`, { headers: { 'content-type': 'text/plain' } }));
  const fetchFn = async (r: unknown) => {
    const req = r instanceof Request ? r : new Request(typeof r === 'string' ? r : (r as { url: string }).url);
    fetched.push({ url: req.url, cache: req.cache });
    const res = await network(req);
    // 같은 출처의 보통 응답(type basic)처럼 보이게
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  };
  const idb = opts.idb ?? createFakeIndexedDB();
  let skipped = 0;
  let claimed = 0;
  const self = {
    location: { origin: 'https://x.test' },
    registration: { scope: SCOPE },
    clients: { claim: async () => void claimed++ },
    skipWaiting: () => void skipped++,
    addEventListener: (t: string, f: Listener) => listeners.set(t, f),
  };
  const src = serviceWorkerSource({
    version: opts.version ?? 'v1',
    staticVersion: opts.staticVersion ?? 's1',
    precache: opts.precache ?? ['./', 'en/', 'manifest.webmanifest', 'assets/index-a.js', 'assets/editor-b.js'],
    assets: opts.assets ?? ['assets/index-a.js', 'assets/editor-b.js', 'assets/en-c.js'],
  });
  new Function('self', 'caches', 'fetch', 'indexedDB', src)(self, caches, fetchFn, idb.indexedDB);
  const waitUntil = async (type: string, extra: Record<string, unknown> = {}) => {
    let p: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...extra, waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const fire = async (request: Record<string, unknown>): Promise<Response | undefined> => {
    let p: Promise<Response> | undefined;
    listeners.get('fetch')!({ request, respondWith: (x: Promise<Response>) => (p = x) });
    return p ? await p : undefined;
  };
  const cached = () => [...stores.entries()].flatMap(([n, m]) => [...m.keys()].map((k) => `${n} ${k}`));
  return { stores, fetched, fire, waitUntil, cached, idb, skipped: () => skipped, claimed: () => claimed };
}

const req = (url: string, extra: Record<string, unknown> = {}) => ({ url, method: 'GET', mode: 'no-cors', headers: new Headers(), ...extra });
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('오프라인 서비스 워커: 미리 담을 목록', () => {
  it('앱 쪽·앱 정보·아이콘·편집기 덩어리는 담고, 소스 맵·공유 그림·사이트맵·글꼴·PDF 자료·예제·쓸 때만 받는 덩어리는 뺀다', () => {
    const lazy = new Set(['assets/en-1.js', 'assets/pdf.worker.min-2.mjs', 'assets/pdfraster-3.js']);
    for (const f of ['index.html', 'en/index.html', 'zh-CN/manifest.webmanifest', 'manifest.webmanifest', 'icon-192.png', 'favicon.svg', 'assets/editor-9.js', 'assets/index-1.css', 'assets/engine.worker-2.js'])
      expect(precacheable(f, lazy), f).toBe(true);
    for (const f of ['assets/editor-9.js.map', 'sitemap.xml', 'og-opencad.jpg', 'sw.js', 'fonts/noto-sans-kr/base.ttf', 'fonts/liberation/LICENSE', 'pdfjs/cmaps/Adobe-GB1-0.bcmap', 'samples/opencad-sample.dxf', 'assets/en-1.js', 'assets/pdf.worker.min-2.mjs', 'assets/pdfraster-3.js'])
      expect(precacheable(f, lazy), f).toBe(false);
    expect(precacheUrls(['index.html', 'en/index.html', 'en/manifest.webmanifest', 'sitemap.xml', 'assets/a.js'])).toEqual(['./', 'en/', 'en/manifest.webmanifest', 'assets/a.js']);
  });

  it('빌드 결과에서 다른 언어 사전과 PDF 해석기(pdfjs-dist)를 "쓸 때만 받는" 덩어리로 가린다', () => {
    const lazy = lazyFiles({
      'assets/en-1.js': { type: 'chunk', fileName: 'assets/en-1.js', facadeModuleId: '/repo/site/locales/en.json', moduleIds: ['/repo/site/locales/en.json'] },
      'assets/pdfraster-2.js': { type: 'chunk', fileName: 'assets/pdfraster-2.js', facadeModuleId: '/repo/src/app/pdfraster.ts', moduleIds: ['/repo/src/app/pdfraster.ts', '/repo/node_modules/pdfjs-dist/build/pdf.mjs'] },
      'assets/editor-3.js': { type: 'chunk', fileName: 'assets/editor-3.js', facadeModuleId: '/repo/src/editor.ts', moduleIds: ['/repo/src/editor.ts'] },
      'assets/pdf.worker.min-4.mjs': { type: 'asset', fileName: 'assets/pdf.worker.min-4.mjs', originalFileNames: ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs'] },
      'assets/engine.worker-5.js': { type: 'asset', fileName: 'assets/engine.worker-5.js', originalFileNames: [] },
      'sitemap.xml': { type: 'asset', fileName: 'sitemap.xml' },
    });
    expect([...lazy].sort()).toEqual(['assets/en-1.js', 'assets/pdf.worker.min-4.mjs', 'assets/pdfraster-2.js']);
  });
});

describe('오프라인 서비스 워커: 설치·바꾸기', () => {
  it('설치: 내용 지문 이름은 앞 판 캐시나 브라우저 캐시에서, 쪽·앱 정보는 서버에 바뀌었는지 물어(no-cache) 담는다', async () => {
    const old = new Map([['opencad-dwgdxf-app-v0', new Map([[`${SCOPE}assets/index-a.js`, new Response('old index')]])]]);
    const sw = runSw({ caches: old });
    await sw.waitUntil('install');
    const app = sw.stores.get('opencad-dwgdxf-app-v1')!;
    expect(await app.get(`${SCOPE}assets/index-a.js`)!.text()).toBe('old index');
    expect(sw.fetched.find((f) => f.url.endsWith('assets/index-a.js'))).toBeUndefined();
    expect(sw.fetched.find((f) => f.url === SCOPE)!.cache).toBe('no-cache');
    expect(sw.fetched.find((f) => f.url === `${SCOPE}en/`)!.cache).toBe('no-cache');
    expect(sw.fetched.find((f) => f.url.endsWith('assets/editor-b.js'))!.cache).toBe('default');
    expect(sw.skipped()).toBe(0);
  });

  it('미리 담을 파일을 하나라도 못 받으면 설치가 실패한다(반쯤 담긴 판을 쓰지 않는다)', async () => {
    const sw = runSw({ network: (r) => (r.url.endsWith('editor-b.js') ? new Response('', { status: 404 }) : new Response('ok')) });
    await expect(sw.waitUntil('install')).rejects.toThrow(/editor-b/);
  });

  it('바꾸기: 앞 판이 받아 둔 빌드 결과 가운데 이 판에도 있는 것만 옮기고 앞 판 캐시를 지운다. 정적 캐시는 지문이 같으면 둔다', async () => {
    const caches = new Map([
      [
        'opencad-dwgdxf-app-v0',
        new Map([
          [`${SCOPE}assets/en-c.js`, new Response('english')],
          [`${SCOPE}assets/gone-z.js`, new Response('gone')],
        ]),
      ],
      ['opencad-dwgdxf-static-s1', new Map([[`${SCOPE}fonts/noto-sans-kr/base.ttf`, new Response('font')]])],
      ['opencad-dwgdxf-static-s0', new Map([[`${SCOPE}fonts/old.ttf`, new Response('old')]])],
      ['opencad-step-v9', new Map([['https://x.test/opencad-step/x', new Response('other app')]])],
    ]);
    const sw = runSw({ caches });
    await sw.waitUntil('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['opencad-dwgdxf-app-v1', 'opencad-dwgdxf-static-s1', 'opencad-step-v9']);
    expect([...sw.stores.get('opencad-dwgdxf-app-v1')!.keys()]).toEqual([`${SCOPE}assets/en-c.js`]);
    expect(sw.claimed()).toBe(1);
  });

  it('새 판은 기다리다가 앱이 SKIP_WAITING을 보내면 바뀐다', async () => {
    const sw = runSw();
    await sw.waitUntil('message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.skipped()).toBe(1);
  });
});

describe('오프라인 서비스 워커: 요청 처리', () => {
  it('쪽은 네트워크 먼저(받으면 담고), 안 되면 주소 인자를 빼고 담아 둔 쪽, 끝 / 없는 언어 쪽도 맞춘다', async () => {
    let online = true;
    const sw = runSw({ network: (r) => (online ? new Response(`net ${r.url}`) : Promise.reject(new TypeError('offline'))) });
    expect(await (await sw.fire(req(`${SCOPE}?sample`, { mode: 'navigate' })))!.text()).toBe(`net ${SCOPE}?sample`);
    await tick();
    expect(sw.cached()).toContain(`opencad-dwgdxf-app-v1 ${SCOPE}`);
    online = false;
    expect(await (await sw.fire(req(`${SCOPE}?open=samples%2Fa.dxf`, { mode: 'navigate' })))!.text()).toBe(`net ${SCOPE}?sample`);
    sw.stores.get('opencad-dwgdxf-app-v1')!.set(`${SCOPE}en/`, new Response('english page'));
    expect(await (await sw.fire(req(`${SCOPE}en`, { mode: 'navigate' })))!.text()).toBe('english page');
    expect(await (await sw.fire(req(`${SCOPE}en/index.html`, { mode: 'navigate' })))!.text()).toBe('english page');
    // 목록에 없는 쪽은 앱 첫 쪽으로
    expect(await (await sw.fire(req(`${SCOPE}nothing/`, { mode: 'navigate' })))!.text()).toBe(`net ${SCOPE}?sample`);
  });

  it('빌드 결과는 담아 둔 것 먼저, 없으면 받아서 담는다. 글꼴·PDF 자료·예제는 정적 캐시에', async () => {
    let n = 0;
    const sw = runSw({ network: (r) => new Response(`net ${r.url} ${++n}`) });
    expect(await (await sw.fire(req(`${SCOPE}assets/en-c.js`)))!.text()).toBe(`net ${SCOPE}assets/en-c.js 1`);
    await tick();
    expect(await (await sw.fire(req(`${SCOPE}assets/en-c.js`)))!.text()).toBe(`net ${SCOPE}assets/en-c.js 1`);
    await sw.fire(req(`${SCOPE}fonts/noto-sans-kr/hangul-0.ttf`));
    await sw.fire(req(`${SCOPE}samples/opencad-sample.dxf`));
    await sw.fire(req(`${SCOPE}pdfjs/cmaps/UniKS-UTF16-H.bcmap`));
    await tick();
    expect(sw.cached().filter((c) => c.startsWith('opencad-dwgdxf-static-s1')).length).toBe(3);
    expect(await (await sw.fire(req(`${SCOPE}fonts/noto-sans-kr/hangul-0.ttf`)))!.text()).toBe(`net ${SCOPE}fonts/noto-sans-kr/hangul-0.ttf 2`);
    // 앱 정보는 주소 인자를 무시하고 찾는다
    sw.stores.get('opencad-dwgdxf-app-v1')!.set(`${SCOPE}manifest.webmanifest`, new Response('{}'));
    expect(await (await sw.fire(req(`${SCOPE}manifest.webmanifest?v=2`)))!.text()).toBe('{}');
  });

  it('그 밖(같은 출처의 ?open= 도면)·앱 범위 밖·다른 출처·POST는 손대지 않고 담지도 않는다. 범위 요청은 담지 않는다', async () => {
    const sw = runSw();
    expect(await sw.fire(req(`${SCOPE}drawings/plan.dwg`))).toBeUndefined();
    expect(await sw.fire(req('https://x.test/opencad-step/assets/a.js'))).toBeUndefined();
    expect(await sw.fire(req('https://x.test/opencad-step/', { mode: 'navigate' }))).toBeUndefined();
    expect(await sw.fire(req('https://other.test/app/assets/a.js'))).toBeUndefined();
    expect(await sw.fire(req(`${SCOPE}assets/a.js`, { method: 'POST' }))).toBeUndefined();
    const ranged = await sw.fire(req(`${SCOPE}samples/big.dxf`, { headers: new Headers({ range: 'bytes=0-9' }) }));
    expect(ranged).toBeDefined();
    await tick();
    expect(sw.cached()).toEqual([]);
  });

  it('CACHE_URLS: 서비스 워커가 맡기 전에 받은 파일 가운데 담을 것만(빌드 결과·글꼴) 담는다', async () => {
    const sw = runSw();
    await sw.waitUntil('message', {
      data: { type: 'CACHE_URLS', urls: [`${SCOPE}assets/ja-d.js`, `${SCOPE}fonts/liberation/LiberationSans-Regular.ttf`, `${SCOPE}drawings/plan.dwg`, 'https://cdn.test/x.js', 'https://x.test/opencad-step/assets/a.js', 'not a url'] },
    });
    expect(sw.cached().sort()).toEqual([`opencad-dwgdxf-app-v1 ${SCOPE}assets/ja-d.js`, `opencad-dwgdxf-static-s1 ${SCOPE}fonts/liberation/LiberationSans-Regular.ttf`]);
  });
});

describe('오프라인 서비스 워커: 공유 받기', () => {
  const share = (sw: ReturnType<typeof runSw>, files: unknown[], path = 'share-target') =>
    sw.fire(req(`${SCOPE}${path}`, { method: 'POST', formData: async () => ({ getAll: () => files }) }));

  it('도면을 최근 문서 저장소(opencad-2d)에 넣고 그 언어 쪽 ?recent=<id>로 보낸다(303)', async () => {
    const sw = runSw();
    const res = (await share(sw, [new File(['0\nSECTION\n'], 'C:\\drawings\\평면도.dxf')], 'en/share-target'))!;
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/app/en/');
    expect(loc.searchParams.get('recent')).toBe('평면도.dxf:10');
    const row = sw.idb.dbs.get('opencad-2d')!.stores.get('recent')!.rows.get('평면도.dxf:10') as { name: string; size: number; data: ArrayBuffer };
    expect(row.name).toBe('평면도.dxf');
    expect(row.size).toBe(10);
    expect(new TextDecoder().decode(row.data)).toBe('0\nSECTION\n');
    expect(sw.idb.openConnections()).toBe(0);
  });

  it('새것부터 8개만 남긴다', async () => {
    const sw = runSw();
    for (let i = 0; i < 10; i++) {
      await share(sw, [new File(['x'.repeat(i + 1)], `d${i}.dwg`)]);
      await new Promise((r) => setTimeout(r, 2));
    }
    const rows = [...(sw.idb.dbs.get('opencad-2d')!.stores.get('recent')!.rows.keys() as Iterable<string>)];
    expect(rows.length).toBe(8);
    expect(rows).not.toContain('d0.dwg:1');
    expect(rows).toContain('d9.dwg:10');
  });

  it('60MB보다 크거나 파일이 없으면 까닭(share-error)을 붙여 보낸다', async () => {
    const sw = runSw();
    const big = { name: 'big.dwg', size: 61 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
    expect(new URL((await share(sw, [big]))!.headers.get('location')!).searchParams.get('share-error')).toBe('too-big');
    expect(new URL((await share(sw, ['just text']))!.headers.get('location')!).searchParams.get('share-error')).toBe('no-file');
    const broken = await sw.fire(req(`${SCOPE}share-target`, { method: 'POST', formData: async () => Promise.reject(new Error('bad form')) }));
    expect(new URL(broken!.headers.get('location')!).searchParams.get('share-error')).toBe('store');
  });
});
