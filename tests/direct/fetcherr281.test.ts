/**
 * 도면 파일을 받지 못했을 때(281차 — 280차 보고 (1)): 예제 도면(`Shell.openSample`)·주소 `?open=`(`Shell.openUrl`) 받기 실패도 오류 알림과 같은 글을
 * 명령행 기록에 남긴다. 알림은 280차부터 셋(낮은 화면 둘)을 넘으면 오래된 것부터 빠지고 4~7초 뒤 사라지는데, 이 둘은 전에 알림에만 있어 무슨 일이었는지 남지 않았다.
 * 알림 글·시간은 그대로이고, 보기 모드의 명령 밖 오류 알림(270차)과 겹치지 않는다(열기 실패 reportOpenError와 같은 errorNoticed 표지). 시작 화면 안내 상자는 쓰지 않는다.
 * 진짜 App·MobileView·Shell의 받기 길(JSDOM), 받기는 가짜 fetch, 화면·명령행·엔진·글꼴·알림은 가짜(viewerr270.test.ts와 같은 틀)
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app/app';
import { registerCommands } from '../../src/app/commands';
import { MobileView } from '../../src/app/ui/mobileview';
import { Shell } from '../../src/app/ui/shell';
import { toast } from '../../src/app/ui/dom';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('location', dom.window.location);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => vi.mocked(toast).mockClear());

const SAMPLE = '예제 도면을 받지 못했습니다.';
const calls = () => vi.mocked(toast).mock.calls;

/** 도면 하나를 연 진짜 App과 휴대폰 보기(view면 보기 모드), 받기 길만 쓰는 Shell(생성자 없이 — 화면을 만들지 않는다) */
function setup(view: boolean) {
  const h = makeApp();
  registerCommands(h.app);
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  if (view) mv.apply(true);
  const shown: string[] = [];
  h.app.ui.showOpenError = (name) => void shown.push(name);
  const sh = Object.create(Shell.prototype) as Shell;
  (sh as unknown as { app: App }).app = h.app;
  h.cmd.lines.length = 0;
  return { ...h, mv, sh, shown, errs: () => h.cmd.lines.filter((l) => l.cls === 'err').map((l) => l.text) };
}
/** 시작 화면(열린 도면 없음) */
function closeAll(h: ReturnType<typeof setup>): void {
  h.app.docs.length = 0;
  h.app.active = null;
  h.mv.refresh();
}
const cardText = (h: { mv: MobileView }) => (h.mv.card.hidden ? '' : (h.mv.card.textContent ?? ''));

describe('받기 실패도 명령행 기록에(281차)', () => {
  it('예제 도면 — 편집 화면: 알림은 그대로, 같은 글의 오류 줄이 명령행에(전에는 알림뿐)', async () => {
    const h = setup(false);
    const fetch = vi.fn(async (_url: URL | string): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetch);
    await h.sh.openSample();
    await settle();
    expect(h.errs()).toEqual([SAMPLE]);
    expect(calls()).toEqual([[SAMPLE, 'error', undefined]]);
    expect(String(fetch.mock.calls[0]![0])).toBe('http://localhost/samples/opencad-sample.dxf');
    expect(h.shown).toEqual([]);
    expect(h.app.errorNoticed).toBe(false);
  });

  it('예제 도면 — 보기 모드: 알림은 하나(270차 명령 밖 오류 알림을 겹쳐 띄우지 않음), 카드에도 넣지 않는다', async () => {
    const h = setup(true);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await h.sh.openSample();
    await settle();
    expect(h.errs()).toEqual([SAMPLE]);
    // 표지 없이 찍으면 9초 알림이 먼저 붙는다([SAMPLE, 'error', 9000] — 280차 한도에서 다른 알림을 밀어냄)
    expect(calls()).toEqual([[SAMPLE, 'error', undefined]]);
    expect(cardText(h)).not.toContain(SAMPLE);
    expect(h.app.errorNoticed).toBe(false);
  });

  it('주소 ?open= — 시작 화면·보기 모드: 알림 그대로(7초), 기록에 남고 시작 화면 안내 상자는 띄우지 않는다', async () => {
    const h = setup(true);
    closeAll(h);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await h.sh.openUrl('http://example.com/plan.dxf');
    await settle();
    const text = '파일을 받지 못했습니다: https 주소만 열 수 있습니다.';
    expect(h.errs()).toEqual([text]);
    expect(calls()).toEqual([[text, 'error', 7000]]);
    expect(fetch).not.toHaveBeenCalled();
    expect(h.shown).toEqual([]);
  });

  it('주소 ?open= — 편집 화면: 받는 곳이 404면 그 까닭 그대로', async () => {
    const h = setup(false);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await h.sh.openUrl('https://example.com/plan.dxf');
    await settle();
    const text = '파일을 받지 못했습니다: HTTP 404';
    expect(h.errs()).toEqual([text]);
    expect(calls()).toEqual([[text, 'error', 7000]]);
    expect(h.app.errorNoticed).toBe(false);
  });
});
