/**
 * 휴대폰 보기 모드에서 명령 밖의 오류(270차 — 269차 보고 (1)): 보기 모드는 명령행이 숨어 있어, 명령 밖에서 찍은 오류 줄(비틀린 뷰포트에 들어가지 못함,
 * 도면 없이 직전 명령 반복 등)은 바로 읽히는 오류 알림(toast 'error' — role="alert")으로 보이고 카드(명령의 안내·결과 띠)에는 넣지 않는다.
 * 전에는 카드 결과 띠에 남거나(닫은 적이 없을 때) 결과 띠를 닫은 뒤·도면이 없을 때는 보이지 않았다.
 * 명령 안의 오류는 카드 그대로, 편집 화면은 명령행 그대로, 따로 알리는 열기 실패는 그 알림 하나. 같은 오류를 거듭 내면 화면의 알림은 하나(271차).
 * 진짜 App·MobileView(jsdom), 화면·명령행·엔진·글꼴은 가짜(measurecard.test.ts와 같은 틀, 배치는 viewonly.test.ts 269차 묶음 꼴)
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { openErrorInfo, openErrorText } from '../../src/app/openerror';
import { MobileView } from '../../src/app/ui/mobileview';
import { toast } from '../../src/app/ui/dom';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 둔다(그 확인이 시험 안에서 끝나게 — viewlink242.test.ts 꼴)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => vi.mocked(toast).mockClear());

type Pt = { x: number; y: number };
const P = (x: number, y: number) => ({ x, y });
const touch = { pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent;
const TWIST = '비틀린 뷰포트는 아직 모형 공간으로 들어갈 수 없습니다.';
const NO_DOC = '열린 도면이 없습니다. 먼저 파일을 여십시오.';

/**
 * 배치 Layout1(종이 공간): 전체 용지 뷰포트(id 1), 30° 비틀린 뷰포트 T(가운데 (230, 50), 100×60 — x 180..280·y 20..80),
 * 뷰포트 N(가운데 (100, 200), 80×60 — x 60..140·y 170..230). view면 MobileView를 보기 모드로
 */
function setup(view = true) {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const lay = h.doc.layouts.find((l) => l.name === 'Layout1')!;
  const blk = h.doc.blocks.get(PAPER_SPACE)!;
  // 그리기·고르기만 볼 자료라 확정 고리 없이 블록과 색인에 넣는다
  const put = <T extends Entity>(e: T): T => {
    e.owner = lay.blockRecord;
    blk.entities.push(e);
    h.doc.entityIndex.set(e.handle, e);
    return e;
  };
  const vp = (id: number, cx: number, cy: number, w: number, ht: number, twist = 0): ViewportEntity => ({
    ...entityDefaults(),
    type: 'VIEWPORT',
    handle: h.st.session.newHandle(),
    paperSpace: true,
    center: { x: cx, y: cy, z: 0 },
    width: w,
    height: ht,
    status: id === 1 ? 1 : id,
    id,
    viewCenter: { x: 0, y: 0 },
    snapBase: { x: 0, y: 0 },
    snapSpacing: { x: 10, y: 10 },
    gridSpacing: { x: 10, y: 10 },
    viewDirection: { x: 0, y: 0, z: 1 },
    viewTarget: { x: 0, y: 0, z: 0 },
    lensLength: 50,
    frontClip: 0,
    backClip: 0,
    viewHeight: ht,
    snapAngle: 0,
    twistAngle: twist,
    circleSides: 1000,
    flags: 32864,
    frozenLayers: [],
    renderMode: 0,
    ucsPerViewport: true,
  });
  put(vp(1, 210, 148.5, 420, 297));
  const t = put(vp(2, 230, 50, 100, 60, Math.PI / 6));
  const n = put(vp(3, 100, 200, 80, 60));
  h.st.space = PAPER_SPACE;
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  if (view) mv.apply(true);
  return { ...h, mv, t, n, click: (p: Pt) => h.view.events.click!(p, p, touch) };
}
/** 브라우저가 두 번째 누르기 뒤에 보내는 dblclick(MouseEvent) */
const dblclick = (h: RealApp, p: Pt) => h.view.events.dblclick!(p, p, {} as MouseEvent);
/** 보이는 카드의 글(숨었으면 빈 글) */
const cardText = (h: { mv: MobileView }) => (h.mv.card.hidden ? '' : (h.mv.card.textContent ?? ''));
const calls = () => vi.mocked(toast).mock.calls;
/** 앱 창의 Enter(초점은 문서 본문 — 명령행·단추 아님) */
const enter = (h: RealApp) =>
  (h.app as unknown as { onKey(ev: KeyboardEvent): void }).onKey({
    key: 'Enter',
    code: 'Enter',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    defaultPrevented: false,
    preventDefault() {},
  } as unknown as KeyboardEvent);

describe('보기 모드의 명령 밖 오류는 오류 알림으로(270차)', () => {
  it('비틀린 뷰포트: 배치에서 두 번 누르기·뷰포트 안에서 누르기 모두 들어가지 않고 그 글을 알림으로, 카드에는 넣지 않는다', async () => {
    const h = setup();
    await settle();
    dblclick(h, P(215, 60));
    await settle();
    expect(h.st.msVp).toBeNull();
    // 명령행 글은 그대로
    expect(h.out()).toContain(TWIST);
    // 전에는 알림 없이 카드 결과 띠에 남았다(닫기 단추 — 정보 카드를 가림)
    expect(calls()).toEqual([[TWIST, 'error', 9000]]);
    expect(cardText(h)).not.toContain(TWIST);
    // 뷰포트 N 안(모형 공간)에서 비틀린 뷰포트 T를 누르면 T를 활성으로 바꾸려다 같은 오류 — N에 그대로
    expect(h.app.enterViewport(h.st, h.n)).toBe(true);
    h.click(P(215, 60));
    await settle();
    expect(h.st.msVp).toEqual({ layout: PAPER_SPACE, handle: h.n.handle });
    expect(calls()).toEqual([
      [TWIST, 'error', 9000],
      [TWIST, 'error', 9000],
    ]);
    expect(cardText(h)).not.toContain(TWIST);
  });

  it('결과 띠를 닫은 뒤에도 알림으로 보인다(전에는 카드가 숨은 채 아무것도 보이지 않았다)', async () => {
    const h = setup();
    h.st.space = MODEL_SPACE;
    void h.app.run('DIST');
    await settle();
    h.click(P(10, 10));
    await settle();
    h.click(P(40, 50));
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(h.mv.card.classList.contains('is-result')).toBe(true);
    (h.mv.card.querySelector('.mv-close') as HTMLButtonElement).click();
    await settle();
    expect(h.mv.card.hidden).toBe(true);
    h.st.space = PAPER_SPACE;
    dblclick(h, P(215, 60));
    await settle();
    expect(h.st.msVp).toBeNull();
    expect(calls()).toEqual([[TWIST, 'error', 9000]]);
    expect(h.mv.card.hidden).toBe(true);
  });

  it('도면을 모두 닫은 뒤 Enter로 직전 재기를 반복하면 「열린 도면이 없습니다」를 알림으로, 다음 도면의 카드에 묵은 줄로 남지 않는다', async () => {
    const h = setup();
    h.st.space = MODEL_SPACE;
    void h.app.run('DIST');
    await settle();
    h.app.cancel();
    await settle();
    expect(h.app.busyCommand).toBeNull();
    const st = h.st;
    h.app.active = null;
    h.mv.refresh();
    enter(h);
    await settle();
    expect(h.out().at(-1)).toBe(NO_DOC);
    // 전에는 도면이 없어 카드가 숨어 보이지 않았다
    expect(calls()).toEqual([[NO_DOC, 'error', 9000]]);
    h.app.active = st;
    h.mv.refresh();
    await settle();
    // 전에는 다시 도면을 보면 결과 띠에 그 줄이 남았다
    expect(cardText(h)).not.toContain(NO_DOC);
  });

  it('도면을 보는 중 열기 실패는 그 알림(이름·까닭·할 일) 하나 — 카드에 같은 줄을 겹쳐 남기지 않는다', async () => {
    const h = setup();
    await settle();
    const info = openErrorInfo('read');
    h.app.reportOpenError('깨진.dwg', info);
    await settle();
    expect(h.out()).toContain(`깨진.dwg — ${info.message}`);
    expect(calls()).toEqual([[openErrorText('깨진.dwg', info), 'error', 9000]]);
    // 전에는 알림과 함께 카드 결과 띠에도 「깨진.dwg — …」이 남았다
    expect(cardText(h)).not.toContain('깨진.dwg');
  });

  it('같은 오류를 거듭 내면 화면의 알림은 하나만 남는다(271차 — 전에는 두 번 누를 때마다 하나씩 쌓여 도면을 가렸다)', async () => {
    // 이 시험만 가짜 알림을 진짜 알림(ui/dom.ts)으로 돌려 화면(DOM)에 뜬 알림을 센다
    const { toast: real } = await vi.importActual<{ toast: typeof toast }>('../../src/app/ui/dom');
    vi.mocked(toast).mockImplementation(real);
    try {
      const h = setup();
      await settle();
      for (let i = 0; i < 3; i++) {
        dblclick(h, P(215, 60));
        await settle();
      }
      expect(h.st.msVp).toBeNull();
      expect(calls()).toEqual([
        [TWIST, 'error', 9000],
        [TWIST, 'error', 9000],
        [TWIST, 'error', 9000],
      ]);
      expect(Array.from(document.querySelectorAll('.toast'), (t) => [t.getAttribute('role'), t.textContent])).toEqual([['alert', TWIST]]);
    } finally {
      vi.mocked(toast).mockReset();
      document.querySelector('.toast-wrap')?.remove();
    }
  });
});

describe('그대로(270차)', () => {
  it('편집 화면: 비틀린 뷰포트 두 번 누르기는 명령행 글만(알림 없음)', async () => {
    const h = setup(false);
    dblclick(h, P(215, 60));
    await settle();
    expect(h.st.msVp).toBeNull();
    expect(h.out()).toContain(TWIST);
    expect(calls()).toEqual([]);
    expect(h.mv.card.hidden).toBe(true);
  });

  it('보기 모드 명령 안의 오류는 측정 띠에(알림 없음): 한계 검사(LIMCHECK 1) 밖을 찍은 거리 재기', async () => {
    const h = setup();
    h.st.space = MODEL_SPACE;
    h.doc.header.set('$LIMCHECK', 1);
    void h.app.run('DIST');
    await settle();
    h.click(P(500, 500));
    await settle();
    expect(h.app.busyCommand).toBe('DIST');
    expect(h.out().at(-1)).toBe('**한계 밖');
    expect(h.mv.card.querySelector('.mv-res.err')?.textContent).toBe('**한계 밖');
    expect(h.mv.card.querySelector('.mv-prompt')?.textContent).toBe('첫 번째 점 지정:');
    expect(calls()).toEqual([]);
  });
});
