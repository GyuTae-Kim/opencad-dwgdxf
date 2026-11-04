/**
 * 85차: R2.x의 REPEAT…ENDREP(사이 객체를 열·행으로 되풀이)를 익명 블록 + 배열 블록 참조로 읽는다(io/dxf/repeat.ts).
 * ENDREP 70 열 수, 71 행 수, 40 열 간격, 41 행 간격(dwg_ac2_10.ksy). 근거 도면(LibreDWG R2.10 시험 도면)은 저장소에 넣지 않는다.
 */
import { describe, expect, it } from 'vitest';
import type { InsertEntity, LineEntity, PointEntity, UnknownEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

const enc = new TextEncoder();
const dxf = (ents: string[]) => enc.encode(['  0', 'SECTION', '  2', 'ENTITIES', ...ents, '  0', 'ENDSEC', '  0', 'EOF', ''].join('\n'));
const point = (x: number, y: number) => ['  0', 'POINT', '  8', '0', ' 10', String(x), ' 20', String(y)];
const line = ['  0', 'LINE', '  8', 'L1', ' 10', '0.0', ' 20', '0.0', ' 11', '1.0', ' 21', '0.5'];
const repeat = ['  0', 'REPEAT', '  8', 'R', ' 62', '3'];
const endrep = (cols: number, rows: number, dx: number, dy: number) => ['  0', 'ENDREP', '  8', '0', ' 70', String(cols), ' 71', String(rows), ' 40', String(dx), ' 41', String(dy)];
const ms = (d: ReturnType<typeof readDxf>) => d.blocks.get(MODEL_SPACE)?.entities ?? [];

describe('REPEAT…ENDREP', () => {
  it('사이 객체를 익명 블록에 넣고 같은 열·행·간격의 배열 블록 참조로 바꾼다(REPEAT의 도면층·색을 받는다)', () => {
    const doc = readDxf(dxf([...point(9, 9), ...repeat, ...point(1, 7), ...line, ...endrep(3, 2, 1, 1.5), ...point(8, 8)]));
    const [before, ins, after] = ms(doc) as [PointEntity, InsertEntity, PointEntity];
    expect([before.type, ins.type, after.type]).toEqual(['POINT', 'INSERT', 'POINT']);
    expect([ins.layer, ins.color.aci, ins.insert, ins.scale, ins.rotation]).toEqual(['R', 3, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 0]);
    expect([ins.columnCount, ins.rowCount, ins.columnSpacing, ins.rowSpacing]).toEqual([3, 2, 1, 1.5]);
    const blk = doc.blocks.get(tableKey(ins.block))!;
    expect([ins.block.startsWith('*U'), blk.flags & 1, blk.basePoint]).toEqual([true, 1, { x: 0, y: 0, z: 0 }]);
    const [p, l] = blk.entities as [PointEntity, LineEntity];
    expect([p.position, l.layer, l.end]).toEqual([{ x: 1, y: 7, z: 0 }, 'L1', { x: 1, y: 0.5, z: 0 }]);
    // 새 블록 참조도 핸들을 받고, 표시하지 않는 종류로 알리지 않는다
    expect(ins.handle).not.toBe('');
    expect(doc.warnings).toEqual([]);
  });

  it('DXF로 다시 써도 배열 블록 참조와 익명 블록이 남는다', () => {
    const doc = readDxf(dxf([...repeat, ...point(1, 7), ...endrep(3, 2, 1, 1)]));
    const back = readDxf(writeDxf(doc, {}).data);
    const ins = ms(back)[0] as InsertEntity;
    expect([ins.type, ins.columnCount, ins.rowCount, ins.columnSpacing, ins.rowSpacing]).toEqual(['INSERT', 3, 2, 1, 1]);
    expect((back.blocks.get(tableKey(ins.block))!.entities[0] as PointEntity).position).toEqual({ x: 1, y: 7, z: 0 });
  });

  it('짝이 없는 REPEAT·ENDREP은 그대로 두고 표시하지 않는 종류로 알린다', () => {
    const doc = readDxf(dxf([...repeat, ...point(1, 7), ...repeat, ...point(2, 7), ...endrep(2, 1, 1, 0), ...endrep(2, 1, 1, 0)]));
    // 안쪽 REPEAT…ENDREP만 접히고, 바깥 REPEAT와 남는 ENDREP은 모르는 객체로 남는다
    const types = ms(doc).map((e) => (e.type === 'UNKNOWN' ? (e as UnknownEntity).originalType : e.type));
    expect(types).toEqual(['REPEAT', 'POINT', 'INSERT', 'ENDREP']);
    expect(doc.warnings.find((w) => w.code === 'entity.unsupported')?.detail).toEqual({ types: { REPEAT: 1, ENDREP: 1 } });
  });
});
