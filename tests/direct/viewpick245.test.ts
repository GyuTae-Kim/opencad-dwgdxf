/**
 * 휴대폰 보기 모드에서 누른 객체(245차): README 휴대폰 보기 절 「정보 카드: 객체를 누르면 그 하나만 고르고 … 치수 정보를 보입니다」와
 * 시작 화면 안내 「객체를 눌러 길이·반지름·치수 값 보기」. 244차까지는 보기 모드의 누르기도 편집 화면처럼 고르기 넓히기
 * (PICKSTYLE 1의 선택 가능한 그룹, 단마다 따로 저장된 여러 단 문자 묶음)를 거쳐, 그룹에 든 객체나 여러 단 문자의 한 단을 누르면
 * 묶음 전체를 골랐고 정보 카드는 고른 것이 하나일 때만 보여 아무 값도 뜨지 않았다. 보기 모드는 누른 그 하나만 고르고, 편집 화면은 그대로 묶음 전체다.
 * 진짜 App·MobileView, 화면·명령행·엔진·글꼴은 가짜(viewmode-round4.test.ts와 같은 틀). 고르기 넓히기는 editor.ts가 util2로 잇는 고리와 같은 함수.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createGroupOps } from '../../src/edit/util/groups';
import { MobileView } from '../../src/app/ui/mobileview';
import { groupExpander } from '../../src/app/util2-select';
import { makeApp, settle } from '../polish/real-app';
import { columnGroup } from '../text/mtextcols-fixture';
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
  vi.stubGlobal('localStorage', dom.window.localStorage);
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 둔다(그 확인이 시험 안에서 끝나게)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  // PICKSTYLE은 이 브라우저 값(기본 1 — 그룹 선택 켜짐)
  dom.window.localStorage.clear();
});

const ev = { pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent;
/** 여러 단 문자(세 단 — 삽입점 (0, 100)·(25, 100)·(50, 100), 단 폭 20, 위 왼쪽 부착이라 상자는 y 88~100) */
const COLS = ['7F00', '7F01', '7F02'];

/**
 * 선 a (0,0)-(10,0)·b (0,20)-(10,20)은 선택 가능한 그룹 G1, c (0,40)-(10,40)은 선택 불가 그룹 G2, d (0,60)-(10,60)은 그룹 밖.
 * 셸처럼 고른 것이 바뀌면(refreshPalette) 휴대폰 보기를 다시 그린다
 */
function setup() {
  const h = makeApp();
  h.app.selectionExpander = groupExpander(h.app);
  const ms = h.doc.blocks.get(MODEL_SPACE)!;
  const add = (e: Entity) => {
    e.owner = ms.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const line = (y: number) => add({ ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y, z: 0 }, end: { x: 10, y, z: 0 } } as LineEntity);
  const [a, b, c, d] = [line(0), line(20), line(40), line(60)];
  const g1 = createGroupOps(h.doc, 'G1', '', [a, b], () => h.st.session.newHandle())!;
  h.st.session.commit({ label: 'GROUP', ops: g1.ops });
  const g2 = createGroupOps(h.doc, 'G2', '', [c], () => h.st.session.newHandle(), false)!;
  h.st.session.commit({ label: 'GROUP', ops: g2.ops });
  for (const m of columnGroup(COLS[0], COLS[1], COLS[2], 0, 100)) add(m);
  // 가짜 고르기는 선만 잡으므로, 여러 단 문자는 진짜 고르기처럼 단 상자 안을 누르면 그 단
  const pk = new FakePicker(h.doc);
  const pick = pk.pick.bind(pk);
  pk.pick = (x: number, y: number, tol: number) => (y >= 88 && y <= 100 && x >= 0 && x < 70 ? COLS[Math.floor(x / 25)]! : pick(x, y, tol));
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  (h.app.ui as { refreshPalette: () => void }).refreshPalette = () => mv.refresh();
  const tap = async (x: number, y: number) => {
    h.view.events.click!({ x, y }, { x, y }, ev);
    await settle();
  };
  const sel = () => [...h.st.selection].sort();
  /** 정보 카드: 보이는지와 행(이름 → 값) */
  const card = () => {
    const rows = new Map([...mv.card.querySelectorAll('.mv-rows dt')].map((dt): [string, string] => [dt.textContent ?? '', dt.nextElementSibling?.textContent ?? '']));
    return { shown: !mv.card.hidden && mv.card.classList.contains('is-info'), title: mv.card.querySelector('.mv-title b')?.textContent, rows };
  };
  return { ...h, mv, a, b, c, d, tap, sel, card };
}

describe('휴대폰 보기 모드: 누른 객체 하나(245차)', () => {
  it('선택 가능한 그룹에 든 객체를 누르면 그 하나만 고르고 정보 카드에 그 객체의 길이를 보인다', async () => {
    const h = setup();
    h.mv.apply(true);
    await h.tap(5, 0);
    expect(h.sel()).toEqual([h.a]);
    const c = h.card();
    expect(c.shown).toBe(true);
    expect(c.title).toBe('선');
    expect([...c.rows.keys()]).toEqual(['길이', '각도', '델타 X', '델타 Y']);
    expect(c.rows.get('길이')).toMatch(/^10(\.0+)?$/);
    // 같은 그룹의 다른 객체를 누르면 그것 하나로 바뀐다
    await h.tap(5, 20);
    expect(h.sel()).toEqual([h.b]);
    expect(h.card().shown).toBe(true);
  });

  it('단마다 따로 저장된 여러 단 문자의 한 단을 누르면 그 단 하나의 문자 높이·내용', async () => {
    const h = setup();
    h.mv.apply(true);
    await h.tap(30, 95);
    expect(h.sel()).toEqual([COLS[1]]);
    const c = h.card();
    expect(c.shown).toBe(true);
    expect([...c.rows.keys()]).toEqual(['문자 높이', '내용']);
    expect(c.rows.get('내용')).toContain('Line 4');
    expect(c.rows.get('내용')).not.toContain('Line 1');
  });

  it('그대로: 편집 화면은 그룹·여러 단 묶음 전체, 선택 불가 그룹과 그룹 밖 객체는 보기 모드에서도 하나', async () => {
    const h = setup();
    // 편집 화면(PICKSTYLE 1)
    await h.tap(5, 0);
    expect(h.sel()).toEqual([h.a, h.b].sort());
    h.app.clearSelection();
    await h.tap(30, 95);
    expect(h.sel()).toEqual([...COLS].sort());
    h.app.clearSelection();
    await h.tap(5, 40);
    expect(h.sel()).toEqual([h.c]);
    h.app.clearSelection();
    await settle();
    // 보기 모드
    h.mv.apply(true);
    await h.tap(5, 40);
    expect(h.sel()).toEqual([h.c]);
    expect(h.card().shown).toBe(true);
    await h.tap(5, 60);
    expect(h.sel()).toEqual([h.d]);
    expect(h.card().shown).toBe(true);
    // 편집 화면으로 돌아오면 다시 그룹 전체
    h.mv.apply(false);
    h.app.clearSelection();
    await h.tap(5, 20);
    expect(h.sel()).toEqual([h.a, h.b].sort());
  });
});
