/**
 * 240차: 건축(LUNITS 4)·공학(LUNITS 3) 단위 도면의 재기 글. 길이 글이 이미 피트-인치(`4'-2"`)라 INSUNITS 단위 꼬리(` in`)를 붙이지 않는다 —
 * 전에는 DIST·MEASUREGEOM 거리·다중 점·반지름 명령행과 도면 표시 글, LIST 길이 합계, 휴대폰 보기 결과 카드(거리·누적 거리·반지름·지름·둘레)에
 * `4'-2" in`처럼 단위가 두 번 적혔다(Autodesk UNITS 도움말: 두 꼴은 피트-인치로 보이고 도면 단위 하나를 1인치로 본다.
 * 같은 앱의 상태 막대 좌표·LIST 객체 줄·DIST 증분 줄은 이미 꼬리 없이 쓴다).
 * 면적은 두 단위에서도 소수라 카드의 제곱 단위(` in²`)는 그대로이고, 면적 꼴(제곱 인치·제곱 피트)은 도움말이 적지 않아 바꾸지 않는다.
 * 다른 단위(십진·분수)는 꼬리 그대로. 틀은 measurecard.test.ts와 같다(진짜 App과 명령, 화면·명령행은 가짜, MobileView는 jsdom 문서).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity, LineEntity } from '../../src/core/model';
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

/** 단위를 정한 새 도면(LUNITS·LUPREC·INSUNITS)과 보기 모드 카드 */
function setup(lunits: number, luprec: number, insunits = 1) {
  const h = makeApp((doc) => {
    doc.header.set('$LUNITS', lunits);
    doc.header.set('$LUPREC', luprec);
    doc.header.set('$INSUNITS', insunits);
  });
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
  const circle = (r: number) => add({ ...entityDefaults(), type: 'CIRCLE', handle: h.st.session.newHandle(), center: { x: 0, y: 0, z: 0 }, radius: r } as CircleEntity);
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    add({ ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } } as LineEntity);
  return { ...h, mv, type, click, circle, line };
}
type H = RealApp & { mv: MobileView };
const text = (h: H, sel: string) => h.mv.card.querySelector(sel)?.textContent ?? null;
/** 도면 위에 남는 마지막 결과 글 */
const lastMark = (h: H) => (h.view.overlay.marks.at(-1) as { text?: string } | undefined)?.text ?? null;

async function dist(h: ReturnType<typeof setup>) {
  void h.app.run('DIST');
  await settle();
  await h.click(P(10, 10));
  await h.click(P(40, 50));
  expect(h.app.busyCommand).toBeNull();
  return h.out().filter((t) => /^(거리|X 증분) =/.test(t));
}
async function radius(h: ReturnType<typeof setup>, r: number) {
  h.circle(r);
  void h.app.run('MEASURERADIUS');
  await settle();
  await h.click(P(r, 0));
  const out = h.out().filter((t) => t.startsWith('반지름 = '));
  h.app.cmd.escape();
  await settle();
  return out;
}
async function area(h: ReturnType<typeof setup>) {
  void h.app.run('AREA');
  await settle();
  for (const p of [P(0, 0), P(40, 0), P(40, 30), P(0, 30)]) await h.click(p);
  await h.type('');
  expect(h.app.busyCommand).toBeNull();
  return h.out().filter((t) => /^(총 )?면적 = /.test(t));
}
async function listSum(h: ReturnType<typeof setup>) {
  const a = h.line(0, 0, 12, 0);
  const b = h.line(0, 10, 18, 10);
  h.app.setSelection([a, b]);
  void h.app.run('LIST');
  await settle();
  return h.out().filter((t) => t.startsWith('길이 합계'));
}

describe('건축·공학 단위의 재기 글: 피트-인치 뒤 단위 꼬리 없음(240차)', () => {
  it('건축(LUNITS 4): DIST 명령행·도면 표시·카드는 4\'-2" — 증분 줄은 전처럼 꼬리 없음', async () => {
    const h = setup(4, 4);
    const out = await dist(h);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^거리 = 4'-2", {2}XY 평면에서의 각도 = \S+, {2}XY 평면으로부터의 각도 = /);
    expect(out[1]).toBe(`X 증분 = 2'-6",  Y 증분 = 3'-4",  Z 증분 = 0'-0"`);
    expect(lastMark(h)).toBe(`4'-2"`);
    expect(text(h, '.mv-kind')).toBe('거리');
    expect(text(h, '.mv-big')).toBe(`4'-2"`);
    expect(text(h, '.mv-sub')).toMatch(/^각도 \S+ · ΔX 2'-6" · ΔY 3'-4"$/);
  });

  it('건축(LUNITS 4): DIST 다중 점의 누적 거리 명령행·카드·도면 표시', async () => {
    const h = setup(4, 4);
    void h.app.run('DIST');
    await settle();
    await h.click(P(0, 0));
    await h.type('');
    await h.click(P(12, 0));
    await h.click(P(12, 18));
    await h.type('');
    expect(h.app.busyCommand).toBeNull();
    expect(h.out().filter((t) => t.startsWith('거리 = '))).toEqual([`거리 = 1'-0"`, `거리 = 2'-6"`]);
    expect(text(h, '.mv-kind')).toBe('누적 거리');
    expect(text(h, '.mv-big')).toBe(`2'-6"`);
    expect(lastMark(h)).toBe(`2'-6"`);
  });

  it('건축(LUNITS 4): MEASUREGEOM 반지름의 반지름·지름(명령행·카드) — 도움말 UNITS의 15.5 = 1\'-3 1/2"', async () => {
    const h = setup(4, 4);
    expect(await radius(h, 15.5)).toEqual([`반지름 = 1'-3 1/2"\n지름 = 2'-7"`]);
    expect(text(h, '.mv-kind')).toBe('반지름');
    expect(text(h, '.mv-big')).toBe(`1'-3 1/2"`);
    expect(text(h, '.mv-sub')).toBe(`지름 2'-7"`);
  });

  it('건축(LUNITS 4): AREA 명령행은 그대로, 카드 면적은 소수 제곱 단위 그대로·둘레는 꼬리 없음(추가 모드도)', async () => {
    const h = setup(4, 4);
    expect(await area(h)).toEqual([`면적 = 1200.0000,  둘레 = 11'-8"`]);
    expect(text(h, '.mv-kind')).toBe('면적');
    expect(text(h, '.mv-big')).toBe('1200.0000 in²');
    expect(text(h, '.mv-sub')).toBe(`둘레 11'-8"`);
    // 면적 추가 모드: 총 면적 카드의 보조 줄 면적은 제곱 단위 그대로, 둘레는 꼬리 없음
    void h.app.run('AREA');
    await settle();
    await h.type('A');
    for (const p of [P(0, 0), P(40, 0), P(40, 30), P(0, 30)]) await h.click(p);
    await h.type('');
    expect(text(h, '.mv-kind')).toBe('총 면적');
    expect(text(h, '.mv-big')).toBe('1200.0000 in²');
    expect(text(h, '.mv-sub')).toBe(`면적 1200.0000 in² · 둘레 11'-8"`);
    await h.type('X');
    expect(h.app.busyCommand).toBeNull();
  });

  it('건축(LUNITS 4): LIST 길이 합계', async () => {
    const h = setup(4, 4);
    expect(await listSum(h)).toEqual([`길이 합계(2개) = 2'-6"`]);
  });

  it('공학(LUNITS 3): DIST·반지름도 꼬리 없음', async () => {
    const h = setup(3, 2);
    const out = await dist(h);
    expect(out[0]).toMatch(/^거리 = 4'-2\.00", {2}XY 평면에서의 각도 = /);
    expect(text(h, '.mv-big')).toBe(`4'-2.00"`);
    expect(await radius(h, 15.5)).toEqual([`반지름 = 1'-3.50"\n지름 = 2'-7.00"`]);
    expect(text(h, '.mv-big')).toBe(`1'-3.50"`);
    expect(text(h, '.mv-sub')).toBe(`지름 2'-7.00"`);
  });

  it('십진(LUNITS 2)·분수(LUNITS 5) in 도면은 전처럼 단위 꼬리', async () => {
    const h = setup(2, 4);
    const out = await dist(h);
    expect(out[0]).toMatch(/^거리 = 50\.0000 in, {2}XY 평면에서의 각도 = /);
    expect(lastMark(h)).toBe('50.0000 in');
    expect(text(h, '.mv-big')).toBe('50.0000 in');
    expect(await radius(h, 15.5)).toEqual(['반지름 = 15.5000 in\n지름 = 31.0000 in']);
    expect(text(h, '.mv-big')).toBe('15.5000 in');
    expect(text(h, '.mv-sub')).toBe('지름 31.0000 in');
    // 면적은 새 도면에서(반지름의 원에 스냅하지 않게)
    const g = setup(2, 4);
    expect(await area(g)).toEqual(['면적 = 1200.0000,  둘레 = 140.0000']);
    expect(text(g, '.mv-big')).toBe('1200.0000 in²');
    expect(text(g, '.mv-sub')).toBe('둘레 140.0000 in');
    expect(await listSum(g)).toEqual(['길이 합계(2개) = 30.0000 in']);
    const f = setup(5, 4);
    expect((await dist(f))[0]).toMatch(/^거리 = 50 in, {2}XY 평면에서의 각도 = /);
    expect(text(f, '.mv-big')).toBe('50 in');
  });
});
