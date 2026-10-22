/**
 * MASSPROP(2D 영역 질량 특성)과 REGION 면적: 구멍 있는 영역의 면적·도심·관성 모멘트·주 모멘트.
 * REGION은 ACIS 모서리의 정확한 곡선(원호·넙스)으로 적분하고, 같은 면의 안쪽 고리만 구멍(서로 다른 영역은 더한다).
 * REGION·UNION·SUBTRACT·INTERSECT는 ACIS 형상을 만들어야 해서 대신 쓸 명령을 알린다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { massProps, massPropsOfGroups, regionGroups, wiresToRings } from '../../src/edit/geom/massprop';
import { entityRings, massGroups, objectArea, registerCommands } from '../../src/app/commands';
import { satShape, setAcisShape } from '../../src/io/acis';
import { circlesFaceSat, halfDiscSat, nurbsCircleSat } from './acis-sat';
import { circle, line, lw } from './make';
import { makeHarness } from '../cmds2/harness';
import type { App } from '../../src/app/app';

const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
const v = (x: number, y: number) => ({ x, y, z: 0 });
const region = (wires: [number, number][][]): Entity => ({ ...entityDefaults(), handle: '', type: 'REGION', wires: wires.map((w) => w.map(([x, y]) => v(x, y))) }) as Entity;

describe('massProps', () => {
  it('구멍 뚫린 직사각형(고리 방향과 관계없이 구멍은 뺀다)', () => {
    // 바깥 0..10 × 0..6, 구멍 2..4 × 2..4(같은 방향으로 줘도 구멍)
    const mp = massProps([rect(0, 0, 10, 6), rect(2, 2, 4, 4)])!;
    expect(mp.area).toBeCloseTo(56, 9);
    expect(mp.perimeter).toBeCloseTo(32 + 8, 9);
    expect(mp.box).toEqual([0, 0, 10, 6]);
    expect(mp.centroid[0]).toBeCloseTo(288 / 56, 9);
    expect(mp.centroid[1]).toBeCloseTo(3, 9);
    // 원점 기준: ∫y² = 720 − 112/3, ∫x² = 2000 − 112/3, ∫xy = 900 − 36
    expect(mp.ix).toBeCloseTo(720 - 112 / 3, 9);
    expect(mp.iy).toBeCloseTo(2000 - 112 / 3, 9);
    expect(mp.ixy).toBeCloseTo(864, 9);
    expect(mp.rx).toBeCloseTo(Math.sqrt((720 - 112 / 3) / 56), 9);
    // 도심 기준 주 모멘트: y = 3에 대칭이라 축은 X·Y
    const icx = 720 - 112 / 3 - 56 * 9;
    const icy = 2000 - 112 / 3 - (288 * 288) / 56;
    expect(mp.principal[0]!.i).toBeCloseTo(icx, 6);
    expect(mp.principal[0]!.dir).toEqual([1, 0]);
    expect(mp.principal[1]!.i).toBeCloseTo(icy, 6);
    expect(mp.principal[1]!.dir).toEqual([0, 1]);
  });
  it('돌린 직사각형의 주축은 변 방향', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const r = rect(-4, -1, 4, 1);
    const rot: number[] = [];
    for (let i = 0; i < r.length; i += 2) rot.push(r[i]! * c - r[i + 1]! * s, r[i]! * s + r[i + 1]! * c);
    const mp = massProps([rot])!;
    // 8 × 2: 약한 축 I = 8·2³/12, 강한 축 J = 2·8³/12
    expect(mp.principal[0]!.i).toBeCloseTo((8 * 8) / 12, 9);
    expect(mp.principal[1]!.i).toBeCloseTo((2 * 512) / 12, 9);
    const d = mp.principal[0]!.dir;
    expect(Math.abs(d[0] * c + d[1] * s)).toBeCloseTo(1, 9);
  });
  it('영역 모서리 선(순서·방향이 뒤섞임)을 고리로 잇는다', () => {
    const rings = wiresToRings(
      [
        [v(10, 0), v(10, 6)],
        [v(0, 0), v(10, 0)],
        [v(0, 6), v(0, 0)],
        [v(0, 6), v(10, 6)],
      ].map((w) => w),
    );
    expect(rings.length).toBe(1);
    expect(massProps(rings)!.area).toBeCloseTo(60, 9);
  });
  it('닫히지 않은 모서리는 고리가 아니다', () => {
    expect(wiresToRings([[v(0, 0), v(1, 0)], [v(1, 0), v(1, 1)]])).toEqual([]);
    expect(massProps([])).toBeNull();
  });
});

describe('객체의 고리와 면적', () => {
  it('원은 잘게 나눠 고리(면적 오차 아주 작음), 선은 아니다', () => {
    const r = entityRings(circle(0, 0, 5))!;
    const mp = massProps(r)!;
    expect(Math.abs(mp.area)).toBeCloseTo(Math.PI * 25, 4);
    expect(Math.abs(mp.ix)).toBeCloseTo((Math.PI * 625) / 4, 3);
    expect(entityRings(line(0, 0, 1, 1))).toBeNull();
  });
  it('REGION 면적·둘레(구멍 포함)', () => {
    const reg = region([
      [[0, 0], [10, 0], [10, 6], [0, 6], [0, 0]],
      [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]],
    ]);
    const a = objectArea(reg)!;
    expect(a.a).toBeCloseTo(56, 9);
    expect(a.per).toBeCloseTo(40, 9);
  });
});

describe('MASSPROP 명령', () => {
  function setup() {
    const h = makeHarness();
    (h.app as unknown as { entity(hd: string): Entity | undefined }).entity = (hd: string) => h.doc.entityIndex.get(hd);
    registerCommands(h.app as App);
    return h;
  }
  it('닫힌 폴리선 둘(안쪽은 구멍)과 선 하나: 선은 빼고 알린다', async () => {
    const h = setup();
    const o = h.add({ ...lw([[0, 0], [10, 0], [10, 6], [0, 6]], true), handle: '' } as Entity);
    const i = h.add({ ...lw([[2, 2], [4, 2], [4, 4], [2, 4]], true), handle: '' } as Entity);
    const l = h.add({ ...line(0, 0, 5, 5), handle: '' } as Entity);
    await h.run('MASSPROP', [{ sel: [o.handle, i.handle, l.handle] }, 'N']);
    expect(h.printed.some((t) => t.includes('1개는 뺐습니다'))).toBe(true);
    expect(h.printed).toContainEqual(expect.stringMatching(/^면적:\s+56(\.0+)?$/));
    expect(h.printed).toContainEqual(expect.stringMatching(/^도심:\s+X: 5\.14/));
    expect(h.prompts.at(-1)).toMatch(/^분석 결과를 파일에 쓰시겠습니까\?/);
  });
  it('REGION을 잰다', async () => {
    const h = setup();
    const r = h.add(region([[[0, 0], [4, 0]], [[4, 0], [4, 3]], [[4, 3], [0, 3]], [[0, 3], [0, 0]]]));
    await h.run('MASSPROP', [{ sel: [r.handle] }, '']);
    expect(h.printed).toContainEqual(expect.stringMatching(/^면적:\s+12(\.0+)?$/));
    expect(h.printed).toContainEqual(expect.stringMatching(/^둘레:\s+14(\.0+)?$/));
  });
  it('잴 것이 없으면 알린다', async () => {
    const h = setup();
    const l = h.add({ ...line(0, 0, 5, 5), handle: '' } as Entity);
    await h.run('MASSPROP', [{ sel: [l.handle] }]);
    expect(h.printed.at(-1)).toMatch(/^잴 영역이 없습니다/);
  });
  it('REGION·UNION·SUBTRACT·INTERSECT는 대신 쓸 명령을 알린다', async () => {
    const h = setup();
    for (const n of ['REGION', 'UNION', 'SUBTRACT', 'INTERSECT']) {
      await h.run(n, []);
      expect(h.printed.at(-1)).toContain('MASSPROP');
      expect(h.printed.at(-1)).toContain('BOUNDARY');
    }
  });
});

describe('REGION: ACIS 모서리의 정확한 곡선', () => {
  const reg = (sat: string): Entity => {
    const e = { ...entityDefaults(), handle: '', type: 'REGION' } as Entity;
    setAcisShape(e as never, satShape(sat));
    return e;
  };
  it('원 영역(r = 10): 화면용 다각형이 아니라 정확한 값(AutoCAD MASSPROP과 같은 소수 넷째 자리)', () => {
    const e = reg(circlesFaceSat([[0, 0, 10]]));
    const mp = massPropsOfGroups(regionGroups(e as never))!;
    expect(mp.area).toBeCloseTo(Math.PI * 100, 9);
    expect(mp.perimeter).toBeCloseTo(Math.PI * 20, 9);
    expect(mp.ix).toBeCloseTo((Math.PI * 1e4) / 4, 7);
    expect(mp.iy).toBeCloseTo((Math.PI * 1e4) / 4, 7);
    expect(mp.box.map((x) => +x.toFixed(9))).toEqual([-10, -10, 10, 10]);
    // 원은 주 모멘트가 같다: 방향은 X·Y(같은 방향 둘이 아니다)
    expect(mp.principal.map((p) => p.dir)).toEqual([
      [1, 0],
      [0, 1],
    ]);
    // 예전(모서리 선 다각형) 값과 다르다
    expect(Math.abs(massProps(wiresToRings((e as { wires: { x: number; y: number }[][] }).wires))!.area)).toBeLessThan(313.94);
    expect(objectArea(e)!.a).toBeCloseTo(314.1592654, 6);
  });
  it('반원(선 + 원호 반쪽): 면적·도심·둘레', () => {
    const mp = massPropsOfGroups(regionGroups(reg(halfDiscSat(5)) as never))!;
    expect(mp.area).toBeCloseTo((Math.PI * 25) / 2, 9);
    expect(mp.perimeter).toBeCloseTo(Math.PI * 5 + 10, 9);
    expect(mp.centroid[0]).toBeCloseTo(-20 / (3 * Math.PI), 9);
    expect(mp.box.map((x) => +x.toFixed(9))).toEqual([-5, -5, 0, 5]);
  });
  it('넙스(유리 2차) 원 영역', () => {
    const mp = massPropsOfGroups(regionGroups(reg(nurbsCircleSat(10)) as never))!;
    expect(mp.area).toBeCloseTo(Math.PI * 100, 7);
    expect(mp.perimeter).toBeCloseTo(Math.PI * 20, 7);
    expect(mp.box.map((x) => +x.toFixed(6))).toEqual([-10, -10, 10, 10]);
  });
  it('같은 면의 안쪽 고리는 구멍, 서로 다른 REGION은 더한다(AutoCAD와 같다)', () => {
    const holed = reg(circlesFaceSat([[0, 0, 10], [0, 0, 2]]));
    expect((holed as { acisLoops?: number[][][] }).acisLoops).toEqual([[[0], [1]]]);
    expect(massPropsOfGroups(regionGroups(holed as never))!.area).toBeCloseTo(Math.PI * 96, 9);
    const two = massGroups([reg(circlesFaceSat([[0, 0, 10]])), reg(circlesFaceSat([[0, 0, 2]]))]);
    expect(massPropsOfGroups(two.groups)!.area).toBeCloseTo(Math.PI * 104, 9);
    // 닫힌 객체끼리는 예전처럼 하나의 영역(안쪽은 구멍)
    const curves = massGroups([circle(0, 0, 10), circle(0, 0, 2)]);
    expect(massPropsOfGroups(curves.groups)!.area).toBeCloseTo(Math.PI * 96, 3);
  });
  it('MASSPROP 명령: 원 영역 면적 314.1593', async () => {
    const h = makeHarness();
    (h.app as unknown as { entity(hd: string): Entity | undefined }).entity = (hd: string) => h.doc.entityIndex.get(hd);
    registerCommands(h.app as App);
    const r = h.add(reg(circlesFaceSat([[0, 0, 10]])));
    await h.run('MASSPROP', [{ sel: [r.handle] }, '']);
    expect(h.printed).toContainEqual(expect.stringMatching(/^면적:\s+314\.1593$/));
    expect(h.printed).toContainEqual(expect.stringMatching(/^둘레:\s+62\.8319$/));
  });
});
