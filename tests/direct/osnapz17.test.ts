/**
 * 17차: 객체 스냅 점의 Z(AutoCAD OSNAPZ).
 * - entityZAt: 평면도에서 구한 점(교차점·근처점·수직·접점)이 놓인 객체 위의 Z — 선·구성선·3D 폴리선·3D 면은 선분을 따라,
 *   원·호·경량 폴리선처럼 평면에 놓인 객체는 그 평면(기운 평면·뒤집힌 OCS 포함)
 * - findSnaps: 교차점은 두 객체가 3D에서도 만날 때만 Z, 근처점·수직·접점·테두리의 중심·기하학적 중심은 그 객체의 Z
 * - 진짜 App: LINE·CIRCLE 중심이 스냅 점의 Z를 쓰고(OSNAPZ 0), OSNAPZ 1(세션 변수·OPTIONS)이면 지금 고도. 3DPOLY도 OSNAPZ 1이면 고도
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity, LineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { packPoly, polyVertices } from '../../src/core/polyverts';
import type { Picker } from '../../src/app/pick';
import { findSnaps } from '../../src/app/snap';
import { entityZAt, intersectionZ } from '../../src/app/snapz';
import { registerDrawCommands } from '../../src/app/draw';
import { getSysVar } from '../../src/app/lisp-host';
import { setSysvarText, sysvarInfo } from '../../src/app/sysvars';
import { circle, lw, newDoc } from '../edit/make';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { type DirectCommandLine, FakePicker } from './fakes';
import { pack3 } from '../../src/core/flat3';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
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
const r9 = (n: number) => Math.round(n * 1e9) / 1e9;

const line3 = (a: Vec3, b: Vec3) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b }) as LineEntity;
const poly3d = (pts: Vec3[], closed = false) =>
  ({
    ...entityDefaults(),
    type: 'POLYLINE',
    handle: '',
    kind: '3d',
    flags: 8 | (closed ? 1 : 0),
    ...packPoly(pts.map((location) => ({ location, bulge: 0, startWidth: 0, endWidth: 0, flags: 32 }))),
    elevation: 0,
    defaultStartWidth: 0,
    defaultEndWidth: 0,
    mCount: 0,
    nCount: 0,
    mDensity: 0,
    nDensity: 0,
    smoothType: 0,
  }) as Entity;
const face3d = (a: Vec3, b: Vec3, c: Vec3, d = c) => ({ ...entityDefaults(), type: '3DFACE', handle: '', points: [a, b, c, d], invisibleEdges: 0 }) as Entity;

describe('객체 위 점의 Z(entityZAt)', () => {
  it('선·구성선·3D 폴리선·3D 면은 평면도에서 같은 자리인 선분 위의 Z(선분을 따라 고르게)', () => {
    const l = line3(V(0, 0, 2), V(10, 0, 6));
    expect(entityZAt(l, P(5, 0))).toBe(4);
    // 끝 밖은 끝점의 Z
    expect(entityZAt(l, P(12, 0))).toBe(6);
    // 평면도에서 점으로 보이는 세로 선은 Z를 정할 수 없다(지금 고도로)
    expect(entityZAt(line3(V(1, 1, 0), V(1, 1, 5)), P(1, 1))).toBeUndefined();
    expect(entityZAt(line3(V(1, 1, 3), V(1, 1, 3)), P(1, 1))).toBe(3);
    const xl = { ...entityDefaults(), type: 'XLINE', handle: '', base: V(0, 0, 1), direction: V(0.6, 0, 0.8) } as Entity;
    expect(r9(entityZAt(xl, P(3, 0))!)).toBe(5);
    expect(r9(entityZAt(xl, P(-3, 0))!)).toBe(-3);
    const p3 = poly3d([V(0, 0, 0), V(10, 0, 10), V(10, 10, 0)]);
    expect(entityZAt(p3, P(5, 0))).toBe(5);
    expect(entityZAt(p3, P(10, 5))).toBe(5);
    // 3D 면(세 점): 대각선 모서리 위
    expect(entityZAt(face3d(V(0, 0, 0), V(10, 0, 0), V(10, 10, 10)), P(5, 5))).toBe(5);
  });

  it('평면 객체는 그 평면의 Z: 경량 폴리선 고도, 뒤집힌 OCS(0,0,-1), 기운 원', () => {
    const p = lw([
      [0, 0],
      [10, 0],
    ]) as Entity & { elevation: number };
    p.elevation = 7;
    expect(entityZAt(p, P(3, 0))).toBe(7);
    const flipped = lw(
      [
        [0, 0],
        [10, 0],
      ],
      false,
      V(0, 0, -1),
    ) as Entity & { elevation: number };
    flipped.elevation = 7;
    // 법선이 −Z면 OCS의 고도 7은 WCS Z −7
    expect(entityZAt(flipped, P(-3, 0))).toBe(-7);
    const c = circle(0, 0, 5) as CircleEntity;
    c.center = V(0, 0, 3);
    expect(entityZAt(c, P(5, 0))).toBe(3);
    // X축을 따라 45° 기운 원(법선 (0, −sin45, cos45)): 평면도에서 y만큼 위
    const s = Math.SQRT1_2;
    const tilted = circle(0, 0, 5, V(0, -s, s)) as CircleEntity;
    expect(r9(entityZAt(tilted, P(0, 2))!)).toBe(2);
    // 스플라인: 조정점이 한 높이면 그 높이, 아니면 곡선 위(1차는 조정점을 잇는 꺾은선)
    const sp = (ctrl: Vec3[], degree: number) => ({ ...entityDefaults(), type: 'SPLINE', handle: '', degree, flags: 0, knots: [], controlVerts: pack3(ctrl), fitVerts: [] }) as unknown as Entity;
    expect(entityZAt(sp([V(0, 0, 4), V(5, 5, 4), V(10, 0, 4), V(15, 5, 4)], 3), P(7, 2))).toBe(4);
    expect(r9(entityZAt(sp([V(0, 0, 0), V(10, 0, 10), V(20, 0, 0)], 1), P(15, 0))!)).toBe(5);
    const cubic = entityZAt(sp([V(0, 0, 0), V(10, 0, 10), V(20, 0, 10), V(30, 0, 0)], 3), P(15, 0))!;
    // 대칭인 3차 곡선의 가운데 높이: (0 + 3·10 + 3·10 + 0) / 8 = 7.5
    expect(cubic).toBeCloseTo(7.5, 3);
    // 블록 참조 등 모르는 객체
    expect(entityZAt({ ...entityDefaults(), type: 'POINT', handle: '', position: V(0, 0, 1) } as Entity, P(0, 0))).toBeUndefined();
  });

  it('교차점의 Z: 두 객체가 같은 Z를 지날 때만', () => {
    expect(intersectionZ(5, 5)).toBe(5);
    expect(intersectionZ(5, 5 + 1e-9)).toBeCloseTo(5, 6);
    expect(intersectionZ(5, 6)).toBeUndefined();
    expect(intersectionZ(undefined, 5)).toBeUndefined();
  });
});

describe('스냅 후보의 Z(findSnaps)', () => {
  const setupDoc = () => {
    const doc = newDoc();
    const add = <T extends Entity>(e: T): T => {
      e.handle = String(doc.entityIndex.size + 100);
      doc.blocks.get(MODEL_SPACE)!.entities.push(e);
      doc.entityIndex.set(e.handle, e);
      return e;
    };
    return { doc, add, pk: new FakePicker(doc) as unknown as Picker };
  };

  it('교차점: 같은 고도의 두 선은 그 Z, 평면도에서만 겹치면 Z 없음', () => {
    const a = setupDoc();
    a.add(line3(V(0, 0, 4), V(10, 10, 4)));
    a.add(line3(V(0, 10, 4), V(10, 0, 4)));
    const s = findSnaps(a.doc, a.pk, P(5.1, 5), 1, new Set(['int'] as const))[0]!;
    expect(s).toMatchObject({ kind: 'int', z: 4 });
    expect(s.handle).toBeUndefined();
    // 3D 선이 같은 자리에서 Z 4를 지나면 3D에서도 만난다
    const b = setupDoc();
    b.add(line3(V(0, 0, 4), V(10, 10, 4)));
    b.add(line3(V(0, 10, 0), V(10, 0, 8)));
    expect(findSnaps(b.doc, b.pk, P(5.1, 5), 1, new Set(['int'] as const))[0]).toMatchObject({ kind: 'int', z: 4 });
    const c = setupDoc();
    c.add(line3(V(0, 0, 0), V(10, 10, 0)));
    c.add(line3(V(0, 10, 4), V(10, 0, 4)));
    const flat = findSnaps(c.doc, c.pk, P(5.1, 5), 1, new Set(['int'] as const))[0]!;
    expect(flat.kind).toBe('int');
    expect(flat.z).toBeUndefined();
  });

  it('근처점·수직은 그 객체 위의 Z, 3D 폴리선·3D 면의 모서리도', () => {
    const a = setupDoc();
    a.add(line3(V(0, 0, 0), V(10, 0, 10)));
    const nea = findSnaps(a.doc, a.pk, P(3, 0.2), 1, new Set(['nea'] as const))[0]!;
    expect(nea.kind).toBe('nea');
    expect(r9(nea.z!)).toBe(3);
    const per = findSnaps(a.doc, a.pk, P(3, 0.2), 1, new Set(['per'] as const), P(3, 5))[0]!;
    expect(per).toMatchObject({ kind: 'per', x: 3, y: 0 });
    expect(r9(per.z!)).toBe(3);
    const b = setupDoc();
    b.add(poly3d([V(0, 0, 0), V(10, 0, 10), V(10, 10, 0)]));
    expect(r9(findSnaps(b.doc, b.pk, P(10.2, 5), 1, new Set(['nea'] as const))[0]!.z!)).toBe(5);
    // 정의점(끝점)은 원래대로 그 Z
    expect(findSnaps(b.doc, b.pk, P(10.1, 0.1), 1, new Set(['end'] as const))[0]).toMatchObject({ kind: 'end', z: 10 });
    const c = setupDoc();
    c.add(face3d(V(0, 0, 0), V(10, 0, 0), V(10, 10, 10)));
    // 대각선 모서리((0,0,0)–(10,10,10)) 위 가장 가까운 점: Z는 그 자리의 x와 같다
    const f = findSnaps(c.doc, c.pk, P(5.2, 5), 0.5, new Set(['nea'] as const))[0]!;
    expect(r9(f.z!)).toBe(r9(f.x));
    expect(r9(f.x)).toBe(5.1);
  });

  it('테두리로 잡은 중심·기하학적 중심·기준점에서 그은 접점은 그 객체 평면의 Z', () => {
    const a = setupDoc();
    const c = a.add(circle(0, 0, 10) as CircleEntity);
    c.center = V(0, 0, 4);
    expect(findSnaps(a.doc, a.pk, P(10.3, 0.2), 1, new Set(['cen'] as const))[0]).toMatchObject({ kind: 'cen', x: 0, y: 0, z: 4 });
    const tan = findSnaps(a.doc, a.pk, P(5, 8.6), 1, new Set(['tan'] as const), P(20, 0))[0]!;
    expect(tan.kind).toBe('tan');
    expect(tan.z).toBe(4);
    const b = setupDoc();
    const box = b.add(
      lw(
        [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
        true,
      ) as Entity & { elevation: number },
    );
    box.elevation = 2;
    expect(findSnaps(b.doc, b.pk, P(4.1, 1), 1, new Set(['gcen'] as const))[0]).toMatchObject({ kind: 'gcen', x: 2, y: 1, z: 2 });
  });
});

// ---------------------------------------------------------------------------
// 진짜 App
// ---------------------------------------------------------------------------

const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;

function setup() {
  const h = makeApp();
  registerDrawCommands(h.app);
  // 극좌표·객체 스냅 추적이 빈 곳 클릭을 정렬선으로 끌어가지 않게
  h.app.polarOn = false;
  h.app.otrackOn = false;
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const add = <T extends Entity>(e: T): T => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e;
  };
  const at = async (p: Pt) => {
    h.view.events.move!(p, p, ev());
    h.view.events.click!(p, p, ev());
    await settle();
  };
  const snaps = (...k: string[]) => {
    h.app.snapModes.clear();
    for (const x of k) h.app.snapModes.add(x as never);
  };
  return { ...h, cl: h.cmd as unknown as DirectCommandLine, add, at, snaps };
}

const linesOf = (h: RealApp, known: Set<string>) =>
  [...h.doc.entityIndex.values()]
    .filter((e): e is LineEntity => e.type === 'LINE' && !known.has(e.handle))
    .map((e) => [e.start, e.end].map((p) => [p.x, p.y, p.z].map(r9)));

describe('LINE·CIRCLE·3DPOLY의 스냅 점 Z(진짜 App)', () => {
  it('LINE: 끝점에 잡은 첫 점은 그 Z, 빈 곳은 지금 고도 — 3D 선', async () => {
    const h = setup();
    h.doc.header.set('$ELEVATION', 1);
    const src = h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    h.snaps('end', 'mid');
    void h.app.run('LINE');
    await settle();
    await h.at(P(0.2, 0.1));
    await h.at(P(5, 20));
    // 중간점(Z 4)으로 이어서
    await h.at(P(5.1, 0.1));
    h.cl.type('');
    await settle();
    expect(linesOf(h, new Set([src.handle]))).toEqual([
      [
        [0, 0, 6],
        [5, 20, 1],
      ],
      [
        [5, 20, 1],
        [5, 0, 4],
      ],
    ]);
    // 마지막 점(LASTPOINT)에도 그 Z
    expect(h.app.lastPoint).toEqual({ x: 5, y: 0, z: 4 });
  });

  it('LINE: 교차점(3D에서 만나는 두 선)과 근처점(3D 선 위)의 Z', async () => {
    const h = setup();
    const a = h.add(line3(V(0, 0, 5), V(10, 10, 5)));
    const b = h.add(line3(V(0, 10, 5), V(10, 0, 5)));
    const c = h.add(line3(V(20, 0, 0), V(30, 0, 10)));
    h.snaps('int', 'nea');
    void h.app.run('LINE');
    await settle();
    await h.at(P(5.1, 5));
    await h.at(P(24, 0.2));
    h.cl.type('');
    await settle();
    expect(linesOf(h, new Set([a.handle, b.handle, c.handle]))).toEqual([
      [
        [5, 5, 5],
        [24, 0, 4],
      ],
    ]);
  });

  it('LINE: 지연된 접점으로 시작하면 접점은 그 원의 고도', async () => {
    const h = setup();
    const c = h.add(circle(0, 0, 5) as CircleEntity);
    c.center = V(0, 0, 3);
    h.snaps('tan');
    void h.app.run('LINE');
    await settle();
    await h.at(P(0.3, 5.1));
    await h.at(P(20, -1));
    h.cl.type('');
    await settle();
    const got = linesOf(h, new Set([c.handle]));
    expect(got).toHaveLength(1);
    expect(got[0]![0]![2]).toBe(3);
    expect(got[0]![1]).toEqual([20, -1, 0]);
    // 접점: 원 위
    expect(Math.hypot(got[0]![0]![0]!, got[0]![0]![1]!)).toBeCloseTo(5, 6);
  });

  it('CIRCLE: 중심을 끝점에 잡으면 그 Z가 원의 고도', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    h.snaps('end');
    void h.app.run('CIRCLE');
    await settle();
    await h.at(P(9.9, 0.1));
    h.cl.type('3');
    await settle();
    const ci = [...h.doc.entityIndex.values()].find((e): e is CircleEntity => e.type === 'CIRCLE')!;
    expect(ci.center).toEqual({ x: 10, y: 0, z: 2 });
    expect(ci.radius).toBe(3);
  });

  it('OSNAPZ 1(세션 변수): LINE·CIRCLE·3DPOLY의 스냅 점은 지금 고도, 좌표로 준 Z는 그대로', async () => {
    const h = setup();
    h.doc.header.set('$ELEVATION', 1);
    expect(sysvarInfo(h.app, 'OSNAPZ')).toMatchObject({ source: 'session', kind: 'int', value: 0, readOnly: false });
    expect(setSysvarText(h.app, 'OSNAPZ', '2')).toBe('값이 맞지 않습니다.');
    expect(setSysvarText(h.app, 'OSNAPZ', '1')).toBeNull();
    expect(h.app.osnapZ).toBe(true);
    expect(getSysVar(h.app, 'osnapz')).toBe(1);
    const src = h.add(line3(V(0, 0, 6), V(10, 0, 2)));
    h.snaps('end');
    void h.app.run('LINE');
    await settle();
    await h.at(P(0.2, 0.1));
    // 동적 입력의 둘째 점은 상대 좌표가 기본이라 #로 절대 좌표
    h.cl.type('#5,5,9');
    await settle();
    h.cl.type('');
    await settle();
    expect(linesOf(h, new Set([src.handle]))).toEqual([
      [
        [0, 0, 1],
        [5, 5, 9],
      ],
    ]);
    void h.app.run('CIRCLE');
    await settle();
    await h.at(P(9.9, 0.1));
    h.cl.type('3');
    await settle();
    expect([...h.doc.entityIndex.values()].find((e): e is CircleEntity => e.type === 'CIRCLE')!.center).toEqual({ x: 10, y: 0, z: 1 });
    void h.app.run('3DPOLY');
    await settle();
    await h.at(P(0.2, 0.1));
    await h.at(P(9.9, 0.1));
    h.cl.type('');
    await settle();
    const pl = [...h.doc.entityIndex.values()].find((e) => e.type === 'POLYLINE')!;
    expect(polyVertices(pl as never).map((v) => [v.location.x, v.location.y, v.location.z])).toEqual([
      [0, 0, 1],
      [10, 0, 1],
    ]);
    // 0으로 되돌리면 다시 스냅 점의 Z
    expect(setSysvarText(h.app, 'OSNAPZ', '0')).toBeNull();
    expect(h.app.osnapZ).toBe(false);
  });

  it('2D 명령(스냅의 Z를 받지 않는 요청)의 클릭 결과에는 그대로 z가 없다', async () => {
    const h = setup();
    h.add(line3(V(0, 0, 6), V(100, 0, 2)));
    h.snaps('end', 'nea');
    const got: unknown[] = [];
    h.app.register({
      name: 'PT',
      title: 'PT',
      async run(ctx) {
        got.push(await ctx.getPoint('점:'));
      },
    });
    void h.app.run('PT');
    await settle();
    await h.at(P(40, 0.2));
    expect(got[0]).toMatchObject({ point: { x: 40, y: 0 }, snap: { kind: 'nea' } });
    expect((got[0] as { z?: number }).z).toBeUndefined();
  });
});
