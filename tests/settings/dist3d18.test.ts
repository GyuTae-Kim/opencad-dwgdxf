/**
 * 18차: 조회 명령과 상태 막대의 Z.
 * - distance3d: 3D 거리와 XY 평면으로부터의 각도(XY 평면 각도와 같은 0~360 꼴 — 아래로 기울면 270~360)
 * - 진짜 App DIST·MEASUREGEOM 거리: 도움말 DIST(모형 공간은 3D 거리, X·Y·Z 증분과 각도는 현재 UCS 기준, Z를 생략한 점은 지금 고도,
 *   배치의 도면 공간은 2D 거리)와 객체 스냅 점의 Z(OSNAPZ 0, 1이면 고도)
 * - ID: 도움말 ID(UCS 좌표 X·Y·Z, 3D 객체에 스냅하면 그 지점의 Z, 마지막 점으로 둔다)
 * - 상태 막대 좌표: 도움말 COORDS·상태 막대(커서 위치의 절대 좌표 — Z도 절대 값). 스냅 점이면 그 Z, 아니면 지금 고도
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { distance3d } from '../../src/app/measure-result';
import { registerCommands } from '../../src/app/commands';
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

const D = Math.PI / 180;
type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

describe('3D 거리와 XY 평면으로부터의 각도(distance3d)', () => {
  it('평면 위 두 점은 2D 거리·각도 0', () => {
    expect(distance3d(3, 4, 0)).toEqual({ d: 5, rise: 0 });
    expect(distance3d(0, 0, 0)).toEqual({ d: 0, rise: 0 });
  });

  it('위로 기울면 0~90°, 아래로 기울면 270~360°(XY 평면 각도와 같은 0~360 꼴)', () => {
    const up = distance3d(3, 4, 12);
    expect(up.d).toBeCloseTo(13, 12);
    expect(up.rise).toBeCloseTo(Math.atan2(12, 5), 12);
    expect(distance3d(1, 0, -1).rise).toBeCloseTo(315 * D, 12);
    expect(distance3d(-3, -4, -5).rise).toBeCloseTo(315 * D, 12);
    // Z축과 나란한 선
    expect(distance3d(0, 0, 5)).toEqual({ d: 5, rise: 90 * D });
    expect(distance3d(0, 0, -5).rise).toBeCloseTo(270 * D, 12);
  });
});

// ---------------------------------------------------------------------------
// 진짜 App
// ---------------------------------------------------------------------------

const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
const line3 = (a: Vec3, b: Vec3) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b }) as LineEntity;

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  // 극좌표·객체 스냅 추적·동적 입력이 빈 곳 클릭과 좌표 입력을 바꾸지 않게
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
  /** DIST·MEASUREGEOM의 결과 두 줄 */
  const result = () => h.out().filter((t) => /^(거리|X 증분) =/.test(t));
  return { ...h, cl, add, type, at, result };
}

describe('DIST·MEASUREGEOM 거리의 3D(진짜 App)', () => {
  it('좌표에 준 Z로 3D 거리·XY 평면으로부터의 각도·Z 증분', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,0', '3,4,12');
    expect(h.result()).toEqual(['거리 = 13.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 67°', 'X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 12.0000']);
    // 휴대폰 결과 카드도 3D 거리와 ΔZ
    const card = h.cmd.lines.at(-1)!.measure!;
    expect(card.value).toBe('13.0000 mm');
    expect(card.details).toContainEqual({ k: 'ΔZ', v: '12.0000' });
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('아래로 기운 두 점: 각도는 0~360 꼴(-45° → 315°), Z 증분은 음수', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,10', '10,0,0');
    expect(h.result()).toEqual(['거리 = 14.1421 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 315°', 'X 증분 = 10.0000,  Y 증분 = 0.0000,  Z 증분 = -10.0000']);
  });

  it('Z를 생략한 점은 지금 고도(ELEVATION), @ 상대 좌표는 첫 점의 Z를 잇는다', async () => {
    const h = setup();
    h.doc.header.set('$ELEVATION', 5);
    void h.app.run('DIST');
    await settle();
    await h.type('0,0', '3,4,17');
    void h.app.run('DIST');
    await settle();
    await h.type('0,0', '3,4');
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,10', '@3,4');
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,10', '@3,4,12');
    const r = h.result();
    expect(r[1]).toBe('X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 12.0000');
    expect(r[0]).toMatch(/^거리 = 13\.0000 mm,/);
    expect(r[2]).toBe('거리 = 5.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 0°');
    expect(r[3]).toBe('X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 0.0000');
    expect(r[5]).toBe('X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 0.0000');
    expect(r[7]).toBe('X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 12.0000');
  });

  it('객체 스냅으로 잡은 점은 그 점의 Z, 빈 곳은 고도. OSNAPZ 1이면 스냅 점도 고도', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    void h.app.run('DIST');
    await settle();
    await h.at(P(0.2, 0.1));
    await h.at(P(5, 20));
    expect(h.result()[1]).toBe('X 증분 = 5.0000,  Y 증분 = 20.0000,  Z 증분 = -6.0000');
    expect(h.result()[0]).toMatch(/^거리 = 21\.4709 mm,/);
    h.app.osnapZ = true;
    void h.app.run('DIST');
    await settle();
    await h.at(P(0.2, 0.1));
    await h.at(P(9.8, 0.1));
    expect(h.result()[3]).toBe('X 증분 = 10.0000,  Y 증분 = 0.0000,  Z 증분 = 0.0000');
  });

  it('MEASUREGEOM 거리: 스냅 점의 Z와 좌표의 Z', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.at(P(9.8, 0.1));
    await h.type('13,4,14', 'X');
    expect(h.result()).toEqual(['거리 = 13.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 67°', 'X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 12.0000']);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('배치의 도면 공간에서는 2D 거리(Z를 보지 않는다)', async () => {
    const h = setup();
    h.st.space = PAPER_SPACE;
    void h.app.run('DIST');
    await settle();
    await h.type('0,0,0', '3,4,12');
    expect(h.result()).toEqual(['거리 = 5.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 0.0000']);
  });
});

describe('ID의 UCS 좌표와 Z(진짜 App)', () => {
  const idLine = (h: ReturnType<typeof setup>) => h.out().filter((t) => /^X = /.test(t));

  it('좌표에 준 Z, 스냅 점의 Z(마지막 점에도), 빈 곳은 지금 고도', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    h.doc.header.set('$ELEVATION', 4);
    void h.app.run('ID');
    await settle();
    await h.type('1,2,3');
    void h.app.run('ID');
    await settle();
    await h.at(P(0.2, 0.1));
    expect(h.app.lastPoint).toEqual({ x: 0, y: 0, z: 6 });
    void h.app.run('ID');
    await settle();
    await h.at(P(5, 20));
    expect(idLine(h)).toEqual([
      'X = 1.0000     Y = 2.0000     Z = 3.0000',
      'X = 0.0000     Y = 0.0000     Z = 6.0000',
      'X = 5.0000     Y = 20.0000     Z = 4.0000',
    ]);
    // 휴대폰 결과 카드: Z가 0이 아니면 보조 줄
    expect(h.cmd.lines.at(-1)!.measure!.details).toEqual([{ k: 'Z', v: '4.0000' }]);
  });

  it('지금 UCS의 좌표(UCS를 90° 돌리면 WCS (10,0)은 (0,−10))', async () => {
    const h = setup();
    h.doc.header.set('$UCSORG', { x: 0, y: 0, z: 0 });
    h.doc.header.set('$UCSXDIR', { x: 0, y: 1, z: 0 });
    h.doc.header.set('$UCSYDIR', { x: -1, y: 0, z: 0 });
    void h.app.run('ID');
    await settle();
    await h.type('*10,0,2');
    expect(idLine(h)).toEqual(['X = 0.0000     Y = -10.0000     Z = 2.0000']);
  });
});

describe('상태 막대 좌표의 Z(진짜 App)', () => {
  const capture = (h: ReturnType<typeof setup>) => {
    const coords: string[] = [];
    h.app.ui.setCoords = (t: string) => void coords.push(t);
    const move = (p: Pt) => {
      h.view.events.move!(p, p, ev());
      return coords.at(-1);
    };
    return move;
  };

  it('명령이 없으면 지금 고도', () => {
    const h = setup();
    h.doc.header.set('$ELEVATION', 2.5);
    const move = capture(h);
    expect(move(P(3, 4))).toBe('3.0000, 4.0000, 2.5000');
  });

  it('점 요청 중 객체 스냅 점이면 그 점의 Z, 빈 곳은 고도, OSNAPZ 1이면 고도', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    const move = capture(h);
    void h.app.run('DIST');
    await settle();
    expect(move(P(0.2, 0.1))).toBe('0.0000, 0.0000, 6.0000');
    expect(move(P(9.9, -0.1))).toBe('10.0000, 0.0000, 2.0000');
    expect(move(P(5, 20))).toBe('5.0000, 20.0000, 0.0000');
    h.app.osnapZ = true;
    expect(move(P(0.2, 0.1))).toBe('0.0000, 0.0000, 0.0000');
    h.cl.escape();
    await settle();
  });

  it('돌린 UCS에서도 X·Y는 UCS, Z는 그대로', async () => {
    const h = setup();
    h.add(line3(V(10, 0, 7), V(10, 10, 7)));
    h.doc.header.set('$UCSXDIR', { x: 0, y: 1, z: 0 });
    h.doc.header.set('$UCSYDIR', { x: -1, y: 0, z: 0 });
    const move = capture(h);
    void h.app.run('DIST');
    await settle();
    expect(move(P(10.1, 0.2))).toBe('0.0000, -10.0000, 7.0000');
    h.cl.escape();
    await settle();
  });
});
