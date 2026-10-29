/**
 * 오른쪽 버튼 끌어 놓기(AutoCAD 도움말 "About Copying Objects": 오른쪽 버튼으로 끌면 놓은 뒤 바로 가기 메뉴 — Move Here·Copy Here·
 * Paste as Block·Cancel):
 *  - RightDragGesture: 브라우저가 contextmenu를 누를 때(macOS·Linux)·뗄 때(Windows) 보내도 끌지 않은 오른쪽 클릭은 한 번 그대로,
 *    끌어 놓은 것은 버린다
 *  - 진짜 App(화면·명령행은 가짜): 고른 객체 위에서만 끌기, 미리보기, 메뉴의 이동·복사·블록으로 붙여넣기(각각 명령 취소 한 단계), 취소·Esc
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InsertEntity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { OverlayState } from '../../src/app/view';
import { DROP_CONTEXT_MS, RIGHT_DRAG_PX, RightDragGesture } from '../../src/app/rightdrag';
import { dropMenuItems } from '../../src/app/dragmove';
import * as dom from '../../src/app/ui/dom';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.mocked(dom.showMenu).mockClear();
});

type Pt = { x: number; y: number };
const P = (x: number, y: number) => ({ x, y });
const ev = (o: Partial<PointerEvent> = {}) => ({ pointerType: 'mouse', button: 2, shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...o }) as PointerEvent;

describe('오른쪽 버튼 끌기 판정(RightDragGesture)', () => {
  it('누를 때 온 contextmenu(macOS·Linux): 끌지 않았으면 뗄 때 한 번 보내고, 끌었으면 버린다', () => {
    const g = new RightDragGesture();
    const sent: number[] = [];
    g.down(P(10, 10));
    expect(g.context(0, () => sent.push(1))).toBe('defer');
    expect(g.move(P(10 + RIGHT_DRAG_PX, 10))).toBeNull();
    expect(g.up(50)).toEqual({ click: true });
    expect(sent).toEqual([1]);
    // 끌기
    g.down(P(10, 10));
    expect(g.context(100, () => sent.push(2))).toBe('defer');
    expect(g.move(P(30, 10))).toEqual(P(10, 10));
    expect(g.context(110, () => sent.push(3))).toBe('swallow');
    expect(g.up(200)).toEqual({ drop: P(10, 10) });
    expect(sent).toEqual([1]);
    // 누를 때 이미 받았으니 바로 뒤의 오른쪽 클릭은 평소처럼
    expect(g.context(210, () => {})).toBe('pass');
  });

  it('뗄 때 오는 contextmenu(Windows): 끌지 않은 클릭은 평소처럼, 끌어 놓은 바로 뒤의 것만 버린다', () => {
    const g = new RightDragGesture();
    g.down(P(0, 0));
    expect(g.up(10)).toEqual({ click: true });
    expect(g.context(12, () => {})).toBe('pass');
    g.down(P(0, 0));
    g.move(P(0, 40));
    expect(g.up(500)).toEqual({ drop: P(0, 0) });
    expect(g.context(505, () => {})).toBe('swallow');
    expect(g.context(510, () => {})).toBe('pass');
    // 오래 지난 뒤에 온 것은 그 놓기의 것이 아니다
    g.down(P(0, 0));
    g.move(P(0, 40));
    g.up(1000);
    expect(g.context(1000 + DROP_CONTEXT_MS + 1, () => {})).toBe('pass');
  });

  it('취소·누르지 않은 뗌', () => {
    const g = new RightDragGesture();
    expect(g.up(0)).toBeNull();
    expect(g.move(P(9, 9))).toBeNull();
    g.down(P(0, 0));
    expect(g.active).toBe(true);
    g.cancel();
    expect(g.active).toBe(false);
    expect(g.context(0, () => {})).toBe('pass');
  });

  it('메뉴 항목은 도움말의 넷(여기로 이동·여기로 복사·블록으로 붙여넣기·취소)', () => {
    const got: string[] = [];
    const items = dropMenuItems((a) => got.push(a));
    expect(items.map((i) => i.label ?? (i.separator ? '-' : ''))).toEqual(['여기로 이동', '여기로 복사', '블록으로 붙여넣기', '-', '취소']);
    for (const i of items) i.run?.();
    expect(got).toEqual(['move', 'copy', 'block']);
  });
});

interface H extends RealApp {
  pk: FakePicker;
  line: (x0: number, y0: number, x1: number, y1: number) => string;
}

function setup(): H {
  const h = makeApp();
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const e: LineEntity = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } };
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  return { ...h, pk, line };
}

const ov = (h: RealApp) => h.view.overlay as unknown as OverlayState;
const events = (h: RealApp) =>
  h.view.events as unknown as {
    rightDown(w: Pt, s: Pt, e: PointerEvent): boolean;
    rightDrag(a: Pt, b: Pt, phase: 'move' | 'drop' | 'cancel', e: PointerEvent): void;
    context(w: Pt, s: Pt, e: MouseEvent, held?: number): void;
  };

/** 끌어 놓고 띄운 메뉴: 항목을 고르면(진짜 메뉴처럼 먼저 닫고) run */
function dropMenu() {
  const call = vi.mocked(dom.showMenu).mock.calls.at(-1)!;
  const [, , items, opt] = call;
  return {
    labels: items.map((i) => i.label ?? '-'),
    pick(label: string) {
      opt?.onClose?.();
      items.find((i) => i.label === label)!.run?.();
    },
  };
}

/** 고른 선을 (30,0)에서 오른쪽 버튼으로 끌어 b에 놓는다 */
function rightDragTo(h: H, b: Pt): void {
  expect(events(h).rightDown(P(30, 0), P(30, 0), ev())).toBe(true);
  events(h).rightDrag(P(30, 0), P(30, 4), 'move', ev());
  events(h).rightDrag(P(30, 0), b, 'drop', ev({ clientX: 200, clientY: 120 }));
}

describe('오른쪽 버튼 끌어 놓기(진짜 App)', () => {
  it('고른 객체 위에서만(그립·빈 곳·명령 중·보기 모드·손가락은 아니다)', async () => {
    const h = setup();
    const a = h.line(0, 0, 100, 0);
    const e = events(h);
    // 고르지 않았으면 아니다
    expect(e.rightDown(P(30, 0), P(30, 0), ev())).toBe(false);
    h.app.setSelection([a]);
    expect(e.rightDown(P(30, 0), P(30, 0), ev())).toBe(true);
    expect(e.rightDown(P(30, 0), P(30, 0), ev({ pointerType: 'touch' }))).toBe(false);
    expect(e.rightDown(P(30, 40), P(30, 40), ev())).toBe(false);
    // 끝점 그립 위는 그립(오른쪽 클릭은 그립 메뉴)
    expect(e.rightDown(P(0, 0), P(0, 0), ev())).toBe(false);
    h.app.register({ name: 'WAITP', title: 'WAITP', run: async (ctx) => void (await ctx.getPoint('점:')) });
    void h.app.run('WAITP');
    await settle();
    expect(e.rightDown(P(30, 0), P(30, 0), ev())).toBe(false);
    h.app.cancel();
    await settle();
  });

  it('끄는 동안 미리보기, 놓으면 메뉴 — 여기로 이동(명령 취소 한 단계)', async () => {
    const h = setup();
    const a = h.line(0, 0, 100, 0);
    h.app.setSelection([a]);
    expect(events(h).rightDown(P(30, 0), P(30, 0), ev())).toBe(true);
    events(h).rightDrag(P(30, 0), P(30, 10), 'move', ev());
    expect(ov(h).ghost[0]!.segs).toEqual([0, 10, 100, 10]);
    expect(ov(h).rubber).toHaveLength(1);
    events(h).rightDrag(P(30, 0), P(30, 10), 'drop', ev({ clientX: 200, clientY: 120 }));
    const m = dropMenu();
    expect(m.labels).toEqual(['여기로 이동', '여기로 복사', '블록으로 붙여넣기', '-', '취소']);
    expect(vi.mocked(dom.showMenu).mock.calls.at(-1)!.slice(0, 2)).toEqual([200, 120]);
    // 메뉴가 열린 동안 미리보기는 놓은 자리에
    expect(ov(h).ghost[0]!.segs).toEqual([0, 10, 100, 10]);
    m.pick('여기로 이동');
    expect(ov(h).ghost).toEqual([]);
    await vi.waitFor(() => expect((h.doc.entityIndex.get(a) as LineEntity).start).toMatchObject({ x: 0, y: 10 }), { timeout: 30_000 });
    expect(h.st.session.undoTop()?.label).toBe('MOVE');
    h.st.session.undo();
    expect((h.doc.entityIndex.get(a) as LineEntity).start).toMatchObject({ x: 0, y: 0 });
  });

  it('여기로 복사는 원본을 두고 사본, 블록으로 붙여넣기는 누른 자리를 기준점으로 한 새 블록을 놓은 자리에(각각 한 단계)', async () => {
    const h = setup();
    const a = h.line(0, 0, 100, 0);
    const ms = () => h.doc.blocks.get(MODEL_SPACE)!.entities;
    const n = ms().length;
    h.app.setSelection([a]);
    rightDragTo(h, P(30, 20));
    dropMenu().pick('여기로 복사');
    await vi.waitFor(() => expect(ms().length).toBe(n + 1), { timeout: 30_000 });
    const copy = ms().at(-1) as LineEntity;
    expect([copy.start, copy.end]).toMatchObject([{ x: 0, y: 20 }, { x: 100, y: 20 }]);
    expect((h.doc.entityIndex.get(a) as LineEntity).start).toMatchObject({ x: 0, y: 0 });
    h.st.session.undo();
    expect(ms().length).toBe(n);
    // 블록으로 붙여넣기
    h.app.setSelection([a]);
    const blocks = h.doc.blocks.size;
    rightDragTo(h, P(80, 50));
    dropMenu().pick('블록으로 붙여넣기');
    await vi.waitFor(() => expect(ms().length).toBe(n + 1), { timeout: 30_000 });
    const ins = ms().at(-1) as InsertEntity;
    expect(ins.type).toBe('INSERT');
    expect(ins.block).toMatch(/^A\$C[0-9A-F]{8}$/);
    expect(ins.insert).toMatchObject({ x: 80, y: 50 });
    const def = h.doc.blocks.get(ins.block.toUpperCase()) ?? [...h.doc.blocks.values()].find((b) => b.name === ins.block)!;
    expect(def.basePoint).toMatchObject({ x: 30, y: 0 });
    expect(def.entities).toHaveLength(1);
    expect(def.entities[0]!.handle).not.toBe(a);
    // 원본은 그대로, 새 블록 참조를 고른다
    expect(h.doc.entityIndex.has(a)).toBe(true);
    expect([...h.st.selection]).toEqual([ins.handle]);
    expect(h.out().at(-1)).toBe(`블록 "${ins.block}"(객체 1개)으로 붙여 넣었습니다.`);
    h.st.session.undo();
    expect(ms().length).toBe(n);
    expect(h.doc.blocks.size).toBe(blocks);
  });

  it('취소·Esc는 아무것도 바꾸지 않고 선택은 그대로, 끌지 않은 오른쪽 클릭은 이전처럼 편집 메뉴', async () => {
    const h = setup();
    const a = h.line(0, 0, 100, 0);
    const before = h.st.session.depth;
    h.app.setSelection([a]);
    rightDragTo(h, P(30, 20));
    dropMenu().pick('취소');
    expect(ov(h).ghost).toEqual([]);
    // Esc: 메뉴가 열린 채로
    rightDragTo(h, P(30, 20));
    h.app.cancel();
    expect(ov(h).ghost).toEqual([]);
    expect([...h.st.selection]).toEqual([a]);
    // Esc: 끄는 동안 — 놓아도 메뉴가 없다
    expect(events(h).rightDown(P(30, 0), P(30, 0), ev())).toBe(true);
    events(h).rightDrag(P(30, 0), P(30, 9), 'move', ev());
    h.app.cancel();
    expect(ov(h).ghost).toEqual([]);
    vi.mocked(dom.showMenu).mockClear();
    events(h).rightDrag(P(30, 0), P(30, 9), 'drop', ev());
    expect(dom.showMenu).not.toHaveBeenCalled();
    // 포인터 취소
    expect(events(h).rightDown(P(30, 0), P(30, 0), ev())).toBe(true);
    events(h).rightDrag(P(30, 0), P(30, 9), 'move', ev());
    events(h).rightDrag(P(30, 9), P(30, 9), 'cancel', ev());
    expect(ov(h).ghost).toEqual([]);
    await settle();
    expect(h.st.session.depth).toBe(before);
    expect((h.doc.entityIndex.get(a) as LineEntity).start).toMatchObject({ x: 0, y: 0 });
    // 끌지 않은 오른쪽 클릭: 편집 모드 메뉴, 그 뒤의 Esc는 선택 해제(이전과 같다)
    expect(events(h).rightDown(P(30, 0), P(30, 0), ev())).toBe(true);
    events(h).context(P(30, 0), P(30, 0), ev() as unknown as MouseEvent);
    const labels = vi.mocked(dom.showMenu).mock.calls.at(-1)![2].map((i) => i.label);
    expect(labels).toContain('모두 선택 해제');
    expect(labels).not.toContain('여기로 이동');
    h.app.cancel();
    expect([...h.st.selection]).toEqual([]);
  });
});
