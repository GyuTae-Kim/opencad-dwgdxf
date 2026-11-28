/**
 * 327차: 다섯 언어 화면의 「한글 0」 재발 막기(NC 199·STEP 209·SKP 214차와 같은 꼴).
 * - 번역층(src/app/i18n.ts installLocalization)은 첫 `languagechange` 알림을 화면 보기(MutationObserver.observe) **전에** 보냈다.
 *   알림을 받아 같은 차례에 동기로 다시 그린 앱 글은 번역층이 보지 못해 다른 언어에서 한국어로 남는다(SKP 214차가 처음 화면 상태 막대에서 찾은 꼴).
 *   이 앱의 받는 쪽 셋(editor.ts 다시 그리기·mobileview.ts 단추 맞추기·shell.ts 최근 문서)은 모두 미뤄 그려 지금은 남지 않았다 — 차례는 첫 시험이 보인다.
 * - 진짜 시작 길(src/editor.ts startEditor — 셸·앱·명령행·모든 명령)과 번역층으로 주요 화면(처음 화면·제목 막대·리본·파일/배치 탭·상태 막대·
 *   명령행·도면층 창·특성 창·정보 카드·도움말(F1))을 jsdom에 그리고 합성 DXF 둘(이 앱의 쓰기 → 읽기)을 열어, 다섯 언어에서 파일 글 칸
 *   (번역층이 옮기지 않는 칸 — i18n.ts의 SKIP·translate="no"와 같은 규칙) 밖의 글 마디·title·aria-label에 한글이 남지 않는지 본다.
 *   한국어 화면은 같은 훑기가 한글을 찾는지(시험이 눈멀지 않았는지)만 본다. 도면 글(합성 도면의 도면층 이름·문자 내용)은 번역층 밖이라 지우고 센다.
 *   지금 고치지 못한 자리는 「아직 둔 것」(PENDING) — 목록에 있는데 이제 한글이 없으면 실패.
 * - 328차: 그리지 않던 화면 넷을 더했다 — 배치 공간(배치 탭·MVIEW 맞춤 뷰포트의 특성·LIST·배치 탭 메뉴), 바로 가기 메뉴(그리기 영역 오른쪽 누름 —
 *   기본·편집·명령 모드), 리본 펼친 메뉴(탭마다 펼침 메뉴 단추), 대화 상자(문자 스타일·치수 스타일·페이지 설정 관리자·플롯).
 * - 329차: 그리지 않던 화면 다섯을 더했다 — 접힌 리본 패널 팝업(jsdom은 폭이 0이라 접히지 않아 리본 넘침·패널 폭·여백을 흉내 냄), 옵션 대화 상자,
 *   도면층 상태 관리자, 치수 스타일 「수정…」 하위 대화 상자(7탭), 문자 편집기(MTEXT). 배치 마법사 「방향」 쪽 라디오가 용지 방향 낱말인지도 본다
 *   (홀로 쓴 「가로」·「세로」는 PLOTSTAMP 글 방향(수평·수직) 뜻으로 옮긴다 — 용지 방향 자리는 뜻을 품은 원문 「가로 방향」·「세로 방향」으로 나눴다).
 * - 화면·엔진·글꼴은 가짜(i18n-mobileview·infocard241·menutype265 꼴), 홈 화면 앱(서비스 워커·새 판 알림)은 화면이 아니라 가짜.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ArcEntity, CircleEntity, Entity, LineEntity, MTextEntity } from '../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../src/core/model';
import { createNewDocument } from '../src/core/newdoc';
import { readDxf } from '../src/io/dxf/reader';
import { writeDxf } from '../src/io/dxf/writer';
import type { App } from '../src/app/app';
import { DocState } from '../src/app/docstate';
import { bindCommitHooks } from '../src/app/hooks';
import { prefSet } from '../src/app/mgr-ui';
import { EditSession } from '../src/edit/session';
import { installLocalization } from '../src/app/i18n';
import type { Shell } from '../src/app/ui/shell';
import { closeMenu } from '../src/app/ui/dom';
import { activeEditor } from '../src/app/textedit';
import { startEditor } from '../src/editor';
import { translate } from '../site/i18n.mjs';
import { settle } from './polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('./polish/fakes')).FakeView }));
// 시작 길은 엔진의 save를 감싼다(refedit.ts installSaveGuard) — 가짜 엔진에 EngineClient의 나머지 메서드도 둔다(부르면 거절·무시)
vi.mock('../src/app/engine', async (orig) => {
  const { FakeEngine } = await import('./polish/fakes');
  class StartEngine extends FakeEngine {
    async open(): Promise<never> {
      throw new Error('open');
    }
    async adopt(): Promise<never> {
      throw new Error('adopt');
    }
    async save(): Promise<never> {
      throw new Error('save');
    }
    images(): void {}
    shx(): void {}
    replace(): void {}
  }
  return { ...(await orig<object>()), EngineClient: StartEngine };
});
vi.mock('../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('./polish/fakes')).FakeFonts }));
// 메뉴(showMenu)는 진짜를 쓴다(328차 — 리본 펼친 메뉴·바로 가기 메뉴·배치 탭 메뉴를 그려 본다). 알림(toast)만 가짜
vi.mock('../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));
vi.mock('../src/app/pwa-app', () => ({ installPwa: vi.fn(), handleLaunchQuery: vi.fn(async () => {}) }));

// 보기 모드 안내(renderNotice)가 기다리지 않고 나눠 받는 모듈을 미리 받아 둔다(공용 규칙 5번 — 시험 파일이 끝난 뒤 모듈을 평가하지 않게)
beforeAll(async () => {
  await Promise.all([import('../src/app/refs'), import('../src/app/shxfonts')]);
});

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const RUN = /[ㄱ-ㆎ가-힣]+(?:[\s·,.:()/]+[ㄱ-ㆎ가-힣]+)*/g;
/** 번역층이 옮기지 않는 칸(src/app/i18n.ts의 SKIP 그대로 읽는다 — 규칙이 바뀌면 시험도 따라간다) */
const SKIP = readFileSync(new URL('../src/app/i18n.ts', import.meta.url), 'utf8').match(/const SKIP = '([^']+)'/)![1]!;
/** 합성 도면의 글(도면층 이름·문자 내용) — 번역하지 않는 도면 글이라 세기 전에 지운다 */
const FILE_TEXT = ['한빛벽체', '두레설비', '한빛 주택 평면도', '두레 메모 글'];

/**
 * 아직 둔 것: 이 시험이 찾았는데 그 차수에 고치지 않은 자리 — 「단계 · 칸: 남은 한글 (언어)」.
 * 목록에 있는데 이제 한글이 없으면 실패한다(고쳤으면 목록에서 지운다).
 * 328차가 모두 고쳤다 — 327차의 둘(도면층 창 색 견본 title 「흰색」·필터 상태 줄 「모두」)과 새 걸음이 찾은 둘
 * (명령 모드 바로 가기 메뉴 「객체 스냅 재지정 ▸」의 「스냅 재지정」·페이지 설정 관리자 설명 줄의 방향 「가로」·「없음」).
 * 329차도 새 걸음이 찾은 다섯을 모두 고쳤다 — 접힌 리본 패널 단추 「뷰·좌표 ▾」(틀 「뷰{0}」에 잡혀 「좌표」가 남음 — 제목과 「 ▾」를 다른 글 마디로),
 * MTEXT 둘째 구석 기록 줄(기록 줄 틀 「…[높이(H)/…/열(C)]: {0}」), 편집기 글꼴 고르기의 앱 글꼴 이름 「맑은 고딕」·「굴림」·「바탕」(값 = 글인 항목은
 * 도면 글로 보아 옮기지 않으므로 이름표를 먼저 옮김 — 사전의 글꼴 이름 오역 「Roll」·「Background」 등도 로마자 고유 이름으로).
 */
const PENDING: string[] = [];
/** 328·329차 새 걸음 — 한국어 화면에서 걸음마다 새 앱 글(한글)이 보여야 그 화면을 실제로 그린 것이다 */
const NEW_STEPS = [
  '배치 공간(MVIEW)',
  '배치 탭 메뉴',
  '바로 가기 메뉴(기본)',
  '바로 가기 메뉴(명령)',
  '리본 펼친 메뉴',
  '대화 상자(STYLE)',
  '대화 상자(DIMSTYLE)',
  '대화 상자(PAGESETUP)',
  '대화 상자(PLOT)',
  '접힌 리본 패널',
  '대화 상자(OPTIONS)',
  '대화 상자(LAYERSTATE)',
  '대화 상자(DIMSTYLE 수정)',
  '문자 편집기(MTEXT)',
];

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let intervals: ReturnType<typeof setInterval>[] = [];

const stubDom = (lang: string) => {
  const dom = new JSDOM('<!doctype html><html lang="ko"><head><title>OpenCAD</title></head><body><div id="app"></div></body></html>', {
    url: `https://gyutae-kim.github.io/opencad-dwgdxf/${lang === 'ko' ? '' : `${lang}/`}`,
  });
  const w = dom.window as unknown as Record<string, unknown>;
  // 대화 상자의 미리보기 캔버스는 jsdom에 그리기가 없다(tabkeys260 꼴 — 그리기 없이 글만 본다)
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as never;
  // NodeFilter: 문자 편집기가 커서를 놓을 때 쓴다(textedit/dom.ts pointAt — createTreeWalker, 329차)
  for (const name of ['window', 'document', 'Node', 'NodeFilter', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLAnchorElement', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, w[name]);
  vi.stubGlobal('getComputedStyle', (el: Element, pseudo?: string) => dom.window.getComputedStyle(el, pseudo));
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  // 상태 막대·보기 단추 맞추기(크기 재기)는 jsdom에 배치가 없어 돌리지 않는다
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  // 자동 저장(30초마다)이 시험 뒤 되돌린 전역에서 돌지 않게 띄운 것을 모아 끝에 끈다
  vi.stubGlobal('setInterval', (f: () => void, ms?: number) => {
    const id = realSetInterval(f, ms);
    intervals.push(id);
    return id;
  });
  return dom;
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const strip = (s: string) => FILE_TEXT.reduce((t, f) => t.split(f).join(' '), s.replace(/[⁨⁩]/g, ''));

/** 번역층이 옮기는 칸(글 마디·title·aria-label)에 남은 한글 — 「칸: 한글 조각」 */
function hangulLeft(): string[] {
  const out = new Set<string>();
  const add = (kind: string, raw: string) => {
    const runs = strip(raw).match(RUN);
    if (runs) out.add(`${kind}: ${runs.join(' … ')}`);
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const p = child.parentElement;
        if (p && !p.closest(SKIP)) add('글', child.nodeValue ?? '');
      } else if (child.nodeType === 1) {
        const el = child as Element;
        // i18n.ts update·element와 같은 거르기: SKIP 안쪽은 건너뛰고, SKIP인 입력 칸·캔버스는 속성만 옮긴다
        const skipAttrs =
          !!el.parentElement?.closest(SKIP) || (el.matches(SKIP) && !el.matches('input, textarea, canvas, [contenteditable]')) || !!el.closest('[translate="no"], [data-i18n-skip]');
        if (!skipAttrs) for (const a of ['title', 'aria-label']) if (el.hasAttribute(a)) add(a, el.getAttribute(a)!);
        walk(el);
      }
    }
  };
  walk(document.body);
  return [...out];
}

let seq = 0xc100;
const nh = () => (seq++).toString(16).toUpperCase();
const P = (x: number, y: number) => ({ x, y, z: 0 });
const line = (layer: string, a: [number, number], b: [number, number]): LineEntity => ({ ...entityDefaults(), handle: nh(), layer, type: 'LINE', start: P(...a), end: P(...b) });
const circle = (layer: string, r: number): CircleEntity => ({ ...entityDefaults(), handle: nh(), layer, type: 'CIRCLE', center: P(50, 50), radius: r });
const arc = (layer: string, r: number): ArcEntity => ({ ...entityDefaults(), handle: nh(), layer, type: 'ARC', center: P(0, 0), radius: r, startAngle: 0, endAngle: Math.PI / 2 });
const mtext = (layer: string, text: string): MTextEntity => ({
  ...entityDefaults(),
  handle: nh(),
  layer,
  type: 'MTEXT',
  insert: P(0, -10),
  height: 2.5,
  width: 50,
  attachment: 1,
  drawingDirection: 1,
  text,
  style: 'Standard',
  rotation: 0,
  lineSpacingStyle: 1,
  lineSpacingFactor: 1,
  backgroundFlags: 0,
  backgroundScale: 1.5,
});
/** 합성 DXF: 새 도면에 도면층 하나와 객체를 넣어 이 앱의 DXF 쓰기로 만든 바이트(열 때는 DXF 읽기로) */
function synth(layer: string, ents: Entity[], state: { off?: boolean; frozen?: boolean; locked?: boolean } = {}): Uint8Array {
  const doc = createNewDocument('metric');
  doc.layers.set(layer, { ...doc.layers.get('0')!, name: layer, handle: nh(), ...state });
  const ms = doc.blocks.get(MODEL_SPACE)!;
  for (const e of ents) {
    e.owner = ms.recordHandle;
    ms.entities.push(e);
  }
  return writeDxf(doc, { version: 'AC1032' }).data;
}
const HOUSE = synth('한빛벽체', [line('한빛벽체', [0, 0], [100, 0]), circle('한빛벽체', 25), mtext('0', '한빛 주택 평면도')]);
// 둘째 도면의 도면층은 꺼짐·동결·잠김(도면층 창 상태 단추의 반대쪽 이름 — 「{0} 꺼짐」 꼴)
const PLAN = synth('두레설비', [arc('두레설비', 40), line('두레설비', [0, 0], [0, 80]), mtext('두레설비', '두레 메모 글')], { off: true, frozen: true, locked: true });

/** 한 언어로 주요 화면을 차례로 그리며 단계마다 새로 보인 남은 한글을 모은다 */
async function screens(lang: string): Promise<{ steps: [string, string][]; fileTextShown: boolean; orient: string[] }> {
  const dom = stubDom(lang);
  for (const n of ['AUTOSNAP', 'POLARMODE', 'POLARANG', 'POLARADDANG', 'COORDS']) prefSet(`opencad.sysvar.${n}`, null);
  const root = document.getElementById('app')!;
  // 편집기 조각이 먼저 받아진 꼴(src/main.ts — mountEditor가 startEditor를 부르고 번역층은 따로 사전을 받는다)
  startEditor(root);
  const app = (window as unknown as { opencad: App }).opencad;
  const shell = app.ui as Shell;
  const dispose = await installLocalization(root);
  await settle();
  const steps: [string, string][] = [];
  const mine = new Set<string>();
  const look = (step: string) => {
    for (const k of hangulLeft())
      if (!mine.has(k)) {
        mine.add(k);
        steps.push([step, k]);
      }
  };
  let id = 1;
  const open = (name: string, bytes: Uint8Array) => {
    const doc = readDxf(bytes);
    const st = new DocState(id++, doc, name, bytes.length, 0);
    st.session = new EditSession(doc, () => {});
    bindCommitHooks(app, st);
    app.docs.push(st);
    app.activate(st);
    return doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
  };
  try {
    look('처음 화면');
    const first = open('house.dxf', HOUSE);
    await settle();
    look('도면 열기');
    void app.run('LINE');
    await settle();
    look('명령행 프롬프트(LINE)');
    app.cancel(true);
    await settle();
    app.setSelection(first, 'replace');
    void app.run('LIST');
    await settle();
    look('명령행 결과(LIST)');
    shell.openPalette('layers');
    await settle();
    look('도면층 창');
    shell.openPalette('props');
    await settle();
    look('특성 창');
    shell.mobile.apply(true);
    app.setSelection([first[1]!], 'replace');
    shell.mobile.refresh();
    await settle();
    await tick();
    look('정보 카드');
    shell.mobile.apply(false);
    const second = open('plan.dxf', PLAN);
    shell.openPalette('layers');
    await settle();
    look('둘째 도면(도면층 창)');
    app.setSelection([second[0]!], 'replace');
    shell.openPalette('props');
    await settle();
    look('둘째 도면(특성 창)');
    void app.run('HELP');
    await settle();
    look('도움말(F1)');
    const text = document.body.textContent ?? '';
    const fileTextShown = text.includes('두레설비') && text.includes('house.dxf');
    // 대화 상자는 바탕(.dialog-back)을 지우면 닫힌다(ui/dom.ts dialog). 다음 app.run은 앞 명령을 취소하고 돈다(app.ts run)
    const closeDialogs = () => {
      for (const b of Array.from(document.querySelectorAll('.dialog-back'))) b.remove();
    };
    closeDialogs();
    app.cancel(true);
    await settle();
    // 328차 ① 배치 공간: 배치 탭을 눌러 들어간다. 가짜 엔진은 장면을 짓지 않으므로(FakeEngine.build 거절) 장면 짓기만 건너뛴다 — 화면 글만 본다
    app.ensureScene = async () => {};
    document.querySelector<HTMLButtonElement>(`button.layouttab[data-layout]:not([data-layout="${MODEL_SPACE}"])`)!.click();
    await settle();
    look('배치 공간');
    void app.run('MVIEW');
    await settle();
    look('배치 공간(MVIEW)');
    // 뷰포트 구석 프롬프트에서 Enter = 맞춤(vpcmds.ts MVIEW — 진짜 명령행 입력 칸)
    app.cmd.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    const vp = [...app.active!.doc.entityIndex.values()].find((e) => e.type === 'VIEWPORT' && e.id > 1);
    expect(vp, 'MVIEW 맞춤 뷰포트').toBeTruthy();
    app.setSelection([vp!.handle], 'replace');
    shell.openPalette('props');
    await settle();
    look('배치 공간(뷰포트 특성 창)');
    void app.run('LIST');
    await settle();
    look('배치 공간(뷰포트 LIST)');
    document.querySelector<HTMLButtonElement>('button.layouttab.active[data-layout]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 560 }));
    await settle();
    look('배치 탭 메뉴');
    closeMenu();
    // ② 바로 가기 메뉴: 그리기 영역 오른쪽 누름(CadView가 on({ context })로 넘기는 처리기 — app.ts onContext) — 기본·편집·명령 모드
    const view = app.view as unknown as { events: Record<string, (...a: unknown[]) => void> };
    const rightClick = async (step: string) => {
      view.events.context!({ x: 300, y: 300 }, { x: 300, y: 300 }, new MouseEvent('contextmenu', { clientX: 300, clientY: 300 }));
      await settle();
      look(step);
      closeMenu();
    };
    app.cancel(true);
    app.setSelection([], 'replace');
    await rightClick('바로 가기 메뉴(기본)');
    app.setSelection([vp!.handle], 'replace');
    await rightClick('바로 가기 메뉴(편집)');
    app.setSelection([], 'replace');
    void app.run('CIRCLE');
    await settle();
    await rightClick('바로 가기 메뉴(명령)');
    app.cancel(true);
    await settle();
    // ③ 리본 펼친 메뉴: 탭마다 펼침 메뉴가 있는 단추(aria-haspopup="menu")를 눌러 연다. 지금 탭을 다시 누르면 리본이 접히므로 둘째 탭부터, 끝에 첫 탭
    const ribbonTabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.ribbon-tab'));
    for (const i of [...ribbonTabs().keys()].slice(1).concat(0)) {
      ribbonTabs()[i]!.click();
      await settle();
      look('리본 탭');
      for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('button.rbtn-lg[aria-haspopup="menu"], button.rbtn-sm[aria-haspopup="menu"]'))) {
        b.click();
        await settle();
        look('리본 펼친 메뉴');
        closeMenu();
      }
    }
    // 329차 ⑤ 접힌 리본 패널 팝업(282차): buildRibbon(shell.ts)은 리본이 넘칠 때(scrollWidth > clientWidth) 패널 폭(getBoundingClientRect)·여백(getComputedStyle)으로
    // foldCount(layout.ts)를 셈해 오른쪽부터 접는다. jsdom은 폭이 모두 0이라 접히지 않으므로 셋을 흉내 낸다 — 펼친 패널 300 · 접은 단추 60 · 쓸 수 있는 폭 200이면
    // 모든 탭의 모든 패널이 접힌다. 탭마다 접힌 단추를 눌러 팝업(role=dialog — 패널 내용·제목)을 열고, 같은 단추를 다시 눌러 닫는다(closeFoldedPop)
    const ribbonEl = (shell as unknown as { ribbon: HTMLElement }).ribbon;
    const proto = dom.window.Element.prototype;
    const rectOf = proto.getBoundingClientRect;
    const domStyle = (el: Element, pseudo?: string) => dom.window.getComputedStyle(el, pseudo);
    Object.defineProperty(ribbonEl, 'scrollWidth', { configurable: true, get: () => 5000 });
    Object.defineProperty(ribbonEl, 'clientWidth', { configurable: true, get: () => 200 });
    proto.getBoundingClientRect = function (this: Element): DOMRect {
      if (!this.classList.contains('rpanel')) return rectOf.call(this);
      const width = this.querySelector('button.folded') ? 60 : 300;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 80, width, height: 80, toJSON: () => ({}) };
    };
    vi.stubGlobal('getComputedStyle', (el: Element, pseudo?: string) => (el === ribbonEl ? ({ paddingLeft: '0px', paddingRight: '0px' } as unknown as CSSStyleDeclaration) : domStyle(el, pseudo)));
    try {
      for (const i of [...ribbonTabs().keys()].slice(1).concat(0)) {
        ribbonTabs()[i]!.click();
        await settle();
        const folded = Array.from(document.querySelectorAll<HTMLButtonElement>('button.folded'));
        expect(folded.length, `접힌 패널(리본 탭 ${i})`).toBeGreaterThan(0);
        for (const b of folded) {
          b.click();
          await settle();
          expect(document.querySelector('.ribbon-pop'), '접힌 패널 팝업').not.toBeNull();
          look('접힌 리본 패널');
          b.click();
          await settle();
        }
      }
    } finally {
      Reflect.deleteProperty(ribbonEl, 'scrollWidth');
      Reflect.deleteProperty(ribbonEl, 'clientWidth');
      proto.getBoundingClientRect = rectOf;
      vi.stubGlobal('getComputedStyle', domStyle);
    }
    // ④ 자주 쓰는 대화 상자: 문자 스타일·치수 스타일·페이지 설정 관리자·플롯(배치에서)
    for (const name of ['STYLE', 'DIMSTYLE', 'PAGESETUP', 'PLOT']) {
      void app.run(name);
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"][aria-modal="true"]'), name).not.toBeNull(), { timeout: 5000 });
      await settle();
      look(`대화 상자(${name})`);
      closeDialogs();
      app.cancel(true);
      await settle();
    }
    // 329차 ⑥ 옵션 대화 상자(mgr-ui tabs — 다섯 쪽을 모두 그려 두고 고른 쪽만 보인다: 훑기·번역층은 숨은 쪽까지 본다)·도면층 상태 관리자
    for (const name of ['OPTIONS', 'LAYERSTATE']) {
      void app.run(name);
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"][aria-modal="true"]'), name).not.toBeNull(), { timeout: 5000 });
      await settle();
      look(`대화 상자(${name})`);
      closeDialogs();
      app.cancel(true);
      await settle();
    }
    // ⑦ 치수 스타일 「수정…」 하위 대화 상자(dimstyle.ts editDialog — 7탭, 고른 탭의 칸만 그린다): 관리자 오른쪽 단추 줄(현재로 설정·새로 만들기·수정·재지정·비교 —
    // 바닥 「닫기」 밖의 button.btn 다섯)의 셋째. 탭을 누르면 탭 줄을 다시 그리므로 매번 다시 찾는다
    void app.run('DIMSTYLE');
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"][aria-modal="true"]'), 'DIMSTYLE').not.toBeNull(), { timeout: 5000 });
    await settle();
    const side = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button.btn')).filter((b) => !b.closest('footer'));
    expect(side.length, '치수 스타일 관리자 단추 줄').toBe(5);
    side[2]!.click();
    const editTabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] [role="tablist"] [role="tab"]'));
    await vi.waitFor(() => expect(editTabs().length, '치수 스타일 수정 탭').toBe(7), { timeout: 5000 });
    await settle();
    for (let i = 0; i < 7; i++) {
      editTabs()[i]!.click();
      await settle();
      look('대화 상자(DIMSTYLE 수정)');
    }
    closeDialogs();
    app.cancel(true);
    await settle();
    // ⑧ 문자 편집기(MTEXT — 두 구석을 진짜 명령행 입력 칸에 쳐서 연다: textedit/editor.ts의 상자·도구 모음)
    const typeLine = async (s: string) => {
      app.cmd.input.value = s;
      app.cmd.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await settle();
    };
    void app.run('MTEXT');
    await settle();
    await typeLine('10,10');
    await typeLine('90,40');
    await vi.waitFor(() => expect(document.querySelector('.te-bar'), 'MTEXT 편집기').not.toBeNull(), { timeout: 5000 });
    await settle();
    look('문자 편집기(MTEXT)');
    activeEditor()?.cancel();
    app.cancel(true);
    await settle();
    // ⑨ 배치 마법사 「방향」 쪽(filecmds-layout.ts runWizard 넷째 쪽 — 바닥 「< 뒤로」·「다음 >」·「취소」의 둘째를 세 번): 라디오 이름표 글(한글 0 훑기 밖 — 뜻만 본다)
    void app.run('LAYOUTWIZARD');
    const wizard = () => Array.from(document.querySelectorAll<HTMLElement>('.dialog-back')).pop();
    await vi.waitFor(() => expect(wizard()?.querySelectorAll('footer .btn').length, 'LAYOUTWIZARD').toBe(3), { timeout: 5000 });
    for (let i = 0; i < 3; i++) {
      wizard()!.querySelectorAll<HTMLButtonElement>('footer .btn')[1]!.click();
      await settle();
    }
    const orient = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="wz-orient"]')).map((r) => r.parentElement!.textContent!.trim());
    closeDialogs();
    app.cancel(true);
    await settle();
    return { steps, fileTextShown, orient };
  } finally {
    app.cancel(true);
    app.cmd.watchers.clear();
    await settle();
    dispose();
    for (const t of intervals.splice(0)) realClearInterval(t);
    // 문서를 먼저 닫고 남은 지켜보기 알림을 이 문서의 전역으로 끝낸 뒤 전역을 되돌린다(전역을 먼저 되돌리면 dom.ts 지켜보기가 document 없이 돈다)
    dom.window.close();
    await settle();
    vi.unstubAllGlobals();
  }
}

describe('번역층의 첫 언어 알림 차례(327차, SKP 214차 꼴)', () => {
  it('첫 알림을 받아 곧바로(같은 차례에) 그린 앱 글도 옮긴다 — 화면 보기를 알림보다 먼저 시작한다', async () => {
    for (const s of ['도면 공간', '특성', '도면층']) expect(translate(s, 'en')).not.toBe(s);
    const dom = stubDom('en');
    const root = document.getElementById('app')!;
    root.innerHTML = '<header class="titlebar"></header><div class="statusbar"><span class="status-text">모형</span></div>';
    // 상태 막대 글을 새 언어로 다시 쓰고 줄을 하나 더하는 받는 쪽(알림 안에서 동기로)
    root.addEventListener('languagechange', () => {
      root.querySelector('.status-text')!.textContent = '도면 공간';
      const late = document.createElement('span');
      late.className = 'late';
      late.title = '도면층';
      late.textContent = '특성';
      root.append(late);
    });
    const dispose = await installLocalization(root);
    await settle();
    try {
      expect(root.querySelector('.status-text')!.textContent).toBe(translate('도면 공간', 'en'));
      expect(root.querySelector('.late')!.textContent).toBe(translate('특성', 'en'));
      expect(root.querySelector('.late')!.getAttribute('title')).toBe(translate('도면층', 'en'));
    } finally {
      dispose();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  });
});

type Screens = Awaited<ReturnType<typeof screens>>;
let runs: Promise<Map<string, Screens>> | undefined;
/** 한국어와 네 언어를 한 번만 그린다(아래 두 시험이 함께 쓴다 — 329차) */
const allScreens = () =>
  (runs ??= (async () => {
    const m = new Map<string, Screens>();
    for (const lang of ['ko', ...LANGS]) m.set(lang, await screens(lang));
    return m;
  })());

describe('다섯 언어 주요 화면의 한글 0(327차)', () => {
  it(
    '처음 화면·명령행·도면층/특성 창·정보 카드·상태 막대·도움말(F1)·배치 공간·바로 가기 메뉴·리본 펼친 메뉴·접힌 리본 패널·대화 상자·문자 편집기(합성 DXF 둘) — 파일 글 칸 밖에 한글이 없다(아직 둔 것 빼고)',
    async () => {
      const all = await allScreens();
      const left = new Map<string, string[]>();
      for (const lang of LANGS) {
        const r = all.get(lang)!;
        // 도면 글(도면층 이름)·파일 이름은 번역층 밖이라 그대로 보인다
        expect(r.fileTextShown, lang).toBe(true);
        for (const [step, k] of r.steps) {
          const key = `${step} · ${k}`;
          left.set(key, [...(left.get(key) ?? []), lang]);
        }
      }
      expect([...left].map(([k, langs]) => `${k} (${langs.join(', ')})`)).toEqual(PENDING);
      for (const p of PENDING) expect(p).toMatch(HANGUL);
      // 한국어 화면: 같은 훑기가 앱 글의 한글을 찾는다(시험이 눈멀지 않음 — 새 걸음마다 새 앱 글이 보여야 그 화면을 그린 것)
      const ko = all.get('ko')!;
      expect(ko.steps.length).toBeGreaterThan(20);
      expect(ko.fileTextShown).toBe(true);
      for (const step of NEW_STEPS) expect(ko.steps.some(([s]) => s === step), step).toBe(true);
    },
    240_000,
  );
  it(
    '배치 마법사 「방향」 쪽 라디오는 용지 방향 낱말이다(329차 — 홀로 쓴 「가로」·「세로」는 PLOTSTAMP 글 방향인 수평·수직 뜻)',
    async () => {
      const all = await allScreens();
      expect(all.get('ko')!.orient).toEqual(['세로 방향', '가로 방향']);
      // 같은 사전의 용지 방향 낱말: -PLOT 옵션 「세로(P)」·「가로(L)」의 번역에서 옵션 글자를 뗀 것(Portrait·縦·纵向·Hochformat 꼴)
      for (const lang of LANGS) expect(all.get(lang)!.orient, lang).toEqual(['세로(P)', '가로(L)'].map((k) => translate(k, lang).replace(/\s*\([A-Z]\)$/, '')));
    },
    240_000,
  );
});
