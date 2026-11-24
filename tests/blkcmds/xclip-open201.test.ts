/**
 * 201차: XCLIP 새 경계의 폴리선 선택(S)이 열린 경량 폴리선도 받는다.
 * 근거 — Autodesk XCLIP 도움말(2026) 「폴리선 선택」: 폴리선은 열려 있어도 되고, 직선 세그먼트로 이루어져야 하며, 자기 자신과 교차할 수 없다.
 * 자르기 경계는 늘 닫힌 다각형이라(점 둘 = 직사각형, 셋 이상 = 다각형) 열린 폴리선의 정점을 다각형(P) 옵션과 같은 꼴로 넘긴다 — 마지막 점에서 첫 점으로 닫힌다.
 * 끝점이 첫 점과 겹치면(닫음 표시 없이 첫 점으로 돌아와 그린 것) 그 점은 뺀다. 전에는 열린 폴리선을 「닫힌 폴리선을 선택하십시오.」로 거절했다.
 * 닫힌 폴리선의 결과는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, InsertEntity } from '../../src/core/model';
import { registerXclipCommands } from '../../src/app/xclip';
import { xclipBoundaryWorld, xclipParts } from '../../src/edit/xclip';
import { P, line, lw } from '../edit/make';
import { insert } from '../hatch/helpers';
import { makeHarness, modelEntities } from '../cmds2/harness';

function harness() {
  const h = makeHarness((doc) => {
    doc.blocks.set('B', {
      name: 'B',
      handle: 'F001',
      recordHandle: 'F002',
      basePoint: P(0, 0),
      flags: 0,
      entities: [
        { ...line(0, 0, 100, 0), handle: 'F003', owner: 'F002' },
        { ...line(0, 0, 0, 100), handle: 'F004', owner: 'F002' },
      ],
      endHandle: 'F005',
    });
    doc.blockRecords.set('B', { name: 'B', handle: 'F002', flags: 0, insertUnits: 0, explodable: true, scalable: true });
  });
  registerXclipCommands(h.app);
  const ins = h.add({ ...insert('B', 0, 0), handle: '' } as Entity) as InsertEntity;
  return { h, ins };
}
type H = ReturnType<typeof harness>['h'];

const boundary = (h: H) => {
  const e = modelEntities(h.doc, 'INSERT')[0]!;
  const pts = xclipBoundaryWorld(h.doc, e);
  return pts?.map((p) => [+p.x.toFixed(9) + 0, +p.y.toFixed(9) + 0]) ?? null;
};
/** 블록 참조 고르기 · 새 경계(Enter) · 폴리선 선택(S) · 그 폴리선 */
const pickInputs = (ins: InsertEntity, pl: Entity, ...rest: string[]) => [{ sel: [ins.handle] }, '', 'S', { pick: pl.handle, at: [0, 0] as [number, number] }, ...rest];

describe('XCLIP 폴리선 선택의 열린 폴리선(201차)', () => {
  it('열린 폴리선의 정점으로 자른다 — 마지막 점에서 첫 점으로 닫힌 다각형', async () => {
    const { h, ins } = harness();
    const pl = h.add(lw([[0, 0], [50, 0], [50, 40], [0, 40]], false));
    await h.run('XCLIP', pickInputs(ins, pl));
    expect(h.printed).not.toContain('닫힌 폴리선을 선택하십시오.');
    expect(boundary(h)).toEqual([[0, 0], [50, 0], [50, 40], [0, 40]]);
    // 폴리선은 그대로 남고, 명령 취소 한 번이면 경계가 없다
    expect(modelEntities(h.doc, 'LWPOLYLINE')).toHaveLength(1);
    h.st.session.undo();
    expect(xclipParts(h.doc, modelEntities(h.doc, 'INSERT')[0]!).filter).toBeNull();
  });

  it('닫음 표시 없이 첫 점으로 돌아온 열린 폴리선은 겹친 끝점을 빼고 같은 경계', async () => {
    const { h, ins } = harness();
    const pl = h.add(lw([[0, 0], [50, 0], [50, 40], [0, 40], [0, 0]], false));
    await h.run('XCLIP', pickInputs(ins, pl));
    expect(boundary(h)).toEqual([[0, 0], [50, 0], [50, 40], [0, 40]]);
  });

  it('점이 셋 아래인 열린 폴리선(겹친 끝점을 뺀 뒤 포함)은 전처럼 거절한다', async () => {
    for (const pts of [
      [[0, 0], [50, 0]],
      [[0, 0], [50, 0], [0, 0]],
    ] as [number, number][][]) {
      const { h, ins } = harness();
      const pl = h.add(lw(pts, false));
      // 거절 뒤 경계 프롬프트에 Enter(직사각형) · 첫 구석에 Enter = 그만둠
      await h.run('XCLIP', pickInputs(ins, pl, '', ''));
      expect(h.printed).toContain('닫힌 폴리선을 선택하십시오.');
      expect(boundary(h)).toBeNull();
    }
  });

  it('열린 폴리선의 호 알림은 있는 세그먼트만 본다', async () => {
    // 마지막 정점의 볼록 값은 이어지는 세그먼트가 없어 알리지 않는다
    {
      const { h, ins } = harness();
      const pl = h.add(lw([[0, 0], [50, 0], [50, 40], [0, 40, 0.5]], false));
      await h.run('XCLIP', pickInputs(ins, pl));
      expect(h.printed).not.toContain('호 세그먼트는 직선으로 이어 자릅니다.');
      expect(boundary(h)).toEqual([[0, 0], [50, 0], [50, 40], [0, 40]]);
    }
    // 가운데 호는 닫힌 것처럼 알리고 직선으로 잇는다
    {
      const { h, ins } = harness();
      const pl = h.add(lw([[0, 0], [50, 0, 0.5], [50, 40], [0, 40]], false));
      await h.run('XCLIP', pickInputs(ins, pl));
      expect(h.printed).toContain('호 세그먼트는 직선으로 이어 자릅니다.');
      expect(boundary(h)).toEqual([[0, 0], [50, 0], [50, 40], [0, 40]]);
    }
  });

  it('닫힌 폴리선의 결과는 전과 같다 — 닫는 세그먼트의 호도 알리고, 첫 점과 겹친 끝점도 그대로 넘긴다', async () => {
    const { h, ins } = harness();
    const pl = h.add(lw([[0, 0], [50, 0], [50, 40], [0, 40, 0.5]], true));
    await h.run('XCLIP', pickInputs(ins, pl));
    expect(h.printed).toContain('호 세그먼트는 직선으로 이어 자릅니다.');
    expect(boundary(h)).toEqual([[0, 0], [50, 0], [50, 40], [0, 40]]);
    const { h: h2, ins: ins2 } = harness();
    const pl2 = h2.add(lw([[0, 0], [50, 0], [50, 40], [0, 40], [0, 0]], true));
    await h2.run('XCLIP', pickInputs(ins2, pl2));
    expect(boundary(h2)).toEqual([[0, 0], [50, 0], [50, 40], [0, 40], [0, 0]]);
  });
});
