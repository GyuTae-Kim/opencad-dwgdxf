/**
 * 19차: DIST·MEASUREGEOM 거리의 다중 점과 투명 사용. 도움말 DIST(<다중 점> — 누적 합계, 호·지정한 길이의 선, 툴팁의 누적 합계,
 * 'DIST)와 MEASUREGEOM(다중 점 — 호·길이·명령 취소·닫기는 폴리선을 그릴 때와 비슷한 옵션)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { registerDrawCommands } from '../../src/app/draw';
import { pathLength, segmentLength } from '../../src/app/distmulti';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
const line3 = (a: Vec3, b: Vec3, o: Partial<LineEntity> = {}) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b, ...o }) as LineEntity;

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  h.app.osnapOn = true;
  h.app.snapModes.clear();
  h.app.snapModes.add('end');
  const cl = h.cmd as unknown as DirectCommandLine;
  const add = <T extends Entity>(e: T): T => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e;
  };
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const at = async (p: Pt) => {
    h.view.events.move!(p, p, ev());
    h.view.events.click!(p, p, ev());
    await settle();
  };
  return { ...h, cl, add, type, at };
}

describe('다중 점의 길이(distmulti)', () => {
  it('선은 3D(도면 공간은 평면), 호는 평면 호 길이', () => {
    expect(segmentLength({ x: 0, y: 0, z: 0, bulge: 0 }, { x: 3, y: 4, z: 12 })).toBe(13);
    expect(segmentLength({ x: 0, y: 0, z: 0, bulge: 0 }, { x: 3, y: 4, z: 12 }, true)).toBe(5);
    // 볼록 1 = 반원(지름 20)
    expect(segmentLength({ x: 10, y: 0, z: 0, bulge: 1 }, { x: 10, y: 20, z: 9 })).toBeCloseTo(Math.PI * 10, 12);
    expect(pathLength([{ x: 0, y: 0, z: 0, bulge: 0 }, { x: 10, y: 0, z: 0, bulge: 1 }, { x: 10, y: 20, z: 0, bulge: 0 }])).toBeCloseTo(10 + Math.PI * 10, 12);
  });
});

describe('DIST·MEASUREGEOM 다중 점(진짜 App)', () => {
  const totals = (h: ReturnType<typeof setup>) => h.out().filter((t) => /^거리 = [^,]*$/.test(t));

  it('<다중 점>은 Enter(기본값)나 M: 점마다 누적 거리, 3D 선 구간, Enter로 끝', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,0');
    expect(h.cmd.prompt).toBe('두 번째 점 지정 또는 <다중 점>:');
    await h.type('');
    expect(h.cmd.prompt).toBe('다음 점 지정 또는 [호(A)/길이(L)/명령 취소(U)]:');
    await h.type('3,4,12', '3,4,0');
    expect(h.cmd.prompt).toBe('다음 점 지정 또는 [호(A)/닫기(C)/길이(L)/명령 취소(U)]:');
    await h.type('');
    expect(totals(h)).toEqual(['거리 = 13.0000 mm', '거리 = 25.0000 mm']);
    expect(h.app.busyCommand).toBeFalsy();
    // 휴대폰 결과 카드: 누적 거리
    expect(h.cmd.lines.at(-1)!.measure).toEqual({ kind: 'distance', label: '누적 거리', value: '25.0000 mm', details: [] });
    // M도 같다
    void h.app.run('DIST');
    await settle();
    await h.type('0,0', 'M', '6,8', '');
    expect(totals(h).at(-1)).toBe('거리 = 10.0000 mm');
  });

  it('호(A)·선(L)·길이(L)·명령 취소(U)·닫기(C)', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    await h.type('0,0', 'M', '10,0', 'A');
    expect(h.cmd.prompt).toBe('호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [각도(A)/중심(CE)/닫기(CL)/방향(D)/선(L)/반지름(R)/두 번째 점(S)/명령 취소(U)]:');
    // 앞 선(동쪽)에 접하는 호로 (10,20): 반지름 10의 반원
    await h.type('10,20', 'L', 'L', '5');
    // 길이: 앞 구간(호 끝의 진행 방향 — 서쪽)과 같은 각도로 5
    await h.type('U', 'C');
    const t = totals(h).map((s) => s.replace(/ mm$/, '').replace(/^거리 = /, ''));
    const semi = 10 + Math.PI * 10;
    expect(t.map(Number)).toEqual([10, +semi.toFixed(4), +(semi + 5).toFixed(4), +semi.toFixed(4), +(semi + Math.hypot(10, 20)).toFixed(4)]);
    // 닫기는 끝낸다
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('호의 중심(CE)·두 번째 점(S)·닫기(CL)', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    // (10,0)에서 중심 (10,10)으로 (20,10)까지 반시계 1/4 원
    await h.type('0,0', 'M', '10,0', 'A', 'CE', '10,10', '20,10');
    // (20,10)에서 (10,20)을 지나 (0,10)까지 세 점 호: 같은 원의 반원
    await h.type('S', '10,20', '0,10');
    const quarter = (Math.PI * 10) / 2;
    expect(totals(h).at(-1)).toBe(`거리 = ${(10 + quarter * 3).toFixed(4)} mm`);
    // 명령 취소(U)는 마지막 호를 뺀다(호 모드 그대로)
    await h.type('U');
    expect(totals(h).at(-1)).toBe(`거리 = ${(10 + quarter).toFixed(4)} mm`);
    // 닫기(CL): (20,10)에서 북쪽으로 접하는 호로 시작점 (0,0)까지 — 중심 (7.5,10), 반지름 12.5, 사이각 2π + atan2(−10, −7.5)
    await h.type('CL');
    const close = 12.5 * (2 * Math.PI + Math.atan2(-10, -7.5));
    expect(totals(h).at(-1)).toBe(`거리 = ${(10 + quarter + close).toFixed(4)} mm`);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('툴팁은 이미 지정한 구간과 지금 고무줄 선의 누적 거리', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    await h.type('0,0', 'M', '10,0');
    h.view.events.move!(P(13, 4.1), P(13, 4.1), ev());
    expect(h.view.overlay.tip).toBe(`거리 = ${(10 + Math.hypot(3, 4.1)).toFixed(4)} mm`);
    await h.type('');
  });

  it('객체 스냅으로 잡은 점은 그 점의 Z(두 점 DIST와 같다)', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    void h.app.run('DIST');
    await settle();
    await h.at(P(0.2, 0.1));
    await h.type('M');
    await h.at(P(9.8, 0.1));
    await h.type('');
    expect(totals(h)).toEqual([`거리 = ${Math.hypot(10, 4).toFixed(4)} mm`]);
  });

  it('명령 취소(U)를 첫 점에서 하면 아무것도 빼지 않고, 도면 공간은 평면 거리', async () => {
    const h = setup();
    h.st.space = PAPER_SPACE;
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,0', 'M', 'U', '3,4,12', '');
    expect(totals(h)).toEqual(['거리 = 5.0000 mm']);
  });

  it('MEASUREGEOM 거리: [다중 점(M)], 끝나면 다시 첫 점 프롬프트', async () => {
    const h = setup();
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.type('0,0');
    expect(h.cmd.prompt).toBe('두 번째 점 지정 또는 [다중 점(M)]:');
    await h.type('M', '3,4', '3,10', '');
    expect(totals(h)).toEqual(['거리 = 5.0000 mm', '거리 = 11.0000 mm']);
    expect(h.cmd.prompt).toMatch(/^첫 번째 점 지정 또는 \[거리\(D\)/);
    await h.type('X');
    expect(h.app.busyCommand).toBeFalsy();
  });
});

describe("투명 사용('DIST)", () => {
  it("LINE의 점 프롬프트에서 'DIST로 재고 LINE으로 돌아간다", async () => {
    const h = setup();
    registerDrawCommands(h.app);
    void h.app.run('LINE');
    await settle();
    await h.type('0,0', "'DIST");
    expect(h.cmd.prompt).toBe('첫 번째 점 지정:');
    await h.type('0,0', '3,4');
    expect(h.out()).toContainEqual(expect.stringMatching(/^거리 = 5\.0000 mm, {2}XY 평면에서의 각도 = 53°/));
    expect(h.app.busyCommand).toBe('LINE');
    await h.type('10,0', '');
    const lines = [...h.doc.blocks.get(MODEL_SPACE)!.entities].filter((e) => e.type === 'LINE') as LineEntity[];
    expect(lines.map((l) => [l.start.x, l.start.y, l.end.x, l.end.y])).toEqual([[0, 0, 10, 0]]);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('작은따옴표 없이 시작하면(리본·휴대폰 단추) 이전처럼 앞 명령을 끝낸다', async () => {
    const h = setup();
    registerDrawCommands(h.app);
    void h.app.run('LINE');
    await settle();
    await h.type('0,0');
    void h.app.run('DIST');
    await settle();
    expect(h.app.busyCommand).toBe('DIST');
    await h.type('0,0', '3,4');
    expect(h.app.busyCommand).toBeFalsy();
  });
});
