/**
 * 가져온 도면 정리(AutoCAD와 같게):
 * - PEDIT 다중(M) 결합의 퍼지 거리와 결합 유형(연장·추가·모두)
 * - JOIN: 호·타원형 호 하나를 닫기(L)로 원·타원
 * - TRIM·EXTEND: 문자(글자 상자)를 절단·경계 모서리로
 * - FILLET: 폴리선과 선·호를 모깎기하면 하나의 폴리선
 */
import { describe, expect, it } from 'vitest';
import type { Entity, LineEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { lwPoints } from '../../src/core/lwpoly';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { registerPeditCommands } from '../../src/app/modify2-pedit';
import { fillet } from '../../src/edit/geom/fillet';
import { fuzzJoinPrep } from '../../src/edit/geom/fuzzjoin';
import { trimEntity, extendEntity } from '../../src/edit/geom/trim';
import { arc as arc0, ellipse as ellipse0, line as line0, lw, mtext, text } from '../edit/make';
import { makeHarness } from '../cmds2/harness';
import { perCommandGroups } from './groups';

function harness() {
  const h = perCommandGroups(makeHarness());
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  registerPeditCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const ents = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities;
const pts = (e: Entity) => lwPoints(e as LwPolylineEntity).map((p) => [+p.x.toFixed(9), +p.y.toFixed(9)]);

describe('PEDIT 다중 결합의 퍼지 거리', () => {
  const setup = (h: H) => {
    const a = h.add(lw([[0, 0], [10, 0]]));
    const b = h.add(lw([[10.3, 0.3], [10.3, 10]]));
    return [a.handle, b.handle];
  };
  it('연장(기본): 끝 세그먼트를 늘여 만나는 점에서 하나로', async () => {
    const h = harness();
    const hs = setup(h);
    await h.run('PEDIT', ['M', { sel: hs }, 'J', '1', '']);
    expect(h.printed).toContain('결합 유형 = 연장');
    expect(ents(h).length).toBe(1);
    expect(pts(ents(h)[0]!)).toEqual([
      [0, 0],
      [10.3, 0],
      [10.3, 10],
    ]);
  });
  it('추가: 틈에 직선 세그먼트를 더한다', async () => {
    const h = harness();
    const hs = setup(h);
    await h.run('PEDIT', ['M', { sel: hs }, 'J', 'J', 'A', '1', '']);
    expect(ents(h).length).toBe(1);
    expect(pts(ents(h)[0]!)).toEqual([
      [0, 0],
      [10, 0],
      [10.3, 0.3],
      [10.3, 10],
    ]);
  });
  it('퍼지 거리보다 먼 틈은 잇지 않는다(0이면 닿은 것만)', async () => {
    const h = harness();
    const hs = setup(h);
    await h.run('PEDIT', ['M', { sel: hs }, 'J', '0.1', '']);
    expect(ents(h).length).toBe(2);
  });
  it('모두: 끝이 호라 늘일 수 없으면 선을 더한다', () => {
    const a = lw([[0, 0], [10, 0, 0.5], [12, 2]]) as LwPolylineEntity;
    const b = lw([[12.5, 2.5], [12.5, 10]]) as LwPolylineEntity;
    const r = fuzzJoinPrep([a, b], 1, 'B');
    expect(r.bridges.length).toBe(1);
    expect(fuzzJoinPrep([a, b], 1, 'E').joined).toBe(0);
  });
  it('한 직선 위에서 마주 보는 끝은 연장으로 잇는다', () => {
    const a = lw([[0, 0], [10, 0]]) as LwPolylineEntity;
    const b = lw([[10.5, 0], [20, 0]]) as LwPolylineEntity;
    const r = fuzzJoinPrep([a, b], 1, 'E');
    expect(r.joined).toBe(1);
    expect(pts(r.polys[0]!)).toEqual([
      [0, 0],
      [10.5, 0],
    ]);
  });
});

describe('JOIN 닫기', () => {
  it('호 하나를 닫으면 같은 중심·반지름의 원', async () => {
    const h = harness();
    const a = h.add(arc0(5, 5, 3, 0, 90));
    await h.run('JOIN', [{ sel: [a.handle] }, 'L']);
    const all = ents(h);
    expect(all.length).toBe(1);
    expect(all[0]!.type).toBe('CIRCLE');
    expect(all[0]).toMatchObject({ center: { x: 5, y: 5 }, radius: 3 });
    expect(h.printed).toContain('호가 원으로 변환되었습니다.');
  });
  it('타원형 호 하나를 닫으면 온 타원(같은 객체를 고친다 — 핸들이 그대로라 연관·그룹이 끊기지 않는다)', async () => {
    const h = harness();
    const e = h.add(ellipse0(0, 0, 10, 0, 0.5, 0, Math.PI));
    await h.run('JOIN', [{ sel: [e.handle] }, 'L']);
    const all = ents(h);
    expect(all.length).toBe(1);
    expect(all[0]).toMatchObject({ type: 'ELLIPSE', startParam: 0, handle: e.handle });
    expect((all[0] as { endParam: number }).endParam).toBeCloseTo(2 * Math.PI, 12);
    h.st.session.undo();
    expect(ents(h)[0]).toMatchObject({ handle: e.handle, endParam: Math.PI });
  });
  it('호 하나 다음에 같은 원 위의 호를 고르면 결합한다', async () => {
    const h = harness();
    const a = h.add(arc0(0, 0, 5, 0, 90));
    const b = h.add(arc0(0, 0, 5, 90, 180));
    await h.run('JOIN', [{ sel: [a.handle] }, { sel: [b.handle] }]);
    const all = ents(h);
    expect(all.length).toBe(1);
    expect(all[0]!.type).toBe('ARC');
  });
});

describe('문자를 절단·경계 모서리로', () => {
  it('TRIM: 선이 문자 상자에서 잘린다', () => {
    const h = harness();
    const t = h.add(text(4, -1, 'ABC', 2));
    const l = h.add(line0(0, 0, 20, 0));
    const r = trimEntity(l, [t], { x: 15, y: 0 }, { doc: h.doc });
    const out = r.replace?.[0] as LineEntity;
    expect(out).toBeTruthy();
    // 남는 쪽은 0에서 문자 상자 오른쪽 끝까지(문자 폭은 0보다 크다)
    expect(out.start.x).toBe(0);
    expect(out.end.x).toBeGreaterThan(4);
    expect(out.end.x).toBeLessThan(15);
  });
  it('EXTEND: 선이 여러 줄 문자 상자까지 늘어난다', () => {
    const h = harness();
    const m = h.add(mtext(10, 5, 'HELLO', 2));
    const l = h.add(line0(0, 4, 5, 4));
    const r = extendEntity(l, [m], { x: 4.5, y: 4 }, { doc: h.doc });
    const out = r.replace?.[0] as LineEntity;
    expect(out).toBeTruthy();
    expect(out.end.x).toBeCloseTo(10, 6);
  });
  it('빠른 TRIM 명령도 문자를 경계로 본다', async () => {
    const h = harness();
    h.add(text(4, -1, 'ABC', 2));
    const l = h.add(line0(0, 0, 20, 0));
    await h.run('TRIM', [{ pick: l.handle, at: [15, 0] }, '']);
    const out = h.doc.entityIndex.get(l.handle) as LineEntity;
    expect(out.end.x).toBeLessThan(15);
  });
});

describe('FILLET 폴리선과 선', () => {
  it('모깎기 호와 선이 폴리선에 결합된다', () => {
    const pl = lw([[0, 0], [10, 0]]);
    pl.handle = 'A1';
    const ln = line0(12, 2, 12, 10);
    ln.handle = 'A2';
    const r = fillet(pl, { x: 5, y: 0 }, ln, { x: 12, y: 5 }, 1);
    expect(r.add ?? []).toEqual([]);
    expect(r.remove).toEqual(['A2']);
    expect(r.replace?.length).toBe(1);
    const out = r.replace![0] as LwPolylineEntity;
    expect(out.handle).toBe('A1');
    const p = lwPoints(out);
    expect(p.length).toBe(4);
    expect([p[0]!.x, p[0]!.y]).toEqual([0, 0]);
    expect(p[3]!.x).toBeCloseTo(12, 9);
    expect(p[3]!.y).toBeCloseTo(10, 9);
  });
  it('선과 선은 지금처럼 따로 남는다', () => {
    const a = line0(0, 0, 10, 0);
    a.handle = 'B1';
    const b = line0(12, 2, 12, 10);
    b.handle = 'B2';
    const r = fillet(a, { x: 5, y: 0 }, b, { x: 12, y: 5 }, 1);
    expect(r.add?.length).toBe(1);
    expect(r.replace?.length).toBe(2);
  });
});
