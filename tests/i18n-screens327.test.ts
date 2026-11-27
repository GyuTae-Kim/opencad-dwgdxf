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
vi.mock('../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));
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
 * 아직 둔 것(327차): 이 시험이 찾았는데 이번 차수에 고치지 않은 자리 — 「단계 · 칸: 남은 한글 (언어)」.
 * 목록에 있는데 이제 한글이 없으면 실패한다(고쳤으면 목록에서 지운다).
 */
const PENDING: string[] = [
  // 도면층 창 색 견본 title 「색: {0}」(palettes.ts) — 틀이 잡은 색 이름(colorText, 앱 낱말)을 번역층이 옮기지 않는다(코드 몫)
  '도면층 창 · title: 흰색 (en, ja, zh-CN, de)',
  // 도면층 필터 상태 줄 「{0}: …개 도면층 중 …개 표시」(layerfilter-core.ts) — 기본 필터 이름 「모두」(앱 낱말)도 사용자 필터 이름(도면 글)과 같은 자리라 옮기지 않는다(코드 몫)
  '도면층 창 · 글: 모두 (en, ja, zh-CN, de)',
];

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let intervals: ReturnType<typeof setInterval>[] = [];

const stubDom = (lang: string) => {
  const dom = new JSDOM('<!doctype html><html lang="ko"><head><title>OpenCAD</title></head><body><div id="app"></div></body></html>', {
    url: `https://gyutae-kim.github.io/opencad-dwgdxf/${lang === 'ko' ? '' : `${lang}/`}`,
  });
  const w = dom.window as unknown as Record<string, unknown>;
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLAnchorElement', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
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
async function screens(lang: string): Promise<{ steps: [string, string][]; fileTextShown: boolean }> {
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
    return { steps, fileTextShown: text.includes('두레설비') && text.includes('house.dxf') };
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

describe('다섯 언어 주요 화면의 한글 0(327차)', () => {
  it(
    '처음 화면·명령행·도면층/특성 창·정보 카드·상태 막대·도움말(F1)(합성 DXF 둘) — 파일 글 칸 밖에 한글이 없다(아직 둔 것 빼고)',
    async () => {
      // 한국어 화면: 같은 훑기가 앱 글의 한글을 찾는다(시험이 눈멀지 않음)
      const ko = await screens('ko');
      expect(ko.steps.length).toBeGreaterThan(20);
      expect(ko.fileTextShown).toBe(true);
      const left = new Map<string, string[]>();
      for (const lang of LANGS) {
        const r = await screens(lang);
        // 도면 글(도면층 이름)·파일 이름은 번역층 밖이라 그대로 보인다
        expect(r.fileTextShown, lang).toBe(true);
        for (const [step, k] of r.steps) {
          const key = `${step} · ${k}`;
          left.set(key, [...(left.get(key) ?? []), lang]);
        }
      }
      expect([...left].map(([k, langs]) => `${k} (${langs.join(', ')})`)).toEqual(PENDING);
      for (const p of PENDING) expect(p).toMatch(HANGUL);
    },
    120_000,
  );
});
