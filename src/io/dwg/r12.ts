/**
 * R12(AC1009) DWG 읽기. R13 이전 DWG는 비트가 아닌 바이트 단위 고정 배치다: 파일 머리(헤더 변수 포함) → 객체 구역 →
 * 표(블록·도면층·문자 스타일·선종류·뷰·UCS·뷰포트·응용프로그램·치수 스타일) → 블록 객체 구역 → 추가 객체 구역.
 * 배치는 공개 형식 설명(Michal Josef Špaček의 CAD-Format-DWG-AC1009, dwg_ac1009.ksy, CC0)을 보고 새로 작성했고,
 * AutoCAD R11이 같은 도면을 DWG와 DXF로 저장한 짝과 공개 R12 도면(에스토니아 국토청 지형 자료, 오스트라바 3D 건물)으로 확인했다.
 * 읽은 값은 R12 DXF와 같은 태그로 바꿔 DXF 리더로 읽는다. 도면층·블록·폴리선·속성·치수의 뜻이 R12 DXF와 같기 때문이다.
 */
import { CadReadError } from '../../core/errors';
import { codepageToEncoding, decoderFor, dwgCodepageName } from '../../core/codepage';
import type { CadDocument } from '../../core/model';
import { type DxfReadOptions, readDxfSource } from '../dxf/reader';
import { RecordStream, type TagReader, type TagValue } from '../dxf/records';

const DEG = 180 / Math.PI;

/** 표 머리(10바이트): 레코드 크기, 개수, (모름), 시작 위치 */
interface TableDesc {
  size: number;
  count: number;
  begin: number;
}

/** 한 레코드(0 태그 하나)씩 쌓는 태그 묶음 */
class Out {
  codes: number[] = [];
  values: TagValue[] = [];
  t(code: number, value: TagValue): void {
    this.codes.push(code);
    this.values.push(value);
  }
  p2(code: number, x: number, y: number): void {
    this.t(code, x);
    this.t(code + 10, y);
  }
  p3(code: number, x: number, y: number, z: number): void {
    this.t(code, x);
    this.t(code + 10, y);
    this.t(code + 20, z);
  }
}

/** 객체 공통 머리를 읽은 결과 */
interface Head {
  type: number;
  mode: number;
  start: number;
  end: number;
  layer: string;
  /** 객체마다 뜻이 다른 플래그 두 바이트(형식 설명의 flag2_1..flag3_8, 위 비트부터) */
  f2: number;
  f3: number;
  color: number | null;
  ltype: string | null;
  thickness: number;
  elevation: number | null;
  handle: string;
  paper: boolean;
  /** 확장 자료(R12 DXF의 1001~1071 태그로 바꾼 것) */
  eed: [number, TagValue][] | null;
  /** 머리 칸이 객체 크기를 넘었다(크기는 믿을 수 있어 이 객체만 건너뛴다) */
  bad: boolean;
  /** 객체 본문 시작 */
  p: number;
}

class R12File {
  readonly dv: DataView;
  readonly dec: TextDecoder;
  readonly codepage: string;
  layers: string[] = [];
  ltypes: string[] = [];
  styles: string[] = [];
  appids: string[] = [];
  dimstyles: string[] = [];
  /** 블록 표 번호 → 블록 이름 */
  blockNames: string[] = [];
  /** 블록 구역 안 위치 → 블록 표 번호 */
  blockAt = new Map<number, number>();
  blockFlags: number[] = [];
  readonly ent: [number, number];
  readonly blk: [number, number];
  readonly extra: [number, number];
  readonly headerEnd: number;
  /**
   * R10(AC1006): 머리 변수와 표 자리는 R12와 같고 R12가 뒤에 더한 변수만 없다. 표 레코드에는 이름 다음의 used(2)와 끝 CRC(2)가 없고,
   * 객체에는 추가 플래그·확장 자료·뷰포트 번호와 끝 CRC가 없으며, 선종류 번호가 1바이트, 고도가 두께보다 먼저다(82차 — dwg_ac1006.ksy)
   */
  readonly r10: boolean;
  /** 표 레코드 이름 뒤 칸의 어긋남(R12 0, R10 -2 — used가 없다) */
  readonly rec: number;
  /** 객체 끝 CRC 바이트(R12 2, R10 0) */
  readonly tail: number;
  /** 지금 읽는 위치(진행률) */
  at = 0;

  constructor(readonly data: Uint8Array) {
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.r10 = String.fromCharCode(...data.subarray(0, 6)) === 'AC1006';
    this.rec = this.r10 ? -2 : 0;
    this.tail = this.r10 ? 0 : 2;
    // R10 머리 변수는 0x512(변수 160개면 응용프로그램 표까지 0x51c)에서 끝난다
    if (data.length < (this.r10 ? 0x512 : 0x6c0)) throw new CadReadError('dwg.corrupt', { reason: 'R12 header too short' });
    const dv = this.dv;
    const es = dv.getInt32(0x14, true);
    const ee = dv.getInt32(0x18, true);
    // 구역 크기와 블록 주소의 맨 위 두 비트는 표시(0x40)다. 형식 설명은 아래 24비트만 크기로 보지만,
    // 블록 구역이 16MB를 넘는 오스트라바 도면은 맨 위 바이트가 0x41이다(크기 1비트가 더 있다)
    const bs = dv.getInt32(0x1c, true);
    const bz = dv.getUint32(0x20, true) & 0x3fffffff;
    const xs = dv.getInt32(0x24, true);
    const xz = dv.getUint32(0x28, true) & 0x3fffffff;
    const inFile = (a: number, b: number) => a >= 0 && b >= a && b <= data.length;
    if (!inFile(es, ee)) throw new CadReadError('dwg.corrupt', { reason: 'R12 entity section' });
    this.ent = [es, ee];
    this.blk = inFile(bs, bs + bz) ? [bs, bs + bz] : [0, 0];
    this.extra = inFile(xs, xs + xz) ? [xs, xs + xz] : [0, 0];
    // 헤더 변수는 객체 구역 앞의 CRC(2)와 구분자(16) 앞에서 끝난다. R10은 그 둘이 없어 객체 구역이 머리 바로 뒤에 온다(표본 0x512)
    this.headerEnd = Math.min(this.r10 ? es : es - 18, data.length);
    this.codepage = dwgCodepageName(this.u16(0x3f9) ?? 0);
    this.dec = decoderFor(codepageToEncoding(this.codepage));
    this.readTables();
  }

  // 머리 변수: 헤더 안에 있을 때만(옛 판은 변수가 적다)
  u16(off: number): number | null {
    return off + 2 <= this.headerEnd ? this.dv.getUint16(off, true) : null;
  }
  s16(off: number): number | null {
    return off + 2 <= this.headerEnd ? this.dv.getInt16(off, true) : null;
  }
  u8(off: number): number | null {
    return off + 1 <= this.headerEnd ? this.data[off]! : null;
  }
  f64(off: number): number | null {
    return off + 8 <= this.headerEnd ? this.dv.getFloat64(off, true) : null;
  }

  /** 0으로 끝나는 고정 길이 문자열 */
  str(off: number, len: number): string {
    const end = Math.min(off + len, this.data.length);
    let z = off;
    while (z < end && this.data[z] !== 0) z++;
    return this.dec.decode(this.data.subarray(off, z));
  }

  table(off: number): TableDesc | null {
    if (off + 10 > this.headerEnd) return null;
    const t = { size: this.dv.getUint16(off, true), count: this.dv.getUint16(off + 2, true), begin: this.dv.getUint32(off + 6, true) };
    if (t.size < 35 || t.begin + t.size * t.count > this.data.length) return null;
    return t;
  }

  private names(t: TableDesc | null): string[] {
    const out: string[] = [];
    if (!t) return out;
    for (let i = 0; i < t.count; i++) out.push(this.str(t.begin + i * t.size + 1, 32));
    return out;
  }

  private readTables(): void {
    this.ltypes = this.names(this.table(0x4a));
    this.layers = this.names(this.table(0x36));
    this.styles = this.names(this.table(0x40));
    this.appids = this.names(this.table(0x512));
    this.dimstyles = this.names(this.table(0x522));
    const bt = this.table(0x2c);
    if (bt) {
      for (let i = 0; i < bt.count; i++) {
        const r = bt.begin + i * bt.size;
        this.blockFlags.push(this.data[r]!);
        this.blockNames.push(this.str(r + 1, 32));
        this.blockAt.set(this.dv.getUint32(r + 35 + this.rec, true) & 0x3fffffff, i);
      }
    }
    // 익명 블록은 표에 *U·*D만 있다. AutoCAD는 같은 도면을 DXF로 쓸 때 표 번호를 붙인다(R11 짝: 표 2번 *D → *D2)
    const seen = new Set<string>();
    this.blockNames = this.blockNames.map((n, i) => {
      let nm = /^\*[A-Za-z]$/.test(n) || !n ? `${n || '*U'}${i}` : n;
      if (seen.has(nm.toUpperCase())) nm = `${nm}_${i}`;
      seen.add(nm.toUpperCase());
      return nm;
    });
  }

  layer(i: number): string {
    return this.layers[i] ?? '0';
  }

  /**
   * JUMP 객체(머리 바로 뒤 4바이트)가 가리키는 자리와 그 구역 끝. 맨 위 바이트가 0x80이면 추가 구역, 0x40이면 블록 구역 안의 위치,
   * 0이면 파일 안 위치(R10 표본: 객체 구역 → 추가 구역 0x80000000, 추가 구역 → 객체 구역의 절대 주소). 구역 밖이면 null
   */
  jump(p: number): [number, number] | null {
    if (p + 8 > this.data.length) return null;
    const raw = this.dv.getUint32(p + 4, true);
    const flag = raw >>> 24;
    const addr = raw & 0xffffff;
    const within = (r: [number, number], at: number): [number, number] | null => (r[1] > r[0] && at >= r[0] && at + 4 <= r[1] ? [at, r[1]] : null);
    if (flag & 0x80) return within(this.extra, this.extra[0] + addr);
    if (flag & 0x40) return within(this.blk, this.blk[0] + addr);
    return within(this.ent, addr) ?? within(this.extra, addr);
  }

  /** 선종류 번호: 표 번호, 32767(또는 256) ByLayer, 32766(또는 255) ByBlock */
  ltypeName(i: number): string | null {
    if (i >= 0 && i < this.ltypes.length) return this.ltypes[i]!;
    if (i === 32767 || i === 256) return 'BYLAYER';
    if (i === 32766 || i === 255) return 'BYBLOCK';
    return null;
  }

  /** 객체 공통 머리. 크기가 구역을 넘거나 4보다 작으면 null */
  head(p: number, top: boolean): Head | null {
    const { dv, data } = this;
    const type = dv.getInt8(p);
    const mode = data[p + 1]!;
    const size = dv.getInt16(p + 2, true);
    if (size < 4 || p + size > data.length) return null;
    const h: Head = {
      type,
      mode,
      start: p,
      end: p + size,
      layer: '0',
      f2: 0,
      f3: 0,
      color: null,
      ltype: null,
      thickness: 0,
      elevation: null,
      handle: '',
      paper: false,
      eed: null,
      bad: false,
      p: p + 4,
    };
    if (type === 18 || type < 0) return h; // JUMP·지운 객체
    // 머리 8바이트 + CRC(R12). R10은 CRC가 없어 본문 없는 POLYLINE·ENDBLK가 8바이트다
    if (size < 8 + this.tail) {
      h.bad = true;
      return h;
    }
    h.layer = this.layer(dv.getInt16(p + 4, true));
    h.f2 = data[p + 6]!;
    h.f3 = data[p + 7]!;
    let q = p + 8;
    let xf = 0;
    // 칸이 객체 끝(CRC 앞)을 넘으면 이 객체만 버린다
    const has = (n: number) => {
      if (q + n <= h.end - this.tail) return true;
      h.bad = true;
      return false;
    };
    const extra = () => {
      if (this.r10 || !(mode & 0x40) || !has(1)) return;
      xf = data[q++]!;
      if (xf & 2 && has(2)) {
        const n = dv.getUint16(q, true);
        q += 2;
        if (has(n)) h.eed = this.eed(q, q + n);
        q += n;
      }
    };
    const props = (elevFirst: boolean) => {
      if (mode & 1 && has(1)) h.color = data[q++]!;
      if (this.r10) {
        if (mode & 2 && has(1)) h.ltype = this.ltypeName(data[q++]!);
      } else if (mode & 2 && has(2)) {
        h.ltype = this.ltypeName(dv.getInt16(q, true));
        q += 2;
      }
      const thick = () => {
        if (mode & 8 && has(8)) {
          h.thickness = dv.getFloat64(q, true);
          q += 8;
        }
      };
      const elev = () => {
        // 선·점·3D 면은 고도 칸이 없고, 이 비트가 Z 좌표를 빼는 뜻이다
        if (mode & 4 && type !== 1 && type !== 2 && type !== 22 && has(8)) {
          h.elevation = dv.getFloat64(q, true);
          q += 8;
        }
      };
      if (elevFirst) {
        elev();
        thick();
      } else {
        thick();
        elev();
      }
    };
    // 정점도 추가 플래그가 먼저다(형식 설명은 정점만 색·고도를 앞에 두지만, 에스토니아 블록의 정점 바이트는 추가 플래그 → 고도 → 핸들 → 뷰포트다)
    extra();
    props(this.r10 || type === 14);
    if (mode & 0x20 && has(1)) {
      const n = data[q++]!;
      if (has(n)) {
        let hex = '';
        for (let i = 0; i < n; i++) hex += data[q + i]!.toString(16).padStart(2, '0');
        h.handle = hex.replace(/^0+(?=.)/, '').toUpperCase();
      }
      q += n;
    }
    if (!this.r10 && mode & 0x40 && xf & 4 && has(2)) {
      // 도면 공간 뷰포트 번호: 최상위 객체에 있으면 도면 공간 객체다(R11 표본: TILEMODE 0, 모든 객체가 1)
      h.paper = top;
      q += 2;
    }
    h.p = q;
    return h;
  }

  /** 확장 자료: 구분 바이트(그룹 코드 - 1000) + 값. 모르는 구분이 나오면 거기서 멈춘다 */
  private eed(start: number, end: number): [number, TagValue][] {
    const { dv, data } = this;
    const out: [number, TagValue][] = [];
    let q = start;
    const hex = (n: number) => {
      let s = '';
      for (let i = 0; i < n; i++) s += data[q + i]!.toString(16).padStart(2, '0');
      return s.toUpperCase();
    };
    while (q < end) {
      const k = data[q++]!;
      const need = k === 0 || k === 4 ? 1 + (q < end ? data[q]! : 0) : k === 2 ? 1 : k === 1 || k === 3 || k === 70 ? 2 : k === 71 ? 4 : k === 5 || (k >= 40 && k <= 42) ? 8 : k >= 10 && k <= 13 ? 24 : -1;
      if (need < 0 || q + need > end) break;
      if (k === 0) out.push([1000, this.dec.decode(data.subarray(q + 1, q + need))]);
      else if (k === 1) out.push([1001, this.appids[dv.getUint16(q, true)] ?? 'ACAD']);
      else if (k === 2) out.push([1002, data[q] ? '}' : '{']);
      else if (k === 3) out.push([1003, this.layer(dv.getUint16(q, true))]);
      else if (k === 4) {
        q++;
        out.push([1004, hex(need - 1)]);
        q--;
      } else if (k === 5) out.push([1005, hex(8).replace(/^0+(?=.)/, '')]);
      else if (k === 70) out.push([1070, dv.getInt16(q, true)]);
      else if (k === 71) out.push([1071, dv.getInt32(q, true)]);
      else if (k >= 40) out.push([1000 + k, dv.getFloat64(q, true)]);
      else {
        out.push([1000 + k, dv.getFloat64(q, true)]);
        out.push([1010 + k, dv.getFloat64(q + 8, true)]);
        out.push([1020 + k, dv.getFloat64(q + 16, true)]);
      }
      q += need;
    }
    return out;
  }
}

/** 객체 본문을 앞에서부터 읽는 커서 */
class Cur {
  constructor(
    readonly f: R12File,
    public p: number,
    readonly end: number,
  ) {}
  f64(): number {
    if (this.p + 8 > this.end) throw new RangeError('R12 객체 끝');
    const v = this.f.dv.getFloat64(this.p, true);
    this.p += 8;
    return v;
  }
  u8(): number {
    if (this.p + 1 > this.end) throw new RangeError('R12 객체 끝');
    return this.f.data[this.p++]!;
  }
  s16(): number {
    if (this.p + 2 > this.end) throw new RangeError('R12 객체 끝');
    const v = this.f.dv.getInt16(this.p, true);
    this.p += 2;
    return v;
  }
  u16(): number {
    return this.s16() & 0xffff;
  }
  /** 길이(s2) + 글자 */
  text(): string {
    const n = this.s16();
    if (n < 0 || this.p + n > this.end) throw new RangeError('R12 문자열 길이');
    const s = this.f.dec.decode(this.f.data.subarray(this.p, this.p + n));
    this.p += n;
    return s.replace(/\0+$/, '');
  }
}

const TYPE_NAMES: Record<number, string> = {
  1: 'LINE',
  2: 'POINT',
  3: 'CIRCLE',
  4: 'SHAPE',
  7: 'TEXT',
  8: 'ARC',
  9: 'TRACE',
  11: 'SOLID',
  12: 'BLOCK',
  13: 'ENDBLK',
  14: 'INSERT',
  15: 'ATTDEF',
  16: 'ATTRIB',
  17: 'SEQEND',
  19: 'POLYLINE',
  20: 'VERTEX',
  22: '3DFACE',
  23: 'DIMENSION',
  24: 'VIEWPORT',
};

/** 객체 하나를 R12 DXF 태그로. 읽을 수 없으면 false */
function entityTags(f: R12File, h: Head, o: Out): boolean {
  // R10까지의 3D 선(21)은 Z가 늘 있는 선이다(R11부터는 선에 Z가 있어 이 종류가 없다)
  const name = TYPE_NAMES[h.type] ?? (f.r10 && h.type === 21 ? 'LINE' : undefined);
  if (!name) return false;
  const c = new Cur(f, h.p, h.end - f.tail);
  const z = h.elevation ?? 0;
  const { f2, f3 } = h;
  o.t(0, name);
  if (h.handle) o.t(5, h.handle);
  o.t(8, h.layer);
  if (h.paper) o.t(67, 1);
  if (h.ltype) o.t(6, h.ltype);
  if (h.color !== null) o.t(62, h.color);
  if (h.thickness) o.t(39, h.thickness);
  const ext = () => {
    o.p3(210, c.f64(), c.f64(), c.f64());
  };
  const noZ = (h.mode & 4) !== 0;
  switch (h.type) {
    case 1: {
      const x1 = c.f64();
      const y1 = c.f64();
      const z1 = noZ ? 0 : c.f64();
      const x2 = c.f64();
      const y2 = c.f64();
      const z2 = noZ ? 0 : c.f64();
      o.p3(10, x1, y1, z1);
      o.p3(11, x2, y2, z2);
      if (f2 & 0x01) ext();
      break;
    }
    case 21: {
      // R10 3D 선: Z가 늘 있다
      o.p3(10, c.f64(), c.f64(), c.f64());
      o.p3(11, c.f64(), c.f64(), c.f64());
      if (f2 & 0x01) ext();
      break;
    }
    case 2: {
      const x = c.f64();
      const y = c.f64();
      o.p3(10, x, y, noZ ? 0 : c.f64());
      if (f2 & 0x01) ext();
      if (f2 & 0x02) o.t(50, c.f64() * DEG);
      break;
    }
    case 3:
    case 8: {
      o.p3(10, c.f64(), c.f64(), z);
      o.t(40, c.f64());
      if (h.type === 8) {
        o.t(50, c.f64() * DEG);
        o.t(51, c.f64() * DEG);
      }
      if (f2 & 0x01) ext();
      break;
    }
    case 4: {
      o.p3(10, c.f64(), c.f64(), z);
      o.t(40, c.f64());
      o.t(2, '');
      o.t(70, c.u8());
      if (f2 & 0x01) o.t(50, c.f64() * DEG);
      if (f2 & 0x02) c.u8(); // 쉐이프 파일 번호
      if (f2 & 0x04) o.t(41, c.f64());
      if (f2 & 0x08) o.t(51, c.f64() * DEG);
      break;
    }
    case 7: {
      o.p3(10, c.f64(), c.f64(), z);
      o.t(40, c.f64());
      o.t(1, c.text());
      if (f2 & 0x01) o.t(50, c.f64() * DEG);
      if (f2 & 0x02) o.t(41, c.f64());
      if (f2 & 0x04) o.t(51, c.f64() * DEG);
      if (f2 & 0x08) o.t(7, f.styles[c.u8()] ?? 'STANDARD');
      if (f2 & 0x10) o.t(71, c.u8());
      if (f2 & 0x20) o.t(72, c.u8());
      if (f2 & 0x40) o.p3(11, c.f64(), c.f64(), z);
      if (f3 & 0x01) o.t(73, c.u8());
      break;
    }
    case 9:
    case 11: {
      for (const k of [10, 11, 12, 13]) o.p3(k, c.f64(), c.f64(), z);
      if (h.type === 11 && f2 & 0x01) ext();
      break;
    }
    case 12: {
      const x = c.f64();
      const y = c.f64();
      let xref = '';
      if (f2 & 0x02) xref = c.text();
      if (f2 & 0x04) c.text();
      return blockTags(f, h, o, x, y, xref);
    }
    case 13:
      break;
    case 14: {
      o.t(66, h.mode & 0x80 ? 1 : 0);
      // INSERT의 플래그 두 바이트: 첫 바이트 위 비트부터 행 간격·열 간격·행 수·열 수·Z 축척·회전·Y 축척·X 축척, 둘째 바이트 끝 비트 돌출 방향
      const bi = c.s16();
      o.t(2, f.blockNames[bi] ?? `*U${bi}`);
      o.p3(10, c.f64(), c.f64(), z);
      if (f2 & 0x01) o.t(41, c.f64());
      if (f2 & 0x02) o.t(42, c.f64());
      if (f2 & 0x04) o.t(50, c.f64() * DEG);
      if (f2 & 0x08) o.t(43, c.f64());
      if (f2 & 0x10) o.t(70, c.u16());
      if (f2 & 0x20) o.t(71, c.u16());
      if (f2 & 0x40) o.t(44, c.f64());
      if (f2 & 0x80) o.t(45, c.f64());
      if (f3 & 0x01) ext();
      break;
    }
    case 15:
    case 16: {
      o.p3(10, c.f64(), c.f64(), z);
      o.t(40, c.f64());
      o.t(1, c.text());
      if (h.type === 15) o.t(3, c.text());
      o.t(2, c.text());
      o.t(70, c.u8());
      if (f2 & 0x02) o.t(50, c.f64() * DEG);
      if (f2 & 0x04) o.t(41, c.f64());
      if (f2 & 0x08) o.t(51, c.f64() * DEG);
      if (f2 & 0x10) o.t(7, f.styles[c.u8()] ?? 'STANDARD');
      if (f2 & 0x20) o.t(71, c.u8());
      if (f2 & 0x40) o.t(72, c.u8());
      if (f2 & 0x80) o.p3(11, c.f64(), c.f64(), z);
      if (f3 & 0x01) ext();
      if (f3 & 0x02) o.t(74, c.u8());
      break;
    }
    case 17:
      break;
    case 19: {
      o.t(66, 1);
      let flags = 0;
      if (f2 & 0x01) flags = c.u8();
      o.t(70, flags);
      if (f2 & 0x02) o.t(40, c.f64());
      if (f2 & 0x04) o.t(41, c.f64());
      if (f2 & 0x08) ext();
      if (f2 & 0x10) o.t(71, c.u16());
      if (f2 & 0x20) o.t(72, c.u16());
      if (f2 & 0x40) o.t(73, c.u16());
      if (f2 & 0x80) o.t(74, c.u16());
      if (f3 & 0x01) o.t(75, c.u16());
      const pz = f3 & 0x80 ? c.f64() : z;
      o.p3(10, 0, 0, pz);
      break;
    }
    case 20: {
      // 정점: X·Y가 없을 수 있다(폴리면 메시의 면 레코드)
      const noXY = (f3 & 0x40) !== 0;
      const x = noXY ? 0 : c.f64();
      const y = noXY ? 0 : c.f64();
      o.p3(10, x, y, z);
      if (f2 & 0x01) o.t(40, c.f64());
      if (f2 & 0x02) o.t(41, c.f64());
      if (f2 & 0x04) o.t(42, c.f64());
      o.t(70, f2 & 0x08 ? c.u8() : 0);
      if (f2 & 0x10) o.t(50, c.f64() * DEG);
      if (f2 & 0x20) o.t(71, c.s16());
      if (f2 & 0x40) o.t(72, c.s16());
      if (f2 & 0x80) o.t(73, c.s16());
      if (f3 & 0x01) o.t(74, c.s16());
      break;
    }
    case 22: {
      for (const k of [10, 11, 12, 13]) {
        const x = c.f64();
        const y = c.f64();
        o.p3(k, x, y, noZ ? 0 : c.f64());
      }
      if (f2 & 0x01) o.t(70, c.u16() & 0xff);
      break;
    }
    case 23: {
      const bi = c.s16();
      if (bi >= 0 && bi < f.blockNames.length) o.t(2, f.blockNames[bi]!);
      o.p3(10, c.f64(), c.f64(), c.f64());
      o.p3(11, c.f64(), c.f64(), z);
      if (f2 & 0x01) o.p3(12, c.f64(), c.f64(), z);
      if (f2 & 0x02) o.t(70, c.u8());
      if (f2 & 0x04) {
        // 공백 한 칸은 재정의 없음이다(AutoCAD R11이 같은 도면을 DXF로 쓰면 빈 글이다)
        const s = c.text();
        o.t(1, s === ' ' ? '' : s);
      }
      if (f2 & 0x08) o.p3(13, c.f64(), c.f64(), c.f64());
      if (f2 & 0x10) o.p3(14, c.f64(), c.f64(), c.f64());
      if (f2 & 0x20) o.p3(15, c.f64(), c.f64(), c.f64());
      // R10은 호 정의점이 3D 점이고 지시선 길이가 수 하나다(R12는 2D 점과 길이·각도)
      if (f2 & 0x40) o.p3(16, c.f64(), c.f64(), f.r10 ? c.f64() : z);
      if (f2 & 0x80) {
        o.t(40, c.f64());
        if (!f.r10) {
          o.t(50, c.f64() * DEG);
          if (h.mode & 4) c.f64();
        }
      }
      if (f3 & 0x01) o.t(50, c.f64() * DEG);
      if (f3 & 0x04) o.t(53, c.f64() * DEG);
      if (f3 & 0x40) ext();
      if (f3 & 0x80) {
        const ds = c.u16();
        if (ds < f.dimstyles.length) o.t(3, f.dimstyles[ds]!);
      }
      break;
    }
    case 24: {
      o.p3(10, c.f64(), c.f64(), c.f64());
      o.t(40, c.f64());
      o.t(41, c.f64());
      o.t(68, 1);
      o.t(69, c.s16());
      break;
    }
    default:
      return false;
  }
  // 확장 자료는 DXF처럼 객체 자료 뒤에 둔다(R12 도면 공간 뷰포트는 보기 정보를 ACAD 확장 자료에 둔다)
  if (h.eed) for (const [k, v] of h.eed) o.t(k, v);
  return true;
}

function blockTags(f: R12File, h: Head, o: Out, x: number, y: number, xref: string): boolean {
  const [bs] = f.blk;
  const i = f.blockAt.get(h.start - bs);
  const nm = i !== undefined ? f.blockNames[i]! : `*U${h.start - bs}`;
  o.t(2, nm);
  o.t(70, i !== undefined ? f.blockFlags[i]! & 0x7f : 0);
  o.p3(10, x, y, h.elevation ?? 0);
  o.t(3, nm);
  if (xref) o.t(1, xref);
  return true;
}

/** 머리 변수(오프셋은 형식 설명의 순서대로 센 값, R11 짝 DXF와 대조함) */
function headerTags(f: R12File, o: Out): void {
  o.t(9, '$ACADVER');
  o.t(1, 'AC1009');
  o.t(9, '$DWGCODEPAGE');
  o.t(3, f.codepage);
  const p3 = (nm: string, off: number) => {
    const x = f.f64(off);
    const y = f.f64(off + 8);
    const z = f.f64(off + 16);
    if (x === null || y === null || z === null) return;
    o.t(9, nm);
    o.p3(10, x, y, z);
  };
  const p2 = (nm: string, off: number) => {
    const x = f.f64(off);
    const y = f.f64(off + 8);
    if (x === null || y === null) return;
    o.t(9, nm);
    o.p2(10, x, y);
  };
  const r = (nm: string, off: number, code = 40, scale = 1) => {
    const v = f.f64(off);
    if (v === null || !Number.isFinite(v)) return;
    o.t(9, nm);
    o.t(code, v * scale);
  };
  const i16 = (nm: string, off: number) => {
    const v = f.s16(off);
    if (v === null) return;
    o.t(9, nm);
    o.t(70, v);
  };
  const i8 = (nm: string, off: number) => {
    const v = f.u8(off);
    if (v === null) return;
    o.t(9, nm);
    o.t(70, v);
  };
  const s = (nm: string, off: number, len: number, code = 1) => {
    if (off + len > f.headerEnd) return;
    o.t(9, nm);
    o.t(code, f.str(off, len));
  };
  p3('$INSBASE', 0x5e);
  i16('$PLINEGEN', 0x76);
  p3('$EXTMIN', 0x78);
  p3('$EXTMAX', 0x90);
  p2('$LIMMIN', 0xa8);
  p2('$LIMMAX', 0xb8);
  p2('$VIEWCTR', 0xc8);
  r('$VIEWSIZE', 0xe0);
  i16('$SNAPMODE', 0xe8);
  p2('$SNAPUNIT', 0xea);
  p2('$SNAPBASE', 0xfa);
  r('$SNAPANG', 0x10a, 50, DEG);
  i16('$SNAPSTYLE', 0x112);
  i16('$SNAPISOPAIR', 0x114);
  i16('$GRIDMODE', 0x116);
  p2('$GRIDUNIT', 0x118);
  i16('$ORTHOMODE', 0x128);
  i16('$REGENMODE', 0x12a);
  i16('$FILLMODE', 0x12c);
  i16('$QTEXTMODE', 0x12e);
  i16('$DRAGMODE', 0x130);
  r('$LTSCALE', 0x132);
  r('$TEXTSIZE', 0x13a);
  r('$TRACEWID', 0x142);
  const cl = f.s16(0x14a);
  if (cl !== null) {
    o.t(9, '$CLAYER');
    o.t(8, f.layer(cl));
  }
  i16('$PSLTSCALE', 0x156);
  i16('$LUNITS', 0x164);
  i16('$LUPREC', 0x166);
  r('$SKETCHINC', 0x17a);
  r('$FILLETRAD', 0x182);
  i16('$AUNITS', 0x18a);
  i16('$AUPREC', 0x18c);
  const ts = f.s16(0x18e);
  if (ts !== null && f.styles[ts]) {
    o.t(9, '$TEXTSTYLE');
    o.t(7, f.styles[ts]!);
  }
  i16('$OSMODE', 0x190);
  i16('$ATTMODE', 0x192);
  r('$DIMSCALE', 0x1a3);
  r('$DIMASZ', 0x1ab);
  r('$DIMEXO', 0x1b3);
  r('$DIMDLI', 0x1bb);
  r('$DIMEXE', 0x1c3);
  r('$DIMTP', 0x1cb);
  r('$DIMTM', 0x1d3);
  r('$DIMTXT', 0x1db);
  r('$DIMCEN', 0x1e3);
  r('$DIMTSZ', 0x1eb);
  i8('$DIMTOL', 0x1f3);
  i8('$DIMLIM', 0x1f4);
  i8('$DIMTIH', 0x1f5);
  i8('$DIMTOH', 0x1f6);
  i8('$DIMSE1', 0x1f7);
  i8('$DIMSE2', 0x1f8);
  i8('$DIMTAD', 0x1f9);
  i16('$LIMCHECK', 0x1fa);
  r('$ELEVATION', 0x229);
  r('$THICKNESS', 0x231);
  i16('$BLIPMODE', 0x2e3);
  i8('$DIMZIN', 0x2e5);
  r('$DIMRND', 0x2e6);
  r('$DIMDLE', 0x2ee);
  s('$DIMBLK', 0x2f6, 33);
  i16('$COORDS', 0x319);
  i16('$CECOLOR', 0x31b);
  const lt = f.s16(0x31d);
  if (lt !== null) {
    const n = f.ltypeName(lt);
    if (n) {
      o.t(9, '$CELTYPE');
      o.t(6, n);
    }
  }
  r('$ANGBASE', 0x353, 50, DEG);
  i16('$ANGDIR', 0x35b);
  i16('$PDMODE', 0x35d);
  r('$PDSIZE', 0x35f);
  r('$PLINEWID', 0x367);
  i8('$DIMALT', 0x3a1);
  i8('$DIMALTD', 0x3a2);
  i8('$DIMASO', 0x3a3);
  i8('$DIMSHO', 0x3a4);
  s('$DIMPOST', 0x3a5, 16);
  s('$DIMAPOST', 0x3b5, 16);
  r('$DIMALTF', 0x3c5);
  r('$DIMLFAC', 0x3cd);
  i16('$SPLINESEGS', 0x3d5);
  i16('$SPLFRAME', 0x3d7);
  i16('$ATTREQ', 0x3d9);
  i16('$ATTDIA', 0x3db);
  r('$CHAMFERA', 0x3dd);
  r('$CHAMFERB', 0x3e5);
  i16('$MIRRTEXT', 0x3ed);
  p3('$UCSORG', 0x3fb);
  p3('$UCSXDIR', 0x413);
  p3('$UCSYDIR', 0x42b);
  i8('$DIMTOFL', 0x47d);
  s('$DIMBLK1', 0x47e, 33);
  s('$DIMBLK2', 0x49f, 33);
  i8('$DIMSAH', 0x4c0);
  i8('$DIMTIX', 0x4c1);
  i8('$DIMSOXD', 0x4c2);
  r('$DIMTVP', 0x4c3);
  i16('$HANDLING', 0x4ec);
  if (0x4ee + 8 <= f.headerEnd) {
    let hex = '';
    for (let i = 0; i < 8; i++) hex += f.data[0x4ee + i]!.toString(16).padStart(2, '0');
    o.t(9, '$HANDSEED');
    o.t(5, hex.replace(/^0+(?=.)/, '').toUpperCase());
  }
  i16('$SPLINETYPE', 0x50c);
  i16('$UNITMODE', 0x53d);
  r('$DIMTFAC', 0x5df);
  i16('$TILEMODE', 0x631);
  i16('$PLIMCHECK', 0x633);
  p3('$PEXTMIN', 0x637);
  p3('$PEXTMAX', 0x64f);
  p2('$PLIMMIN', 0x667);
  p2('$PLIMMAX', 0x677);
  p3('$PINSBASE', 0x687);
  i16('$MAXACTVP', 0x6a9);
  r('$DIMGAP', 0x6ab);
}

/** 표 하나. 레코드가 이 판의 크기(size)보다 작으면 이름·플래그만 낸다(옛 판의 짧은 레코드를 넘어 읽지 않는다) */
function tableTags(f: R12File, o: Out, kind: string, off: number, size: number, each: (r: number, o: Out) => void): Generator<void> {
  return (function* () {
    const t = f.table(off);
    o.t(0, 'TABLE');
    o.t(2, kind);
    o.t(70, t?.count ?? 0);
    yield;
    if (t) {
      for (let i = 0; i < t.count; i++) {
        const r = t.begin + i * t.size;
        const nm = f.str(r + 1, 32);
        if (!nm) continue;
        o.t(0, kind);
        o.t(2, nm);
        o.t(70, f.data[r]! & 0x7f);
        // R10 레코드에는 used(2)와 CRC(2)가 없다
        if (t.size >= size + 2 * f.rec) each(r, o);
        yield;
      }
    }
    o.t(0, 'ENDTAB');
    yield;
  })();
}

/** 파일 전체를 R12 DXF 레코드 순서로 낸다. 레코드 하나를 쌓을 때마다 멈춘다 */
function* records(f: R12File, o: Out, warn: (code: string) => void): Generator<void> {
  const { dv } = f;
  o.t(0, 'SECTION');
  o.t(2, 'HEADER');
  headerTags(f, o);
  yield;
  o.t(0, 'ENDSEC');
  yield;

  o.t(0, 'SECTION');
  o.t(2, 'TABLES');
  yield;
  yield* tableTags(f, o, 'LTYPE', 0x4a, 191, (r) => {
    o.t(3, f.str(r + 35 + f.rec, 48));
    o.t(72, f.data[r + 83 + f.rec]!);
    const n = Math.min(f.data[r + 84 + f.rec]!, 12);
    o.t(73, n);
    o.t(40, dv.getFloat64(r + 85 + f.rec, true));
    for (let i = 0; i < n; i++) o.t(49, dv.getFloat64(r + 93 + f.rec + i * 8, true));
  });
  yield* tableTags(f, o, 'LAYER', 0x36, 41, (r) => {
    o.t(62, dv.getInt16(r + 35 + f.rec, true));
    o.t(6, f.ltypeName(dv.getInt16(r + 37 + f.rec, true)) ?? 'CONTINUOUS');
  });
  yield* tableTags(f, o, 'STYLE', 0x40, 198, (r) => {
    o.t(40, dv.getFloat64(r + 35 + f.rec, true));
    o.t(41, dv.getFloat64(r + 43 + f.rec, true));
    o.t(50, dv.getFloat64(r + 51 + f.rec, true) * DEG);
    o.t(71, f.data[r + 59 + f.rec]!);
    o.t(42, dv.getFloat64(r + 60 + f.rec, true));
    o.t(3, f.str(r + 68 + f.rec, 64));
    o.t(4, f.str(r + 132 + f.rec, 64));
  });
  yield* tableTags(f, o, 'VPORT', 0x500, 253, (r) => {
    const d = (k: number) => dv.getFloat64(r + k + f.rec, true);
    o.p2(10, d(35), d(43));
    o.p2(11, d(51), d(59));
    o.p3(17, d(67), d(75), d(83));
    o.p3(16, d(91), d(99), d(107));
    o.t(51, d(115) * DEG);
    o.t(40, d(123));
    o.p2(12, d(131), d(139));
    o.t(41, d(147));
    o.t(42, d(155));
    o.t(43, d(163));
    o.t(44, d(171));
    for (let i = 0; i < 8; i++) o.t(71 + i, dv.getInt16(r + 179 + f.rec + i * 2, true));
    o.t(50, d(195) * DEG);
    o.p2(13, d(203), d(211));
    o.p2(14, d(219), d(227));
    o.p2(15, d(235), d(243));
  });
  yield* tableTags(f, o, 'APPID', 0x512, 37, () => {});
  yield* tableTags(f, o, 'DIMSTYLE', 0x522, 324, (r) => {
    let q = r + 35 + f.rec;
    const real = (code: number) => {
      o.t(code, dv.getFloat64(q, true));
      q += 8;
    };
    const byte = (code: number) => o.t(code, f.data[q++]!);
    for (const c of [40, 41, 42, 43, 44, 45, 46, 47, 48, 140, 141, 142, 143, 144, 145]) real(c);
    for (const c of [71, 72, 73, 74, 75, 76, 77, 78, 170, 171, 172, 173, 174, 175]) byte(c);
    for (const [c, n] of [
      [3, 16],
      [4, 16],
      [5, 16],
      [6, 16],
      [7, 66],
    ] as const) {
      const v = f.str(q, n);
      if (v) o.t(c, v);
      q += n;
    }
    for (const c of [176, 177, 178]) {
      o.t(c, dv.getInt16(q, true));
      q += 2;
    }
    q++; // DIMUPT
    real(146);
    real(147);
  });
  o.t(0, 'ENDSEC');
  yield;

  // 블록: 블록 구역의 BLOCK … ENDBLK
  o.t(0, 'SECTION');
  o.t(2, 'BLOCKS');
  yield;
  yield* section(f, o, f.blk, false, warn);
  o.t(0, 'ENDSEC');
  yield;

  o.t(0, 'SECTION');
  o.t(2, 'ENTITIES');
  yield;
  // 객체 구역을 JUMP를 따라 읽고, 추가 구역에서 JUMP로 닿지 않은 객체를 뒤에 읽는다
  const seen = new Set<number>();
  yield* section(f, o, f.ent, true, warn, seen);
  yield* section(f, o, f.extra, true, warn, seen);
  o.t(0, 'ENDSEC');
  yield;
  o.t(0, 'EOF');
  yield;
}

/**
 * 구역의 객체를 차례로 낸다. seen이 있으면 JUMP(18)를 따라간다: 주소(아래 24비트)로 가서 읽다가 그 구역 끝에 닿으면 JUMP 다음으로 돌아온다.
 * 한 번 읽은 자리는 다시 읽지 않는다(82차 — R10 표본: 객체 구역의 JUMP가 추가 구역의 폴리선 머리로 가고, 거기서 JUMP로 객체 구역의 정점으로 돌아온다.
 * 전에는 JUMP를 건너뛰어 정점이 폴리선 없이 남았다)
 */
function* section(f: R12File, o: Out, range: [number, number], top: boolean, warn: (code: string) => void, seen?: Set<number>): Generator<void> {
  let inBlock = false;
  let [, end] = range;
  const back: [number, number][] = [];
  for (let p = range[0]; ; ) {
    if (p + 4 > end || seen?.has(p)) {
      const r = back.pop();
      if (!r) break;
      [p, end] = r;
      continue;
    }
    const h = f.head(p, top);
    // 크기가 구역을 넘으면 그 뒤를 믿을 수 없다
    if (!h || h.end > end) {
      warn('dwg.object_skipped');
      const r = back.pop();
      if (!r) break;
      [p, end] = r;
      continue;
    }
    seen?.add(p);
    p = h.end;
    f.at = p;
    if (h.type === 18 && seen) {
      const t = f.jump(h.start);
      if (t && !seen.has(t[0])) {
        back.push([p, end]);
        [p, end] = t;
      }
      continue;
    }
    if (h.type < 0 || h.type === 18) continue;
    if (h.bad) {
      warn('dwg.object_skipped');
      continue;
    }
    if (!top) {
      if (h.type === 12) inBlock = true;
      else if (!inBlock) continue;
      if (h.type === 13) inBlock = false;
    }
    const save = o.codes.length;
    let ok = false;
    try {
      ok = entityTags(f, h, o);
    } catch {
      ok = false;
    }
    if (!ok) {
      o.codes.length = save;
      o.values.length = save;
      if (TYPE_NAMES[h.type] === undefined) warn('entity.r12_unknown');
      else warn('dwg.object_skipped');
      continue;
    }
    yield;
  }
}

/** 생성기가 쌓은 태그를 하나씩 내는 읽개 */
class GenTags implements TagReader {
  code = 0;
  value: TagValue = '';
  private i = 0;
  constructor(
    private readonly gen: Generator<void>,
    private readonly o: Out,
    private readonly where: () => number,
  ) {}
  next(): boolean {
    const o = this.o;
    while (this.i >= o.codes.length) {
      o.codes.length = 0;
      o.values.length = 0;
      this.i = 0;
      if (this.gen.next().done && !o.codes.length) return false;
    }
    this.code = o.codes[this.i]!;
    this.value = o.values[this.i]!;
    this.i++;
    return true;
  }
  progress(): number {
    return this.where();
  }
}

export function readR12Dwg(data: Uint8Array, options: DxfReadOptions = {}): CadDocument {
  const f = new R12File(data);
  const o = new Out();
  const warned = new Map<string, number>();
  const gen = records(f, o, (code) => warned.set(code, (warned.get(code) ?? 0) + 1));
  const reader = new GenTags(gen, o, () => f.at / data.length);
  const doc = readDxfSource({ stream: new RecordStream(reader), version: 'AC1009', codepage: f.codepage, binary: false }, options);
  doc.format = 'dwg';
  doc.version = 'AC1009';
  for (const [code, count] of warned) {
    doc.warnings.push({
      code,
      message: code === 'entity.r12_unknown' ? `알 수 없는 R12 객체 ${count}개를 건너뛰었습니다.` : `R12 객체 ${count}개를 읽지 못해 건너뛰었습니다.`,
      count,
    });
  }
  return doc;
}
