/**
 * 174차: 돌출 방향이 −Z인(대칭으로 뒤집힌) 원·호에 만드는 치수·중심 표식.
 * DXF 참조서의 OCS 쪽: CIRCLE·ARC의 중심(10)과 각도(50·51)는 객체 OCS 값이다. (0, 0, −1)이면 OCS X = WCS −X라
 * OCS 중심 (10, 5)인 −Z 원은 평면도 (−10, 5)에 그려진다. Autodesk DIMRADIUS·DIMDIAMETER·DIMARC·DIMCENTER 도움말은
 * 고른 원·호의 반지름·지름·호 길이 치수와 중심 표식을 그 원·호에 만든다고 적는다.
 * 고치기 전에는 OCS 값을 평면도 자리로 그대로 써 치수·중심 표식이 X 거울상 자리에 생겼다(연관 참조는 진짜 원을 보아
 * 반지름 치수는 두 원 사이에 걸치고, 지름 치수는 두 점이 겹쳤다). +Z 원·호는 평면 사상이 항등이라 전과 같은 값이다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, CircleEntity, DimensionEntity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerEditCmds2Dim } from '../../src/app/editcmds2-dim';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { NEG_Z, arc, circle } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerEditCmds2Dim(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const lastDim = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'DIMENSION').at(-1) as DimensionEntity;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];
/** 연관 참조가 모두 붙었고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, d: DimensionEntity, n: number) {
  const a = dimAssocOf(h.doc, d);
  expect(a).not.toBeNull();
  expect(a!.data.refs.filter((r) => r)).toHaveLength(n);
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}

describe('DIMRADIUS·DIMDIAMETER: −Z 원', () => {
  it('반지름 치수는 평면도 중심 (−10, 5)과 커서 쪽 현 위 점 (−14, 5)에, 두 점 모두 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    await h.run('DIMRADIUS', [{ pick: c.handle, at: [-14, 5] }, '-20,5']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(4);
    expect(xy(d.defPoint)).toEqual([-10, 5]);
    expect(xy(d.defPoint4)).toEqual([-14, 5]);
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
  });

  it('지름 치수는 평면도 원의 양쪽 (−14, 5)·(−6, 5)에, 두 점 모두 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    await h.run('DIMDIAMETER', [{ pick: c.handle, at: [-14, 5] }, '-20,5']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(3);
    expect(xy(d.defPoint4)).toEqual([-14, 5]);
    expect(xy(d.defPoint)).toEqual([-6, 5]);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('DIMARC: −Z 호', () => {
  it('OCS 0°~90° 호(평면도 90°~180°)의 호 길이 치수가 평면도 호의 끝점·중심에, 세 점 모두 연관', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z));
    await h.run('DIMARC', [{ pick: a.handle, at: [-12.828, 7.828] }, '-14,9']);
    const d = lastDim(h);
    expect(d.subtype).toBe('ARC_DIMENSION');
    expect(xy(d.defPoint4)).toEqual([-10, 5]);
    expect(xy(d.defPoint2)).toEqual([-10, 9]);
    expect(xy(d.defPoint3)).toEqual([-14, 5]);
    expect(d.arc!.startAngle).toBeCloseTo(Math.PI / 2, 12);
    expect(d.arc!.endAngle).toBeCloseTo(Math.PI, 12);
    expect(d.measurement).toBeCloseTo(2 * Math.PI, 9);
    expectAssocHolds(h, d, 3);
  });
});

describe('DIMCENTER: −Z 원', () => {
  it('OCS 고도 3인 −Z 원의 중심 표식은 평면도 중심 (−10, 5)에 WCS Z −3으로', async () => {
    const h = harness();
    h.doc.header.set('$DIMCEN', 2.5);
    h.doc.header.set('$DIMSCALE', 1);
    const c0 = circle(10, 5, 4, NEG_Z) as CircleEntity;
    c0.center.z = 3;
    const c = h.add(c0);
    await h.run('DIMCENTER', [{ pick: c.handle, at: [-14, 5] }]);
    const ls = modelEntities(h.doc, 'LINE');
    expect(ls).toHaveLength(2);
    expect([...xy(ls[0]!.start), ...xy(ls[0]!.end)]).toEqual([-12.5, 5, -7.5, 5]);
    expect([...xy(ls[1]!.start), ...xy(ls[1]!.end)]).toEqual([-10, 2.5, -10, 7.5]);
    expect(ls.every((l: LineEntity) => l.start.z === -3 && l.end.z === -3)).toBe(true);
  });
});

describe('+Z 원·호는 전과 같은 값', () => {
  it('돌출 방향이 없거나 (0, 0, 1)인 원·호: 반지름·지름·호 길이 치수와 중심 표식', async () => {
    const h = harness();
    h.doc.header.set('$DIMCEN', 2.5);
    h.doc.header.set('$DIMSCALE', 1);
    const c1 = h.add(circle(10, 5, 4));
    await h.run('DIMRADIUS', [{ pick: c1.handle, at: [14, 5] }, '20,5']);
    let d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([10, 5]);
    expect(xy(d.defPoint4)).toEqual([14, 5]);
    const c2 = h.add(circle(30, 5, 4, { x: 0, y: 0, z: 1 }));
    await h.run('DIMDIAMETER', [{ pick: c2.handle, at: [34, 5] }, '40,5']);
    d = lastDim(h);
    expect(xy(d.defPoint4)).toEqual([34, 5]);
    expect(xy(d.defPoint)).toEqual([26, 5]);
    const a = h.add(arc(10, 25, 4, 0, 90));
    await h.run('DIMARC', [{ pick: a.handle, at: [12.828, 27.828] }, '14,29']);
    d = lastDim(h);
    expect(xy(d.defPoint2)).toEqual([14, 25]);
    expect(xy(d.defPoint3)).toEqual([10, 29]);
    expect(d.arc!.startAngle).toBe(0);
    expect(d.arc!.endAngle).toBe(Math.PI / 2);
    const c3 = circle(50, 5, 4) as CircleEntity;
    c3.center.z = 3;
    const c3h = h.add(c3);
    await h.run('DIMCENTER', [{ pick: c3h.handle, at: [54, 5] }]);
    const ls = modelEntities(h.doc, 'LINE');
    expect(ls).toHaveLength(2);
    expect([...xy(ls[0]!.start), ...xy(ls[0]!.end)]).toEqual([47.5, 5, 52.5, 5]);
    expect(ls.every((l: LineEntity) => l.start.z === 3 && l.end.z === 3)).toBe(true);
  });
});
