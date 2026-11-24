/**
 * 201차: -ATTEDIT 하나씩 편집의 높이(H)가 점을 받는다.
 * 근거 — Autodesk -ATTEDIT 도움말(2026) 「높이」: 점을 지정하면 높이는 그 점과 문자 시작점 사이의 거리가 된다.
 * 문자 시작점은 DXF 참조서 ATTRIB의 그룹 10(OCS) — 이 앱의 `insert`이고, 돌출 방향이 +Z가 아니면 WCS로 옮긴 자리에서 잰다.
 * 전에는 점을 「숫자 값이 필요합니다.」로 거절하고 다시 물었다. 숫자·Enter는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, Entity, InsertEntity, TextEntity, Vec3 } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { registerDashInsertCommands } from '../../src/app/dashcmds-insert';
import { NEG_Z, P, circle, text } from '../edit/make';
import { makeHarness, modelEntities } from '../cmds2/harness';

function harness() {
  const h = makeHarness((doc) => {
    doc.blocks.set('B', { name: 'B', handle: 'F001', recordHandle: 'F002', basePoint: P(0, 0), flags: 0, entities: [{ ...circle(0, 0, 1), handle: 'F003', owner: 'F002' }], endHandle: 'F004' });
    doc.blockRecords.set('B', { name: 'B', handle: 'F002', flags: 0, insertUnits: 0, explodable: true, scalable: true });
  });
  registerDashInsertCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;

const attrib = (h: H, x: number, y: number, extra: Record<string, unknown> = {}): AttribEntity =>
  ({ ...(text(x, y, 'V', 1) as TextEntity), type: 'ATTRIB', handle: h.st.session.newHandle(), tag: 'T', attFlags: 0, ...extra }) as AttribEntity;

const addInsert = (h: H, at: Vec3, attribs: AttribEntity[], extra: Record<string, unknown> = {}): InsertEntity =>
  h.add({ ...entityDefaults(), type: 'INSERT', handle: '', block: 'B', insert: at, scale: P(1, 1, 1), rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs, ...extra } as Entity) as InsertEntity;

/** 하나씩 편집(Y) · 사양 셋 Enter(*) · 그 블록 참조 고르기 · 높이(H) 답 · 다음(N) */
const heightInputs = (ins: InsertEntity, ...answers: string[]) => ['Y', '', '', '', { sel: [ins.handle] }, 'H', ...answers, 'N'];
const attOf = (h: H) => modelEntities(h.doc, 'INSERT')[0]!.attribs[0]!;

describe('-ATTEDIT 높이(H)의 점(201차)', () => {
  it('점을 찍으면 그 점과 문자 시작점(삽입점 10)의 거리가 높이가 된다 — 맞춘 속성도 맞춤점이 아니라 시작점에서 잰다', async () => {
    const h = harness();
    const ins = addInsert(h, P(0, 0), [attrib(h, 2, 3)]);
    await h.run('-ATTEDIT', heightInputs(ins, '2,7'));
    expect(h.printed).not.toContain('숫자 값이 필요합니다.');
    expect(attOf(h).height).toBeCloseTo(4, 12);
    // 가운데 맞춤 속성: 시작점 (1, 3), 맞춤점 (2, 3) — (1, 6)을 찍으면 3(맞춤점에서 재면 √10)
    const h2 = harness();
    const ins2 = addInsert(h2, P(0, 0), [attrib(h2, 1, 3, { halign: 1, alignPoint: P(2, 3) })]);
    await h2.run('-ATTEDIT', heightInputs(ins2, '1,6'));
    expect(attOf(h2).height).toBeCloseTo(3, 12);
    // 명령 취소 한 번이면 전 높이
    h2.st.session.undo();
    expect(attOf(h2).height).toBe(1);
  });

  it('돌출 방향이 −Z인 속성은 WCS로 옮긴 시작점에서 잰다', async () => {
    const h = harness();
    // OCS (−2, 3) = WCS (2, 3) — (2, 7)을 찍으면 4(OCS 값 그대로 재면 √32)
    const ins = addInsert(h, P(0, 0), [attrib(h, -2, 3, { extrusion: NEG_Z })], { extrusion: NEG_Z });
    await h.run('-ATTEDIT', heightInputs(ins, '2,7'));
    expect(attOf(h).height).toBeCloseTo(4, 12);
  });

  it('시작점과 같은 점(거리 0)은 0보다 커야 한다고 알리고 다시 묻는다', async () => {
    const h = harness();
    const ins = addInsert(h, P(0, 0), [attrib(h, 2, 3)]);
    await h.run('-ATTEDIT', heightInputs(ins, '2,3', '2.5'));
    expect(h.printed).toContain('값은 0보다 커야 합니다.');
    expect(attOf(h).height).toBe(2.5);
  });

  it('숫자·Enter는 전과 같다(숫자는 거리 입력이 아니라 값)', async () => {
    const h = harness();
    const ins = addInsert(h, P(0, 0), [attrib(h, 2, 3)]);
    await h.run('-ATTEDIT', heightInputs(ins, '2.5'));
    expect(attOf(h).height).toBe(2.5);
    await h.run('-ATTEDIT', heightInputs(ins, ''));
    expect(attOf(h).height).toBe(2.5);
    await h.run('-ATTEDIT', heightInputs(ins, '0', '-1', '3'));
    expect(h.printed.filter((t) => t === '값은 0보다 커야 합니다.')).toHaveLength(2);
    expect(attOf(h).height).toBe(3);
  });
});
