/**
 * 166차: 클래식 원형 배열(-ARRAY·ARRAYCLASSIC)에서 항목을 돌리지 않을 때 원을 따라 옮기는 기준점.
 * Autodesk Array 대화 상자 도움말: "객체 기본값으로 설정"(기본 켬)은 객체의 기본 기준점을 쓴다 — 호·원·타원은 중심,
 * 선·폴리선·3D 폴리선·광선·스플라인은 시작점, 블록·여러 줄 문자·한 줄 문자는 삽입점, 구성선은 중간점이고,
 * 여러 객체를 고르면 마지막으로 고른 객체의 기준점을 쓴다. -ARRAY 도움말도 "선택 세트의 마지막 객체의 기준점을 모든 객체에 쓴다".
 * 전에는 늘 선택 범위의 가운데를 썼다. 표에 없는 종류(솔리드 등)와 기준(B)으로 준 점은 전과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { formAnswers } = vi.hoisted(() => ({ formAnswers: [] as (Record<string, unknown> | null)[] }));
vi.mock('../../src/app/ui/dom', async (orig) => ({
  ...(await orig<object>()),
  form: vi.fn(async () => formAnswers.shift() ?? null),
}));

import type { CircleEntity, Entity, InsertEntity, LineEntity, MTextEntity, TextEntity } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { registerDashArrayCommand } from '../../src/app/dashcmds-array';
import { registerModifyCommands } from '../../src/app/modify';
import { setArrayAssociativity } from '../../src/app/assocarray';
import { circle, line, mtext, text } from '../edit/make';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { perCommandGroups } from './groups';

afterEach(() => {
  formAnswers.length = 0;
  setArrayAssociativity(true);
});

function harness() {
  const h = perCommandGroups(
    makeHarness((doc) => {
      // 블록 B: 기준점 (0,0)에서 (5,0)만큼 떨어진 원 — 참조의 범위 가운데와 삽입점이 다르다
      doc.blocks.set('B', { name: 'B', handle: 'F001', recordHandle: 'F002', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [{ ...circle(5, 0, 1), handle: 'F003', owner: 'F002' }], endHandle: 'F004' });
      doc.blockRecords.set('B', { name: 'B', handle: 'F002', flags: 0, insertUnits: 0, explodable: true, scalable: true });
    }),
  );
  registerDashArrayCommand(h.app);
  registerModifyCommands(h.app);
  return h;
}

/** 시험 도구의 핸들은 문서 핸들과 겹칠 수 있다 → 세션이 새로 매기게 */
const fresh = (e: Entity): Entity => ({ ...e, handle: '' });

const near = (a: { x: number; y: number }, x: number, y: number) => Math.abs(a.x - x) < 1e-9 && Math.abs(a.y - y) < 1e-9;
const hasLine = (h: ReturnType<typeof harness>, x0: number, y0: number, x1: number, y1: number) =>
  modelEntities(h.doc, 'LINE').some((l: LineEntity) => near(l.start, x0, y0) && near(l.end, x1, y1));

/** -ARRAY 원형: 중심 0,0 · 4개 · 360° · 회전 안 함 */
const dashPolar = (h: ReturnType<typeof harness>, sel: string[], base?: string) =>
  h.run('-ARRAY', [{ sel }, 'P', ...(base ? ['B', base] : []), '0,0', '4', '360', 'N']);

describe('클래식 원형 배열을 돌리지 않을 때의 기준점(166차)', () => {
  it('-ARRAY: 선은 시작점이 원을 따라 돈다(범위 가운데가 아니다)', async () => {
    const h = harness();
    const a = h.add(fresh(line(10, 0, 12, 0)));
    await dashPolar(h, [a.handle]);
    expect(modelEntities(h.doc, 'LINE')).toHaveLength(4);
    // 시작점 (10,0) → (0,10)·(−10,0)·(0,−10), 선은 돌지 않는다
    expect([hasLine(h, 0, 10, 2, 10), hasLine(h, -10, 0, -8, 0), hasLine(h, 0, -10, 2, -10)]).toEqual([true, true, true]);
    // 거꾸로 그린 선은 시작점 (12,0)이 기준
    const h2 = harness();
    const b = h2.add(fresh(line(12, 0, 10, 0)));
    await dashPolar(h2, [b.handle]);
    expect(hasLine(h2, 0, 12, -2, 12)).toBe(true);
  });

  it('-ARRAY: 여러 객체는 마지막으로 고른 객체의 기준점(원은 중심)을 모두에 쓴다', async () => {
    const h = harness();
    const c = h.add(fresh(circle(20, 0, 1)));
    const l = h.add(fresh(line(10, 0, 12, 0)));
    // 마지막 = 원 → 중심 (20,0)이 (0,20)으로: 모두 (−20,20)만큼
    await dashPolar(h, [l.handle, c.handle]);
    const cs = modelEntities(h.doc, 'CIRCLE') as CircleEntity[];
    expect(cs.some((x) => near(x.center, 0, 20))).toBe(true);
    expect(hasLine(h, -10, 20, -8, 20)).toBe(true);
    // 마지막 = 선 → 시작점 (10,0)이 (0,10)으로: 모두 (−10,10)만큼
    const h2 = harness();
    const c2 = h2.add(fresh(circle(20, 0, 1)));
    const l2 = h2.add(fresh(line(10, 0, 12, 0)));
    await dashPolar(h2, [c2.handle, l2.handle]);
    expect((modelEntities(h2.doc, 'CIRCLE') as CircleEntity[]).some((x) => near(x.center, 10, 10))).toBe(true);
    expect(hasLine(h2, 0, 10, 2, 10)).toBe(true);
  });

  it('-ARRAY: 블록 참조·한 줄 문자·여러 줄 문자는 삽입점', async () => {
    const h = harness();
    const ins = h.add({ ...entityDefaults(), type: 'INSERT', handle: '', block: 'B', insert: { x: 10, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as InsertEntity);
    await dashPolar(h, [ins.handle]);
    const is = modelEntities(h.doc, 'INSERT') as InsertEntity[];
    // 삽입점 (10,0) → (−10,0) (전에는 범위 가운데 (15,0) 기준이라 (−20,0))
    expect(is.some((x) => near(x.insert, -10, 0))).toBe(true);
    expect(is.some((x) => near(x.insert, 0, 10))).toBe(true);

    const h2 = harness();
    const t = h2.add(fresh(text(10, 0, 'ABCD')));
    await dashPolar(h2, [t.handle]);
    expect((modelEntities(h2.doc, 'TEXT') as TextEntity[]).some((x) => near(x.insert, 0, 10))).toBe(true);

    const h3 = harness();
    const m = h3.add(fresh(mtext(10, 0, 'ABCD')));
    await dashPolar(h3, [m.handle]);
    expect((modelEntities(h3.doc, 'MTEXT') as MTextEntity[]).some((x) => near(x.insert, -10, 0))).toBe(true);
  });

  it('ARRAYCLASSIC(대화 상자, 연관 아니오)도 같은 기준점', async () => {
    const h = harness();
    const a = h.add(fresh(line(10, 0, 12, 0)));
    formAnswers.push({ n: 4, fill: 360, rotate: false, assoc: false });
    await h.run('ARRAYCLASSIC', [{ sel: [a.handle] }, 'PO', '0,0']);
    expect(modelEntities(h.doc, 'LINE')).toHaveLength(4);
    expect([hasLine(h, 0, 10, 2, 10), hasLine(h, -10, 0, -8, 0)]).toEqual([true, true]);
  });

  it('전후 같음: 기준(B)으로 준 점, 표에 없는 종류(솔리드)는 선택 범위 가운데, 회전하는 배열', async () => {
    const h = harness();
    const a = h.add(fresh(line(10, 0, 12, 0)));
    await dashPolar(h, [a.handle], '11,0');
    expect(hasLine(h, -1, 11, 1, 11)).toBe(true);

    const h2 = harness();
    const s = h2.add({ ...entityDefaults(), type: 'SOLID', handle: '', points: [{ x: 10, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }, { x: 10, y: 2, z: 0 }, { x: 12, y: 2, z: 0 }], invisibleEdges: 0 } as unknown as Entity);
    await dashPolar(h2, [s.handle]);
    // 범위 가운데 (11,1) → (−1,11): (−12,10)만큼
    const sol = modelEntities(h2.doc, 'SOLID') as unknown as { points: { x: number; y: number }[] }[];
    expect(sol.some((x) => near(x.points[0]!, -2, 10))).toBe(true);

    const h3 = harness();
    const b = h3.add(fresh(line(10, 0, 12, 0)));
    await h3.run('-ARRAY', [{ sel: [b.handle] }, 'P', '0,0', '4', '360', 'Y']);
    expect(hasLine(h3, 0, 10, 0, 12)).toBe(true);
  });
});
