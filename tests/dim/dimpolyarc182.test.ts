/**
 * 182차: DIMRADIUS·DIMDIAMETER·DIMARC로 폴리선의 호 세그먼트 고르기.
 * Autodesk DIMRADIUS·DIMDIAMETER 도움말 「호 또는 원 선택」: 원, 호, 폴리선의 호 세그먼트를 지정한다. DIMARC 도움말: 호 또는 폴리선 호 세그먼트를 지정한다.
 * 고치기 전에는 세 명령이 원·호만 받아 폴리선을 고르면 알림(「호 또는 원을 선택하십시오.」·「호를 선택하십시오.」)만 하고 끝났다
 * (DIMARC는 프롬프트가 「호 또는 폴리선 호 세그먼트 선택:」인데도). 이제 고른 점에 가장 가까운 세그먼트가 호면 그 호의 중심·반지름·범위로 치수를 만든다
 * (스마트 치수 DIM과 같은 세그먼트 고르기, −Z 폴리선은 평면도 꼭짓점). 직선 세그먼트를 고르면 전과 같은 알림, 원·호는 전과 같은 값(174차 시험).
 * 폴리선 호 세그먼트의 반지름·지름 치수는 연관을 붙이지 않는다.
 *
 * 193차: DIMARC가 폴리선 호 세그먼트로 만든 호 길이 치수에도 ARC와 같은 세 참조(시작·끝 끝점과 중심)를 붙인다(아래 193차 절).
 * Autodesk DIMASSOC 도움말: 2는 연관 치수 객체 — 정의점 하나 이상이 형상 객체의 연관점에 묶여 그 점이 움직이면 치수의 위치·방향·값이 바뀐다.
 * 연관 치수 도움말이 받지 않는 객체로 적은 것(해치·이미지·언더레이·다중선·2D 솔리드)에 폴리선은 없고, DIMARC 도움말은 호 또는 폴리선 호 세그먼트를 고른다.
 * 고치기 전에는 DIMASSOC 2여도 폴리선 호 세그먼트의 호 길이 치수에 연관이 없어 폴리선을 옮겨도 치수가 그 자리에 남았다.
 * 참조는 192차 `segmentSnapRef`(고른 세그먼트 번호 표지)로 만든다. ARC로 만든 치수·DIMASSOC 1·반지름 치수는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { OSNAP, dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, lw } from '../edit/make';

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
    // 182차에는 연관 없음이었다 — 193차부터 세 참조(아래 193차 절)
    expect(dimAssocOf(h.doc, d)!.data.refs.filter((r) => r)).toHaveLength(3);
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

/** 호 길이 치수의 시작(13)·끝(14)·중심(15) */
const arcPts = (d: DimensionEntity) => [...xy(d.defPoint2), ...xy(d.defPoint3), ...xy(d.defPoint4)];
/** 연관 참조(DIMASSOC 참조 칸 넷 가운데 빈 칸은 거른다) */
const refsOf = (h: H, d: DimensionEntity) => dimAssocOf(h.doc, d)!.data.refs.filter((r) => r);
/** 연관 참조 수가 n이고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, d: DimensionEntity, n: number) {
  expect(dimAssocOf(h.doc, d)).not.toBeNull();
  expect(refsOf(h, d)).toHaveLength(n);
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}
/** 폴리선 꼭짓점을 연관 따라가기 없이 바꾼 뒤 DIMREGEN이 맞춘 치수(192차 시험과 같은 꼴 — 바꾸기 전은 문서의 지금 객체) */
function editAndRegen(h: H, handle: string, verts: LwPolylineEntity['verts'], d: DimensionEntity): DimensionEntity | undefined {
  const before = h.doc.entityIndex.get(handle) as Entity;
  h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before, after: { ...before, verts } as Entity }] });
  return regenAssociations(h.doc, () => h.st.session.newHandle()).dims.get(d.handle);
}
const vertsOf = (pts: [number, number, number?][], closed = false, ext?: { x: number; y: number; z: number }) => (lw(pts, closed, ext) as LwPolylineEntity).verts;

describe('193차: DIMARC가 폴리선 호 세그먼트의 두 끝점·중심에 연관한다(ARC와 같은 세 참조)', () => {
  it('경량 폴리선 반시계 세그먼트: 끝점 둘·중심 참조가 고른 세그먼트 표지(2)이고, 폴리선을 X로 +2 옮기면 (12, 0)·(22, 0)·(17, 0)로 따라간다(전에는 연관 없음)', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const d = lastDim(h);
    expect(arcPts(d)).toEqual([10, 0, 20, 0, 15, 0]);
    expect(refsOf(h, d).map((r) => [r!.osnap, r!.gsMarker, r!.ids[0]])).toEqual([
      [OSNAP.END, 2, p.handle],
      [OSNAP.END, 2, p.handle],
      [OSNAP.CEN, 2, p.handle],
    ]);
    expectAssocHolds(h, d, 3);
    const m = editAndRegen(h, p.handle, vertsOf([[2, 0], [12, 0, 1], [22, 0]]), d);
    expect(m).toBeDefined();
    expect(arcPts(m!)).toEqual([12, 0, 22, 0, 17, 0]);
    expect(m!.measurement).toBeCloseTo(5 * Math.PI, 9);
  });

  it('꼭짓점을 바꾸면 따라간다: 끝 꼭짓점 (20, 0) → (24, 0)이면 끝 (24, 0)·중심 (17, 0)·값 7π', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const d = lastDim(h);
    const m = editAndRegen(h, p.handle, vertsOf([[0, 0], [10, 0, 1], [24, 0]]), d);
    expect(m).toBeDefined();
    expect(arcPts(m!)).toEqual([10, 0, 24, 0, 17, 0]);
    expect(m!.measurement).toBeCloseTo(7 * Math.PI, 9);
  });

  it('시계 세그먼트(볼록도 −1)는 반시계로 바꾼 시작 (10, 10)·끝 (0, 10)·중심 (5, 10)에 연관 셋(표지 1)', async () => {
    const h = harness();
    const p = h.add(lw([[0, 10, -1], [10, 10]]));
    await h.run('DIMARC', [{ pick: p.handle, at: [5, 15] }, '5,18']);
    const d = lastDim(h);
    expect(arcPts(d)).toEqual([10, 10, 0, 10, 5, 10]);
    expect(refsOf(h, d).map((r) => r!.gsMarker)).toEqual([1, 1, 1]);
    expectAssocHolds(h, d, 3);
  });

  it('−Z 경량 폴리선은 평면도 (−20, 0)·(−10, 0)·(−15, 0)에 연관 셋, OCS X로 +2 옮기면 평면도 (−22, 0)·(−12, 0)·(−17, 0)', async () => {
    const h = harness();
    const p = polyline(h, NEG_Z);
    await h.run('DIMARC', [{ pick: p.handle, at: [-15, -5] }, '-15,-8']);
    const d = lastDim(h);
    expect(arcPts(d)).toEqual([-20, 0, -10, 0, -15, 0]);
    expectAssocHolds(h, d, 3);
    const m = editAndRegen(h, p.handle, vertsOf([[2, 0], [12, 0, 1], [22, 0]], false, NEG_Z), d);
    expect(m).toBeDefined();
    expect(arcPts(m!)).toEqual([-22, 0, -12, 0, -17, 0]);
  });

  it('도넛 꼴(닫힌 볼록도 1·1)의 둘째 반원: 세 참조가 둘째 세그먼트 표지(2)이고, 둘째 볼록도를 0.5로 바꾸면 중심 (5, −3.75)를 따라간다', async () => {
    const h = harness();
    const p = h.add(lw([[0, 0, 1], [10, 0, 1]], true));
    await h.run('DIMARC', [{ pick: p.handle, at: [5, 5] }, '5,8']);
    const d = lastDim(h);
    expect(arcPts(d)).toEqual([10, 0, 0, 0, 5, 0]);
    expect(refsOf(h, d).map((r) => r!.gsMarker)).toEqual([2, 2, 2]);
    expectAssocHolds(h, d, 3);
    // 둘째 세그먼트 볼록도 0.5: 반지름 6.25, 중심 (5, −3.75) — 첫째 세그먼트(중심 (5, 0))는 그대로
    const m = editAndRegen(h, p.handle, vertsOf([[0, 0, 1], [10, 0, 0.5]], true), d);
    expect(m).toBeDefined();
    expect(arcPts(m!)).toEqual([10, 0, 0, 0, 5, -3.75]);
    expect(m!.measurement).toBeCloseTo(6.25 * 4 * Math.atan(0.5), 9);
  });

  it('부분(P)은 ARC와 같은 꼴: 호 끝에 닿은 첫 점 (10, 0)·중심만 연관하고 안쪽 둘째 점 (15, −5)는 비운다', async () => {
    const pattern = (h: H, d: DimensionEntity) => dimAssocOf(h.doc, d)!.data.refs.slice(0, 3).map((r) => r?.osnap ?? null);
    const ha = harness();
    const a = ha.add(arc(15, 0, 5, 180, 360));
    await ha.run('DIMARC', [{ pick: a.handle, at: [15, -5] }, 'P', '10,0', '15,-5', '15,-8']);
    const da = lastDim(ha);
    const hp = harness();
    const p = polyline(hp);
    await hp.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, 'P', '10,0', '15,-5', '15,-8']);
    const dp = lastDim(hp);
    expect(arcPts(da)).toEqual([10, 0, 15, -5, 15, 0]);
    expect(pattern(ha, da)).toEqual([OSNAP.END, null, OSNAP.CEN]);
    expect(arcPts(dp)).toEqual(arcPts(da));
    expect(dp.arc!.partial).toBe(true);
    expect(pattern(hp, dp)).toEqual(pattern(ha, da));
  });
});

describe('193차 — 전과 같은 꼴', () => {
  it('ARC로 만든 호 길이 치수는 시작·끝·중심 세 참조(표지 0) 그대로', async () => {
    const h = harness();
    const a = h.add(arc(5, 60, 5, 0, 180));
    await h.run('DIMARC', [{ pick: a.handle, at: [5, 65] }, '5,68']);
    const d = lastDim(h);
    expect(arcPts(d)).toEqual([10, 60, 0, 60, 5, 60]);
    expect(refsOf(h, d).map((r) => [r!.osnap, r!.gsMarker, r!.ids[0]])).toEqual([
      [OSNAP.END, 0, a.handle],
      [OSNAP.END, 0, a.handle],
      [OSNAP.CEN, 0, a.handle],
    ]);
    expectAssocHolds(h, d, 3);
  });

  it('DIMASSOC 1이면 폴리선 호 세그먼트·ARC 모두 연관 없는 치수(정의점은 같은 자리)', async () => {
    const h = harness();
    h.doc.header.set('$DIMASSOC', 1);
    const p = polyline(h);
    const a = h.add(arc(5, 60, 5, 0, 180));
    await h.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const dp = lastDim(h);
    await h.run('DIMARC', [{ pick: a.handle, at: [5, 65] }, '5,68']);
    const da = lastDim(h);
    expect(dims(h)).toHaveLength(2);
    expect(arcPts(dp)).toEqual([10, 0, 20, 0, 15, 0]);
    expect(arcPts(da)).toEqual([10, 60, 0, 60, 5, 60]);
    expect(dimAssocOf(h.doc, dp)).toBeNull();
    expect(dimAssocOf(h.doc, da)).toBeNull();
  });
});
