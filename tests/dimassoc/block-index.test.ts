/**
 * 47차: 치수 4만 개를 옮기면 38초를 넘게 멈추던 결함. 치수마다 문서 전체를 훑어 자기만 쓰는 블록인지 보고 새 *D 번호를 찾았다.
 * 한 편집 안에서는 문서가 그대로이므로 표를 한 번만 만든다. 결과는 치수마다 훑을 때와 같아야 한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dimensionBlockOps } from '../../src/app/dimcmds';
import type { DocState } from '../../src/app/docstate';
import type { CadDocument, DimensionEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { EditSession } from '../../src/edit/session';
import { readDxf } from '../../src/io/dxf/reader';
import { bytesOf, dxfText } from '../robust/corrupt35';

const dimension = (handle: string, block: string, x: number): string[] => [
  '0', 'DIMENSION', '5', handle, '8', '0', '100', 'AcDbEntity', '100', 'AcDbDimension', '2', block,
  '10', String(x), '20', '2', '30', '0', '11', String(x + 1), '21', '2', '31', '0', '70', '32',
  '100', 'AcDbAlignedDimension', '13', String(x), '23', '0', '33', '0', '14', String(x + 2), '24', '0', '34', '0',
  '100', 'AcDbRotatedDimension', '50', '0',
];
const blockDef = (name: string): string[] => ['0', 'BLOCK', '8', '0', '2', name, '70', '1', '10', '0', '20', '0', '30', '0', '3', name, '0', 'ENDBLK', '8', '0'];

function setup(blocks: string[]): { doc: CadDocument; st: DocState; dims: DimensionEntity[] } {
  const names = [...new Set(blocks)].filter(Boolean);
  const doc = readDxf(bytesOf(dxfText(blocks.map((b, i) => dimension((0x100 + i).toString(16).toUpperCase(), b, i * 5)), names.map(blockDef))));
  const st = { doc, session: new EditSession(doc, () => {}) } as unknown as DocState;
  return { doc, st, dims: doc.blocks.get(MODEL_SPACE)!.entities as DimensionEntity[] };
}

/** 작업들이 만드는 블록 정의 */
const defs = (ops: ReturnType<typeof dimensionBlockOps>) => ops.flatMap((o) => (o.kind === 'blockDef' ? [o] : []));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('한 편집의 치수 블록 표', () => {
  it('자기만 쓰는 블록은 그대로 다시 쓴다', () => {
    const { doc, st, dims } = setup(['*D1', '*D2']);
    const extra = new Set<string>();
    const a = defs(dimensionBlockOps(st, dims[0]!, true, extra));
    const b = defs(dimensionBlockOps(st, dims[1]!, true, extra));
    expect([a[a.length - 1]!.key, b[b.length - 1]!.key]).toEqual([tableKey('*D1'), tableKey('*D2')]);
    expect(a[a.length - 1]!.before).toBe(doc.blocks.get(tableKey('*D1')));
  });

  it('둘이 같이 쓰는 블록은 새 블록을 만든다', () => {
    const { st, dims } = setup(['*D1', '*D1', '*D5']);
    const extra = new Set<string>();
    const a = defs(dimensionBlockOps(st, dims[0]!, true, extra)).at(-1)!;
    const b = defs(dimensionBlockOps(st, dims[1]!, true, extra)).at(-1)!;
    const c = defs(dimensionBlockOps(st, dims[2]!, true, extra)).at(-1)!;
    expect(a.before).toBeNull();
    expect(b.before).toBeNull();
    expect([a.key, b.key, c.key]).toEqual([tableKey('*D6'), tableKey('*D7'), tableKey('*D5')]);
  });

  it('다시 쓰지 않으면 겹치지 않는 번호를 차례로 준다', () => {
    const { st, dims } = setup(['*D3', '*D3']);
    const extra = new Set<string>([tableKey('*D5')]);
    const names = [0, 1, 0].map((i) => defs(dimensionBlockOps(st, { ...dims[i]! }, false, extra)).at(-1)!.key);
    expect(names).toEqual([tableKey('*D4'), tableKey('*D6'), tableKey('*D7')]);
  });

  it('표는 편집마다 새로 만든다(앞 편집 뒤에 쓰는 치수가 바뀌었다)', () => {
    const { doc, st, dims } = setup(['*D1', '*D1']);
    expect(defs(dimensionBlockOps(st, { ...dims[0]! }, true, new Set())).at(-1)!.before).toBeNull();
    doc.blocks.get(MODEL_SPACE)!.entities.splice(1, 1);
    expect(defs(dimensionBlockOps(st, dims[0]!, true, new Set())).at(-1)!.before).not.toBeNull();
  });

  it('치수마다 문서를 훑지 않는다', () => {
    const { doc, st, dims } = setup(Array.from({ length: 40 }, (_, i) => `*D${i + 1}`));
    const blocks = vi.spyOn(doc.blocks, 'values');
    const records = vi.spyOn(doc.blockRecords, 'values');
    const extra = new Set<string>();
    for (const d of dims) dimensionBlockOps(st, d, true, extra);
    for (const d of dims) dimensionBlockOps(st, { ...d }, false, extra);
    // 치수 80번을 만드는 동안 문서를 몇 번만 본다
    expect(blocks.mock.calls.length).toBeLessThanOrEqual(3);
    expect(records.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
