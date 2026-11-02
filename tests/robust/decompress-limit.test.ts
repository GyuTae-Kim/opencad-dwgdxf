/**
 * 36차: 압축 비율 32:1이 합법 DWG를 손상으로 거부하던 결함.
 * 한도는 이제 형식의 상한(255:1)이고 파일에서 푸는 크기의 합을 묶는다. 크기만 크게 적은 파일은 여전히 할당 전에 막힌다.
 * 넓어진 한도로 객체 구역이 512MiB를 넘는 파일이 닿으므로 비트 위치가 2^32를 넘어도 읽는지도 본다.
 */
import { describe, expect, it } from 'vitest';
import { CadReadError } from '../../src/core/errors';
import { DECOMPRESS_RATIO, ZERO_PAGE_SKIP, decompressLimit, sectionWorkLimit } from '../../src/core/limits';
import type { CadDocument, Entity, LineEntity, LwPolylineEntity, Ole2FrameEntity, TableEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { EditSession } from '../../src/edit/session';
import { createTable } from '../../src/edit/table/model';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { defaultTableStyle } from '../../src/edit/table/style';
import { writeDwg } from '../../src/io/dwg';
import { BitReader } from '../../src/io/dwg/bitstream';
import { buildDocument } from '../../src/io/dwg/build';
import { readR2004Container } from '../../src/io/dwg/container/r2004';
import { readR2007Container } from '../../src/io/dwg/container/r2007';
import type { DwgSections } from '../../src/io/dwg/container/types';
import { readObjectMap } from '../../src/io/dwg/handles';
import { decompressR18 } from '../../src/io/dwg/lz77';
import { ObjectReader } from '../../src/io/dwg/objects/reader';
import { fingerprint } from '../../src/io/dwg/rawbody';
import { R2004, R2007, R2018 } from '../../src/io/dwg/version';
import { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { encoderFor } from '../../src/io/dwg/writer/codepage';
import { writeR2004 } from '../../src/io/dwg/writer/container';
import { compressR18 } from '../../src/io/dwg/writer/lz77enc';
import { readCadFile } from '../../src/io/index';
import { encodeObjectMap, r2004Pages, r2007Pages } from './corrupt35';

const MiB = 1048576;
/** 고치기 전의 한도: 파일 × 32 + 1MiB. 입력이 이 값을 넘어야 고친 것을 확인하는 시험이다 */
const oldLimit = (fileBytes: number) => fileBytes * 32 + MiB;
const modelOf = (doc: CadDocument): Entity[] => doc.blocks.get(MODEL_SPACE)!.entities;
const reasonOf = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(CadReadError);
    return (e as CadReadError).detail?.reason as string | undefined;
  }
  return undefined;
};
/** f가 잡은 ArrayBuffer 바이트. 거부되면 거부되기 전까지 잡은 몫이다 */
const allocatedBy = (f: () => unknown): number => {
  const before = process.memoryUsage().arrayBuffers;
  try {
    f();
  } catch {
    // 거부되는 입력도 재므로 그대로 둔다
  }
  return process.memoryUsage().arrayBuffers - before;
};

function polylines(n: number, verts: number): CadDocument {
  const doc = createNewDocument('metric');
  const s = new EditSession(doc, () => {});
  const flat: number[] = [];
  for (let i = 0; i < verts; i++) flat.push(i, i % 2, 0);
  const es = modelOf(doc);
  for (let k = 0; k < n; k++) {
    const e: LwPolylineEntity = { ...entityDefaults(), type: 'LWPOLYLINE', handle: s.newHandle(), verts: flat, closed: false, plinegen: false, constantWidth: 0, elevation: 0 };
    es.push(e);
  }
  return doc;
}

/** 표 명령과 같은 길로 만든 빈 표 하나 */
function appTable(rows: number, cols: number): CadDocument {
  const doc = createNewDocument('metric');
  const s = new EditSession(doc, () => {});
  const nh = () => s.newHandle();
  const style = defaultTableStyle(true, '표');
  const saved = saveTableStyleOps(doc, nh, style);
  s.commit({ label: 'TABLESTYLE', ops: saved.ops });
  const data = createTable({ cols, colWidth: 40, dataRows: rows, rowLines: 1, first: 'data', second: 'data' }, style);
  const added = addTableOps(doc, nh, { space: MODEL_SPACE, data, style, styleHandle: saved.handle, insert: { x: 0, y: 0, z: 0 }, props: { ...entityDefaults() } });
  s.commit({ label: 'TABLE', ops: added.ops });
  return doc;
}

describe('합법 DWG를 다시 연다', () => {
  it.each([['AC1018', R2004], ['AC1032', R2018]] as const)('앱이 쓴 300 × 300 표(%s, 0.03~0.06MB가 2~3MB로 풀린다)', (version, ver) => {
    const { data } = writeDwg(appTable(300, 300), { version });
    const sec = readR2004Container(data.slice(), ver);
    expect(sec.objects.length).toBeGreaterThan(oldLimit(data.length));
    const doc = readCadFile(data, 'x.dwg');
    const t = modelOf(doc).find((e) => e.type === 'ACAD_TABLE') as TableEntity;
    expect([t.rows, t.columns]).toEqual([300, 300]);
    expect(doc.warnings).toEqual([]);
  });

  it('정점 300개 꺾은선 6만 개(AC1032, 7.9MB)', () => {
    const { data } = writeDwg(polylines(60000, 300), { version: 'AC1032' });
    expect(data.length).toBeLessThan(8.5 * MiB);
    const sec = readR2004Container(data.slice(), R2018);
    expect(sec.objects.length).toBeGreaterThan(oldLimit(data.length));
    const doc = readCadFile(data, 'x.dwg');
    const es = modelOf(doc) as LwPolylineEntity[];
    expect(es.length).toBe(60000);
    expect(es.every((e) => e.type === 'LWPOLYLINE' && e.verts.length === 900)).toBe(true);
    expect(es[59999]!.verts.slice(-3)).toEqual([299, 1, 0]);
    expect(doc.warnings).toEqual([]);
  });

  it('같은 바이트로 찬 섹션: 쓰기가 실제로 내는 비율(지도까지 166:1)도 받는다', () => {
    const objects = new Uint8Array(1000 * 0x7400).fill(0x55);
    const section = (name: string, bytes: Uint8Array) => ({ name, data: bytes, compressed: true, pageSize: 0x7400 });
    const sections = [section('AcDb:Header', new Uint8Array(32).fill(1)), section('AcDb:Handles', new Uint8Array(32).fill(2)), section('AcDb:AcDbObjects', objects)];
    const data = writeR2004(1018, 0, 30, sections, sections.map((s) => s.name));
    expect(objects.length / data.length).toBeGreaterThan(160);
    const sec = readR2004Container(data, R2004);
    expect(sec.warnings).toEqual([]);
    expect(sec.objects.length).toBe(objects.length);
    expect(sec.objects.every((b) => b === 0x55)).toBe(true);
  });
});

describe('한도의 근거: 형식의 상한', () => {
  /** 글자 4개 뒤에 긴 길이의 되돌아 복사 하나(길이 바이트 0이 zeros개) */
  const longCopy = (zeros: number): Uint8Array => new Uint8Array([0x01, 1, 2, 3, 4, 0x20, ...new Array<number>(zeros).fill(0), 0xff, 0, 0, 0x11]);
  const unpackedLength = (src: Uint8Array): number => {
    const out = decompressR18(src, 0, src.length, 16 * MiB);
    return out.findLastIndex((b) => b !== 0) + 1;
  };

  it('R2004 압축은 어떤 길이에서도 읽은 바이트의 255배를 풀지 못하고 그 값에 다가간다', () => {
    for (const zeros of [0, 1, 10, 115, 1000, 10000]) {
      const src = longCopy(zeros);
      expect(unpackedLength(src)).toBeLessThan(DECOMPRESS_RATIO * src.length);
    }
    const src = longCopy(10000);
    expect(unpackedLength(src)).toBeGreaterThan(254 * src.length);
  });

  it('같은 바이트로 찬 페이지는 머리까지 160바이트라 낮은 비율은 합법 파일을 거부한다', () => {
    const payload = compressR18(new Uint8Array(0x7400).fill(0x55));
    expect(Math.ceil((32 + payload.length) / 0x20) * 0x20).toBe(160);
  });
});

/** 크기 칸이 파일 크기를 따라가는 입력: 크기가 바뀌면 압축된 지도의 길이도 바뀔 수 있어 맞을 때까지 다시 만든다 */
function atLimit(build: (sizes: number[]) => Uint8Array, sizes: (limit: number) => number[]): Uint8Array {
  let data = build([16, 16, 16]);
  for (let i = 0; i < 4; i++) {
    const next = build(sizes(decompressLimit(data.length)));
    if (next.length === data.length) return next;
    data = next;
  }
  throw new Error('파일 크기가 맞지 않습니다');
}
const r2004 = (sizes: number[], bytes = 512) => r2004Pages(1, bytes, 0x7400, 1, sizes);
const r2007 = (sizes: number[]) => r2007Pages(1, 512, 512, sizes);
/** 페이지가 크기를 모두 뒷받침하는 입력(같은 페이지를 되풀이해 가리킨다) */
const backed2004 = (sizes: number[]) => r2004Pages(0, 512, 0x7400, 1, sizes, undefined, [300, 300, 0]);
const backed2007 = (counts: number[]) => (sizes: number[]) => r2007Pages(0, 512, 0x7400, sizes, counts);

describe('압축 폭탄', () => {
  it('작은 파일이 큰 섹션을 적으면 할당 전에 손상으로 알린다', () => {
    const tiny = r2004([4 * 1024 * MiB, 16, 16]);
    expect(tiny.length).toBeLessThan(2048);
    expect(reasonOf(() => readR2004Container(tiny, R2004))).toBe('section size');
    expect(allocatedBy(() => readR2004Container(tiny, R2004))).toBeLessThan(16 * MiB);

    const small = r2004([256 * MiB, 16, 16], 100_000);
    expect(small.length).toBeLessThan(110_000);
    expect(reasonOf(() => readR2004Container(small, R2004))).toBe('section size');
    expect(allocatedBy(() => readR2004Container(small, R2004))).toBeLessThan(16 * MiB);

    const r21 = r2007([4 * 1024 * MiB, 16, 16]);
    expect(reasonOf(() => readR2007Container(r21, R2007))).toBe('section size');
    expect(allocatedBy(() => readR2007Container(r21, R2007))).toBeLessThan(16 * MiB);
  });

  it('작은 파일의 한도는 작다(100KB 파일이 26MiB 안쪽)', () => {
    expect(decompressLimit(100_000)).toBeLessThan(26 * MiB);
    expect(decompressLimit(7_000)).toBeLessThan(3 * MiB);
  });

  it('한도와 같은 크기는 받고 1바이트 넘으면 막는다', () => {
    const fits = atLimit(backed2004, (limit) => [limit - 16, 16, 16]);
    expect(readR2004Container(fits, R2004).warnings.map((w) => w.code)).not.toContain('dwg.page_repeat');
    const over = atLimit(backed2004, (limit) => [limit - 15, 16, 16]);
    expect(reasonOf(() => readR2004Container(over, R2004))).toBe('section size');

    const fits21 = atLimit(backed2007([3000, 1, 0]), (limit) => [limit - 16, 16, 16]);
    expect(readR2007Container(fits21, R2007).header.length).toBe(decompressLimit(fits21.length) - 16);
    const over21 = atLimit(backed2007([3000, 1, 0]), (limit) => [limit - 15, 16, 16]);
    expect(reasonOf(() => readR2007Container(over21, R2007))).toBe('section size');
  });

  it('섹션마다 한도 안이어도 푸는 크기의 합이 한도를 넘으면 막는다', () => {
    const half = (limit: number) => [Math.ceil(limit * 0.6), Math.ceil(limit * 0.6), 16];
    expect(reasonOf(() => readR2004Container(atLimit(backed2004, half), R2004))).toBe('section size');
    expect(reasonOf(() => readR2007Container(atLimit(backed2007([1500, 1500, 0]), half), R2007))).toBe('section size');
  });

  it('섹션 크기와 페이지 크기를 함께 부풀려도 버퍼 합이 한도 안이다', () => {
    const bytes = 100_000;
    const r18 = (sizes: number[]) => r2004Pages(1, bytes, 0x7fffffff, 2, sizes);
    const data = atLimit(r18, (limit) => [limit - 64, 16, 16]);
    expect(allocatedBy(() => readR2004Container(data, R2004))).toBeLessThan(decompressLimit(data.length) * 1.2);

    // 페이지 하나만 보면 한도 안이고 섹션을 더하면 넘는다
    const limit = decompressLimit(r2007([16, 16, 16]).length);
    const near = r2007Pages(1, 512, limit - 1024, [Math.floor(limit / 2), 16, 16]);
    expect(near.length).toBe(r2007([16, 16, 16]).length);
    expect(readR2007Container(near, R2007).warnings.map((w) => w.code)).toContain('dwg.page_corrupt');
  });

  it('선택 섹션 하나가 크기를 잘못 적어도 합을 쓰지 않아 뒤 섹션을 읽는다', () => {
    const names = ['AcDb:Header', 'AcDb:Handles', 'AcDb:AcDbObjects', 'AcDb:Template', 'AcDb:SummaryInfo'];
    const sec = readR2004Container(r2004Pages(1, 512, 0x7400, 1, [16, 16, 16, 2 ** 40, 16], names), R2004);
    expect(sec.template).toBeNull();
    expect(sec.summaryInfo?.length).toBe(16);
  });

  it('섹션 크기가 작으면 큰 파일에서도 같은 페이지 되풀이가 곧 멈춘다', () => {
    const pageWork = 4 * MiB;
    const data = r2004Pages(1000000, pageWork);
    const w = readR2004Container(data, R2004).warnings.find((x) => x.code === 'dwg.page_repeat');
    expect(w).toBeDefined();
    // 파일 × 비율로 잡으면 3GiB를 돈다
    expect(w!.detail!.work as number).toBeLessThanOrEqual(sectionWorkLimit(data.length, 16) + pageWork);
    expect(w!.detail!.work as number).toBeLessThanOrEqual(24 * MiB);
  });
});

describe('0만 있는 페이지', () => {
  const PAGE = 0x7400;
  const section = (name: string, data: Uint8Array) => ({ name, data, compressed: true, pageSize: PAGE });
  const write = (objects: Uint8Array, extra: ReturnType<typeof section>[] = []) => {
    const sections = [section('AcDb:Header', new Uint8Array(32).fill(1)), section('AcDb:Handles', new Uint8Array(32).fill(2)), section('AcDb:AcDbObjects', objects), ...extra];
    return writeR2004(1018, 0, 30, sections, sections.map((s) => s.name));
  };

  it('건너뛰는 합은 읽기 한도의 여유 안쪽이다', () => {
    expect(ZERO_PAGE_SKIP).toBeLessThan(decompressLimit(0));
    expect(decompressLimit(0) - ZERO_PAGE_SKIP).toBeGreaterThanOrEqual(PAGE);
  });

  it('원본 본문에 0이 8MiB 이어진 OLE 객체를 다시 저장해도 다시 열린다', () => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    const e: Ole2FrameEntity = { ...entityDefaults(), type: 'OLE2FRAME', handle: s.newHandle(), upperLeft: { x: 0, y: 0, z: 0 }, lowerRight: { x: 0, y: 0, z: 0 } };
    const body = new Uint8Array(8 * MiB);
    body[0] = 0xff;
    body[body.length - 1] = 0x81;
    e.dwgRaw = { version: 'AC1032', typeName: 'OLE2FRAME', typeNum: 74, data: body, dataBits: body.length * 8, handles: new Uint8Array(8), handleBits: 0, fingerprint: fingerprint(e) };
    modelOf(doc).push(e);
    const { data } = writeDwg(doc, { version: 'AC1032' });
    const back = readCadFile(data, 'x.dwg');
    expect(back.warnings).toEqual([]);
    const rawOf = (d: CadDocument) => modelOf(d).find((x) => x.type === 'OLE2FRAME')!.dwgRaw!.data;
    expect(Buffer.compare(rawOf(back), body)).toBe(0);
    const again = readCadFile(writeDwg(back, { version: 'AC1032' }).data, 'y.dwg');
    expect(again.warnings).toEqual([]);
    expect(Buffer.compare(rawOf(again), body)).toBe(0);
  });

  it('0 구역 앞뒤의 자료가 제자리에 남는다', () => {
    const objects = new Uint8Array(64 * MiB);
    for (let i = 0; i < 4096; i++) objects[i] = (i * 31) & 0xff;
    objects.set([1, 2, 3], objects.length - 3);
    const sec = readR2004Container(write(objects), R2004);
    expect(sec.warnings).toEqual([]);
    expect(Buffer.compare(sec.objects, objects)).toBe(0);
  });

  it('건너뛰는 합은 섹션마다가 아니라 파일 전체다', () => {
    // 첫 섹션만 건너뛰고 뒤 세 섹션은 쓴다. 섹션마다 묶으면 네 섹션을 모두 건너뛰어 파일이 2KB 안쪽이다
    const pages = Math.floor(ZERO_PAGE_SKIP / PAGE);
    const zeros = new Uint8Array(pages * PAGE);
    const data = write(zeros, [section('AcDb:Classes', zeros), section('AcDb:Template', zeros), section('AcDb:SummaryInfo', zeros)]);
    expect(data.length).toBeGreaterThanOrEqual(3 * pages * 160);
    const sec = readR2004Container(data, R2004);
    expect([sec.objects.length, sec.classes!.length, sec.template?.length, sec.summaryInfo?.length]).toEqual(new Array(4).fill(zeros.length));
  });

  it('합 안쪽의 0 페이지는 전처럼 쓰지 않아 일반 파일의 출력이 그대로다', () => {
    const fits = Math.floor(ZERO_PAGE_SKIP / PAGE);
    const small = write(new Uint8Array(PAGE));
    expect(write(new Uint8Array(fits * PAGE)).length).toBe(small.length);
    expect(write(new Uint8Array((fits + 10) * PAGE)).length).toBeGreaterThanOrEqual(small.length + 10 * 160);
  });
});

describe('비트 위치가 2^32를 넘는 자리', () => {
  const FAR = 0x20000000; // 512MiB, 비트로 2^32
  const enc = encoderFor('ANSI_1252');

  /** 같은 자료를 앞과 2^32비트 뒤에 두고 값마다 같은지 본다 */
  it('값 읽기', () => {
    const w = new BitWriter(R2018, enc, 256);
    w.B(1);
    w.BB(2);
    w.RC(0xa5);
    w.RS(-1234);
    w.RL(0x12345678);
    w.RD(1.5);
    w.BS(300);
    w.BL(70000);
    w.BD(2.25);
    w.alignByte();
    w.RL(77);
    w.RD(-3.5);
    const bytes = w.bytes();
    const read = (r: BitReader) => {
      const start = r.pos;
      const out = [r.B(), r.BB(), r.RC(), r.RS(), r.RL(), r.RD(), r.BS(), r.BL(), r.BD()];
      r.alignByte();
      out.push(r.pos - start, r.RL(), r.RD());
      return out;
    };
    const near = new Uint8Array(bytes.length + 8);
    near.set(bytes);
    const far = new Uint8Array(FAR + bytes.length + 8);
    far.set(bytes, FAR);
    const a = new BitReader(near, R2018, new TextDecoder());
    const b = new BitReader(far, R2018, new TextDecoder());
    b.pos = FAR * 8;
    expect(read(b)).toEqual(read(a));
  });

  it('bits·문자열 바이트·바이트 맞춤', () => {
    const far = new Uint8Array(FAR + 16);
    far.set([0xab, 0xcd, 0x41, 0x42], FAR);
    const r = new BitReader(far, R2004, new TextDecoder());
    r.pos = FAR * 8;
    expect(r.bits(12)).toBe(0xabc);
    expect(r.bytePos).toBe(FAR + 1);
    r.alignByte();
    expect(r.pos).toBe((FAR + 2) * 8);
    expect(r.bytesToString(2)).toBe('AB');
  });

  it('도형의 프록시 그림(R2010+는 바이트에 맞아 바로 잘라 온다)', () => {
    const body = new BitWriter(R2018, enc, 256);
    body.OT(19);
    body.H(0, 0x50);
    body.BS(0); // 확장 자료 없음
    body.B(1);
    body.BLL(4);
    body.rawBytes(new Uint8Array([1, 2, 3, 4]));
    for (let i = 0; i < 32; i++) body.RC(0);
    const bytes = body.bytes();
    const head = new BitWriter(R2018, enc, 16);
    head.MS(bytes.length);
    head.UMC(0);
    const start = head.bytes();
    const far = new Uint8Array(FAR + start.length + bytes.length + 8);
    far.set(start, FAR);
    far.set(bytes, FAR + start.length);
    const or = new ObjectReader(far, R2018, new TextDecoder(), []);
    or.begin(FAR, 0x50);
    expect([...or.commonEntity().graphics!]).toEqual([1, 2, 3, 4]);
  });

  /** 객체를 모두 offset 바이트 뒤로 옮긴 섹션(앞쪽은 0이라 메모리를 거의 쓰지 않는다) */
  const relocated = (sec: DwgSections, offset: number): DwgSections => {
    const objects = new Uint8Array(offset + sec.objects.length);
    objects.set(sec.objects, offset);
    const pairs: [number, number][] = [...readObjectMap(sec)].map(([h, at]) => [h, at + offset]);
    pairs.sort((a, b) => a[0] - b[0]);
    return { ...sec, objects, handles: encodeObjectMap(pairs) };
  };

  it.each([['AC1018', R2004], ['AC1032', R2018]] as const)('%s: 객체를 512MiB 뒤로 옮겨도 같은 문서를 읽는다', (version, ver) => {
    const doc = appTable(3, 2);
    const s = new EditSession(doc, () => {});
    const line: LineEntity = { ...entityDefaults(), type: 'LINE', handle: s.newHandle(), start: { x: 1, y: 2, z: 0 }, end: { x: 3, y: 4, z: 0 } };
    const text: TextEntity = { ...entityDefaults(), type: 'TEXT', handle: s.newHandle(), insert: { x: 0, y: 0, z: 0 }, height: 2.5, text: '가나다', rotation: 0, style: 'Standard' } as TextEntity;
    modelOf(doc).push(line, text);
    const data = writeDwg(doc, { version }).data.slice();
    const sec = readR2004Container(data, ver);
    const near = buildDocument(sec);
    const far = buildDocument(relocated(readR2004Container(data, ver), FAR));
    // 옮긴 지도는 구역 CRC를 맞추지 않으므로 그 경고만 빼고 견준다. 객체 CRC 경고는 남는다
    expect(far.warnings.filter((w) => w.detail?.sections === undefined)).toEqual(near.warnings);
    expect(modelOf(far).length).toBe(modelOf(near).length);
    expect(JSON.stringify(modelOf(far))).toBe(JSON.stringify(modelOf(near)));
    expect(JSON.stringify([...far.objects.values()])).toBe(JSON.stringify([...near.objects.values()]));
  });
});
