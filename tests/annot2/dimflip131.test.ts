/**
 * 131차: 화살표 반전 명령 AIDIMFLIPARROW(AutoCAD 도움말 "To Flip the Direction of an Arrowhead" — 뒤집을 화살표 가까이에서 치수를 고르고
 * 오른쪽 클릭 → 화살표 반전), 바로 가기 메뉴·다기능 그립 메뉴, 명령 취소, R2018 DWG·DXF 저장 왕복.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, FaceEntity, LineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import type { App } from '../../src/app/app';
import type { ContextMenuProvider } from '../../src/app/hooks';
import { registerDimFlip } from '../../src/app/dimflip';
import { gripOptions } from '../../src/app/gripmenu';
import { createAlignedDimension, createAngularDimension, createLinearDimension } from '../../src/edit/dim';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { writeDxf } from '../../src/io/dxf/writer';
import { readCadFile } from '../../src/io/index';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** 치수 블록에서 끝이 (x, y)인 SOLID 화살촉의 몸통 쪽 x 부호(가로 치수용) */
function bodyAt(doc: CadDocument, d: DimensionEntity, x: number): number {
  const s = doc.blocks.get(tableKey(d.block))!.entities.find((e): e is FaceEntity => e.type === 'SOLID' && Math.abs(e.points[2].x - x) < 1e-9)!;
  return Math.sign((s.points[0].x + s.points[1].x) / 2 - x);
}

function setup() {
  const providers: ContextMenuProvider[] = [];
  const ran: [string, string | undefined][] = [];
  const h = makeHarness((doc) => {
    doc.header.set('$DIMSTYLE', 'Standard');
  });
  Object.assign(h.app, { contextMenuProviders: providers, run: async (name: string, arg?: string) => void ran.push([name, arg]) });
  registerDimFlip(h.app as App);
  // 가로 치수: 첫 보조선 (0,0) → 둘째 (40,0), 치수선 y = 10, 화살촉 안쪽
  const dim = h.add(createLinearDimension(h.doc, V(0, 0), V(40, 0), V(20, 10))) as DimensionEntity;
  // 다른 명령처럼 블록부터 만든다(확정 한 번)
  return { h, providers, ran, dim };
}

const get = (h: ReturnType<typeof makeHarness>, handle: string) => h.doc.entityIndex.get(handle) as DimensionEntity;

describe('화살표 반전 명령(131차)', () => {
  it('고른 점에 가까운 화살표를 뒤집고 블록을 다시 만든다 — 다시 부르면 되돌아가고, 명령 취소 한 단계', async () => {
    const { h, dim } = setup();
    // 명령마다 다른 편집 묶음(진짜 명령행처럼 — 명령 취소가 명령 하나씩 되돌린다)
    await runWith(h, 'AIDIMFLIPARROW', [{ pick: dim.handle, at: [3, 10] }], 1);
    let d = get(h, dim.handle);
    expect([d.flipArrow1, d.flipArrow2]).toEqual([true, undefined]);
    // 첫 화살촉(끝 x = 0)의 몸통이 밖(−x), 둘째(x = 40)는 안(−x)
    expect(bodyAt(h.doc, d, 0)).toBe(-1);
    expect(bodyAt(h.doc, d, 40)).toBe(-1);
    await runWith(h, 'AIDIMFLIPARROW', [{ pick: dim.handle, at: [38, 11] }], 2);
    d = get(h, dim.handle);
    expect([d.flipArrow1, d.flipArrow2]).toEqual([true, true]);
    expect(bodyAt(h.doc, d, 40)).toBe(1);
    // 같은 화살표에 다시: 깃발을 지운다(켠 것만 둔다)
    await runWith(h, 'AIDIMFLIPARROW', [{ pick: dim.handle, at: [1, 9] }], 3);
    d = get(h, dim.handle);
    expect('flipArrow1' in d).toBe(false);
    expect(bodyAt(h.doc, d, 0)).toBe(1);
    h.st.session.undo();
    d = get(h, dim.handle);
    expect([d.flipArrow1, d.flipArrow2]).toEqual([true, true]);
    expect(bodyAt(h.doc, d, 0)).toBe(-1);
  });

  it('치수가 아닌 객체는 다시 묻고, 반전해 그리지 못하는 치수(각도 — 정렬 치수는 150차부터 받는다)는 알리고 그대로 둔다', async () => {
    const { h } = setup();
    const an = h.add(createAngularDimension(h.doc, V(0, 50), V(30, 50), V(0, 80), V(20, 70))) as DimensionEntity;
    const ln = h.add({ ...entityDefaults(), type: 'LINE', handle: '', start: V(0, -20), end: V(10, -20) } as LineEntity);
    const before = structuredClone(get(h, an.handle));
    await h.run('AIDIMFLIPARROW', [
      { pick: ln.handle, at: [5, -20] },
      { pick: an.handle, at: [20, 70] },
    ]);
    expect(h.printed).toEqual(['치수가 아닙니다.', '회전 선형·정렬 치수의 닫고 채운 화살촉만 반전할 수 있습니다.']);
    expect(get(h, an.handle)).toEqual(before);
  });

  it('바로 가기 메뉴: 치수 하나를 고르고 누른 자리 가까운 화살표 — 명령에 그 자리를 넘긴다', async () => {
    const { h, providers, ran, dim } = setup();
    const p = providers.find((x) => x.name === 'dim-flip-arrow')!;
    const items = p.items({ mode: 'edit', selection: [dim.handle], point: { x: 39, y: 10 }, st: h.st })!;
    expect(items.map((i) => i.label)).toEqual(['화살표 반전']);
    expect(p.items({ mode: 'default', selection: [], point: { x: 39, y: 10 }, st: h.st })).toBeNull();
    items[0]!.run!();
    expect(ran).toEqual([['AIDIMFLIPARROW', '39,10']]);
    // 명령은 고른 치수와 넘긴 자리로 묻지 않고 뒤집는다
    h.st.selection.add(dim.handle);
    await h.run('AIDIMFLIPARROW', [], ran[0]![1]);
    expect(get(h, dim.handle).flipArrow2).toBe(true);
    expect(get(h, dim.handle).flipArrow1).toBeUndefined();
  });

  it('다기능 그립 메뉴: 치수선 끝 그립(둘째 화살표)에 화살표 반전', () => {
    const { h, dim } = setup();
    const d = get(h, dim.handle);
    const opts = gripOptions(h.app as App, { handle: d.handle, id: 'defPoint', point: { x: 40, y: 10 } }, d, h.st);
    expect(opts.map((o) => o.key)).toEqual(['ST', 'CO', 'BA', 'FL']);
    const r = opts[3]!.apply!();
    expect((r.replace![0] as DimensionEntity).flipArrow2).toBe(true);
    // 정렬 치수도 반전을 그린다(150차). 눈금 화살촉은 반전 없이 그려 메뉴가 없다
    const al = createAlignedDimension(h.doc, V(0, 50), V(30, 70), V(-5, 75));
    expect(gripOptions(h.app as App, { handle: 'X', id: 'defPoint', point: { x: 0, y: 0 } }, al, h.st).map((o) => o.key)).toEqual(['ST', 'CO', 'BA', 'FL']);
    al.overrides = { 142: 0.1 };
    expect(gripOptions(h.app as App, { handle: 'X', id: 'defPoint', point: { x: 0, y: 0 } }, al, h.st).map((o) => o.key)).toEqual(['ST', 'CO', 'BA']);
  });

  it('R2018 DWG·DXF로 저장해 다시 읽으면 반전 깃발과 반전한 그림 블록이 그대로', async () => {
    const { h, dim } = setup();
    await h.run('AIDIMFLIPARROW', [{ pick: dim.handle, at: [2, 10] }]);
    const d0 = get(h, dim.handle);
    const block = h.doc.blocks.get(tableKey(d0.block))!.entities.filter((e) => e.type === 'LINE' || e.type === 'SOLID').length;
    for (const [name, data] of [
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      const ds = back.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
      expect(ds, name).toHaveLength(1);
      const d = ds[0]!;
      expect([d.flipArrow1, d.flipArrow2], name).toEqual([true, undefined]);
      expect(bodyAt(back, d, 0), name).toBe(-1);
      expect(bodyAt(back, d, 40), name).toBe(-1);
      expect(back.blocks.get(tableKey(d.block))!.entities.filter((e) => e.type === 'LINE' || e.type === 'SOLID').length, name).toBe(block);
    }
  });
});
