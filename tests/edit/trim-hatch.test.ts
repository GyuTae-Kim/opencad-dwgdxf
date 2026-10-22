/**
 * TRIM으로 해치 자르기(AutoCAD와 같다): 고른 점이 든 칸(해치 경계와 절단 모서리가 나눈 칸)을 해치에서 뺀다.
 * 섬은 그대로 섬, 결과는 연관이 끊긴 홀짝 해치. 절단 모서리가 칸을 나누지 않으면 표준은 알림, 빠른 모드는 해치를 지운다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, HatchEntity, HatchPath, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { lwVertices, packBulge } from '../../src/core/lwpoly';
import { boundaryObjects } from '../../src/edit/geom/bpoly';
import { createHatch } from '../../src/edit/hatch';
import { extendEntity, trimEntity } from '../../src/edit/geom/trim';
import { MSG } from '../../src/edit/geom/types';
import { hatchArea } from '../../src/app/inquiry';
import { circle, line, lw, newDoc, xline } from './make';
import { registerModifyCommands } from '../../src/app/modify';
import { makeHarness } from '../cmds2/harness';

const rect = (x0: number, y0: number, x1: number, y1: number, flags = 3): HatchPath => ({
  flags,
  polyline: {
    closed: true,
    verts: packBulge([
      { x: x0, y: y0, bulge: 0 },
      { x: x1, y: y0, bulge: 0 },
      { x: x1, y: y1, bulge: 0 },
      { x: x0, y: y1, bulge: 0 },
    ]),
  },
});

function hatchOf(doc: CadDocument, paths: HatchPath[], pattern = 'ANSI31'): HatchEntity {
  const h = createHatch(doc, paths, { pattern });
  return { ...h, handle: 'H1' };
}

function trimmed(r: ReturnType<typeof trimEntity>): HatchEntity {
  const h = (r.replace ?? []).find((e) => e.type === 'HATCH') as HatchEntity | undefined;
  expect(h, JSON.stringify(r).slice(0, 200)).toBeTruthy();
  return h!;
}

/** 해치가 칠하는 곳인가(홀짝) */
function filled(h: HatchEntity, x: number, y: number): boolean {
  // 아주 작은 해치 정사각형 넓이로 견준다(경계 위가 아닌 점에서만 쓴다)
  const probe: HatchEntity = { ...h, paths: [...h.paths, rect(x - 1e-3, y - 1e-3, x + 1e-3, y + 1e-3, 0)] };
  return hatchArea(probe) < hatchArea(h);
}

describe('TRIM: 해치 자르기', () => {
  it('세로선으로 사각형 해치의 고른 쪽을 뺀다', () => {
    const doc = newDoc();
    const h = hatchOf(doc, [rect(0, 0, 10, 10)]);
    const cut = line(4, -1, 4, 11);
    const left = trimmed(trimEntity(h, [cut], { x: 2, y: 5 }, { doc }));
    expect(hatchArea(left)).toBeCloseTo(60, 6);
    expect(filled(left, 7, 5)).toBe(true);
    expect(filled(left, 2, 5)).toBe(false);
    const right = trimmed(trimEntity(h, [cut], { x: 7, y: 5 }, { doc }));
    expect(hatchArea(right)).toBeCloseTo(40, 6);
    // 핸들 유지, 연관 끊김, 홀짝
    expect(left.handle).toBe('H1');
    expect(left.associative).toBe(false);
    expect(left.hatchStyle).toBe(0);
    expect(left.patternName).toBe('ANSI31');
  });

  it('섬은 그대로 섬: 섬을 지나는 선으로 자르면 남은 쪽에 섬의 반이 남는다', () => {
    const doc = newDoc();
    const h = hatchOf(doc, [rect(0, 0, 10, 10, 1), rect(3, 3, 7, 7, 16)]);
    expect(hatchArea(h)).toBeCloseTo(84, 6);
    const r = trimmed(trimEntity(h, [line(5, -1, 5, 11)], { x: 1, y: 5 }, { doc }));
    expect(hatchArea(r)).toBeCloseTo(50 - 8, 6);
    expect(filled(r, 6, 5)).toBe(false);
    expect(filled(r, 8, 5)).toBe(true);
  });

  it('두 선 사이를 고르면 양쪽 두 조각이 한 해치에 남는다', () => {
    const doc = newDoc();
    const h = hatchOf(doc, [rect(0, 0, 10, 10)]);
    const r = trimmed(trimEntity(h, [line(3, -1, 3, 11), line(6, -1, 6, 11)], { x: 4.5, y: 5 }, { doc }));
    expect(r.paths).toHaveLength(2);
    expect(hatchArea(r)).toBeCloseTo(70, 6);
    expect(filled(r, 1, 5)).toBe(true);
    expect(filled(r, 8, 5)).toBe(true);
    expect(filled(r, 4.5, 5)).toBe(false);
  });

  it('원 해치를 지름으로 자르면 반원(호 모서리 유지)', () => {
    const doc = newDoc();
    const disk: HatchPath = { flags: 1, edges: [{ type: 'arc', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI * 2, ccw: true }] };
    const h = hatchOf(doc, [disk], 'SOLID');
    const r = trimmed(trimEntity(h, [line(-6, 0, 6, 0)], { x: 1, y: -2 }, { doc }));
    // 넓이는 꺾은선 근사(hatchArea)로 잰다
    expect(hatchArea(r)).toBeCloseTo((Math.PI * 25) / 2, 1);
    expect(filled(r, 0, 2)).toBe(true);
    expect(filled(r, 0, -2)).toBe(false);
    // 폴리선 경로(볼록도) 또는 호 모서리 — 꺾은선으로 깎지 않는다
    const p = r.paths[0]!;
    const curved = p.polyline ? p.polyline.verts.some((v, i) => i % 3 === 2 && Math.abs(v) > 0.1) : (p.edges ?? []).some((e) => e.type === 'arc');
    expect(curved).toBe(true);
  });

  it('연관 해치를 빠른 모드(모든 객체가 경계)로 자르면 연관을 끊고 경계 객체 반응자도 뺀다', () => {
    const doc = newDoc();
    const bnd = { ...lw([[0, 0], [10, 0], [10, 10], [0, 10]], true), handle: 'B1', reactors: ['H1'] } as Entity;
    const h = { ...hatchOf(doc, [{ ...rect(0, 0, 10, 10), sources: ['B1'] }]), associative: true };
    doc.blocks.get(MODEL_SPACE)!.entities.push(bnd, h);
    doc.entityIndex.set('B1', bnd);
    doc.entityIndex.set('H1', h);
    const cut = { ...line(4, -1, 4, 11), handle: 'L1' };
    const r = trimEntity(h, 'all', { x: 2, y: 5 }, { doc, quick: true, all: [bnd, cut, h] });
    const out = trimmed(r);
    expect(hatchArea(out)).toBeCloseTo(60, 6);
    expect(out.associative).toBe(false);
    expect(out.paths.every((p) => !p.sources?.length)).toBe(true);
    const b = (r.replace ?? []).find((e) => e.handle === 'B1')!;
    expect(b.reactors ?? []).toEqual([]);
  });

  it('절단 모서리가 칸을 나누지 않으면: 표준은 알림, 빠른 모드는 해치를 지운다', () => {
    const doc = newDoc();
    const h = hatchOf(doc, [rect(0, 0, 10, 10)]);
    const far = line(20, 0, 20, 10);
    expect(trimEntity(h, [far], { x: 5, y: 5 }, { doc }).message).toBe(MSG.noIntersect);
    expect(trimEntity(h, [far], { x: 5, y: 5 }, { doc, quick: true }).remove).toEqual(['H1']);
  });

  it('남는 곳이 없으면 해치를 지우고, 칠 밖(섬 안)을 고르면 자를 수 없다고 알린다', () => {
    const doc = newDoc();
    const h = hatchOf(doc, [rect(0, 0, 10, 10, 1), rect(3, 3, 7, 7, 16)]);
    // 섬 안
    expect(trimEntity(h, [line(5, -1, 5, 11)], { x: 5.5, y: 5 }, { doc }).message).toBe(MSG.cannotTrimHatch);
    // 해치 전체를 둘러싼 원 경계 + 그 안을 다시 나누지 않는 선 → 고른 칸이 해치 전체면 'nocut'(빠른 모드는 지운다)
    const c = circle(5, 5, 20);
    expect(trimEntity(h, [c], { x: 1, y: 1 }, { doc, quick: true }).remove).toEqual(['H1']);
  });

  it('무한선(XLINE)도 절단 모서리', () => {
    const doc = newDoc();
    const h = hatchOf(doc, [rect(0, 0, 10, 10)]);
    const r = trimmed(trimEntity(h, [xline(0, 0, 1, 1)], { x: 8, y: 2 }, { doc }));
    expect(hatchArea(r)).toBeCloseTo(50, 6);
    expect(filled(r, 2, 8)).toBe(true);
  });

  it('TRIM 명령(표준): 절단 모서리를 고른 뒤 해치를 누르면 잘린다', async () => {
    const h = makeHarness();
    registerModifyCommands(h.app);
    const doc = h.doc;
    const hh = h.add({ ...createHatch(doc, [rect(0, 0, 10, 10)], { pattern: 'ANSI31' }), handle: '' } as Entity);
    const cut = h.add(line(4, -1, 4, 11));
    // 표준 모드로 바꾸고 절단 모서리 → 해치
    await h.run('TRIM', ['O', 'S', { sel: [cut.handle] }, { pick: hh.handle, at: [2, 5] }, '']);
    const out = doc.entityIndex.get(hh.handle) as HatchEntity;
    expect(hatchArea(out)).toBeCloseTo(60, 6);
  });
});

describe('해치 경계 객체와 그 밖의 객체', () => {
  it('한 바퀴 원 모서리 경로는 반원 둘의 닫힌 폴리선(볼록도 1)이 된다(전에는 볼록도가 무한대)', () => {
    const disk: HatchPath = { flags: 1, edges: [{ type: 'arc', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI * 2, ccw: true }] };
    const [o] = boundaryObjects([disk], entityDefaults());
    const v = lwVertices(o as LwPolylineEntity);
    expect(v).toHaveLength(2);
    for (const x of v) expect(x.bulge).toBeCloseTo(1, 12);
  });

  it('다중선·치수는 자르기·연장 대신 쓸 길을 알린다', () => {
    const doc = newDoc();
    const ml = { ...line(0, 0, 1, 0), type: 'MLINE' } as unknown as Entity;
    const dim = { ...line(0, 0, 1, 0), type: 'DIMENSION' } as unknown as Entity;
    expect(trimEntity(ml, [line(0.5, -1, 0.5, 1)], { x: 0.8, y: 0 }, { doc }).message).toBe(MSG.trimMline);
    expect(extendEntity(dim, [line(5, -1, 5, 1)], { x: 0.8, y: 0 }, { doc }).message).toBe(MSG.trimDimension);
  });
});
