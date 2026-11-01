/**
 * 35차: DWG 읽기에서 파일 안의 크기·개수 값이 할당과 반복 수를 바로 정하던 자리.
 * 고치기 전에는 7KB 파일이 4GiB를 잡거나(R2004 페이지 크기), 지도 하나로 몇십 초씩 돌거나, 힙이 넘쳐 프로세스가 죽었다.
 */
import { describe, expect, it } from 'vitest';
import { CadReadError } from '../../src/core/errors';
import { finalizeDocument } from '../../src/core/finalize';
import { TABLE_CELL_LIMIT } from '../../src/core/limits';
import type { CadDocument, TableEntity } from '../../src/core/model';
import { readR2004Container } from '../../src/io/dwg/container/r2004';
import { readR2007Container } from '../../src/io/dwg/container/r2007';
import type { DwgSections } from '../../src/io/dwg/container/types';
import { acdsRecords } from '../../src/io/dwg/acds';
import { buildDocument } from '../../src/io/dwg/build';
import { writeDwg } from '../../src/io/dwg';
import { layoutFromR24 } from '../../src/io/dwg/tablemodel';
import { R2007 } from '../../src/io/dwg/version';
import type { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { readDxf } from '../../src/io/dxf/reader';
import { readCadFile } from '../../src/io/index';
import {
  R2000,
  R2004,
  acdsBlob,
  acdsManySegments,
  acdsSameSegment,
  bytesOf,
  dwgDoc,
  dxfText,
  encodeObjectMap,
  entityHead,
  objectBytes,
  objectHead,
  r2004Pages,
  r2004WithMaxSize,
  r2007Pages,
  r2007WithMapSize,
  sectionsOf,
  table,
} from './corrupt35';

const within2s = <T>(f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  expect(performance.now() - t0).toBeLessThan(2000);
  return r;
};
const codes = (w: { code: string }[]) => w.map((x) => x.code);
const allEntities = (doc: CadDocument) => [...doc.blocks.values()].flatMap((b) => b.entities);

describe('R2004 컨테이너', () => {
  it('페이지 크기가 망가져도 4GiB를 잡지 않고 도면을 연다', () => {
    const data = r2004WithMaxSize(0xf0000000);
    const before = process.memoryUsage().arrayBuffers;
    const doc = within2s(() => readCadFile(data, 'x.dwg'));
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(0x10000000);
    expect(codes(doc.warnings)).toContain('dwg.page_corrupt');
    expect(allEntities(doc).some((e) => e.type === 'LINE')).toBe(true);
  });

  it('섹션 지도가 같은 페이지를 100만 번 가리켜도 파일 크기에 비례한 일만 한다', () => {
    const data = r2004Pages(1000000, 4 * 1048576);
    const sec = within2s(() => readR2004Container(data, R2004));
    expect(codes(sec.warnings)).toContain('dwg.page_repeat');
  });

  it('정상 파일은 페이지 경고가 없다', () => {
    const { data } = dwgDoc('AC1018', 50);
    const sec = readR2004Container(data, R2004);
    expect(codes(sec.warnings)).not.toContain('dwg.page_repeat');
    expect(codes(sec.warnings)).not.toContain('dwg.page_corrupt');
  });
});

describe('R2007 컨테이너', () => {
  it('지도의 푼 크기가 망가지면 잡기 전에 손상으로 알린다', () => {
    const data = r2007WithMapSize(0xf0000000);
    within2s(() => expect(() => readCadFile(data, 'x.dwg')).toThrow(CadReadError));
  });

  it('섹션 지도가 큰 페이지를 수천 번 가리켜도 되풀이하지 않는다', () => {
    const data = r2007Pages(5000, 1048576);
    const sec = within2s(() => readR2007Container(data, R2007));
    expect(codes(sec.warnings)).toContain('dwg.page_repeat');
  });

  it('페이지의 푼 크기가 망가지면 그 페이지만 건너뛴다', () => {
    const data = r2007Pages(5000, 512, 0xf0000000);
    const sec = within2s(() => readR2007Container(data, R2007));
    expect(codes(sec.warnings)).toContain('dwg.page_corrupt');
  });

  it('맞는 크기의 페이지는 그대로 읽는다', () => {
    const sec = readR2007Container(r2007Pages(1, 512), R2007);
    expect(codes(sec.warnings)).toEqual([]);
    expect(sec.header.length).toBe(16);
  });
});

/** 선 객체들을 손으로 만든 객체로 덮어쓴 섹션 */
function patched(version: 'AC1015' | 'AC1018', lines: number, make: (h: number, ver: number) => Uint8Array): DwgSections {
  const { data, ver } = dwgDoc(version, lines);
  const { sec, map } = sectionsOf(data, ver);
  for (const e of allEntities(readCadFile(data, 'x.dwg'))) {
    if (e.type !== 'LINE') continue;
    const h = parseInt(e.handle, 16);
    sec.objects.set(make(h, ver), map.get(h)!);
  }
  return sec;
}

describe('객체 안의 개수', () => {
  it('작은 객체가 반응자 10만 개라고 적어도 핸들을 읽기 전에 건너뛴다', () => {
    const sec = patched('AC1015', 2000, (handle, ver) => objectBytes(ver, { type: 19, handle, dat: (w) => entityHead(w, ver, 100000), hdl: () => {} }));
    const doc = within2s(() => buildDocument(sec));
    expect(doc.warnings.find((w) => w.code === 'dwg.object_skipped')?.count).toBe(2000);
  });

  it('표 제어 객체가 항목 100만 개라고 적어도 남은 비트만큼만 읽는다', () => {
    const sec = patched('AC1015', 2000, (handle, ver) =>
      objectBytes(ver, {
        type: 60,
        handle,
        dat: (w) => {
          objectHead(w, ver);
          w.BL(999999);
        },
        hdl: () => {},
      }),
    );
    expect(within2s(() => buildDocument(sec)).version).toBe('AC1015');
  });

  const tableClassDoc = (version: 'AC1015' | 'AC1018') => {
    const polyline = ['0', 'LWPOLYLINE', '5', '7A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbPolyline', '90', '30000', '70', '0'];
    for (let i = 0; i < 30000; i++) polyline.push('10', String(i * 1.25), '20', String((i * 7) % 5));
    const t1 = ['0', 'BLOCK', '8', '0', '2', '*T1', '70', '1', '10', '0', '20', '0', '30', '0', '3', '*T1', '0', 'ENDBLK', '8', '0'];
    const data = writeDwg(readDxf(bytesOf(dxfText([table(2, 2), polyline], [t1]))), { version }).data.slice();
    const ver = version === 'AC1018' ? R2004 : R2000;
    const doc = readCadFile(data, 'x.dwg');
    const cls = doc.classes.find((c) => c.dxfName === 'ACAD_TABLE')!;
    const handle = parseInt(allEntities(doc).find((e) => e.type === 'LWPOLYLINE')!.handle, 16);
    const { sec, map } = sectionsOf(data, ver);
    return { sec, ver, type: cls.number!, handle, off: map.get(handle)! };
  };
  const tableHead = (w: BitWriter, ver: number) => {
    entityHead(w, ver, 0);
    w.BD(0);
    w.BD(0);
    w.BD(0);
    w.BB(3);
    w.BD(0);
    w.BD(0);
    w.BD(0);
    w.BD(1);
  };

  it('옛 표의 행 × 열이 남은 비트를 넘으면 셀을 돌지 않는다', () => {
    const { sec, ver, type, handle, off } = tableClassDoc('AC1015');
    const bytes = objectBytes(ver, {
      type,
      handle,
      dat: (w) => {
        tableHead(w, ver);
        w.B(0);
        w.BS(22);
        w.BD(1);
        w.BD(0);
        w.BD(0);
        w.BL(5000);
        w.BL(5000);
        for (let i = 0; i < 10000; i++) w.BD(1);
      },
      hdl: () => {},
      pad: 20000,
    });
    const objects = sec.objects.slice();
    objects.set(bytes, off);
    objects.fill(0, off + bytes.length);
    const doc = within2s(() => buildDocument({ ...sec, objects }));
    for (const e of allEntities(doc)) if (e.type === 'ACAD_TABLE') expect((e as TableEntity).rows * (e as TableEntity).columns).toBeLessThanOrEqual(TABLE_CELL_LIMIT);
  });

  it('행·열만 남은 큰 표도 마무리에서 셀 없는 표가 된다', () => {
    const doc = readDxf(bytesOf(dxfText([table(2, 2)])));
    const e = allEntities(doc).find((x) => x.type === 'ACAD_TABLE') as TableEntity;
    e.rows = 5000;
    e.columns = 5000;
    finalizeDocument(doc);
    expect([e.rows, e.columns]).toEqual([0, 0]);
    expect(codes(doc.warnings)).toContain('table.too_large');
  });

  it('표의 소유 객체 수가 망가지면 20억 번 돌지 않는다(R2004)', () => {
    const { sec, ver, type, handle, off } = tableClassDoc('AC1018');
    const bytes = objectBytes(ver, {
      type,
      handle,
      dat: (w) => {
        tableHead(w, ver);
        w.B(1);
        w.BL(2000000000);
      },
      hdl: () => {},
    });
    sec.objects.set(bytes, off);
    const doc = within2s(() => buildDocument(sec));
    expect(codes(doc.warnings)).toContain('dwg.object_skipped');
  });

  it('R2010+ 표의 병합 범위가 표 밖이어도 표 안만 돈다', () => {
    const t = { content: { rows: [{ cells: [], height: 1 }], columns: [{ width: 1 }], merges: [[0, 0, 2000000000, 2000000000]] } };
    expect(within2s(() => layoutFromR24(t as never, () => '')).cells.length).toBe(1);
    const inside = { content: { rows: [{ cells: [], height: 1 }, { cells: [], height: 1 }], columns: [{ width: 1 }, { width: 1 }], merges: [[0, 0, 0, 1]] } };
    const lay = layoutFromR24(inside as never, () => '');
    expect(lay.cells[0]!.spanCols).toBe(2);
    expect(lay.cells[1]!.covered).toBe(true);
    expect(lay.cells[2]!.covered).toBe(false);
  });
});

describe('객체 지도', () => {
  it('핸들 5만 개가 큰 객체 하나를 가리켜도 객체 구역을 몇 번만 읽는다', () => {
    const { data, ver } = dwgDoc('AC1015', 0, 30000);
    const { sec, map } = sectionsOf(data, ver);
    const lw = allEntities(readCadFile(data, 'x.dwg')).find((e) => e.type === 'LWPOLYLINE')!;
    const off = map.get(parseInt(lw.handle, 16))!;
    const pairs: [number, number][] = [...map].sort((a, b) => a[0] - b[0]);
    const top = pairs[pairs.length - 1]![0];
    for (let i = 1; i <= 50000; i++) pairs.push([top + i, off]);
    const doc = within2s(() => buildDocument({ ...sec, handles: encodeObjectMap(pairs) }));
    expect(codes(doc.warnings)).toContain('dwg.object_repeat');
  });

  it('정상 파일은 되풀이 경고가 없다', () => {
    const { data } = dwgDoc('AC1015', 200, 2000);
    expect(codes(readCadFile(data, 'x.dwg').warnings)).not.toContain('dwg.object_repeat');
  });
});

describe('자료 저장소', () => {
  it('색인이 구역 번호 30만 개를 가리켜도 제곱으로 돌지 않는다', () => {
    const d = acdsManySegments(300000);
    expect(within2s(() => acdsRecords(d)).size).toBe(0);
  });

  it('구역 칸 10만 개가 같은 자료 구역을 가리켜도 레코드 머리를 되풀이해 돌지 않는다', () => {
    const d = acdsSameSegment(100000, 100000);
    expect(within2s(() => acdsRecords(d)).size).toBe(0);
  });

  it('큰 자료가 같은 쪽을 수천 번 가리켜도 저장소 크기를 넘게 잡지 않는다', () => {
    const d = acdsBlob(4000, 1048576);
    const before = process.memoryUsage().arrayBuffers;
    const r = within2s(() => acdsRecords(d));
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(0x10000000);
    expect(r.get('1A')!.length).toBeLessThanOrEqual(d.length);
  });
});
