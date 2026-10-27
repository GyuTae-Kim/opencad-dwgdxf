// @vitest-environment jsdom
/** 홈 화면 앱 연결(pwa.ts·pwa-app.ts)과 최근 문서 저장소(recent.ts): 새 판 알림, 파일 열기, 공유 받기 주소, 서비스 워커와 같은 저장소 꼴 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseServiceWorker, consumeLaunchFiles, parseLaunchQuery, registerServiceWorker, shareErrorMessage, usedResourceUrls, withoutLaunchQuery, type SwContainer, type SwRegistration, type SwWorker } from '../../src/app/pwa';
import { applyUpdate, handleLaunchQuery } from '../../src/app/pwa-app';
import { RECENT_MAX, RecentStore, recentTimeLabel } from '../../src/app/recent';
import { createFakeIndexedDB } from './fake-idb';

function fakeWorker(state = 'installing') {
  const listeners: (() => void)[] = [];
  const w = {
    state,
    posted: [] as unknown[],
    postMessage(m: unknown) {
      this.posted.push(m);
    },
    addEventListener: (_t: 'statechange', fn: () => void) => listeners.push(fn),
    become(s: string) {
      w.state = s;
      for (const f of listeners) f();
    },
  };
  return w;
}

function fakeContainer(reg: Partial<SwRegistration> & { fireUpdate?: () => void }, controller: unknown = {}) {
  const changes: (() => void)[] = [];
  let found: (() => void) | null = null;
  const registration: SwRegistration = {
    waiting: null,
    installing: null,
    addEventListener: (_t, fn) => void (found = fn),
    ...reg,
  };
  const sw: SwContainer & { change(): void; found(): void; registered: { url: string; scope?: string }[] } = {
    controller,
    registered: [],
    async register(url, opts) {
      this.registered.push({ url: String(url), scope: opts?.scope });
      return registration;
    },
    addEventListener: (_t, fn) => void changes.push(fn),
    change: () => changes.forEach((f) => f()),
    found: () => found?.(),
  };
  return { sw, registration };
}

describe('서비스 워커 등록과 새 판 알림', () => {
  it('앱 뿌리를 범위로 등록하고, 처음 설치(맡은 워커가 없음)는 알리지도 다시 읽지도 않는다', async () => {
    const w = fakeWorker();
    const { sw } = fakeContainer({ get installing() { return w as unknown as SwWorker; } }, null);
    const onUpdate = vi.fn();
    const reload = vi.fn();
    await registerServiceWorker(sw, 'https://x.test/app/sw.js', onUpdate, reload);
    expect(sw.registered).toEqual([{ url: 'https://x.test/app/sw.js', scope: 'https://x.test/app/' }]);
    sw.found();
    w.become('installed');
    sw.change(); // clients.claim
    expect(onUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('앞 판이 맡고 있을 때 새 판이 기다리면 알리고, 고르면 SKIP_WAITING을 보낸 뒤 바뀌면 한 번만 다시 읽는다', async () => {
    const w = fakeWorker('installed');
    const { sw } = fakeContainer({ waiting: w as unknown as SwWorker });
    let apply: (() => void) | null = null;
    const reload = vi.fn();
    await registerServiceWorker(sw, 'https://x.test/app/sw.js', (a) => (apply = a), reload);
    expect(apply).not.toBeNull();
    // 다른 창이 고른 새 판으로 바뀐 것은 이 창을 다시 읽지 않는다
    sw.change();
    expect(reload).not.toHaveBeenCalled();
    apply!();
    expect(w.posted).toEqual([{ type: 'SKIP_WAITING' }]);
    sw.change();
    sw.change();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('쓰는 중에 새 판이 설치되면 그때 알린다(같은 워커는 한 번만)', async () => {
    const w = fakeWorker();
    const { sw } = fakeContainer({ get installing() { return w as unknown as SwWorker; } });
    const onUpdate = vi.fn();
    await registerServiceWorker(sw, 'https://x.test/app/sw.js', onUpdate);
    sw.found();
    w.become('installed');
    w.become('installed');
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('등록하지 못하거나 서비스 워커가 없으면 조용히 null, 보안 맥락(https·이 컴퓨터)에서만 쓴다', async () => {
    expect(await registerServiceWorker(undefined, 'sw.js', vi.fn())).toBeNull();
    const bad: SwContainer = { controller: null, register: () => Promise.reject(new Error('denied')), addEventListener: () => {} };
    expect(await registerServiceWorker(bad, 'https://x.test/sw.js', vi.fn())).toBeNull();
    expect(canUseServiceWorker({ protocol: 'https:', hostname: 'gyutae-kim.github.io' }, { serviceWorker: {} })).toBe(true);
    expect(canUseServiceWorker({ protocol: 'http:', hostname: '127.0.0.1' }, { serviceWorker: {} })).toBe(true);
    expect(canUseServiceWorker({ protocol: 'http:', hostname: 'example.test' }, { serviceWorker: {} })).toBe(false);
    expect(canUseServiceWorker({ protocol: 'https:', hostname: 'x' }, {})).toBe(false);
  });

  it('맡기 전에 받은 파일은 앱 범위 안의 것만(조각 # 없이, 겹치지 않게) 알린다', () => {
    const urls = usedResourceUrls([{ name: 'https://x.test/app/assets/en-1.js' }, { name: 'https://x.test/app/assets/en-1.js#x' }, { name: 'https://x.test/other/a.js' }, { name: 'https://cdn.test/a.js' }, { name: 'nonsense' }], 'https://x.test/app/');
    expect(urls).toEqual(['https://x.test/app/assets/en-1.js']);
  });
});

describe('파일 열기(launchQueue)와 공유 받기 주소', () => {
  it('설치한 앱으로 연 파일들을 한꺼번에 넘기고, 못 읽은 것은 뺀다. 파일 없이 ?recent= 주소로 오면 주소를 넘긴다', async () => {
    let consumer: ((p: { files?: { getFile(): Promise<File> }[]; targetURL?: string }) => void) | null = null;
    const w = { launchQueue: { setConsumer: (fn: typeof consumer) => void (consumer = fn) } };
    const open = vi.fn();
    const onUrl = vi.fn();
    expect(consumeLaunchFiles(open, onUrl, w as never)).toBe(true);
    const a = new File(['a'], 'a.dwg');
    const b = new File(['b'], 'b.lsp');
    consumer!({ files: [{ getFile: async () => a }, { getFile: () => Promise.reject(new Error('gone')) }, { getFile: async () => b }] });
    await new Promise((r) => setTimeout(r, 0));
    expect(open).toHaveBeenCalledWith([a, b]);
    consumer!({ files: [], targetURL: 'https://x.test/app/?recent=a.dwg%3A1' });
    expect(onUrl).toHaveBeenCalledWith('https://x.test/app/?recent=a.dwg%3A1');
    expect(consumeLaunchFiles(open, onUrl, {} as never)).toBe(false);
  });

  it('?recent=·?share-error=를 읽고, 한 번 쓴 뒤에는 다른 인자·조각을 남긴 채 지운다', () => {
    expect(parseLaunchQuery('?recent=a.dwg%3A12&lang=en')).toEqual({ recent: 'a.dwg:12', shareError: null });
    expect(parseLaunchQuery('?share-error=too-big')).toEqual({ recent: null, shareError: 'too-big' });
    expect(withoutLaunchQuery('https://x.test/app/en/?recent=a&sample&share-error=x#view')).toBe('/app/en/?sample#view');
    expect(shareErrorMessage('too-big')).toContain('60MB');
    expect(shareErrorMessage('no-file')).toContain('DWG·DXF');
    expect(shareErrorMessage('store')).toContain('파일 열기');
  });

  it('공유 받기로 시작하면 그 최근 문서를 열고(열지 못하면 목록에서 뺀다) 주소에서 인자를 지운다', async () => {
    history.replaceState(null, '', '/app/en/?recent=plan.dxf%3A10&sample');
    const openRecent = vi.fn().mockResolvedValue(true);
    await handleLaunchQuery({ openRecent });
    expect(openRecent).toHaveBeenCalledWith('plan.dxf:10', true);
    expect(location.pathname + location.search).toBe('/app/en/?sample');
    history.replaceState(null, '', '/app/?share-error=too-big');
    await handleLaunchQuery({ openRecent });
    expect(location.search).toBe('');
    expect(document.querySelector('.toast')!.textContent).toContain('60MB');
    expect(openRecent).toHaveBeenCalledOnce();
  });
});

describe('새 판으로 바꾸기와 자동 저장', () => {
  afterEach(() => document.querySelectorAll('.dialog-back').forEach((d) => d.remove()));
  it('바뀐 도면이 없으면 바로 바꾼다', async () => {
    const apply = vi.fn();
    const save = vi.fn();
    expect(await applyUpdate({ docs: [] }, apply, save)).toBe(true);
    expect(apply).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it('저장하지 않은 도면이 있으면 묻고, 고르면 자동 저장한 뒤 바꾼다. 나중에를 고르면 바꾸지 않는다', async () => {
    const docs = [{ session: { dirty: true } }, { session: { dirty: false } }] as never;
    const apply = vi.fn();
    const save = vi.fn().mockResolvedValue(1);
    const p = applyUpdate({ docs }, apply, save);
    await new Promise((r) => setTimeout(r, 0));
    const box = document.querySelector('.dialog')!;
    expect(box.textContent).toContain('저장하지 않은 도면이 1개');
    [...box.querySelectorAll('button')].find((b) => b.textContent === '자동 저장하고 새로 고침')!.click();
    expect(await p).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    const later = applyUpdate({ docs }, apply, save);
    await new Promise((r) => setTimeout(r, 0));
    [...document.querySelectorAll('.dialog button')].find((b) => b.textContent === '나중에')!.dispatchEvent(new MouseEvent('click'));
    expect(await later).toBe(false);
    expect(apply).toHaveBeenCalledOnce();
  });
});

describe('최근 문서 저장소', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('남기기·목록(새것부터)·읽기·지우기·모두 지우기, 8개 한도와 60MB 한도, 연결은 닫는다', async () => {
    const idb = createFakeIndexedDB();
    vi.stubGlobal('indexedDB', idb.indexedDB);
    const store = new RecentStore();
    const buf = (n: number) => new Uint8Array(n).buffer;
    expect(await store.add('a.dwg', buf(3))).toBe(true);
    await new Promise((r) => setTimeout(r, 2));
    expect(await store.add('b.dxf', buf(5))).toBe(true);
    expect((await store.list()).map((e) => e.id)).toEqual(['b.dxf:5', 'a.dwg:3']);
    const got = await store.read('a.dwg:3');
    expect(got.kind === 'ok' && got.name === 'a.dwg' && got.data.byteLength === 3).toBe(true);
    // 읽으면 맨 앞으로
    expect((await store.list())[0]!.id).toBe('a.dwg:3');
    expect((await store.read('none')).kind).toBe('missing');
    await store.remove('a.dwg:3');
    expect((await store.list()).map((e) => e.id)).toEqual(['b.dxf:5']);
    expect(await store.add('huge.dwg', { byteLength: 61 * 1024 * 1024 } as ArrayBuffer)).toBe(false);
    for (let i = 0; i < RECENT_MAX + 2; i++) {
      await store.add(`d${i}.dwg`, buf(i + 1));
      await new Promise((r) => setTimeout(r, 1));
    }
    expect((await store.list()).length).toBe(RECENT_MAX);
    await store.clear();
    expect(await store.list()).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    expect(idb.openConnections()).toBe(0);
  });

  it('저장소를 못 쓰는 환경(비공개 창 등)에서는 비어 있고 오류 없이 넘어간다', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked'); } });
    const store = new RecentStore();
    expect(await store.list()).toEqual([]);
    expect(await store.add('a.dwg', new ArrayBuffer(1))).toBe(false);
    expect((await store.read('a')).kind).toBe('error');
  });

  it('날짜는 지금 언어로: 오늘은 시각, 올해는 월·일, 그 전은 연도까지', () => {
    const now = new Date(2026, 9, 27, 15, 0).getTime();
    expect(recentTimeLabel(new Date(2026, 9, 27, 9, 5).getTime(), now, 'en')).toMatch(/9:05/);
    expect(recentTimeLabel(new Date(2026, 2, 3, 9, 5).getTime(), now, 'en')).toMatch(/Mar 3/);
    expect(recentTimeLabel(new Date(2024, 2, 3).getTime(), now, 'de')).toMatch(/2024/);
    expect(recentTimeLabel(new Date(2026, 2, 3).getTime(), now, 'ko')).toMatch(/3월 3일/);
    expect(recentTimeLabel(new Date(2026, 2, 3).getTime(), now, 'xx-invalid-@@')).toMatch(/3월 3일/);
  });
});
