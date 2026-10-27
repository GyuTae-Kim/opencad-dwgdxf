/**
 * 대조 정규화(normalize.ts)의 동적 블록 이름 규칙(10번) — 표본 없이 도는 합성 시험.
 * 기준 DXF(R2000~R2007)는 동적 블록 정의를 `*U<n>`으로 쓰고, DWG 쪽은 본래 이름을 가진다.
 */
import { describe, expect, it } from 'vitest';
import { createNewDocument } from '../../src/core/newdoc';
import { DXF_RENAMES_DYNAMIC_BLOCKS, dynamicBlockRenames, isDynamicBlock, normalizePair } from './normalize';

const yes = () => true;

describe('동적 블록 이름 정규화', () => {
  it('블록 안 도형 핸들이 같으면 기준의 *U<n>을 본래 이름으로 짝짓는다', () => {
    const m = dynamicBlockRenames(
      [{ key: '*U7', handles: ['A1', 'A2'] }, { key: '*U2', handles: ['B1'] }],
      [{ key: 'DOOR', handles: ['A1', 'A2'] }, { key: '*U2', handles: ['B1'] }],
      new Map(),
      new Map(),
      yes,
    );
    expect([...m]).toEqual([['*U7', 'DOOR']]);
  });

  it('빈 블록은 같은 핸들의 INSERT가 가리키는 이름으로 짝짓는다', () => {
    const m = dynamicBlockRenames([{ key: '*U3', handles: [] }], [{ key: 'EMPTY', handles: [] }], new Map([['90', '*U3']]), new Map([['90', 'Empty']]), yes);
    expect([...m]).toEqual([['*U3', 'EMPTY']]);
  });

  it('동적 블록 표지가 없거나 이름이 이미 맞으면 짝짓지 않는다', () => {
    expect(dynamicBlockRenames([{ key: '*U1', handles: ['A1'] }], [{ key: 'PLAIN', handles: ['A1'] }], new Map(), new Map(), () => false).size).toBe(0);
    expect(dynamicBlockRenames([{ key: '*U1', handles: ['A1'] }], [{ key: '*U1', handles: ['A1'] }], new Map(), new Map(), yes).size).toBe(0);
    expect(dynamicBlockRenames([{ key: 'DOOR', handles: ['A1'] }], [{ key: 'DOOR2', handles: ['A1'] }], new Map(), new Map(), yes).size).toBe(0);
  });

  it('R2000~R2007 기준에서만 요약의 블록 열쇠와 참조를 되돌린다', () => {
    expect(['AC1015', 'AC1018', 'AC1021'].every(DXF_RENAMES_DYNAMIC_BLOCKS)).toBe(true);
    expect(['AC1009', 'AC1024', 'AC1032'].some(DXF_RENAMES_DYNAMIC_BLOCKS)).toBe(false);
    const doc = createNewDocument('metric');
    doc.blocks.set('DOOR', { name: 'Door', handle: 'D0', recordHandle: 'D1', basePoint: { x: 0, y: 0, z: 0 }, flags: 1, entities: [] });
    doc.blockRecords.set('DOOR', { name: 'Door', handle: 'D1', flags: 0, insertUnits: 0, explodable: true, scalable: true, xdata: [{ app: 'AcDbDynamicBlockGUID', items: [{ code: 1000, value: '{0}' }] }] });
    expect(isDynamicBlock(doc, 'DOOR')).toBe(true);
    const make = (name: string, key: string, version: string) => ({
      version,
      layers: [],
      dimStyles: [],
      blocks: { '*MODEL_SPACE': [{ type: 'INSERT', handle: '90', block: name }], [key]: [{ type: 'LINE', handle: 'A1' }] },
    });
    for (const [version, renamed] of [['AC1015', true], ['AC1024', false]] as const) {
      const expected = make('*U4', '*U4', version) as Record<string, unknown>;
      const actual = make('Door', 'DOOR', 'AC1015') as Record<string, unknown>;
      normalizePair(expected, actual, doc);
      const blocks = expected.blocks as Record<string, { block?: string }[]>;
      expect('DOOR' in blocks).toBe(renamed);
      expect(blocks['*MODEL_SPACE']![0]!.block).toBe(renamed ? 'Door' : '*U4');
    }
  });
});
