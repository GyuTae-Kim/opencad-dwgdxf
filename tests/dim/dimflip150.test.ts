/**
 * 150차: 정렬 치수(종류 1)의 화살표 반전(DXF 74·75 — AutoCAD "To Flip the Direction of an Arrowhead", AIDIMFLIPARROW)도 그린다.
 * 131차 규칙(실제 도면 3개의 AutoCAD 반전 블록에서 읽은 꼴 — 치수선 좌표·화살촉 길이 단위)은 회전 치수에서 읽었고, 정렬 치수는 반전 실물이 없어 반전 없이 그렸다.
 * 근거: 반전 깃발은 치수 공통 자료(R2007+ DWG 공통 비트·DXF AcDbDimension 73~75 — AutoCAD는 모든 치수에 적는다, 130차),
 * 132차 맞춤 규칙이 정렬 치수에도 그대로 맞았다(블록 같음 정렬 125 → 134, 같던 것이 달라진 치수 0 — AutoCAD가 두 종류를 같은 배치로 그린다),
 * 이 앱의 linear()는 두 종류를 치수선 방향 하나만 달리 그린다. 실제 도면 840개의 반전 치수 3개는 모두 회전 치수라 앞 차수 결과에서 바뀌는 치수는 없다.
 * 아래 시험은 정렬 치수와 같은 방향(회전 = 두 원점 방향)의 회전 치수가 반전까지 같은 그림인지, 반전을 받는 화살촉 조건이 회전과 같은지, 명령·메뉴가 정렬 치수를 받는지 본다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, Vec3 } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import type { App } from '../../src/app/app';
import type { ContextMenuProvider } from '../../src/app/hooks';
import { registerDimFlip } from '../../src/app/dimflip';
import { gripOptions } from '../../src/app/gripmenu';
import { createAlignedDimension, createAngularDimension, createLinearDimension, drawsFlippedArrow, generateDimensionGeometry } from '../../src/edit/dim';
import { createNewDocument } from '../../src/core/newdoc';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

const gen = (doc: CadDocument, d: DimensionEntity, f1: boolean, f2: boolean) => {
  const x = { ...d };
  delete x.flipArrow1;
  delete x.flipArrow2;
  if (f1) x.flipArrow1 = true;
  if (f2) x.flipArrow2 = true;
  return generateDimensionGeometry(doc, x).entities;
};
/** 그림 견주기: 수를 1e-6으로 반올림한 JSON */
const norm = (es: Entity[]) => JSON.stringify(es, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 + 0 : v));
const count = (es: Entity[], type: string) => es.filter((e) => e.type === type).length;

describe('정렬 치수의 화살표 반전(150차)', () => {
  it('정렬 치수의 반전 그림 = 같은 방향 회전 치수의 반전 그림(바깥·안쪽 화살촉, 하나·둘)', () => {
    const doc = createNewDocument('metric');
    // 두 원점 방향 (0.6, 0.8) — 바깥 화살촉(보조선 사이 4 < 화살촉 둘)과 안쪽 화살촉(40)
    for (const [p2, at] of [
      [V(2.4, 3.2), V(-1.6, 6.2)],
      [V(24, 32), V(16, 38)],
    ] as const) {
      const al = createAlignedDimension(doc, V(0, 0), p2, at);
      const ro = createLinearDimension(doc, V(0, 0), p2, at, { rotation: Math.atan2(p2.y, p2.x) });
      expect(al.dimType & 7).toBe(1);
      expect(ro.dimType & 7).toBe(0);
      // 반전하지 않은 그림부터 같다(같은 치수선·보조선·문자)
      expect(norm(gen(doc, al, false, false))).toBe(norm(gen(doc, ro, false, false)));
      for (const [f1, f2] of [
        [true, false],
        [false, true],
        [true, true],
      ] as const) {
        const on = gen(doc, al, f1, f2);
        expect(norm(on), `${p2.x} ${f1} ${f2}`).toBe(norm(gen(doc, ro, f1, f2)));
        // 반전한 화살촉마다 선 둘(131차 꼴), 화살촉·문자 수는 그대로
        expect(count(on, 'LINE'), `${p2.x} ${f1} ${f2}`).toBe(count(gen(doc, al, false, false), 'LINE') + 2 * (Number(f1) + Number(f2)));
        expect(count(on, 'SOLID')).toBe(2);
      }
    }
  });

  it('반전을 받는 화살촉은 회전 치수와 같은 조건 — 닫고 채운 화살촉만, 블록·눈금 화살촉과 숨긴 반쪽·각도 치수는 그대로', () => {
    const doc = createNewDocument('metric');
    const al = () => createAlignedDimension(doc, V(0, 0), V(24, 32), V(16, 38));
    const solid = al();
    expect([drawsFlippedArrow(doc, solid, 1), drawsFlippedArrow(doc, solid, 2)]).toEqual([true, true]);
    const same = (d: DimensionEntity) => expect(norm(gen(doc, d, true, true))).toBe(norm(gen(doc, d, false, false)));
    const open = al();
    open.overrides = { 5: '_Open' };
    expect(drawsFlippedArrow(doc, open, 1)).toBe(false);
    same(open);
    const tick = al();
    tick.overrides = { 142: 1 };
    expect(drawsFlippedArrow(doc, tick, 2)).toBe(false);
    same(tick);
    const half = al();
    half.overrides = { 281: 1 };
    expect([drawsFlippedArrow(doc, half, 1), drawsFlippedArrow(doc, half, 2)]).toEqual([false, true]);
    const ang = createAngularDimension(doc, V(0, 0), V(30, 0), V(0, 30), V(20, 20));
    expect(drawsFlippedArrow(doc, ang, 1)).toBe(false);
    same(ang);
  });

  it('명령·바로 가기 메뉴·그립 메뉴가 정렬 치수를 받는다(가까운 화살표, 블록을 다시 만듦, 명령 취소 한 단계)', async () => {
    const providers: ContextMenuProvider[] = [];
    const ran: [string, string | undefined][] = [];
    const h = makeHarness((doc) => {
      doc.header.set('$DIMSTYLE', 'Standard');
    });
    Object.assign(h.app, { contextMenuProviders: providers, run: async (name: string, arg?: string) => void ran.push([name, arg]) });
    registerDimFlip(h.app as App);
    // 첫 원점 (0,50) → 둘째 (30,70), 화살촉 안쪽 — 치수선 발은 약 (−13.1, 69.6)·(16.9, 89.6)
    const al = h.add(createAlignedDimension(h.doc, V(0, 50), V(30, 70), V(-5, 75))) as DimensionEntity;
    // h.add는 그림 블록을 만들지 않는다 — 반전 전 선 수는 생성기로, 명령 뒤에는 명령이 다시 만든 블록에서 센다
    const before = count(generateDimensionGeometry(h.doc, al).entities, 'LINE');
    await runWith(h, 'AIDIMFLIPARROW', [{ pick: al.handle, at: [-12, 69] }], 1);
    let d = h.doc.entityIndex.get(al.handle) as DimensionEntity;
    expect(h.printed).toEqual([]);
    expect([d.flipArrow1, d.flipArrow2]).toEqual([true, undefined]);
    expect(count(h.doc.blocks.get(tableKey(d.block))!.entities, 'LINE')).toBe(before + 2);
    h.st.session.undo();
    d = h.doc.entityIndex.get(al.handle) as DimensionEntity;
    expect('flipArrow1' in d).toBe(false);
    // 바로 가기 메뉴(둘째 화살표 가까이)와 치수선 끝 그립 메뉴(둘째 화살표)
    const p = providers.find((x) => x.name === 'dim-flip-arrow')!;
    expect(p.items({ mode: 'edit', selection: [al.handle], point: { x: 16, y: 89 }, st: h.st })!.map((i) => i.label)).toEqual(['화살표 반전']);
    const opts = gripOptions(h.app as App, { handle: d.handle, id: 'defPoint', point: d.defPoint }, d, h.st);
    expect(opts.map((o) => o.key)).toEqual(['ST', 'CO', 'BA', 'FL']);
    expect((opts[3]!.apply!().replace![0] as DimensionEntity).flipArrow2).toBe(true);
  });
});
