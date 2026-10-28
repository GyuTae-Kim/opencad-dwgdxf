/**
 * 9차 후속: 3D 좌표 입력의 Z.
 * - parsePointInput: x,y,z 절대, @ 상대(마지막 점의 Z를 잇는다), 원통(d<a,z)·구(d<a<b) 좌표, 직접 거리
 * - 3DPOLY·3DFACE는 입력이 정한 Z, Z를 주지 않은 점은 고도. 2D 명령(LINE)은 지금처럼 고도에 평면으로
 * - 점 필터(.XY → Z 숫자)·M2P의 Z
 */
import { describe, expect, it } from 'vitest';
import type { FaceEntity, LineEntity, PolylineEntity } from '../../src/core/model';
import type { PointResult } from '../../src/app/app';
import { parsePointInput } from '../../src/app/commandline';
import { dynRelative } from '../../src/app/dyninput';
import { runPointOverride } from '../../src/app/osnap-override';
import { WORLD } from '../../src/app/ucs';
import { registerDrawCommands } from '../../src/app/draw';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { polyVertices } from '../../src/core/polyverts';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('좌표 입력의 Z(parsePointInput)', () => {
  it('절대 x,y,z는 Z, x,y는 Z 없음, @ 상대는 마지막 점의 Z를 잇는다', () => {
    expect(parsePointInput('1,2,3', null, null)).toEqual({ x: 1, y: 2, z: 3 });
    expect(parsePointInput('1,2', { x: 5, y: 5, z: 9 }, null)).toEqual({ x: 1, y: 2 });
    expect(parsePointInput('@1,2', { x: 5, y: 5, z: 9 }, null)).toEqual({ x: 6, y: 7, z: 9 });
    expect(parsePointInput('@1,2,-4', { x: 5, y: 5, z: 9 }, null)).toEqual({ x: 6, y: 7, z: 5 });
    // 마지막 점에 Z가 없으면(평면 점) 상대 dz는 고도(relZ0)에서, 평면 상대 좌표는 Z 없음
    expect(parsePointInput('@1,2,3', { x: 0, y: 0 }, null)).toEqual({ x: 1, y: 2, z: 3 });
    expect(parsePointInput('@1,2,3', { x: 0, y: 0 }, null, 5)).toEqual({ x: 1, y: 2, z: 8 });
    expect(parsePointInput('1,2,3', { x: 0, y: 0 }, null, 5)).toEqual({ x: 1, y: 2, z: 3 });
    expect(parsePointInput('@1,2', { x: 0, y: 0 }, null)).toEqual({ x: 1, y: 2 });
    expect(parsePointInput('@10<90', { x: 0, y: 0, z: 4 }, null)).toMatchObject({ z: 4 });
  });

  it('원통 좌표 d<a,z와 구 좌표 d<a<b(XY 평면에서 올려 본 각)', () => {
    const c = parsePointInput('5<90,6', null, null)!;
    close(c.x, 0);
    close(c.y, 5);
    expect(c.z).toBe(6);
    const rc = parsePointInput('@5<0,2', { x: 1, y: 1, z: 1 }, null)!;
    expect(rc).toEqual({ x: 6, y: 1, z: 3 });
    const s = parsePointInput('8<60<30', null, null)!;
    close(s.x, 8 * Math.cos(Math.PI / 6) * Math.cos(Math.PI / 3));
    close(s.y, 8 * Math.cos(Math.PI / 6) * Math.sin(Math.PI / 3));
    close(s.z!, 4);
    const rs = parsePointInput('@10<0<90', { x: 0, y: 0, z: 1 }, null)!;
    close(rs.x, 0);
    close(rs.z!, 11);
    expect(parsePointInput('1<2<3<4', null, null)).toBeNull();
  });

  it('직접 거리는 평면도의 커서 방향(수평), Z는 마지막 점 그대로', () => {
    expect(parsePointInput('5', { x: 0, y: 0, z: 7 }, { x: 0, y: 2 })).toEqual({ x: 0, y: 5, z: 7 });
  });

  it('동적 입력: 두 번째 점부터 원통·구 좌표도 상대 좌표로', () => {
    expect(dynRelative('10,5,3')).toBe('@10,5,3');
    expect(dynRelative('10<45,3')).toBe('@10<45,3');
    expect(dynRelative('10<45<30')).toBe('@10<45<30');
    expect(dynRelative('#10<45<30')).toBe('#10<45<30');
  });
});

describe('3DPOLY·3DFACE의 Z', () => {
  const harness = () => {
    const h = makeHarness();
    registerDrawCommands(h.app);
    h.doc.header.set('$ELEVATION', 2);
    return h;
  };

  it('3DPOLY: x,y,z·@ 상대(앞 점의 Z)·세로 구간·원통 좌표, Z를 주지 않은 점은 고도', async () => {
    const h = harness();
    await h.run('3DPOLY', ['0,0,0', '10,0,5', '@0,10', '@0,0,-5', '5<90,3', '1,1', '']);
    const p = modelEntities(h.doc, 'POLYLINE')[0] as PolylineEntity;
    expect(p.kind).toBe('3d');
    expect(polyVertices(p).map((v) => [v.location.x, v.location.y, v.location.z].map((n) => Math.round(n * 1e9) / 1e9))).toEqual([
      [0, 0, 0],
      [10, 0, 5],
      [10, 10, 5],
      [10, 10, 0],
      [0, 5, 3],
      [1, 1, 2],
    ]);
    // 마지막 점(LASTPOINT)에도 Z
    expect(h.app.lastPoint).toMatchObject({ x: 1, y: 1, z: 2 });
  });

  it('3DPOLY: 같은 3D 점은 건너뛰고, 명령 취소(U)는 마지막 정점만', async () => {
    const h = harness();
    await h.run('3DPOLY', ['0,0,1', '0,0,1', '4,0,1', '4,4,9', 'U', '4,4,3', '']);
    const p = modelEntities(h.doc, 'POLYLINE')[0] as PolylineEntity;
    expect(polyVertices(p).map((v) => v.location.z)).toEqual([1, 1, 3]);
  });

  it('3DFACE: 구석마다 Z, 상대 좌표는 앞 점의 Z', async () => {
    const h = harness();
    await h.run('3DFACE', ['0,0,0', '10,0,1', '@0,10', '0,10', '']);
    const f = modelEntities(h.doc, '3DFACE')[0] as FaceEntity;
    expect(f.points.map((q) => q.z)).toEqual([0, 1, 1, 2]);
  });

  it('2D 명령(LINE)은 Z를 받아도 지금처럼 고도에 평면으로 그린다', async () => {
    const h = harness();
    await h.run('LINE', ['0,0,5', '10,0,7', '']);
    const l = modelEntities(h.doc, 'LINE')[0] as LineEntity;
    expect(l.start).toEqual({ x: 0, y: 0, z: 2 });
    expect(l.end).toEqual({ x: 10, y: 0, z: 2 });
  });
});

describe('점 필터·M2P의 Z', () => {
  /** 답을 차례로 내주는 가짜 점 요청(점이면 z도 그대로) */
  const io = (answers: PointResult[]) => {
    const prompts: string[] = [];
    return {
      prompts,
      ucs: WORLD,
      elevation: 2,
      print: () => {},
      getPoint: async (prompt: string) => {
        prompts.push(prompt);
        return answers.shift()!;
      },
    };
  };

  it('.XY → "(Z 필요):"의 숫자가 Z, .Z는 첫 점의 Z(없으면 고도)', async () => {
    const a = io([{ point: { x: 1, y: 2 } }, { text: '7' }]);
    expect(await runPointOverride({ kind: 'filter', take: ['x', 'y'] }, a)).toEqual({ x: 1, y: 2, z: 7 });
    expect(a.prompts).toEqual(['대상:', '(Z 필요):']);
    const b = io([{ point: { x: 1, y: 2 }, z: 5 }, { point: { x: 8, y: 9 } }]);
    expect(await runPointOverride({ kind: 'filter', take: ['z'] }, b)).toEqual({ x: 8, y: 9, z: 5 });
    const c = io([{ point: { x: 1, y: 2 } }, { point: { x: 8, y: 9 }, z: 4 }]);
    expect(await runPointOverride({ kind: 'filter', take: ['z'] }, c)).toEqual({ x: 8, y: 9, z: 2 });
    // 어느 점도 Z를 주지 않으면 Z 없는 점(2D 명령에는 전과 같다)
    const d = io([{ point: { x: 1, y: 2 } }, { point: { x: 8, y: 9 } }]);
    expect(await runPointOverride({ kind: 'filter', take: ['x'] }, d)).toEqual({ x: 1, y: 9 });
  });

  it('M2P: 두 점 Z의 가운데(Z가 없는 점은 고도)', async () => {
    const a = io([{ point: { x: 0, y: 0 }, z: 10 }, { point: { x: 4, y: 0 } }]);
    expect(await runPointOverride({ kind: 'm2p' }, a)).toEqual({ x: 2, y: 0, z: 6 });
  });
});
