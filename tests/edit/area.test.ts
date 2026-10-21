/**
 * AREA·MEASUREGEOM 면적: 객체(호·타원호·닫힌 스플라인·볼록도 폴리선)의 면적은 열린 곡선이면 현으로 닫은 면적, 둘레는 곡선 길이.
 * 면적 추가(A)·빼기(S) 모드는 잴 때마다 합계를 알린다(휴대폰 '면적' 단추도 같은 명령).
 */
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/model';
import { registerCommands, objectArea } from '../../src/app/commands';
import { entityPath } from '../../src/edit/geom/path';
import { pathSignedArea } from '../../src/edit/geom/curve';
import { polyArea } from '../../src/app/inquiry';
import { lwVertices } from '../../src/core/lwpoly';
import { arc, circle, ellipse, line, lw, spline } from './make';
import { makeHarness } from '../cmds2/harness';
import type { App } from '../../src/app/app';

const near = (a: number | null | undefined, b: number, eps = 1e-6) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(eps);

describe('경로 면적', () => {
  it('원·호(현으로 닫음)·타원호·볼록도 폴리선', () => {
    near(pathSignedArea(entityPath(circle(3, 4, 5))!), Math.PI * 25);
    // 반원: 현으로 닫으면 반원 넓이
    near(Math.abs(pathSignedArea(entityPath(arc(1, 1, 2, 0, 180))!)), Math.PI * 2);
    // 사분원 호: 부채꼴 − 삼각형
    near(Math.abs(pathSignedArea(entityPath(arc(0, 0, 10, 0, 90))!)), (Math.PI * 100) / 4 - 50);
    // 타원 전체와 반 타원
    near(Math.abs(pathSignedArea(entityPath(ellipse(0, 0, 10, 0, 0.5))!)), Math.PI * 10 * 5);
    near(Math.abs(pathSignedArea(entityPath(ellipse(2, 3, 0, 10, 0.4, 0, Math.PI))!)), (Math.PI * 10 * 4) / 2);
    const pl = lw([[0, 0, 0], [10, 0, 1], [10, 10, 0], [0, 10, 0]], true);
    near(Math.abs(pathSignedArea(entityPath(pl)!)), Math.abs(polyArea(lwVertices(pl as never))));
  });
  it('닫힌 스플라인은 수치 적분(같은 점의 다각형과 거의 같다)', () => {
    const sq = spline([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], 1);
    near(Math.abs(pathSignedArea(entityPath(sq)!)), 100, 1e-6);
  });
});

describe('objectArea', () => {
  it('타원호는 전체 타원이 아니다, 호는 잴 수 있다, 선은 면적 없음', () => {
    const half = objectArea(ellipse(0, 0, 10, 0, 0.5, 0, Math.PI))!;
    near(half.a, (Math.PI * 50) / 2);
    const a = objectArea(arc(0, 0, 10, 0, 90))!;
    near(a.a, (Math.PI * 100) / 4 - 50);
    near(a.per, (Math.PI * 20) / 4);
    expect(objectArea(line(0, 0, 1, 1))).toBeNull();
  });
});

describe('AREA 명령', () => {
  function setup() {
    const h = makeHarness();
    (h.app as unknown as { entity(hd: string): Entity | undefined }).entity = (hd: string) => h.doc.entityIndex.get(hd);
    registerCommands(h.app as App);
    return h;
  }
  it('객체 하나(기본): 타원호 면적', async () => {
    const h = setup();
    const e = h.add({ ...ellipse(0, 0, 10, 0, 0.5, 0, Math.PI), handle: '' } as Entity);
    await h.run('AREA', ['', { pick: e.handle, at: [0, 5] }]);
    const res = h.printed.find((t) => t.startsWith('면적 = '))!;
    expect(res).toMatch(/^면적 = 78\.5398/);
  });
  it('면적 추가(A)·빼기(S): 원 더하고 안쪽 사각형 빼기, 합계', async () => {
    const h = setup();
    const c = h.add({ ...circle(0, 0, 10), handle: '' } as Entity);
    const r = h.add({ ...lw([[-2, -2], [2, -2], [2, 2], [-2, 2]], true), handle: '' } as Entity);
    await h.run('AREA', ['A', 'O', { pick: c.handle, at: [10, 0] }, '', 'S', 'O', { pick: r.handle, at: [2, 0] }, '', 'X']);
    const totals = h.printed.filter((t) => t.startsWith('총 면적 = '));
    expect(totals.length).toBeGreaterThanOrEqual(2);
    expect(totals.at(-1)).toMatch(new RegExp(`^총 면적 = ${(Math.PI * 100 - 16).toFixed(4)}`));
    expect(h.prompts.some((p) => p.startsWith('(추가 모드)'))).toBe(true);
    expect(h.prompts.some((p) => p.startsWith('(빼기 모드)'))).toBe(true);
  });
  it('점으로 둘러 재기(전처럼 한 번에 끝)', async () => {
    const h = setup();
    await h.run('AREA', ['0,0', '40,0', '40,30', '0,30', '']);
    expect(h.printed).toContainEqual(expect.stringMatching(/^면적 = 1200(\.0+)?, {2}둘레 = 140(\.0+)?$/));
  });
});
