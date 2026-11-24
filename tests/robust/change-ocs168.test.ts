/**
 * 168차: CHANGE 변경점으로 돌출 방향이 −Z인 한 줄 문자·속성 정의를 옮기거나 원의 반지름을 바꿀 때 찍은 점을 객체 OCS로 옮겨 쓰는지.
 * Autodesk CHANGE 도움말(변경점): 문자는 "새 문자 삽입점 — 문자를 옮긴다", 원은 "원의 반지름을 바꾼다",
 * 그리고 두께 0인 선 말고는 고른 객체가 현재 UCS와 평행해야 한다(−Z 문자·원도 WCS XY와 평행하다 — 바꿀 대상이다).
 * 전에는 찍은 점(WCS 평면도)을 OCS 삽입점에 그대로 넣어 −Z 문자가 찍은 점의 거울상 X 자리로 갔고,
 * −Z 원은 OCS 중심과 찍은 점 사이로 반지름을 재어 원이 찍은 점을 지나지 않았다(이 앱의 +Z 규칙 — 찍은 점까지의 거리 — 과 다름).
 * 돌출 방향이 +Z인 문자·맞춘 문자·원은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, CircleEntity, Entity, TextEntity } from '../../src/core/model';
import { registerPropCommands } from '../../src/app/propcmds';
import { ocsToWcs } from '../../src/edit/geom/ocs';
import { NEG_Z, P, circle, text } from '../edit/make';
import { makeHarness, modelEntities } from '../cmds2/harness';

function harness() {
  const h = makeHarness();
  registerPropCommands(h.app);
  return h;
}

/** 소수 9자리로 맞춘 좌표(−0은 0으로) */
const xy = (a: { x: number; y: number }) => [+a.x.toFixed(9) + 0, +a.y.toFixed(9) + 0];
const wxy = (a: { x: number; y: number; z: number }) => xy(ocsToWcs(a, NEG_Z));

describe('CHANGE 변경점의 −Z 한 줄 문자·원(168차)', () => {
  it('−Z 한 줄 문자는 찍은 점에 놓인다(전에는 거울상 X 자리)', async () => {
    const h = harness();
    // OCS (−3,1) = WCS (3,1)
    const t = h.add({ ...text(-3, 1, 'A', 1, 0, { extrusion: NEG_Z }), handle: '' });
    await h.run('CHANGE', [{ sel: [t.handle] }, '10,5', '', '', '']);
    const r = modelEntities(h.doc, 'TEXT')[0] as TextEntity;
    expect(wxy(r.insert)).toEqual([10, 5]);
    expect(r.insert.z).toBe(0);
    expect(r.extrusion).toEqual(NEG_Z);
    expect(r.text).toBe('A');
    // 명령 취소 한 번으로 돌아온다
    h.st.session.undo();
    expect(wxy((modelEntities(h.doc, 'TEXT')[0] as TextEntity).insert)).toEqual([3, 1]);
  });

  it('−Z 맞춘 문자는 맞춤점도 WCS에서 같은 만큼 옮겨진다', async () => {
    const h = harness();
    // 가운데 맞춤: 첫 정렬점 OCS (−3,1) = WCS (3,1), 맞춤점 OCS (−5,1) = WCS (5,1)
    const t = h.add({ ...text(-3, 1, 'A', 1, 0, { extrusion: NEG_Z, halign: 1, alignPoint: P(-5, 1) }), handle: '' });
    await h.run('CHANGE', [{ sel: [t.handle] }, '10,5', '', '', '']);
    const r = modelEntities(h.doc, 'TEXT')[0] as TextEntity;
    expect(wxy(r.insert)).toEqual([10, 5]);
    // WCS에서 (7,4)만큼 — 맞춤점 (5,1) → (12,5)
    expect(wxy(r.alignPoint!)).toEqual([12, 5]);
  });

  it('블록 밖의 −Z 속성 정의도 찍은 점에 놓인다', async () => {
    const h = harness();
    const d = h.add({ ...(text(-2, -1, 'DEF', 1, 0, { extrusion: NEG_Z }) as TextEntity), type: 'ATTDEF', handle: '', tag: 'T', prompt: 'P', attFlags: 0 } as AttribEntity as Entity);
    await h.run('CHANGE', [{ sel: [d.handle] }, '4,4', '', '', '']);
    const r = modelEntities(h.doc, 'ATTDEF')[0] as AttribEntity;
    expect(wxy(r.insert)).toEqual([4, 4]);
  });

  it('−Z 원은 찍은 점까지의 거리로 반지름이 바뀐다(원이 찍은 점을 지난다)', async () => {
    const h = harness();
    // OCS 중심 (−10,0) = WCS (10,0)
    const c = h.add({ ...circle(-10, 0, 1, NEG_Z), handle: '' });
    await h.run('CHANGE', [{ sel: [c.handle] }, '12,0']);
    let r = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(r.radius).toBeCloseTo(2, 12);
    expect(wxy(r.center)).toEqual([10, 0]);
    await h.run('CHANGE', [{ sel: [c.handle] }, '10,3']);
    r = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(r.radius).toBeCloseTo(3, 12);
  });

  it('+Z 문자·맞춘 문자·원은 전과 같다', async () => {
    const h = harness();
    const t = h.add({ ...text(2, 1, 'A', 1), handle: '' });
    const j = h.add({ ...text(1, 0, 'B', 1, 0, { halign: 1, alignPoint: P(2, 0) }), handle: '' });
    const c = h.add({ ...circle(0, 0, 1), handle: '' });
    await h.run('CHANGE', [{ sel: [t.handle] }, '7,6', '', '', '']);
    await h.run('CHANGE', [{ sel: [j.handle] }, '5,5', '', '', '']);
    await h.run('CHANGE', [{ sel: [c.handle] }, '3,4']);
    const [rt, rj] = modelEntities(h.doc, 'TEXT') as TextEntity[];
    expect(rt!.insert).toEqual(P(7, 6));
    expect(rj!.insert).toEqual(P(5, 5));
    expect(rj!.alignPoint).toEqual(P(6, 5));
    expect((modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity).radius).toBe(5);
  });
});
