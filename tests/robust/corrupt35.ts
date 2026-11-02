/**
 * 35차 견고성 시험의 합성 손상 파일(시험 안에서 만든다 — 저장소에 파일을 넣지 않는다).
 * 파일 안의 개수·크기 값만 크게 바꾼 작은 DXF 글·DWG 바이트.
 */
import type { LineEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readR2000Container } from '../../src/io/dwg/container/r2000';
import { readR2004Container } from '../../src/io/dwg/container/r2004';
import type { DwgSections } from '../../src/io/dwg/container/types';
import { readObjectMap } from '../../src/io/dwg/handles';
import { decompressR18 } from '../../src/io/dwg/lz77';
import { R2000, R2004 } from '../../src/io/dwg/version';
import { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { encoderFor } from '../../src/io/dwg/writer/codepage';
import { compressR18 } from '../../src/io/dwg/writer/lz77enc';
import { writeDwg } from '../../src/io/dwg';

/** 머리말 + (표) + 블록 + 도형만 있는 DXF 글 */
export function dxfText(ents: string[][], blocks: string[][] = [], tables: string[] = []): string {
  return [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1018', '0', 'ENDSEC',
    ...tables,
    '0', 'SECTION', '2', 'BLOCKS', ...blocks.flat(), '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...ents.flat(), '0', 'ENDSEC',
    '0', 'EOF', '',
  ].join('\n');
}

export const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);

/** 선종류 D(대시 길이 dash, 틈 같은 길이)가 든 표 구역 */
export const ltypeTable = (dash: number): string[] => [
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '1',
  '0', 'LTYPE', '2', 'D', '70', '0', '3', 'd', '72', '65', '73', '2', '40', String(dash * 2), '49', String(dash), '74', '0', '49', String(-dash), '74', '0',
  '0', 'ENDTAB', '0', 'ENDSEC',
];

/** 선종류 D로 그린 선(길이 len) */
export const dashedLine = (y: number, len: number): string[] => ['0', 'LINE', '8', '0', '6', 'D', '10', '0', '20', String(y), '30', '0', '11', String(len), '21', String(y), '31', '0'];

/** 선 하나가 든 블록 B */
export const BLOCK_B = ['0', 'BLOCK', '8', '0', '2', 'B', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'B', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0', '0', 'ENDBLK', '8', '0'];

/** 다중 삽입(MINSERT): 열 70·행 71 */
export function minsert(cols: number, rows: number, handle = '1A', block = 'B'): string[] {
  return ['0', 'INSERT', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbMInsertBlock', '2', block, '10', '0', '20', '0', '30', '0', '70', String(cols), '71', String(rows), '44', '2', '45', '2'];
}

/** 표(ACAD_TABLE): 행 91·열 92와 행 높이 141·열 폭 142(각 2개) */
export function table(rows: number, cols: number, handle = '2A'): string[] {
  return [
    '0', 'ACAD_TABLE', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockReference', '2', '*T1', '10', '0', '20', '0', '30', '0',
    '100', 'AcDbTable', '91', String(rows), '92', String(cols), '141', '5', '141', '5', '142', '10', '142', '10',
  ];
}

/** 앱 표 확장 자료(OPENCAD_TABLE)가 붙은 블록 참조: 크기 rows×cols, 그 뒤 묶음(1000 이름 다음 1071 값들) */
export function tableXdataInsert(rows: number, cols: number, group: string, values: number[], handle = '3A'): string[] {
  return [
    '0', 'INSERT', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockReference', '2', 'B', '10', '0', '20', '0', '30', '0',
    '1001', 'OPENCAD_TABLE', '1000', 'OPENCAD_TABLE 1', '1000', 'size', '1071', String(rows), '1071', String(cols),
    '1000', group, ...values.flatMap((v) => ['1071', String(v)]),
  ];
}

/** 스플라인: 차수 71, 조정점 n개(매듭 없이 — 균일 매듭으로 계산한다) */
export function spline(degree: number, n: number, handle = '4A'): string[] {
  const out = ['0', 'SPLINE', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbSpline', '70', '8', '71', String(degree), '72', '0', '73', String(n), '74', '0'];
  for (let i = 0; i < n; i++) out.push('10', String(i), '20', String((i * 7) % 5), '30', '0');
  return out;
}

const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const put32 = (b: Uint8Array, o: number, v: number) => {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
};

/**
 * R2004(AC1018) DWG에서 섹션 지도의 'AcDb:Header' 칸 최대 페이지 크기(maxSize)만 바꾼 파일.
 * 섹션 지도 시스템 페이지(종류 0x4163003b)를 풀어 값을 고치고 다시 압축해 같은 자리에 넣는다(체크섬은 다시 맞추지 않는다 — 읽기는 보지 않는다)
 */
export function r2004WithMaxSize(maxSize: number): Uint8Array {
  const doc = createNewDocument('metric');
  const line: LineEntity = { ...entityDefaults(), type: 'LINE', handle: '', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 } };
  doc.blocks.get(MODEL_SPACE)!.entities.push(line);
  const data = writeDwg(doc, { version: 'AC1018' }).data.slice();
  for (let a = 0x100; a + 0x14 < data.length; a++) {
    if (u32(data, a) !== 0x4163003b) continue;
    const decomp = u32(data, a + 4);
    const comp = u32(data, a + 8);
    if (u32(data, a + 12) !== 2 || decomp > 0x100000 || a + 0x14 + comp > data.length) continue;
    const map = decompressR18(data, a + 0x14, a + 0x14 + comp, decomp);
    const name = new TextEncoder().encode('AcDb:Header');
    let at = -1;
    for (let i = 0; i + name.length <= map.length && at < 0; i++) if (name.every((c, k) => map[i + k] === c)) at = i;
    if (at < 0x20) continue;
    put32(map, at - 0x20 + 0x0c, maxSize);
    const re = compressR18(map);
    // 같은 페이지 자리(32바이트 단위로 올린 크기) 안에 들어가야 한다
    const slot = Math.ceil((0x14 + comp) / 0x20) * 0x20;
    if (0x14 + re.length > slot) throw new Error('다시 압축한 섹션 지도가 자리를 넘습니다');
    put32(data, a + 8, re.length);
    data.fill(0, a + 0x14, a + slot);
    data.set(re, a + 0x14);
    return data;
  }
  throw new Error('섹션 지도 페이지를 찾지 못했습니다');
}

/**
 * 최소 R2007(AC1021) DWG: 파일 헤더(Reed–Solomon 끼워 짠 3블록, 압축하지 않음)가 가리키는 페이지 지도·섹션 지도의 "푼 크기"만 uncomp로 크게 둔다.
 * 지도 페이지 자체는 0x480의 한 블록(압축 크기 8)
 */
export function r2007WithMapSize(uncomp: number): Uint8Array {
  const data = new Uint8Array(0x480 + 255 * 2);
  data.set(new TextEncoder().encode('AC1021'), 0);
  const hdr = new Uint8Array(3 * 239);
  const dv = new DataView(hdr.buffer);
  dv.setInt32(0x18, -0x110, true);
  const fh = (off: number, v: number) => {
    dv.setUint32(0x20 + off, v % 0x100000000, true);
    dv.setUint32(0x20 + off + 4, Math.floor(v / 0x100000000), true);
  };
  fh(0x18, 1); // 페이지 지도 보정(배수)
  fh(0x38, 0); // 페이지 지도 위치(+ 0x480)
  fh(0x50, 8); // 페이지 지도 압축 크기
  fh(0x58, uncomp); // 페이지 지도 푼 크기
  fh(0xb0, 8);
  fh(0xc0, 0);
  fh(0xc8, uncomp);
  fh(0xd8, 1);
  // 끼워 짜기: 블록 i의 j번째 바이트 → 0x80 + j * 3 + i
  for (let x = 0; x < hdr.length; x++) data[0x80 + (x % 239) * 3 + Math.floor(x / 239)] = hdr[x]!;
  return data;
}

// ---------------------------------------------------------------------------
// DXF: 블록 중첩·해치·스플라인 매듭·표 병합
// ---------------------------------------------------------------------------

/** 블록 N0이 N1을 fan번, N1이 N2를 fan번 … 넣고 마지막 블록은 선 하나. 그리면 선이 fan^depth개 */
export function nestedBlocks(depth: number, fan: number): string[][] {
  const out: string[][] = [];
  const head = (n: string) => ['0', 'BLOCK', '8', '0', '2', n, '70', '0', '10', '0', '20', '0', '30', '0', '3', n];
  const tail = ['0', 'ENDBLK', '8', '0'];
  for (let d = 0; d < depth; d++) {
    const body: string[] = [];
    for (let k = 0; k < fan; k++) body.push('0', 'INSERT', '8', '0', '2', `N${d + 1}`, '10', String(k), '20', '0', '30', '0');
    out.push([...head(`N${d}`), ...body, ...tail]);
  }
  out.push([...head(`N${depth}`), '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0', ...tail]);
  return out;
}

/** 블록 이름 하나를 가리키는 보통 블록 참조 */
export const insertOf = (block: string, handle = '6A'): string[] => ['0', 'INSERT', '5', handle, '8', '0', '2', block, '10', '0', '20', '0', '30', '0'];

/** 사각 경계(크기 size, 왼쪽 아래 x·y)의 무늬 해치: 무늬 선 하나(각도 0, 기준 baseY, 간격 spacing, 대시) */
export function hatch(o: { size?: number; x?: number; y?: number; spacing: number; dashes?: number[]; baseY?: number }, handle = '5A'): string[] {
  const s = o.size ?? 100;
  const x = o.x ?? 0;
  const y = o.y ?? 0;
  const c = [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
  ] as const;
  const edges: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i]!;
    const b = c[(i + 1) % 4]!;
    edges.push('72', '1', '10', String(a[0]), '20', String(a[1]), '11', String(b[0]), '21', String(b[1]));
  }
  const dashes = o.dashes ?? [];
  return [
    '0', 'HATCH', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbHatch',
    '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1',
    '2', 'P', '70', '0', '71', '0', '91', '1', '92', '1', '93', '4', ...edges, '97', '0',
    '75', '0', '76', '1', '52', '0', '41', '1', '77', '0', '78', '1',
    '53', '0', '43', '0', '44', String(o.baseY ?? 0), '45', '0', '46', String(o.spacing), '79', String(dashes.length),
    ...dashes.flatMap((d) => ['49', String(d)]),
    '98', '0',
  ];
}

/** 스플라인: 차수·매듭을 직접 준다(조정점 n개) */
export function splineKnots(degree: number, n: number, knots: number[], handle = '4B'): string[] {
  const out = ['0', 'SPLINE', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbSpline', '70', '8', '71', String(degree), '72', String(knots.length), '73', String(n), '74', '0'];
  for (const k of knots) out.push('40', String(k));
  for (let i = 0; i < n; i++) out.push('10', String(i), '20', String((i * 7) % 5), '30', '0');
  return out;
}

/** 표 + 첫 셀의 병합 폭 175·높이 176(원본 태그) */
export function tableMerge(rows: number, cols: number, spanW: number, spanH: number, handle = '2B'): string[] {
  return [...table(rows, cols, handle), '171', '1', '175', String(spanW), '176', String(spanH)];
}

// ---------------------------------------------------------------------------
// DWG 컨테이너: 지도 하나가 같은 페이지를 여러 번 가리키는 파일
// ---------------------------------------------------------------------------

const put64 = (b: Uint8Array, o: number, v: number) => {
  put32(b, o, v % 0x100000000);
  put32(b, o + 4, Math.floor(v / 0x100000000));
};

const NAMES = ['AcDb:Header', 'AcDb:Handles', 'AcDb:AcDbObjects'] as const;

/**
 * 최소 R2004(AC1018): 'AcDb:Header' 섹션이 자료 페이지 하나를 pageCount번 가리킨다(그 페이지의 체크섬을 pageCount번 잰다).
 * 섹션 지도는 압축되므로 파일은 작다. dataBytes = 자료 페이지 크기
 */
export function r2004Pages(pageCount: number, dataBytes: number, maxSize = 0x7400, compressed = 1): Uint8Array {
  // 섹션 지도
  const descs = NAMES.length;
  const sm = new Uint8Array(0x14 + descs * 0x60 + pageCount * 16);
  put32(sm, 0, descs);
  let q = 0x14;
  NAMES.forEach((name, i) => {
    const n = i === 0 ? pageCount : 0;
    put64(sm, q, 16);
    put32(sm, q + 8, n);
    put32(sm, q + 0x0c, maxSize);
    put32(sm, q + 0x14, compressed); // 1 압축하지 않음, 2 압축
    put32(sm, q + 0x18, i + 1);
    sm.set(new TextEncoder().encode(name), q + 0x20);
    q += 0x60;
    for (let k = 0; k < n; k++) {
      put32(sm, q, 3);
      put32(sm, q + 4, dataBytes);
      q += 16;
    }
  });
  const smComp = compressR18(sm);
  const smSize = Math.ceil((0x14 + smComp.length) / 0x20) * 0x20;
  const dataSize = Math.ceil((32 + dataBytes) / 0x20) * 0x20;
  // 페이지 지도: 1 자기 자신, 2 섹션 지도, 3 자료
  const pm = new Uint8Array(3 * 8);
  const pmSize = Math.ceil((0x14 + pm.length) / 0x20) * 0x20;
  [pmSize, smSize, dataSize].forEach((sz, i) => {
    put32(pm, i * 8, i + 1);
    put32(pm, i * 8 + 4, sz);
  });
  const out = new Uint8Array(0x100 + pmSize + smSize + dataSize);
  out.set(new TextEncoder().encode('AC1018'), 0);
  // 머리: 0x80부터 XOR
  const hdr = new Uint8Array(0x6c);
  hdr.set(new TextEncoder().encode('AcFssFcAJMB'), 0);
  put32(hdr, 0x54, 0); // 페이지 지도 위치(0x100 기준)
  put32(hdr, 0x5c, 2); // 섹션 지도 페이지 번호
  let seed = 1;
  for (let i = 0; i < 0x6c; i++) {
    seed = (Math.imul(seed, 0x343fd) + 0x269ec3) | 0;
    out[0x80 + i] = hdr[i]! ^ ((seed >> 16) & 0xff);
  }
  const sys = (at: number, type: number, decomp: number, body: Uint8Array, compType: number) => {
    put32(out, at, type);
    put32(out, at + 4, decomp);
    put32(out, at + 8, body.length);
    put32(out, at + 12, compType);
    out.set(body, at + 0x14);
  };
  sys(0x100, 0x41630e3b, pm.length, pm, 1);
  sys(0x100 + pmSize, 0x4163003b, sm.length, smComp, 2);
  // 자료 페이지: 32바이트 머리는 주소로 가린다
  const a = 0x100 + pmSize + smSize;
  const mask = (0x4164536b ^ a) >>> 0;
  put32(out, a, (0x4163043b ^ mask) >>> 0);
  put32(out, a + 8, (dataBytes ^ mask) >>> 0);
  put32(out, a + 16, mask);
  put32(out, a + 20, mask);
  return out;
}

/** RS 블록 끼워 짜기(읽기의 rsDecode와 반대) */
function rsInterleave(payload: Uint8Array, k: number): Uint8Array {
  const blocks = Math.max(1, Math.ceil(payload.length / k));
  const raw = new Uint8Array(blocks * 255);
  for (let i = 0; i < blocks; i++) for (let j = 0; j < k; j++) raw[j * blocks + i] = payload[i * k + j] ?? 0;
  return raw;
}

/**
 * 최소 R2007(AC1021): 'AcDb:Header' 섹션이 자료 페이지 하나를 pageCount번 가리킨다(페이지마다 그 페이지의 Reed–Solomon 끼워 짬을 다시 푼다).
 * uncomp를 주면 페이지마다의 "푼 크기"를 그 값으로 적는다(압축 크기 comp보다 크면 압축을 풀려고 그만큼 잡는다)
 */
export function r2007Pages(pageCount: number, comp: number, uncomp = comp): Uint8Array {
  const u16 = (s: string): Uint8Array => {
    const b = new Uint8Array((s.length + 1) * 2);
    for (let i = 0; i < s.length; i++) b[i * 2] = s.charCodeAt(i);
    return b;
  };
  const parts: Uint8Array[] = [];
  NAMES.forEach((nm, i) => {
    const n = i === 0 ? pageCount : 0;
    const nb = u16(nm);
    const d = new Uint8Array(0x40 + nb.length + n * 56);
    put64(d, 0, 16);
    put64(d, 8, 0x7400);
    put64(d, 0x20, nb.length);
    put64(d, 0x30, 4);
    put64(d, 0x38, n);
    d.set(nb, 0x40);
    let q = 0x40 + nb.length;
    for (let k = 0; k < n; k++) {
      put64(d, q + 8, comp);
      put64(d, q + 16, 3);
      put64(d, q + 24, uncomp);
      put64(d, q + 32, comp);
      q += 56;
    }
    parts.push(d);
  });
  const sm = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    sm.set(p, o);
    o += p.length;
  }
  const smRaw = rsInterleave(sm, 239);
  const pmProbe = new Uint8Array(3 * 16);
  const pmRaw0 = rsInterleave(pmProbe, 239);
  const dataRaw = new Uint8Array(Math.ceil(((comp + 7) & ~7) / 251) * 255);
  const pm = new Uint8Array(3 * 16);
  [pmRaw0.length, smRaw.length, dataRaw.length].forEach((sz, i) => {
    put64(pm, i * 16, sz);
    put64(pm, i * 16 + 8, i + 1);
  });
  const pmRaw = rsInterleave(pm, 239);
  const data = new Uint8Array(0x480 + pmRaw.length + smRaw.length + dataRaw.length);
  data.set(new TextEncoder().encode('AC1021'), 0);
  data.set(pmRaw, 0x480);
  data.set(smRaw, 0x480 + pmRaw.length);
  const hdr = new Uint8Array(3 * 239);
  const dv = new DataView(hdr.buffer);
  dv.setInt32(0x18, -0x110, true);
  const fh = (off: number, v: number) => put64(hdr, 0x20 + off, v);
  fh(0x18, 1);
  fh(0x38, 0);
  fh(0x50, pm.length);
  fh(0x58, pm.length);
  fh(0xb0, sm.length);
  fh(0xc0, 2);
  fh(0xc8, sm.length);
  fh(0xd8, 1);
  for (let x = 0; x < hdr.length; x++) data[0x80 + (x % 239) * 3 + Math.floor(x / 239)] = hdr[x]!;
  return data;
}

// ---------------------------------------------------------------------------
// DWG 객체: 쓰기로 만든 파일의 객체 자리를 손으로 만든 비트로 덮어쓴다
// ---------------------------------------------------------------------------

export interface ObjectBody {
  /** 고정 종류 번호 또는 클래스 번호 */
  type: number;
  handle: number;
  /** 머리(종류·핸들 흐름 크기·핸들·확장 자료 끝) 다음 자료 */
  dat: (w: BitWriter) => void;
  /** 핸들 흐름 */
  hdl: (w: BitWriter) => void;
  /** 자료 흐름 뒤에 채울 0 바이트(개수 값이 남은 비트 검사를 지나가게) */
  pad?: number;
}

/** R2000~R2004 객체 바이트(MS 크기 + 본문 + CRC 자리) */
export function objectBytes(ver: number, b: ObjectBody): Uint8Array {
  const enc = encoderFor('ANSI_1252');
  const w = new BitWriter(ver, enc, 1024);
  w.BS(b.type);
  const at = w.pos;
  w.RL(0);
  w.H(0, b.handle);
  w.BS(0); // 확장 자료 없음
  b.dat(w);
  for (let i = 0; i < (b.pad ?? 0); i++) w.RC(0);
  w.patchRL(at, w.pos);
  b.hdl(w);
  const body = w.bytes();
  const out = new BitWriter(ver, enc, body.length + 16);
  out.MS(body.length);
  out.rawBytes(body);
  out.RS(0);
  return out.bytes();
}

/** 도형 공통 자료(그림 없음, 소유자 없음, 반응자 numReactors개라고 적는다) */
export function entityHead(w: BitWriter, ver: number, numReactors: number): void {
  w.B(0);
  w.BB(2);
  w.BL(numReactors);
  if (ver >= R2004) w.B(1); // 확장 사전 없음
  else w.B(1); // 앞뒤 연결 없음
  if (ver >= R2004) w.BS(0);
  else w.BS(256);
  w.BD(1);
  w.BB(0);
  w.BB(0);
  w.BS(0);
  w.RC(29);
}

/** 비도형 객체 공통 자료(반응자 없음) */
export function objectHead(w: BitWriter, ver: number): void {
  w.BL(0);
  if (ver >= R2004) w.B(1);
}

/** 쓰기로 만든 파일의 섹션과 객체 지도(핸들 → 객체 시작 위치) */
export function sectionsOf(data: Uint8Array, ver: number): { sec: DwgSections; map: Map<number, number> } {
  const sec = ver === R2000 ? readR2000Container(data, ver) : readR2004Container(data, ver);
  return { sec, map: readObjectMap(sec) };
}

/** 선 n개와 정점 verts개짜리 폴리선 하나가 든 DWG. 폴리선 자리는 크므로 큰 객체를 덮어쓸 때 쓴다 */
export function dwgDoc(version: 'AC1015' | 'AC1018', lines: number, verts = 0): { data: Uint8Array; ver: number } {
  const doc = createNewDocument('metric');
  const es = doc.blocks.get(MODEL_SPACE)!.entities;
  for (let i = 0; i < lines; i++) {
    const line: LineEntity = { ...entityDefaults(), type: 'LINE', handle: '', start: { x: i, y: 0, z: 0 }, end: { x: i, y: 1, z: 0 } };
    es.push(line);
  }
  if (verts) {
    const flat: number[] = [];
    for (let i = 0; i < verts; i++) flat.push(i * 1.25, (i * 7) % 5, 0);
    const lw = { ...entityDefaults(), type: 'LWPOLYLINE', handle: '', verts: flat, flags: 0, constantWidth: 0, elevation: 0, thickness: 0, extrusion: { x: 0, y: 0, z: 1 } } as unknown as LwPolylineEntity;
    es.push(lw);
  }
  return { data: writeDwg(doc, { version }).data.slice(), ver: version === 'AC1015' ? R2000 : R2004 };
}

/** 지도(핸들, 위치 쌍)를 AcDb:Handles 바이트로. 구역 CRC는 맞추지 않는다(읽기는 경고만 한다) */
export function encodeObjectMap(pairs: [number, number][]): Uint8Array {
  const out: number[] = [];
  const umc = (v: number, a: number[]) => {
    let x = v;
    while (x >= 0x80) {
      a.push((x % 0x80) | 0x80);
      x = Math.floor(x / 0x80);
    }
    a.push(x);
  };
  const smc = (v: number, a: number[]) => {
    let x = Math.abs(v);
    while (x >= 0x40) {
      a.push((x % 0x80) | 0x80);
      x = Math.floor(x / 0x80);
    }
    a.push(x | (v < 0 ? 0x40 : 0));
  };
  for (let i = 0; i < pairs.length; ) {
    const chunk: number[] = [];
    let handle = 0;
    let loc = 0;
    while (i < pairs.length && chunk.length < 2000) {
      const [h, l] = pairs[i++]!;
      umc(h - handle, chunk);
      smc(l - loc, chunk);
      handle = h;
      loc = l;
    }
    const size = chunk.length + 2;
    out.push((size >> 8) & 0xff, size & 0xff, ...chunk, 0, 0);
  }
  out.push(0, 2, 0, 0);
  return Uint8Array.from(out);
}

export { R2000, R2004 };

// ---------------------------------------------------------------------------
// 자료 저장소(AcDsPrototype_1b)
// ---------------------------------------------------------------------------

const acdsName = (b: Uint8Array, at: number, name: string) => b.set(new TextEncoder().encode(name), at + 2);

/** 자료 색인이 서로 다른 구역 번호 n개를 가리키는 저장소(n²번 비교하게 만든다) */
export function acdsManySegments(n: number): Uint8Array {
  const segIdx = 64;
  const di = segIdx + 48 + 2 * 12;
  const data = new Uint8Array(di + 48 + 8 + n * 12);
  const dv = new DataView(data.buffer);
  dv.setInt32(24, segIdx, true);
  dv.setInt32(32, 2, true);
  dv.setInt32(40, 1, true);
  dv.setUint32(segIdx + 48 + 12, di, true);
  acdsName(data, di, 'datidx');
  dv.setInt32(di + 48, n, true);
  for (let i = 0; i < n; i++) dv.setUint32(di + 48 + 8 + i * 12, i + 2, true);
  return data;
}

/** 구역 색인 칸 segs개가 레코드 머리 heads개짜리 자료 구역 하나를 모두 가리키는 저장소(segs × heads번 돈다) */
export function acdsSameSegment(segs: number, heads: number): Uint8Array {
  const segIdx = 64;
  const dataSeg = segIdx + 48 + segs * 12;
  const data = new Uint8Array(dataSeg + 48 + heads * 20 + 64);
  const dv = new DataView(data.buffer);
  dv.setInt32(24, segIdx, true);
  dv.setInt32(32, segs, true);
  dv.setInt32(40, 0, true);
  for (let i = 1; i < segs; i++) dv.setUint32(segIdx + 48 + i * 12, dataSeg, true);
  acdsName(data, dataSeg, '_data_');
  for (let i = 0; i < heads; i++) {
    const p = dataSeg + 48 + i * 20;
    dv.setUint32(p, 20, true);
    dv.setUint32(p + 4, 1, true);
    dv.setUint32(p + 8, 1, true); // 모두 같은 핸들: 자료는 한 번만 남는다
    dv.setUint32(p + 16, 0xfffffff, true); // 자료는 저장소 밖
  }
  return data;
}

/** 큰 자료 하나가 같은 blob 구역을 pages번 가리키는 저장소(부풀린 크기 = pages × blobBytes) */
export function acdsBlob(pages: number, blobBytes: number): Uint8Array {
  const segIdx = 64;
  const dataSeg = segIdx + 48 + 3 * 12;
  const blobSeg = dataSeg + 48 + 20 + 16 + 4 + 32 + pages * 8 + 16;
  const data = new Uint8Array(blobSeg + 48 + 32 + blobBytes);
  const dv = new DataView(data.buffer);
  dv.setInt32(24, segIdx, true);
  dv.setInt32(32, 3, true);
  dv.setInt32(40, 0, true);
  dv.setUint32(segIdx + 48 + 12, dataSeg, true);
  dv.setUint32(segIdx + 48 + 24, blobSeg, true);
  acdsName(data, dataSeg, '_data_');
  // 레코드 머리 하나
  let p = dataSeg + 48;
  dv.setUint32(p, 20, true);
  dv.setUint32(p + 4, 1, true);
  dv.setUint32(p + 8, 0x1a, true);
  dv.setUint32(p + 16, 0, true);
  p += 20;
  const marker = dataSeg + Math.ceil((p - dataSeg) / 16) * 16;
  dv.setUint32(marker, 0xbb106bb1, true);
  dv.setUint32(marker + 4, 0xffffffff, true);
  dv.setUint32(marker + 8, 0xff, true);
  dv.setUint32(marker + 12, pages, true);
  for (let k = 0; k < pages; k++) dv.setUint32(marker + 4 + 32 + k * 8, 2, true);
  dv.setUint32(blobSeg + 48 + 24, blobBytes, true);
  return data;
}
