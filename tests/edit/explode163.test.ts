/**
 * 163차: 블록을 분해할 때 옮길 수 없는 블록 내용 — 원본 ACIS 자료가 있는 영역·3D 솔리드·바디·곡면, 모르는 객체(프록시 등),
 * 고르지 않게 축척한 원호 정렬 문자.
 * Autodesk EXPLODE 도움말(HTML): 블록은 한 단계씩 분해하고, 비균등 축척 블록에서 분해할 수 없는 객체는 "*E" 익명 블록으로 모아
 * 그 축척으로 참조하며, 모두 분해할 수 없으면 참조를 분해하지 않는다 — AutoCAD는 블록 내용을 버리지 않는다.
 * 전에는 변환 결과가 없는 내용을 버리고 나머지만 내놓아 EXPLODE·BURST·분해해 넣기가 그 객체를 도면에서 지웠다
 * (내용이 모두 그런 블록은 참조만 지우고 아무것도 넣지 않았다). 이제 참조를 남기고 변환 함수의 까닭을 알린다.
 * ACIS 형상은 새 핸들로 복사하면 원본 본문·자료 저장소 몫을 잃어 "*E" 블록으로 모으지 않는다.
 */
import { describe, expect, it } from 'vitest';
import type { ArcTextEntity, CadDocument, Entity, InsertEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { arcTextDefaults } from '../../src/text/arctext';
import { explodeEntity } from '../../src/edit/geom/explode';
import { entityBounds } from '../../src/edit/geom/query';
import { MSG } from '../../src/edit/geom/types';
import { registerModifyCommands } from '../../src/app/modify';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { registerDashInsertCommands } from '../../src/app/dashcmds-insert';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { P, line, near, newDoc } from './helpers';

const ARCTEXT_NUS = '원호 정렬 문자는 고르지 않게 축척하거나 기울일 수 없습니다.';

function insert(block: string, x: number, y: number, extra: Partial<InsertEntity> = {}): InsertEntity {
  return {
    ...entityDefaults(),
    type: 'INSERT',
    handle: 'I' + block + x,
    block,
    insert: P(x, y),
    scale: P(1, 1, 1),
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    attribs: [],
    ...extra,
  };
}

/** 원본 ACIS 자료(DWG에서 읽은 SAT)가 있는 3D 솔리드 — 이 앱은 형상을 옮길 수 없다 */
const solid = (h: string): Entity => ({ ...entityDefaults(), type: '3DSOLID', handle: h, sat: 'x', wires: [[P(0, 0), P(1, 1)]] }) as Entity;

function arcText(h: string): ArcTextEntity {
  return { ...entityDefaults(), ...arcTextDefaults(), handle: h, text: 'AAA', center: P(0, 0), radius: 10, startAngle: 0, endAngle: Math.PI, style: 'Standard', height: 1, alignment: 4 };
}

/** S: 선 + 솔리드, O: 솔리드만, U: 선 + 모르는 객체, A: 선 + 원호 정렬 문자, R: 선 + 원본 자료 없는 영역(모서리 선만), L: 선만 */
function addBlocks(doc: CadDocument): void {
  const def = (name: string, entities: Entity[]) =>
    doc.blocks.set(name, { name, handle: 'B' + name.charCodeAt(0).toString(16), recordHandle: 'C' + name.charCodeAt(0).toString(16), basePoint: P(0, 0), flags: 0, entities });
  def('S', [{ ...line(0, 0, 1, 0), handle: 'E01' }, solid('E02')]);
  def('O', [solid('E03')]);
  def('U', [{ ...line(0, 0, 1, 0), handle: 'E04' }, { ...entityDefaults(), type: 'UNKNOWN', handle: 'E05', originalType: 'ACAD_PROXY_ENTITY' } as Entity]);
  def('A', [{ ...line(0, 0, 1, 0), handle: 'E06' }, arcText('E07')]);
  def('R', [{ ...line(0, 0, 1, 0), handle: 'E08' }, { ...entityDefaults(), type: 'REGION', handle: 'E09', wires: [[P(0, 0), P(2, 0), P(2, 2), P(0, 0)]] } as Entity]);
  def('L', [{ ...line(0, 0, 1, 0), handle: 'E0A' }]);
}

/** 분해하지 않고 원본을 남긴 결과 */
function refused(r: ReturnType<typeof explodeEntity>, message: string): void {
  expect(r.add).toBeUndefined();
  expect(r.remove).toBeUndefined();
  expect(r.message).toBe(message);
}

describe('옮길 수 없는 블록 내용의 분해(163차)', () => {
  const doc = newDoc();
  addBlocks(doc);

  it('원본 ACIS 자료가 든 블록은 분해하지 않고 까닭을 알린다(전에는 솔리드를 버리고 선만 냈다) — EXPLODE·BURST·다중 삽입', () => {
    for (const attribs of ['definitions', 'values'] as const) {
      refused(explodeEntity(insert('S', 10, 0), doc, false, attribs), MSG.acis);
      refused(explodeEntity(insert('S', 10, 0, { rowCount: 2, columnCount: 2, rowSpacing: 5, columnSpacing: 5 }), doc, false, attribs), MSG.acis);
    }
    // 블록 정의는 그대로
    expect(doc.blocks.get('S')!.entities.map((e) => e.type)).toEqual(['LINE', '3DSOLID']);
  });

  it('내용이 모두 옮길 수 없는 블록은 참조를 지우지 않는다(전에는 참조만 지우고 아무것도 넣지 않았다 — 비균등 축척이면 AutoCAD도 분해하지 않는다)', () => {
    refused(explodeEntity(insert('O', 0, 0), doc, false, 'definitions'), MSG.acis);
    refused(explodeEntity(insert('O', 0, 0, { scale: P(2, 1, 1) }), doc, false, 'definitions'), MSG.acis);
  });

  it('모르는 객체(프록시)와 고르지 않게 축척한 원호 정렬 문자도 같다 — 균일 축척 원호 정렬 문자는 전처럼 분해된다', () => {
    refused(explodeEntity(insert('U', 0, 0), doc, false, 'definitions'), MSG.cannotTransform);
    refused(explodeEntity(insert('A', 0, 0, { scale: P(2, 1, 1) }), doc, false, 'definitions'), ARCTEXT_NUS);
    const r = explodeEntity(insert('A', 5, 0, { scale: P(2, 2, 1) }), doc, false, 'definitions');
    expect(r.remove).toEqual(['IA5']);
    expect(r.add!.map((e) => e.type)).toEqual(['LINE', 'ARCALIGNEDTEXT']);
    const t = r.add![1] as ArcTextEntity;
    expect(t.radius).toBeCloseTo(20, 12);
    near(t.center, P(5, 0));
  });

  it('원본 자료가 없는 영역(모서리 선만)은 전처럼 옮겨 분해하고, 범위 조회는 전처럼 옮길 수 있는 내용으로 잰다', () => {
    const r = explodeEntity(insert('R', 10, 0, { scale: P(2, 1, 1) }), doc, false, 'definitions');
    expect(r.remove).toEqual(['IR10']);
    expect(r.add!.map((e) => e.type)).toEqual(['LINE', 'REGION']);
    const w = (r.add![1] as Entity & { wires: { x: number; y: number }[][] }).wires[0]!;
    near(w[1]!, P(14, 0));
    near(w[2]!, P(14, 2));
    const b = entityBounds(insert('S', 10, 0), doc)!;
    expect(b.minX).toBeCloseTo(10, 9);
    expect(b.maxX).toBeCloseTo(11, 9);
  });
});

describe('명령: EXPLODE·BURST·분해해 넣기(163차)', () => {
  function harness() {
    const h = makeHarness((doc) => addBlocks(doc));
    registerModifyCommands(h.app);
    registerUtil2BlockCommands(h.app);
    registerDashInsertCommands(h.app);
    return h;
  }
  const model = (h: ReturnType<typeof harness>) => h.doc.blocks.get(MODEL_SPACE)!.entities;

  it('EXPLODE: 솔리드가 든 참조는 남고 까닭을 알리며, 함께 고른 다른 참조는 분해한다', async () => {
    const h = harness();
    const s = h.add(insert('S', 10, 0)) as InsertEntity;
    const l = h.add(insert('L', 20, 0)) as InsertEntity;
    await runWith(h, 'EXPLODE', [{ sel: [s.handle, l.handle] }]);
    expect(model(h).map((e) => e.type)).toEqual(['INSERT', 'LINE']);
    expect(model(h)[0]!.handle).toBe(s.handle);
    expect(h.printed).toContain('1개는 분해할 수 없습니다.');
    expect(h.printed).toContain(MSG.acis);
    expect(h.printed).toContain('1개를 분해해 객체 1개를 만들었습니다.');
  });

  it('BURST와 분해해 넣기(-INSERT *이름)도 솔리드를 잃지 않는다', async () => {
    const h = harness();
    const s = h.add(insert('S', 10, 0)) as InsertEntity;
    await runWith(h, 'BURST', [{ sel: [s.handle] }]);
    expect(model(h).map((e) => e.handle)).toEqual([s.handle]);
    expect(h.printed).toContain(MSG.acis);
    h.printed.length = 0;
    await runWith(h, '-INSERT', ['*S', '20,0', '1', '0']);
    expect(model(h).map((e) => e.handle)).toEqual([s.handle]);
    expect(h.printed).toContain(MSG.acis);
  });
});
