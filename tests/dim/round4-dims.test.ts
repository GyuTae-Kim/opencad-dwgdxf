/**
 * AutoCAD 치수 옵션:
 * - 하위 치수 스타일(이름$2 각도, $4 반지름 …): 그 종류의 치수는 하위 스타일 값으로 그린다
 * - DIMANGULAR 사분점(Q): 재는 각도를 사분면에 묶고, 바깥에 둔 문자까지 치수 호를 늘인다
 * - DIMARC 지시선(L): 90°보다 큰 호에서 치수 호 → 재는 호로 지시선
 * - 각도 치수의 DIMCONTINUE·DIMBASELINE
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, DimensionEntity, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createAngularDimension, createLinearDimension, generateDimensionGeometry, rawDimVars } from '../../src/edit/dim';
import { childStyleSuffix } from '../../src/edit/dim/vars';
import { angularSpan } from '../../src/edit/dim/angular';
import { registerDimCommands } from '../../src/app/dimcmds';
import { dimStyleRenameOps } from '../../src/app/dimstyle';
import { ISO25, makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { arc as arc0, line as line0 } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });
const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** ARC가 각도 a(라디안)를 지나는가 */
const covers = (e: ArcEntity, a: number) => norm(a - e.startAngle) <= norm(e.endAngle - e.startAngle) + 1e-9;

describe('하위 치수 스타일', () => {
  const doc = () => makeDoc({ 'ISO-25$2': { ...ISO25, DIMTXT: 5 }, 'ISO-25$4': { ...ISO25, DIMTXT: 7 } });
  it('종류 → 접미사', () => {
    expect(childStyleSuffix({ dimType: 0 })).toBe('0');
    expect(childStyleSuffix({ dimType: 1 })).toBe('0');
    expect(childStyleSuffix({ dimType: 2 })).toBe('2');
    expect(childStyleSuffix({ dimType: 5 })).toBe('2');
    expect(childStyleSuffix({ dimType: 3 })).toBe('3');
    expect(childStyleSuffix({ dimType: 4 })).toBe('4');
    expect(childStyleSuffix({ dimType: 6 | 64 })).toBe('6');
    expect(childStyleSuffix({ dimType: 5, subtype: 'ARC_DIMENSION' })).toBeNull();
    expect(childStyleSuffix({ subtype: 'LEADER' })).toBe('7');
  });
  it('각도 치수는 부모 이름을 가리켜도 $2 값으로, 선형 치수는 부모 값으로', () => {
    const d = doc();
    const ang = createAngularDimension(d, V(0, 0), V(10, 0), V(0, 10), V(5, 5), { style: 'ISO-25' });
    expect(ang.dimStyle).toBe('ISO-25');
    expect(rawDimVars(d, ang).DIMTXT).toBe(5);
    const lin = createLinearDimension(d, V(0, 0), V(10, 0), V(5, 5), { style: 'ISO-25' });
    expect(rawDimVars(d, lin).DIMTXT).toBe(2.5);
  });
  it('부모 이름을 바꾸면 하위 스타일도 따라간다', () => {
    const h = makeHarness((d0) => Object.assign(d0, doc()));
    const ops = dimStyleRenameOps(h.st, 'ISO-25', 'MY');
    h.st.session.commit({ label: 'RENAME', ops });
    expect(h.doc.dimStyles.has('MY')).toBe(true);
    expect(h.doc.dimStyles.get('MY$2')?.name).toBe('MY$2');
    expect(h.doc.dimStyles.has('ISO-25$2')).toBe(false);
  });
});

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  return h;
}
const lastDim = (h: ReturnType<typeof harness>) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'DIMENSION').at(-1) as DimensionEntity;

describe('DIMANGULAR 사분점(Q)', () => {
  it('사분점을 고른 뒤 다른 사분면에 놓으면 고른 사분면의 각을 재고 문자를 그 자리에', async () => {
    const h = harness();
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(0, 0, 0, 10));
    await h.run('DIMANGULAR', [{ pick: a.handle, at: [5, 0] }, { pick: b.handle, at: [0, 5] }, 'Q', '3,3', '-5,-5']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(2);
    expect(d.defPoint5!.x).toBeCloseTo(5, 9);
    expect(d.defPoint5!.y).toBeCloseTo(5, 9);
    expect(d.dimType & 128).toBe(128);
    expect([d.textMid.x, d.textMid.y]).toEqual([-5, -5]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
  });
  it('사분점 없이는 놓은 자리의 사분면을 잰다', async () => {
    const h = harness();
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(0, 0, 0, 10));
    await h.run('DIMANGULAR', [{ pick: a.handle, at: [5, 0] }, { pick: b.handle, at: [0, 5] }, '-5,-5']);
    const d = lastDim(h);
    expect(d.dimType & 128).toBe(0);
    expect(d.defPoint5!.x).toBeCloseTo(-5, 9);
  });
  it('문자가 시작 변 앞이면 치수 호를 시작 쪽으로 늘인다', () => {
    const doc = makeDoc();
    const d = createAngularDimension(doc, V(0, 0), V(10, 0), V(0, 10), V(5, 5), { style: 'ISO-25' });
    const R = Math.hypot(5, 5);
    const ta = -75 * (Math.PI / 180);
    d.textMid = V(R * Math.cos(ta), R * Math.sin(ta));
    d.dimType |= 128;
    const g = generateDimensionGeometry(doc, d);
    const arcs = g.entities.filter((e): e is ArcEntity => e.type === 'ARC' && Math.abs(e.radius - R) < 1e-6);
    // 0°에서 시작 쪽(시계)으로 문자 가까이(바깥 화살촉의 기본 꼬리 −41°보다 멀리) 늘어난 호가 있다
    expect(arcs.some((e) => covers(e, -60 * (Math.PI / 180)))).toBe(true);
    // 끝 쪽은 바깥 화살촉 꼬리(약 131°)까지만
    expect(arcs.some((e) => covers(e, 150 * (Math.PI / 180)))).toBe(false);
  });
});

describe('DIMARC 지시선(L)', () => {
  it('90°보다 큰 호: 지시선 끝점이 재는 호와 치수 호 위에 반지름 방향으로', async () => {
    const h = harness();
    const a = h.add(arc0(0, 0, 10, 0, 180));
    await h.run('DIMARC', [{ pick: a.handle, at: [0, 10] }, 'L', '0,15']);
    const d = lastDim(h);
    expect(d.subtype).toBe('ARC_DIMENSION');
    expect(d.arc!.leader1!.x).toBeCloseTo(0, 9);
    expect(d.arc!.leader1!.y).toBeCloseTo(10, 9);
    expect(d.arc!.leader2!.y).toBeCloseTo(15, 9);
    const g = generateDimensionGeometry(h.doc, d);
    const lines = g.entities.filter((e): e is LineEntity => e.type === 'LINE');
    expect(lines.some((l) => Math.abs(l.start.x) < 1e-6 && Math.abs(l.start.y - 15) < 1e-6 && l.end.y < 15 && l.end.y >= 10 - 1e-9)).toBe(true);
    expect(h.prompts.some((p) => p.includes('지시선 없음(N)'))).toBe(true);
  });
  it('90° 이하인 호에는 지시선 옵션이 없다', async () => {
    const h = harness();
    const a = h.add(arc0(0, 0, 10, 0, 60));
    await h.run('DIMARC', [{ pick: a.handle, at: [8.66, 5] }, '12,8']);
    expect(h.prompts.some((p) => p.includes('지시선(L)'))).toBe(false);
    expect(lastDim(h).arc!.leader1).toBeUndefined();
  });
});

describe('각도 치수 연속·기준선', () => {
  const setup = (h: ReturnType<typeof harness>) => {
    const d = createAngularDimension(h.doc, V(0, 0), V(10, 0), V(10, 10), V(8 * Math.cos(Math.PI / 8), 8 * Math.sin(Math.PI / 8)), { style: 'ISO-25' });
    return h.add(d as Entity) as DimensionEntity;
  };
  it('DIMCONTINUE: 앞 치수의 둘째 변부터 같은 반지름으로', async () => {
    const h = harness();
    setup(h);
    await h.run('DIMCONTINUE', ['0,10', '']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(5);
    expect([d.defPoint2.x, d.defPoint2.y]).toEqual([10, 10]);
    const sp = angularSpan(d)!;
    expect(sp.sweep).toBeCloseTo(Math.PI / 4, 9);
    expect(sp.R).toBeCloseTo(8, 9);
    expect(sp.start).toBeCloseTo(Math.PI / 4, 9);
  });
  it('DIMBASELINE: 기준 치수의 첫 변부터 DIMDLI만큼 바깥에, 다음은 또 한 칸', async () => {
    const h = harness();
    setup(h);
    await h.run('DIMBASELINE', ['0,10', '-10,0', '']);
    const ds = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
    expect(ds.length).toBe(3);
    const s1 = angularSpan(ds[1]!)!;
    const s2 = angularSpan(ds[2]!)!;
    expect(s1.start).toBeCloseTo(0, 9);
    expect(s1.sweep).toBeCloseTo(Math.PI / 2, 9);
    expect(s1.R).toBeCloseTo(8 + 3.75, 9);
    expect(s2.sweep).toBeCloseTo(Math.PI, 9);
    expect(s2.R).toBeCloseTo(8 + 7.5, 9);
  });
});
