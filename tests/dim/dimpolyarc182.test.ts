/**
 * 182차: DIMRADIUS·DIMDIAMETER·DIMARC로 폴리선의 호 세그먼트 고르기.
 * Autodesk DIMRADIUS·DIMDIAMETER 도움말 「호 또는 원 선택」: 원, 호, 폴리선의 호 세그먼트를 지정한다. DIMARC 도움말: 호 또는 폴리선 호 세그먼트를 지정한다.
 * 고치기 전에는 세 명령이 원·호만 받아 폴리선을 고르면 알림(「호 또는 원을 선택하십시오.」·「호를 선택하십시오.」)만 하고 끝났다
 * (DIMARC는 프롬프트가 「호 또는 폴리선 호 세그먼트 선택:」인데도). 이제 고른 점에 가장 가까운 세그먼트가 호면 그 호의 중심·반지름·범위로 치수를 만든다
 * (스마트 치수 DIM과 같은 세그먼트 고르기, −Z 폴리선은 평면도 꼭짓점). 직선 세그먼트를 고르면 전과 같은 알림, 원·호는 전과 같은 값(174차 시험).
 * 폴리선 호 세그먼트 치수는 스마트 치수 DIM처럼 연관을 붙이지 않는다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { dimAssocOf } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, lw } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dims = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const lastDim = (h: H) => dims(h).at(-1)!;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];

/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) */
const polyline = (h: H, ext?: { x: number; y: number; z: number }) =>
  h.add(lw([[0, 0], [10, 0, 1], [20, 0]], false, ext)) as LwPolylineEntity;

describe('DIMRADIUS·DIMDIAMETER: 폴리선 호 세그먼트', () => {
  it('반지름 치수는 호 세그먼트의 중심 (15, 0)과 커서 쪽 현 위 점 (15, −5)에, 값 5, 연관 없음', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [15, -5] }, '15,-10']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(4);
    expect(xy(d.defPoint)).toEqual([15, 0]);
    expect(xy(d.defPoint4)).toEqual([15, -5]);
    expect(d.measurement).toBeCloseTo(5, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
  });

  it('지름 치수는 호 세그먼트 원의 양쪽 (15, −5)·(15, 5)에, 값 10', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMDIAMETER', [{ pick: p.handle, at: [15, -5] }, '15,-10']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(3);
    expect(xy(d.defPoint4)).toEqual([15, -5]);
    expect(xy(d.defPoint)).toEqual([15, 5]);
    expect(d.measurement).toBeCloseTo(10, 9);
  });

  it('−Z 폴리선(OCS X = WCS −X)의 호 세그먼트는 평면도 중심 (−15, 0)·현 위 점 (−15, −5)에', async () => {
    const h = harness();
    const p = polyline(h, NEG_Z);
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [-15, -5] }, '-15,-10']);
    const d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([-15, 0]);
    expect(xy(d.defPoint4)).toEqual([-15, -5]);
    expect(d.measurement).toBeCloseTo(5, 9);
  });
});

describe('DIMARC: 폴리선 호 세그먼트', () => {
  it('반시계 세그먼트: 시작 (10, 0)·끝 (20, 0)·중심 (15, 0), 값 5π', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const d = lastDim(h);
    expect(d.subtype).toBe('ARC_DIMENSION');
    expect(xy(d.defPoint4)).toEqual([15, 0]);
    expect(xy(d.defPoint2)).toEqual([10, 0]);
    expect(xy(d.defPoint3)).toEqual([20, 0]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
  });

  it('시계 세그먼트(볼록도 −1)는 반시계로 바꿔 시작 (10, 10)·끝 (0, 10)', async () => {
    const h = harness();
    const p = h.add(lw([[0, 10, -1], [10, 10]]));
    await h.run('DIMARC', [{ pick: p.handle, at: [5, 15] }, '5,18']);
    const d = lastDim(h);
    expect(xy(d.defPoint4)).toEqual([5, 10]);
    expect(xy(d.defPoint2)).toEqual([10, 10]);
    expect(xy(d.defPoint3)).toEqual([0, 10]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
  });

  it('부분(P)은 호 세그먼트 위 두 점 사이만', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, 'P', '10,0', '15,-5', '15,-8']);
    const d = lastDim(h);
    expect(xy(d.defPoint2)).toEqual([10, 0]);
    expect(xy(d.defPoint3)).toEqual([15, -5]);
    expect(d.arc!.partial).toBe(true);
    expect(d.measurement).toBeCloseTo(2.5 * Math.PI, 9);
  });
});

describe('잘못된 입력·Enter·명령 취소는 전과 같은 꼴', () => {
  it('직선 세그먼트를 고르면 전과 같은 알림만 하고 치수를 만들지 않는다', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [5, 0] }]);
    await h.run('DIMDIAMETER', [{ pick: p.handle, at: [5, 0] }]);
    await h.run('DIMARC', [{ pick: p.handle, at: [5, 0] }]);
    expect(h.printed.filter((t) => t === '호 또는 원을 선택하십시오.')).toHaveLength(2);
    expect(h.printed).toContain('호를 선택하십시오.');
    expect(dims(h)).toHaveLength(0);
  });

  it('치수 위치에서 Enter면 치수 없이 끝나고, 만든 치수는 명령 취소 한 번에 사라지며 폴리선은 그대로', async () => {
    const h = harness();
    const p = polyline(h);
    const before = [...p.verts];
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [15, -5] }, '']);
    expect(dims(h)).toHaveLength(0);
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [15, -5] }, '15,-10']);
    expect(dims(h)).toHaveLength(1);
    h.st.session.undo();
    expect(dims(h)).toHaveLength(0);
    expect([...(h.doc.entityIndex.get(p.handle) as LwPolylineEntity).verts]).toEqual(before);
  });
});
