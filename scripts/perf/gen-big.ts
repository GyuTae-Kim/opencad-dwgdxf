/**
 * 성능 측정용 큰 합성 도면 생성기(개발 전용).
 *
 * 사용법:
 *   npx vite-node scripts/perf/gen-big.ts <객체 수> <출력.dxf> [--dwg 출력.dwg] [--layers 300] [--zoom 10] [--mix verts] [--only <종류>]
 *
 * - ASCII DXF R2000(AC1015)을 조금씩 써 내려가므로 수백만 객체도 메모리를 적게 쓴다.
 * - 객체: 선·경량 폴리선·2D 폴리선(VERTEX)·원·호·문자·여러 줄 문자·해치(SOLID·ANSI31)·블록 참조(속성 포함)를 섞는다.
 * - --mix verts: 정점이 많은 객체를 더 섞는다(볼록·폭이 있는 2D 폴리선, 3D 폴리선, 폴리페이스·다각형 메시, 선·호 모서리 경계 해치,
 *   조정점·맞춤점 스플라인, 지시선). 기본 섞음의 파일은 예전과 같다.
 * - --only <종류>: 한 종류만(객체 종류별 메모리를 잴 때). 종류 이름은 KINDS.
 * - 도면층은 기본 300개, 블록 정의 20개(그중 5개는 속성 정의 2개).
 * - --dwg를 주면 이 앱의 DXF 리더로 읽어 DWG 라이터(AC1032)로 같은 내용의 DWG를 쓴다.
 * - 같은 객체 수면 언제나 같은 파일이 나온다(고정 씨앗 난수).
 * - --zoom N: 저장된 *Active 뷰를 가운데 1/N 높이로(점진 빌드가 첫 화면 객체를 먼저 그리는지 볼 때).
 * 산출물은 .runtime/perf/ 아래에 둔다(저장소에 넣지 않는다).
 */
import { closeSync, openSync, writeSync, readFileSync, writeFileSync, statSync } from 'node:fs';

interface Args {
  count: number;
  out: string;
  dwg?: string;
  layers: number;
  /** *Active 뷰를 도면의 1/zoom 높이로(가운데) — 점진 빌드의 "보이는 범위 먼저"를 볼 때 */
  zoom?: number;
  /** 객체 섞음: 기본 또는 정점이 많은 객체를 더(verts) */
  mix?: Mix;
  /** 한 종류만 */
  only?: Kind;
}

/** 객체 종류(--only 이름) */
export const KINDS = ['line', 'lw', 'poly2d', 'poly2dArc', 'poly3d', 'polyface', 'pmesh', 'circle', 'arc', 'text', 'mtext', 'hatch', 'hatchEdges', 'spline', 'splineFit', 'leader', 'insert'] as const;
export type Kind = (typeof KINDS)[number];
export type Mix = 'default' | 'verts';

/** 섞음별 누적 비율(마지막 종류는 나머지) */
const MIXES: Record<Mix, [number, Kind][]> = {
  default: [
    [0.3, 'line'],
    [0.45, 'lw'],
    [0.47, 'poly2d'],
    [0.57, 'circle'],
    [0.67, 'arc'],
    [0.77, 'text'],
    [0.8, 'mtext'],
    [0.85, 'hatch'],
    [1, 'insert'],
  ],
  verts: [
    [0.15, 'line'],
    [0.25, 'lw'],
    [0.32, 'poly2d'],
    [0.4, 'poly2dArc'],
    [0.52, 'poly3d'],
    [0.53, 'polyface'],
    [0.54, 'pmesh'],
    [0.58, 'circle'],
    [0.62, 'arc'],
    [0.67, 'text'],
    [0.69, 'mtext'],
    [0.73, 'hatch'],
    [0.8, 'hatchEdges'],
    [0.85, 'spline'],
    [0.87, 'splineFit'],
    [0.91, 'leader'],
    [1, 'insert'],
  ],
};

function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  let dwg: string | undefined;
  let layers = 300;
  let zoom: number | undefined;
  let mix: Mix = 'default';
  let only: Kind | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dwg') dwg = argv[++i];
    else if (a === '--layers') layers = Number(argv[++i]);
    else if (a === '--zoom') zoom = Number(argv[++i]);
    else if (a === '--mix') mix = argv[++i] as Mix;
    else if (a === '--only') only = argv[++i] as Kind;
    else pos.push(a);
  }
  const count = Number(pos[0]);
  const out = pos[1];
  if (!Number.isFinite(count) || count <= 0 || !out || !(mix in MIXES) || (only && !KINDS.includes(only)))
    throw new Error(`사용법: gen-big.ts <객체 수> <출력.dxf> [--dwg 출력.dwg] [--layers 300] [--zoom 10] [--mix default|verts] [--only ${KINDS.join('|')}]`);
  return { count, out, dwg, layers, zoom, mix, only };
}

/** 고정 씨앗 난수(mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 버퍼에 모았다가 4MB마다 내보낸다 */
class Out {
  private parts: string[] = [];
  private size = 0;
  bytes = 0;
  constructor(private readonly write: (s: string) => void) {}
  tag(code: number, value: string | number): void {
    const c = String(code);
    const line = (c.length >= 3 ? c : '   '.slice(c.length) + c) + '\n' + value + '\n';
    this.parts.push(line);
    this.size += line.length;
    if (this.size > 4 << 20) this.flush();
  }
  flush(): void {
    if (!this.parts.length) return;
    const s = this.parts.join('');
    this.write(s);
    this.bytes += s.length;
    this.parts = [];
    this.size = 0;
  }
}

/** 실수 표기(AutoCAD처럼 소수점이 있게, 자릿수는 줄인다) */
function f(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  const s = String(r);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
}

const BLOCKS = 20;
const ATTR_BLOCKS = 5;

/** 합성 도면을 ASCII DXF 문자열 조각으로 write에 넘긴다(시험은 메모리로, 명령은 파일로 받는다). */
export function generate(args: { count: number; layers?: number; zoom?: number; mix?: Mix; only?: Kind }, write: (s: string) => void): { bytes: number; counts: Record<string, number> } {
  const count = args.count;
  const layers = args.layers ?? 300;
  const o = new Out(write);
  const rand = rng(0x5eed + count);
  let next = 0x100;
  const h = () => (next++).toString(16).toUpperCase();
  // 표·블록 핸들(고정)
  const T = { BLOCK_RECORD: '1', LAYER: '2', STYLE: '3', LTYPE: '5', VIEW: '6', UCS: '7', VPORT: '8', APPID: '9', DIMSTYLE: 'A', ROOT: 'C', GROUPS: 'D', LAYOUTS: '1A' };
  const side = Math.sqrt(count) * 20;
  const layerName = (i: number) => 'L' + String(i).padStart(3, '0');
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  // 블록 레코드 핸들을 먼저 정한다
  const msRec = h();
  const psRec = h();
  const msLayout = h();
  const psLayout = h();
  const blockRecs: string[] = [];
  for (let b = 0; b < BLOCKS; b++) blockRecs.push(h());
  // 전체 핸들 상한: 객체마다 최대 12개(2D 폴리선 정점 6 + SEQEND, 블록 참조 + 속성 2 + SEQEND).
  // 정점 섞음·한 종류만은 객체마다 최대 24개(폴리페이스 정점 8 + 면 6 + SEQEND, 다각형 메시 4×4 + SEQEND)
  const wide = (args.mix ?? 'default') !== 'default' || !!args.only;
  const handSeed = (0x10000 + count * (wide ? 24 : 12) + 100000).toString(16).toUpperCase();

  // ---- HEADER
  o.tag(0, 'SECTION');
  o.tag(2, 'HEADER');
  o.tag(9, '$ACADVER');
  o.tag(1, 'AC1015');
  o.tag(9, '$DWGCODEPAGE');
  o.tag(3, 'ANSI_1252');
  o.tag(9, '$INSBASE');
  o.tag(10, '0.0');
  o.tag(20, '0.0');
  o.tag(30, '0.0');
  o.tag(9, '$EXTMIN');
  o.tag(10, '0.0');
  o.tag(20, '0.0');
  o.tag(30, '0.0');
  o.tag(9, '$EXTMAX');
  o.tag(10, f(side));
  o.tag(20, f(side));
  o.tag(30, '0.0');
  o.tag(9, '$LIMMIN');
  o.tag(10, '0.0');
  o.tag(20, '0.0');
  o.tag(9, '$LIMMAX');
  o.tag(10, f(side));
  o.tag(20, f(side));
  o.tag(9, '$LTSCALE');
  o.tag(40, '1.0');
  o.tag(9, '$INSUNITS');
  o.tag(70, 4);
  o.tag(9, '$MEASUREMENT');
  o.tag(70, 1);
  o.tag(9, '$HANDSEED');
  o.tag(5, handSeed);
  // 날짜·GUID를 고정해 다시 쓴 결과가 언제나 같게 한다(쓰기가 없는 값은 지금 시각·난수로 채운다)
  for (const v of ['$TDCREATE', '$TDUCREATE', '$TDUPDATE', '$TDUUPDATE']) {
    o.tag(9, v);
    o.tag(40, '2460000.5');
  }
  o.tag(9, '$FINGERPRINTGUID');
  o.tag(2, '{8E2A3E5C-1F0B-4B7E-9C1D-2A3B4C5D6E7F}');
  o.tag(9, '$VERSIONGUID');
  o.tag(2, '{0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0}');
  o.tag(0, 'ENDSEC');

  // ---- TABLES
  o.tag(0, 'SECTION');
  o.tag(2, 'TABLES');
  const table = (name: string, hd: string, n: number, body: () => void) => {
    o.tag(0, 'TABLE');
    o.tag(2, name);
    o.tag(5, hd);
    o.tag(330, 0);
    o.tag(100, 'AcDbSymbolTable');
    o.tag(70, n);
    body();
    o.tag(0, 'ENDTAB');
  };
  const rec = (type: string, hd: string, sub: string, name: string, flags = 0) => {
    o.tag(0, type);
    o.tag(5, h());
    o.tag(330, hd);
    o.tag(100, 'AcDbSymbolTableRecord');
    o.tag(100, sub);
    o.tag(2, name);
    o.tag(70, flags);
  };
  table('VPORT', T.VPORT, 1, () => {
    rec('VPORT', T.VPORT, 'AcDbViewportTableRecord', '*Active');
    o.tag(10, '0.0');
    o.tag(20, '0.0');
    o.tag(11, '1.0');
    o.tag(21, '1.0');
    o.tag(12, f(side / 2));
    o.tag(22, f(side / 2));
    o.tag(40, f(args.zoom && args.zoom > 0 ? side / args.zoom : side));
    o.tag(41, '1.6');
  });
  table('LTYPE', T.LTYPE, 4, () => {
    for (const n of ['ByBlock', 'ByLayer', 'Continuous']) {
      rec('LTYPE', T.LTYPE, 'AcDbLinetypeTableRecord', n);
      o.tag(3, n === 'Continuous' ? 'Solid line' : '');
      o.tag(72, 65);
      o.tag(73, 0);
      o.tag(40, '0.0');
    }
    rec('LTYPE', T.LTYPE, 'AcDbLinetypeTableRecord', 'DASHED');
    o.tag(3, '__ __ __');
    o.tag(72, 65);
    o.tag(73, 2);
    o.tag(40, '0.75');
    o.tag(49, '0.5');
    o.tag(74, 0);
    o.tag(49, '-0.25');
    o.tag(74, 0);
  });
  table('LAYER', T.LAYER, layers + 1, () => {
    for (let i = -1; i < layers; i++) {
      rec('LAYER', T.LAYER, 'AcDbLayerTableRecord', i < 0 ? '0' : layerName(i));
      o.tag(62, i < 0 ? 7 : 1 + (i % 254));
      o.tag(6, i >= 0 && i % 10 === 9 ? 'DASHED' : 'Continuous');
      o.tag(370, -3);
    }
  });
  table('STYLE', T.STYLE, 1, () => {
    rec('STYLE', T.STYLE, 'AcDbTextStyleTableRecord', 'Standard');
    o.tag(40, '0.0');
    o.tag(41, '1.0');
    o.tag(50, '0.0');
    o.tag(71, 0);
    o.tag(42, '2.5');
    o.tag(3, 'txt');
    o.tag(4, '');
  });
  table('VIEW', T.VIEW, 0, () => {});
  table('UCS', T.UCS, 0, () => {});
  table('APPID', T.APPID, 1, () => rec('APPID', T.APPID, 'AcDbRegAppTableRecord', 'ACAD'));
  table('DIMSTYLE', T.DIMSTYLE, 1, () => {
    o.tag(0, 'DIMSTYLE');
    o.tag(105, h());
    o.tag(330, T.DIMSTYLE);
    o.tag(100, 'AcDbSymbolTableRecord');
    o.tag(100, 'AcDbDimStyleTableRecord');
    o.tag(2, 'Standard');
    o.tag(70, 0);
  });
  table('BLOCK_RECORD', T.BLOCK_RECORD, 2 + BLOCKS, () => {
    const br = (hd: string, name: string, layout?: string) => {
      o.tag(0, 'BLOCK_RECORD');
      o.tag(5, hd);
      o.tag(330, T.BLOCK_RECORD);
      o.tag(100, 'AcDbSymbolTableRecord');
      o.tag(100, 'AcDbBlockTableRecord');
      o.tag(2, name);
      if (layout) o.tag(340, layout);
    };
    br(msRec, '*Model_Space', msLayout);
    br(psRec, '*Paper_Space', psLayout);
    for (let b = 0; b < BLOCKS; b++) br(blockRecs[b]!, 'BLK' + String(b).padStart(2, '0'));
  });
  o.tag(0, 'ENDSEC');

  // ---- 객체 쓰기 도우미
  const head = (type: string, owner: string, layer: string, hd = h()): string => {
    o.tag(0, type);
    o.tag(5, hd);
    o.tag(330, owner);
    o.tag(100, 'AcDbEntity');
    o.tag(8, layer);
    return hd;
  };
  const color = () => {
    // 객체 1/8은 색을 직접 준다
    if (rand() < 0.125) o.tag(62, 1 + Math.floor(rand() * 255));
  };
  const lineAt = (owner: string, layer: string, x: number, y: number, dx: number, dy: number) => {
    head('LINE', owner, layer);
    color();
    o.tag(100, 'AcDbLine');
    o.tag(10, f(x));
    o.tag(20, f(y));
    o.tag(30, '0.0');
    o.tag(11, f(x + dx));
    o.tag(21, f(y + dy));
    o.tag(31, '0.0');
  };
  const circleAt = (owner: string, layer: string, x: number, y: number, r: number) => {
    head('CIRCLE', owner, layer);
    color();
    o.tag(100, 'AcDbCircle');
    o.tag(10, f(x));
    o.tag(20, f(y));
    o.tag(30, '0.0');
    o.tag(40, f(r));
  };
  const arcAt = (owner: string, layer: string, x: number, y: number, r: number, a0: number, a1: number) => {
    head('ARC', owner, layer);
    color();
    o.tag(100, 'AcDbCircle');
    o.tag(10, f(x));
    o.tag(20, f(y));
    o.tag(30, '0.0');
    o.tag(40, f(r));
    o.tag(100, 'AcDbArc');
    o.tag(50, f(a0));
    o.tag(51, f(a1));
  };
  const textAt = (owner: string, layer: string, x: number, y: number, ht: number, s: string, rot: number) => {
    head('TEXT', owner, layer);
    color();
    o.tag(100, 'AcDbText');
    o.tag(10, f(x));
    o.tag(20, f(y));
    o.tag(30, '0.0');
    o.tag(40, f(ht));
    o.tag(1, s);
    if (rot) o.tag(50, f(rot));
    o.tag(100, 'AcDbText');
  };
  const word = () => {
    const n = 4 + Math.floor(rand() * 8);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(rand() < 0.3 ? 48 + Math.floor(rand() * 10) : 65 + Math.floor(rand() * 26));
    return s;
  };

  // ---- BLOCKS
  o.tag(0, 'SECTION');
  o.tag(2, 'BLOCKS');
  const blockBegin = (recH: string, name: string, flags: number) => {
    head('BLOCK', recH, '0');
    o.tag(100, 'AcDbBlockBegin');
    o.tag(2, name);
    o.tag(70, flags);
    o.tag(10, '0.0');
    o.tag(20, '0.0');
    o.tag(30, '0.0');
    o.tag(3, name);
    o.tag(1, '');
  };
  const blockEnd = (recH: string) => {
    head('ENDBLK', recH, '0');
    o.tag(100, 'AcDbBlockEnd');
  };
  blockBegin(msRec, '*Model_Space', 0);
  blockEnd(msRec);
  blockBegin(psRec, '*Paper_Space', 0);
  blockEnd(psRec);
  for (let b = 0; b < BLOCKS; b++) {
    const r = blockRecs[b]!;
    const name = 'BLK' + String(b).padStart(2, '0');
    const attrs = b < ATTR_BLOCKS;
    blockBegin(r, name, attrs ? 2 : 0);
    // 블록 내용: 사각형 + 대각선 + 원 + 호 (+ 속성 정의 2개)
    const s = 2 + (b % 5);
    lineAt(r, '0', -s, -s, 2 * s, 0);
    lineAt(r, '0', s, -s, 0, 2 * s);
    lineAt(r, '0', s, s, -2 * s, 0);
    lineAt(r, '0', -s, s, 0, -2 * s);
    lineAt(r, '0', -s, -s, 2 * s, 2 * s);
    circleAt(r, '0', 0, 0, s * 0.6);
    arcAt(r, '0', 0, 0, s * 0.8, 15 * b, 15 * b + 200);
    if (attrs) {
      for (const [tag, dy] of [
        ['TAG1', s + 1],
        ['TAG2', -s - 3],
      ] as const) {
        head('ATTDEF', r, '0');
        o.tag(100, 'AcDbText');
        o.tag(10, f(-s));
        o.tag(20, f(dy));
        o.tag(30, '0.0');
        o.tag(40, '1.5');
        o.tag(1, 'DEFAULT');
        o.tag(100, 'AcDbAttributeDefinition');
        o.tag(3, 'Prompt ' + tag);
        o.tag(2, tag);
        o.tag(70, 0);
      }
    }
    blockEnd(r);
  }
  o.tag(0, 'ENDSEC');

  // ---- ENTITIES
  o.tag(0, 'SECTION');
  o.tag(2, 'ENTITIES');
  const mixTable = MIXES[args.mix ?? 'default'];
  const pick = (k: number): Kind => {
    if (args.only) return args.only;
    for (const [lim, kind] of mixTable) if (k < lim) return kind;
    return mixTable[mixTable.length - 1]![1];
  };
  /** VERTEX 하나(2D·3D·메시·폴리페이스) */
  const vertex = (owner: string, layer: string, sub: string, px: number, py: number, pz: number, flags: number, extra?: () => void) => {
    head('VERTEX', owner, layer);
    o.tag(100, 'AcDbVertex');
    o.tag(100, sub);
    o.tag(10, f(px));
    o.tag(20, f(py));
    o.tag(30, f(pz));
    extra?.();
    if (flags) o.tag(70, flags);
  };
  for (let i = 0; i < count; i++) {
    const layer = layerName(Math.floor(rand() * layers));
    const x = rand() * side;
    const y = rand() * side;
    const k = rand();
    const sz = 1 + rand() * 9;
    const kind = pick(k);
    if (kind === 'line') {
      bump('LINE');
      const a = rand() * Math.PI * 2;
      lineAt(msRec, layer, x, y, Math.cos(a) * sz, Math.sin(a) * sz);
    } else if (kind === 'lw') {
      bump('LWPOLYLINE');
      head('LWPOLYLINE', msRec, layer);
      color();
      const nv = 3 + Math.floor(rand() * 8);
      const closed = rand() < 0.4;
      const bulges = rand() < 0.25;
      o.tag(100, 'AcDbPolyline');
      o.tag(90, nv);
      o.tag(70, closed ? 1 : 0);
      o.tag(43, '0.0');
      let px = x;
      let py = y;
      for (let v = 0; v < nv; v++) {
        o.tag(10, f(px));
        o.tag(20, f(py));
        if (bulges && v % 2 === 0) o.tag(42, f(rand() - 0.5));
        px += (rand() - 0.3) * sz;
        py += (rand() - 0.3) * sz;
      }
    } else if (kind === 'poly2d') {
      bump('POLYLINE');
      const ph = head('POLYLINE', msRec, layer);
      o.tag(100, 'AcDb2dPolyline');
      o.tag(66, 1);
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, '0.0');
      o.tag(70, rand() < 0.5 ? 1 : 0);
      const nv = 3 + Math.floor(rand() * 4);
      let px = x;
      let py = y;
      for (let v = 0; v < nv; v++) {
        head('VERTEX', ph, layer);
        o.tag(100, 'AcDbVertex');
        o.tag(100, 'AcDb2dVertex');
        o.tag(10, f(px));
        o.tag(20, f(py));
        o.tag(30, '0.0');
        px += (rand() - 0.3) * sz;
        py += (rand() - 0.3) * sz;
      }
      head('SEQEND', ph, layer);
    } else if (kind === 'poly2dArc') {
      // 볼록·정점별 폭·기본 폭·고도가 있는 2D 폴리선
      bump('POLYLINE2D_ARC');
      const ph = head('POLYLINE', msRec, layer);
      color();
      const wide = rand() < 0.3;
      const elev = rand() < 0.2 ? Math.round(rand() * 50) : 0;
      o.tag(100, 'AcDb2dPolyline');
      o.tag(66, 1);
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, f(elev));
      o.tag(70, (rand() < 0.4 ? 1 : 0) | (rand() < 0.2 ? 128 : 0));
      if (wide) {
        o.tag(40, f(sz / 20));
        o.tag(41, f(sz / 20));
      }
      const nv = 3 + Math.floor(rand() * 8);
      let px = x;
      let py = y;
      for (let v = 0; v < nv; v++) {
        const b = rand() < 0.4 ? rand() - 0.5 : 0;
        const w = wide && rand() < 0.3 ? rand() * sz * 0.1 : -1;
        vertex(ph, layer, 'AcDb2dVertex', px, py, elev, 0, () => {
          if (w >= 0) {
            o.tag(40, f(w));
            o.tag(41, f(w / 2));
          }
          if (b) o.tag(42, f(b));
        });
        px += (rand() - 0.3) * sz;
        py += (rand() - 0.3) * sz;
      }
      head('SEQEND', ph, layer);
    } else if (kind === 'poly3d') {
      bump('POLYLINE3D');
      const ph = head('POLYLINE', msRec, layer);
      color();
      o.tag(100, 'AcDb3dPolyline');
      o.tag(66, 1);
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, '0.0');
      o.tag(70, 8 | (rand() < 0.3 ? 1 : 0));
      const nv = 2 + Math.floor(rand() * 7);
      let px = x;
      let py = y;
      let pz = rand() * 20;
      for (let v = 0; v < nv; v++) {
        vertex(ph, layer, 'AcDb3dPolylineVertex', px, py, pz, 32);
        px += (rand() - 0.3) * sz;
        py += (rand() - 0.3) * sz;
        pz += (rand() - 0.5) * sz;
      }
      head('SEQEND', ph, layer);
    } else if (kind === 'polyface') {
      // 상자 모양 폴리페이스(정점 8, 면 6 — 보이지 않는 모서리 몇 개)
      bump('POLYFACE');
      const ph = head('POLYLINE', msRec, layer);
      o.tag(100, 'AcDbPolyFaceMesh');
      o.tag(66, 1);
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, '0.0');
      o.tag(70, 64);
      o.tag(71, 8);
      o.tag(72, 6);
      const hz = sz * (0.5 + rand());
      for (let v = 0; v < 8; v++) vertex(ph, layer, 'AcDbPolyFaceMeshVertex', x + (v & 1 ? sz : 0), y + (v & 2 ? sz : 0), v & 4 ? hz : 0, 192);
      const faces = [
        [1, 2, 4, 3],
        [5, 6, 8, 7],
        [1, 2, 6, 5],
        [3, 4, 8, 7],
        [1, 3, 7, 5],
        [2, 4, 8, -6],
      ];
      for (const fc of faces) {
        vertex(ph, layer, 'AcDbFaceRecord', 0, 0, 0, 128, () => {
          fc.forEach((n, j) => o.tag(71 + j, n));
        });
      }
      head('SEQEND', ph, layer);
    } else if (kind === 'pmesh') {
      // M×N 다각형 메시
      bump('PMESH');
      const ph = head('POLYLINE', msRec, layer);
      const m = 2 + Math.floor(rand() * 3);
      const n = 2 + Math.floor(rand() * 3);
      o.tag(100, 'AcDbPolygonMesh');
      o.tag(66, 1);
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, '0.0');
      o.tag(70, 16);
      o.tag(71, m);
      o.tag(72, n);
      for (let a = 0; a < m; a++) for (let b = 0; b < n; b++) vertex(ph, layer, 'AcDbPolygonMeshVertex', x + a * sz, y + b * sz, rand() * sz, 64);
      head('SEQEND', ph, layer);
    } else if (kind === 'circle') {
      bump('CIRCLE');
      circleAt(msRec, layer, x, y, sz / 2);
    } else if (kind === 'arc') {
      bump('ARC');
      const a0 = rand() * 360;
      arcAt(msRec, layer, x, y, sz / 2, a0, a0 + 30 + rand() * 300);
    } else if (kind === 'text') {
      bump('TEXT');
      textAt(msRec, layer, x, y, 1 + rand() * 2, word(), rand() < 0.2 ? rand() * 90 : 0);
    } else if (kind === 'mtext') {
      bump('MTEXT');
      head('MTEXT', msRec, layer);
      o.tag(100, 'AcDbMText');
      o.tag(10, f(x));
      o.tag(20, f(y));
      o.tag(30, '0.0');
      o.tag(40, '2.0');
      o.tag(41, '30.0');
      o.tag(71, 1);
      o.tag(1, word() + ' ' + word() + '\\P' + word());
    } else if (kind === 'hatch') {
      bump('HATCH');
      const solid = rand() < 0.6;
      head('HATCH', msRec, layer);
      o.tag(100, 'AcDbHatch');
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, '0.0');
      o.tag(210, '0.0');
      o.tag(220, '0.0');
      o.tag(230, '1.0');
      o.tag(2, solid ? 'SOLID' : 'ANSI31');
      o.tag(70, solid ? 1 : 0);
      o.tag(71, 0);
      o.tag(91, 1);
      o.tag(92, 2);
      o.tag(72, 0);
      o.tag(73, 1);
      o.tag(93, 4);
      const w = sz;
      const hgt = sz * (0.5 + rand());
      for (const [vx, vy] of [
        [x, y],
        [x + w, y],
        [x + w, y + hgt],
        [x, y + hgt],
      ] as const) {
        o.tag(10, f(vx));
        o.tag(20, f(vy));
      }
      o.tag(97, 0);
      o.tag(75, 0);
      o.tag(76, 1);
      if (!solid) {
        o.tag(52, '0.0');
        o.tag(41, '1.0');
        o.tag(77, 0);
        o.tag(78, 1);
        o.tag(53, '45.0');
        o.tag(43, '0.0');
        o.tag(44, '0.0');
        o.tag(45, '-2.2450640303');
        o.tag(46, '2.2450640303');
        o.tag(79, 0);
      }
      o.tag(98, 0);
    } else if (kind === 'hatchEdges') {
      // 선·호 모서리 경계(둥근 끝 사각형, 1/3은 안에 둥근 구멍)
      bump('HATCH_EDGES');
      const solid = rand() < 0.6;
      const hole = rand() < 0.33;
      head('HATCH', msRec, layer);
      color();
      o.tag(100, 'AcDbHatch');
      o.tag(10, '0.0');
      o.tag(20, '0.0');
      o.tag(30, '0.0');
      o.tag(210, '0.0');
      o.tag(220, '0.0');
      o.tag(230, '1.0');
      o.tag(2, solid ? 'SOLID' : 'ANSI31');
      o.tag(70, solid ? 1 : 0);
      o.tag(71, 0);
      o.tag(91, hole ? 2 : 1);
      const w = sz;
      const hgt = sz * (0.5 + rand());
      const r = hgt / 2;
      o.tag(92, 1);
      o.tag(93, 4);
      const line = (x0: number, y0: number, x1: number, y1: number) => {
        o.tag(72, 1);
        o.tag(10, f(x0));
        o.tag(20, f(y0));
        o.tag(11, f(x1));
        o.tag(21, f(y1));
      };
      const arc = (cx: number, cy: number, rr: number, a0: number, a1: number, ccw: boolean) => {
        o.tag(72, 2);
        o.tag(10, f(cx));
        o.tag(20, f(cy));
        o.tag(40, f(rr));
        o.tag(50, f(a0));
        o.tag(51, f(a1));
        o.tag(73, ccw ? 1 : 0);
      };
      line(x, y, x + w, y);
      arc(x + w, y + r, r, 270, 90, true);
      line(x + w, y + hgt, x, y + hgt);
      line(x, y + hgt, x, y);
      o.tag(97, 0);
      if (hole) {
        o.tag(92, 16);
        o.tag(93, 2);
        const cx = x + w / 2;
        const cy = y + r;
        arc(cx, cy, r / 3, 0, 180, true);
        arc(cx, cy, r / 3, 180, 360, true);
        o.tag(97, 0);
      }
      o.tag(75, 0);
      o.tag(76, 1);
      if (!solid) {
        o.tag(52, '0.0');
        o.tag(41, '1.0');
        o.tag(77, 0);
        o.tag(78, 1);
        o.tag(53, '45.0');
        o.tag(43, '0.0');
        o.tag(44, '0.0');
        o.tag(45, '-2.2450640303');
        o.tag(46, '2.2450640303');
        o.tag(79, 0);
      }
      o.tag(98, 0);
    } else if (kind === 'spline' || kind === 'splineFit') {
      // 조정점 3차 스플라인(고정 균일 매듭) 또는 맞춤점만 있는 스플라인(맞춤점 방식·현 길이)
      const fit = kind === 'splineFit';
      bump(fit ? 'SPLINE_FIT' : 'SPLINE');
      head('SPLINE', msRec, layer);
      color();
      const n = fit ? 3 + Math.floor(rand() * 5) : 4 + Math.floor(rand() * 6);
      const pts: [number, number][] = [];
      let px = x;
      let py = y;
      for (let v = 0; v < n; v++) {
        pts.push([px, py]);
        px += (0.2 + rand()) * sz;
        py += (rand() - 0.5) * sz;
      }
      o.tag(100, 'AcDbSpline');
      o.tag(210, '0.0');
      o.tag(220, '0.0');
      o.tag(230, '1.0');
      o.tag(70, fit ? 1064 : 8);
      o.tag(71, 3);
      const knots: number[] = [];
      if (!fit) {
        for (let j = 0; j < 4; j++) knots.push(0);
        for (let j = 1; j < n - 3; j++) knots.push(j);
        for (let j = 0; j < 4; j++) knots.push(n - 3);
      }
      o.tag(72, knots.length);
      o.tag(73, fit ? 0 : n);
      o.tag(74, fit ? n : 0);
      o.tag(42, '0.0000000001');
      o.tag(43, '0.0000000001');
      if (fit) o.tag(44, '0.0000000001');
      for (const kv of knots) o.tag(40, f(kv));
      for (const [vx, vy] of pts) {
        o.tag(fit ? 11 : 10, f(vx));
        o.tag(fit ? 21 : 20, f(vy));
        o.tag(fit ? 31 : 30, '0.0');
      }
    } else if (kind === 'leader') {
      bump('LEADER');
      head('LEADER', msRec, layer);
      o.tag(100, 'AcDbLeader');
      o.tag(3, 'Standard');
      o.tag(71, 1);
      o.tag(72, rand() < 0.2 ? 1 : 0);
      o.tag(73, 3);
      o.tag(74, 0);
      o.tag(75, 0);
      o.tag(40, '0.0');
      o.tag(41, '0.0');
      const n = 2 + Math.floor(rand() * 3);
      o.tag(76, n);
      let px = x;
      let py = y;
      for (let v = 0; v < n; v++) {
        o.tag(10, f(px));
        o.tag(20, f(py));
        o.tag(30, '0.0');
        px += (0.3 + rand()) * sz;
        py += v === 0 ? sz : 0;
      }
    } else {
      bump('INSERT');
      const b = Math.floor(rand() * BLOCKS);
      const attrs = b < ATTR_BLOCKS;
      const ih = head('INSERT', msRec, layer);
      o.tag(100, 'AcDbBlockReference');
      if (attrs) o.tag(66, 1);
      o.tag(2, 'BLK' + String(b).padStart(2, '0'));
      o.tag(10, f(x));
      o.tag(20, f(y));
      o.tag(30, '0.0');
      const sc = 0.5 + rand();
      o.tag(41, f(sc));
      o.tag(42, f(sc));
      o.tag(43, f(sc));
      if (rand() < 0.3) o.tag(50, f(rand() * 360));
      if (attrs) {
        const s = 2 + (b % 5);
        for (const [tag, dy] of [
          ['TAG1', s + 1],
          ['TAG2', -s - 3],
        ] as const) {
          head('ATTRIB', ih, layer);
          o.tag(100, 'AcDbText');
          o.tag(10, f(x - s * sc));
          o.tag(20, f(y + dy * sc));
          o.tag(30, '0.0');
          o.tag(40, f(1.5 * sc));
          o.tag(1, word());
          o.tag(100, 'AcDbAttribute');
          o.tag(2, tag);
          o.tag(70, 0);
        }
        head('SEQEND', ih, layer);
      }
    }
  }
  o.tag(0, 'ENDSEC');

  // ---- OBJECTS: 이름 있는 객체 사전과 배치
  o.tag(0, 'SECTION');
  o.tag(2, 'OBJECTS');
  const dict = (hd: string, owner: string, entries: [string, string][]) => {
    o.tag(0, 'DICTIONARY');
    o.tag(5, hd);
    o.tag(330, owner);
    o.tag(100, 'AcDbDictionary');
    o.tag(281, 1);
    for (const [k, v] of entries) {
      o.tag(3, k);
      o.tag(350, v);
    }
  };
  dict(T.ROOT, '0', [
    ['ACAD_GROUP', T.GROUPS],
    ['ACAD_LAYOUT', T.LAYOUTS],
  ]);
  dict(T.GROUPS, T.ROOT, []);
  dict(T.LAYOUTS, T.ROOT, [
    ['Model', msLayout],
    ['Layout1', psLayout],
  ]);
  const layout = (hd: string, name: string, recH: string, tab: number) => {
    o.tag(0, 'LAYOUT');
    o.tag(5, hd);
    o.tag(330, T.LAYOUTS);
    o.tag(100, 'AcDbPlotSettings');
    o.tag(1, '');
    o.tag(4, 'ISO_A3_(420.00_x_297.00_MM)');
    o.tag(6, '');
    o.tag(40, '7.5');
    o.tag(41, '20.0');
    o.tag(42, '7.5');
    o.tag(43, '20.0');
    o.tag(44, '420.0');
    o.tag(45, '297.0');
    o.tag(70, tab === 0 ? 1712 : 688);
    o.tag(72, 1);
    o.tag(73, 1);
    o.tag(74, tab === 0 ? 0 : 5);
    o.tag(100, 'AcDbLayout');
    o.tag(1, name);
    o.tag(70, 1);
    o.tag(71, tab);
    o.tag(10, '0.0');
    o.tag(20, '0.0');
    o.tag(11, '420.0');
    o.tag(21, '297.0');
    o.tag(330, recH);
  };
  layout(msLayout, 'Model', msRec, 0);
  layout(psLayout, 'Layout1', psRec, 1);
  o.tag(0, 'ENDSEC');
  o.tag(0, 'EOF');
  o.flush();
  return { bytes: o.bytes, counts };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = performance.now();
  const fd = openSync(args.out, 'w');
  const r = generate(args, (s) => writeSync(fd, s, null, 'latin1'));
  closeSync(fd);
  console.log(`DXF ${args.out}: ${args.count.toLocaleString()} 객체, ${(r.bytes / 1048576).toFixed(1)} MB, ${Math.round(performance.now() - t0)} ms`);
  console.log('종류별:', JSON.stringify(r.counts));
  if (args.dwg) {
    const { readCadFile } = await import('../../src/io/index');
    const { writeDwg } = await import('../../src/io/dwg/index');
    const t1 = performance.now();
    const doc = readCadFile(new Uint8Array(readFileSync(args.out)), args.out);
    const t2 = performance.now();
    const w = writeDwg(doc, { version: 'AC1032' });
    writeFileSync(args.dwg, w.data);
    console.log(`DWG ${args.dwg}: ${(statSync(args.dwg).size / 1048576).toFixed(1)} MB (읽기 ${Math.round(t2 - t1)} ms, 쓰기 ${Math.round(performance.now() - t2)} ms), 경고 ${w.warnings.length}`);
  }
}

// 시험(vitest)에서 불러올 때는 명령을 돌리지 않는다.
if (!process.env.VITEST) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
