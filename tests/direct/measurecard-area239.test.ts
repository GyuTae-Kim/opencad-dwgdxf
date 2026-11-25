/**
 * 239차: 휴대폰 보기 모드의 면적 단추(AREA)를 면적 추가(A)·빼기(S) 모드로 쓸 때의 결과 카드.
 * 데스크톱 명령행은 잴 때마다 「면적 = …, 둘레 = …」와 「총 면적 = …」 두 줄을 보인다(Autodesk MEASUREGEOM 도움말 면적: 정한 면적마다 면적과 둘레,
 * 면적 추가는 정하는 면적의 총합을 이어 센다). 보기 모드는 명령행을 숨기므로 카드가 두 줄을 한 덩어리(큰 값 총 면적, 보조 줄 방금 잰 면적·둘레)로 보여야 한다.
 * 전에는 마지막 덩어리(총 면적)만 「면적」 이름으로 보여 방금 잰 면적·둘레가 휴대폰에서 보이지 않고 빼기 뒤 총합도 면적처럼 보였다.
 * 틀은 measurecard.test.ts와 같다(진짜 App과 명령, 화면·명령행은 가짜, MobileView는 jsdom 문서).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { MobileView } from '../../src/app/ui/mobileview';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';
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
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

const P = (x: number, y: number) => ({ x, y });
const ev = { pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent;

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const add = (e: Entity) => {
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  mv.apply(true);
  const type = async (t: string) => {
    (h.cmd as unknown as { type(t: string): void }).type(t);
    await settle();
  };
  const click = async (p: { x: number; y: number }) => {
    h.view.events.click!(p, p, ev);
    await settle();
  };
  return { ...h, mv, add, type, click };
}
type H = RealApp & { mv: MobileView };
const text = (h: H, sel: string) => h.mv.card.querySelector(sel)?.textContent ?? null;
const raw = (h: H) => [...h.mv.card.querySelectorAll('.mv-raw > div')].map((d) => d.textContent);
/** 명령행의 면적·총 면적 줄(데스크톱 글 — 고쳐도 그대로) */
const areaLines = (h: H) => h.out().filter((t) => /^(총 )?면적 = /.test(t));

describe('휴대폰 보기 모드 면적 단추의 추가·빼기 모드 카드(239차)', () => {
  it('점으로 더하고 빼기: 잴 때마다 큰 값은 총 면적, 보조 줄은 방금 잰 면적·둘레, 펼침은 명령행 두 줄. 끝내면 총 면적', async () => {
    const h = setup();
    void h.app.run('AREA');
    await settle();
    await h.type('A');
    expect(text(h, '.mv-prompt')).toMatch(/^\(추가 모드\) 첫 번째 구석점 지정/);
    for (const p of [P(0, 0), P(40, 0), P(40, 30), P(0, 30)]) await h.click(p);
    await h.type('');
    // 더하기: 1200(둘레 140), 총 1200 — 아직 명령 중이라 프롬프트 위에
    expect(h.app.busyCommand).toBe('AREA');
    expect(h.mv.card.classList.contains('is-prompt')).toBe(true);
    expect(h.mv.card.querySelectorAll('details.mv-measure')).toHaveLength(1);
    expect(text(h, '.mv-kind')).toBe('총 면적');
    expect(text(h, '.mv-big')).toBe('1200.0000 mm²');
    expect(text(h, '.mv-sub')).toBe('면적 1200.0000 mm² · 둘레 140.0000 mm');
    expect(raw(h)).toEqual(['면적 = 1200.0000,  둘레 = 140.0000', '총 면적 = 1200.0000']);
    // 빼기: 300(둘레 80), 총 900 — 카드는 마지막 측정 한 덩어리
    await h.type('S');
    expect(text(h, '.mv-prompt')).toMatch(/^\(빼기 모드\) 첫 번째 구석점 지정/);
    for (const p of [P(0, 0), P(10, 0), P(10, 30), P(0, 30)]) await h.click(p);
    await h.type('');
    expect(h.mv.card.querySelectorAll('details.mv-measure')).toHaveLength(1);
    expect(text(h, '.mv-kind')).toBe('총 면적');
    expect(text(h, '.mv-big')).toBe('900.0000 mm²');
    expect(text(h, '.mv-sub')).toBe('면적 300.0000 mm² · 둘레 80.0000 mm');
    expect(raw(h)).toEqual(['면적 = 300.0000,  둘레 = 80.0000', '총 면적 = 900.0000']);
    // 종료(X): 명령행처럼 총 면적 한 줄이 결과
    await h.type('X');
    expect(h.app.busyCommand).toBeNull();
    expect(h.mv.card.classList.contains('is-result')).toBe(true);
    expect(text(h, '.mv-kind')).toBe('총 면적');
    expect(text(h, '.mv-big')).toBe('900.0000 mm²');
    expect(h.mv.card.querySelector('.mv-sub')).toBeNull();
    expect(raw(h)).toEqual(['총 면적 = 900.0000']);
    // 데스크톱 명령행 글·차례는 그대로
    expect(areaLines(h)).toEqual(['면적 = 1200.0000,  둘레 = 140.0000', '총 면적 = 1200.0000', '면적 = 300.0000,  둘레 = 80.0000', '총 면적 = 900.0000', '총 면적 = 900.0000']);
  });

  it('추가 모드의 객체(O): 원 하나를 더하면 총 면적과 그 원의 면적·둘레. 모드 없이 잰 객체는 전처럼 면적·둘레', async () => {
    const h = setup();
    const c: CircleEntity = { ...entityDefaults(), type: 'CIRCLE', handle: h.st.session.newHandle(), center: { x: 0, y: 0, z: 0 }, radius: 10 };
    h.add(c);
    void h.app.run('AREA');
    await settle();
    await h.type('A');
    await h.type('O');
    expect(text(h, '.mv-prompt')).toBe('(추가 모드) 객체 선택:');
    await h.click(P(10, 0));
    expect(text(h, '.mv-kind')).toBe('총 면적');
    expect(text(h, '.mv-big')).toBe('314.1593 mm²');
    expect(text(h, '.mv-sub')).toBe('면적 314.1593 mm² · 둘레 62.8319 mm');
    // 객체 고르기를 Enter로 끝내고 모드 프롬프트에서 Enter: 총 면적으로 끝난다
    await h.type('');
    await h.type('');
    expect(h.app.busyCommand).toBeNull();
    expect(text(h, '.mv-kind')).toBe('총 면적');
    expect(text(h, '.mv-big')).toBe('314.1593 mm²');
    expect(areaLines(h)).toEqual(['면적 = 314.1593,  둘레 = 62.8319', '총 면적 = 314.1593', '총 면적 = 314.1593']);
    // 모드 없이(기본 객체) 같은 원: 이름은 면적, 보조 줄은 둘레(전과 같다)
    void h.app.run('AREA');
    await settle();
    await h.type('');
    await h.click(P(10, 0));
    expect(h.app.busyCommand).toBeNull();
    expect(text(h, '.mv-kind')).toBe('면적');
    expect(text(h, '.mv-big')).toBe('314.1593 mm²');
    expect(text(h, '.mv-sub')).toBe('둘레 62.8319 mm');
    expect(raw(h)).toEqual(['면적 = 314.1593,  둘레 = 62.8319']);
  });
});
