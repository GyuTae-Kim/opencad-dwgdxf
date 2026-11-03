/**
 * R12(AC1009) DWG 읽기. 표본은 저장소에 넣지 않으므로 형식 설명대로 바이트를 직접 조립한다.
 * 실제 파일 대조(AutoCAD R11이 같은 도면을 DWG·DXF로 쓴 짝, 에스토니아·오스트라바 공개 도면)는 작업 내역에 적었다.
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, AttribEntity, CadDocument, CircleEntity, InsertEntity, LineEntity, PolylineEntity, TextEntity, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

class Bytes {
  a: number[] = [];
  get n(): number {
    return this.a.length;
  }
  u8(v: number): this {
    this.a.push(v & 0xff);
    return this;
  }
  i16(v: number): this {
    return this.u8(v).u8(v >> 8);
  }
  u32(v: number): this {
    return this.i16(v & 0xffff).i16(v >>> 16);
  }
  f64(v: number): this {
    const b = new Uint8Array(new Float64Array([v]).buffer);
    for (const x of b) this.a.push(x);
    return this;
  }
  fixed(s: number[] | string, n: number): this {
    const b = typeof s === 'string' ? [...s].map((c) => c.charCodeAt(0)) : s;
    for (let i = 0; i < n; i++) this.u8(b[i] ?? 0);
    return this;
  }
  text(s: string): this {
    this.i16(s.length);
    for (const c of s) this.u8(c.charCodeAt(0));
    return this;
  }
  put(at: number, other: number[]): void {
    for (let i = 0; i < other.length; i++) this.a[at + i] = other[i]!;
  }
}

interface EntOpts {
  layer?: number;
  f2?: number;
  f3?: number;
  color?: number;
  ltype?: number;
  thickness?: number;
  elevation?: number;
  handle?: number[];
  /** 추가 플래그(모드 0x40): 0x04 뷰포트 번호 */
  extra?: number;
  /** 확장 자료 바이트(추가 플래그 0x02) */
  eed?: number[];
  attribs?: boolean;
  /** 지운 객체(종류 | 0x80) */
  deleted?: boolean;
}

/** 객체 하나: 종류, 모드, 크기, 도면층, 플래그 두 바이트, 선택 칸, 본문, CRC(0) */
function ent(type: number, body: (b: Bytes) => void, o: EntOpts = {}): number[] {
  let mode = 0;
  const pre = new Bytes();
  if (o.extra !== undefined || o.eed) {
    mode |= 0x40;
    pre.u8((o.extra ?? 0) | (o.eed ? 2 : 0));
    if (o.eed) {
      pre.i16(o.eed.length);
      pre.a.push(...o.eed);
    }
  }
  if (o.color !== undefined) {
    mode |= 1;
    pre.u8(o.color);
  }
  if (o.ltype !== undefined) {
    mode |= 2;
    pre.i16(o.ltype);
  }
  if (o.thickness !== undefined) {
    mode |= 8;
    pre.f64(o.thickness);
  }
  if (o.elevation !== undefined) {
    mode |= 4;
    if (type !== 1 && type !== 2 && type !== 22) pre.f64(o.elevation);
  }
  if (o.handle) {
    mode |= 0x20;
    pre.u8(o.handle.length);
    for (const x of o.handle) pre.u8(x);
  }
  if (o.extra !== undefined && o.extra & 4) pre.i16(1);
  // 확장 자료와 뷰포트 번호가 고도 앞뒤에 오는 순서: 추가 플래그 → (색·선종류·두께·고도) → 핸들 → 뷰포트
  if (o.attribs) mode |= 0x80;
  const b = new Bytes();
  body(b);
  const size = 8 + pre.n + b.n + 2;
  const out = new Bytes()
    .u8(o.deleted ? type | 0x80 : type)
    .u8(mode)
    .i16(size)
    .i16(o.layer ?? 0)
    .u8(o.f2 ?? 0)
    .u8(o.f3 ?? 0);
  out.a.push(...pre.a, ...b.a);
  out.i16(0);
  return out.a;
}

interface FileParts {
  layers: { name: number[] | string; color: number; ltype?: number }[];
  ltypes?: string[];
  styles?: string[];
  appids?: string[];
  blocks?: { name: string; flag: number; entities: number[][] }[];
  entities: number[][];
  codepage?: number;
  header?: (b: Bytes) => void;
}

/** R12 파일: 머리(0x6BD) + CRC + 구분자 → 객체 구역 → 표 → 블록 구역 */
function r12(p: FileParts): Uint8Array {
  const b = new Bytes();
  b.fixed('AC1009', 0x6cf);
  p.header?.(b);
  b.put(0x3f9, [p.codepage ?? 0, 0]);
  const es = b.n;
  for (const e of p.entities) b.a.push(...e);
  const ee = b.n;
  const table = (at: number, size: number, recs: number[][]) => {
    const begin = b.n;
    for (const r of recs) b.a.push(...r);
    const d = new Bytes().i16(size).i16(recs.length).i16(0).u32(begin);
    b.put(at, d.a);
  };
  const ltypes = p.ltypes ?? ['CONTINUOUS'];
  table(
    0x4a,
    191,
    ltypes.map((n) => new Bytes().u8(0).fixed(n, 32).i16(0).fixed('', 48).u8(65).u8(0).f64(0).fixed([], 96).i16(0).a),
  );
  table(
    0x36,
    41,
    p.layers.map((l) => new Bytes().u8(0).fixed(l.name, 32).i16(0).i16(l.color).i16(l.ltype ?? 0).i16(0).a),
  );
  table(
    0x40,
    198,
    (p.styles ?? ['STANDARD']).map((n) => new Bytes().u8(0).fixed(n, 32).i16(0).f64(0).f64(1).f64(0).u8(0).f64(0.2).fixed('txt', 64).fixed('', 64).i16(0).a),
  );
  // 블록 구역 위치를 먼저 정해 블록 표의 주소를 쓴다
  const blocks = p.blocks ?? [];
  const blockBytes = new Bytes();
  const addr: number[] = [];
  for (const blk of blocks) {
    addr.push(blockBytes.n);
    for (const e of blk.entities) blockBytes.a.push(...e);
  }
  table(
    0x2c,
    45,
    blocks.map((blk, i) => new Bytes().u8(blk.flag).fixed(blk.name, 32).i16(0).u32((0x40000000 | addr[i]!) >>> 0).i16(0).u8(0).u8(0).i16(0).a),
  );
  table(
    0x512,
    37,
    (p.appids ?? ['ACAD']).map((n) => new Bytes().u8(0).fixed(n, 32).i16(0).i16(0).a),
  );
  for (const at of [0x54, 0x3ef, 0x500, 0x522, 0x69f]) b.put(at, new Bytes().i16(40).i16(0).i16(0).u32(0).a);
  const bs = b.n;
  b.a.push(...blockBytes.a);
  const pos = new Bytes().u32(es).u32(ee).u32(bs).u32(blockBytes.n).u32(b.n).u32(0);
  b.put(0x14, pos.a);
  return new Uint8Array(b.a);
}

const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)?.entities ?? [];
const xy = (x: number, y: number) => (b: Bytes) => b.f64(x).f64(y);
const line3 = (b: Bytes) => b.f64(1).f64(2).f64(3).f64(4).f64(5).f64(6);
const LAYERS = [
  { name: '0', color: 7 },
  { name: 'WALL', color: 1 },
];

describe('R12 DWG 읽기', () => {
  it('선·원·호: 도면층·색·선종류·고도·두께, 고도 비트가 있는 선은 Z가 없다', () => {
    const doc = readDwg(
      r12({
        layers: LAYERS,
        ltypes: ['CONTINUOUS', 'DASHED'],
        entities: [
          ent(1, line3, { layer: 1, color: 3, ltype: 1 }),
          ent(1, (b) => b.f64(1).f64(1).f64(2).f64(2), { elevation: 0 }),
          ent(3, (b) => xy(5, 5)(b.f64(0).f64(0).f64(2)), { elevation: 7, thickness: 0.5 }),
          ent(8, (b) => b.f64(0).f64(0).f64(1).f64(0).f64(Math.PI / 2), { ltype: 32767 }),
        ],
      }),
    );
    expect(doc.version).toBe('AC1009');
    expect(doc.format).toBe('dwg');
    const [a, b, c, d] = ms(doc) as [LineEntity, LineEntity, CircleEntity, ArcEntity];
    expect(a.layer).toBe('WALL');
    expect(a.color).toEqual({ aci: 3 });
    expect(a.linetype).toBe('DASHED');
    expect(a.start).toEqual({ x: 1, y: 2, z: 3 });
    expect(a.end).toEqual({ x: 4, y: 5, z: 6 });
    expect(b.end).toEqual({ x: 2, y: 2, z: 0 });
    expect(c.type).toBe('CIRCLE');
    expect(c.center.z).toBe(7);
    expect(c.thickness).toBe(0.5);
    expect(d.endAngle).toBeCloseTo(Math.PI / 2);
    expect(d.linetype.toUpperCase()).toBe('BYLAYER');
  });

  it('문자: 회전(라디안 → 도)·문자 스타일 번호·맞춤점', () => {
    const doc = readDwg(
      r12({
        layers: LAYERS,
        styles: ['STANDARD', 'ROMANS'],
        entities: [
          ent(
            7,
            (b) =>
              b
                .f64(1)
                .f64(2)
                .f64(0.5)
                .text('HELLO')
                .f64(Math.PI / 6)
                .u8(1)
                .u8(1)
                .f64(3)
                .f64(4),
            { f2: 0x01 | 0x08 | 0x20 | 0x40 },
          ),
        ],
      }),
    );
    const t = ms(doc)[0] as TextEntity;
    expect(t.text).toBe('HELLO');
    expect(t.rotation).toBeCloseTo(Math.PI / 6);
    expect(t.style).toBe('ROMANS');
    expect(t.halign).toBe(1);
    expect(t.alignPoint).toMatchObject({ x: 3, y: 4 });
  });

  it('폴리선·정점·끝: 볼록 정도와 닫힘, 3D 정점은 고도가 Z다', () => {
    const doc = readDwg(
      r12({
        layers: LAYERS,
        entities: [
          ent(19, (b) => b.u8(1), { f2: 0x01 }),
          ent(20, xy(0, 0)),
          ent(20, (b) => b.f64(10).f64(0).f64(1), { f2: 0x04 }),
          ent(20, xy(10, 10)),
          ent(17, (b) => b.u32(0)),
          ent(19, (b) => b.u8(8), { f2: 0x01 }),
          ent(20, (b) => b.f64(0).f64(0).u8(32), { elevation: 5, f2: 0x08 }),
          ent(20, xy(1, 1), { elevation: 6 }),
          ent(17, (b) => b.u32(0)),
        ],
      }),
    );
    const [p2, p3] = ms(doc) as PolylineEntity[];
    expect(p2.flags & 1).toBe(1);
    expect([...p2.verts]).toEqual([0, 0, 0, 10, 0, 0, 10, 10, 0]);
    expect([...p2.bulges!]).toEqual([0, 1, 0]);
    expect(p3.flags & 8).toBe(8);
    expect([...p3.verts]).toEqual([0, 0, 5, 1, 1, 6]);
  });

  it('블록·삽입·속성: 익명 블록 이름은 표 번호를 붙이고, 블록 번호로 이름을 찾는다', () => {
    const blockEnt = (name: string) => (b: Bytes) => b.f64(0).f64(0).text(name);
    const doc = readDwg(
      r12({
        layers: LAYERS,
        blocks: [
          { name: 'DOOR', flag: 2, entities: [ent(12, blockEnt('DOOR'), { f2: 0x04 }), ent(1, line3), ent(13, () => {})] },
          { name: '*U', flag: 1, entities: [ent(12, (b) => b.f64(0).f64(0)), ent(3, (b) => b.f64(0).f64(0).f64(1)), ent(13, () => {})] },
        ],
        entities: [
          ent(14, (b) => b.i16(0).f64(10).f64(20).f64(2).f64(3).f64(Math.PI), { f2: 0x01 | 0x02 | 0x04, attribs: true }),
          ent(16, (b) => b.f64(10).f64(20).f64(1).text('101').text('NO').u8(0)),
          ent(17, (b) => b.u32(0)),
          ent(14, (b) => b.i16(1).f64(0).f64(0)),
        ],
      }),
    );
    expect([...doc.blocks.values()].map((b) => b.name)).toEqual(expect.arrayContaining(['DOOR', '*U1']));
    expect(doc.blocks.get('DOOR')!.entities).toHaveLength(1);
    const [door, anon] = ms(doc) as InsertEntity[];
    expect(door.block).toBe('DOOR');
    expect(door.insert).toMatchObject({ x: 10, y: 20 });
    expect(door.scale).toMatchObject({ x: 2, y: 3 });
    expect(door.rotation).toBeCloseTo(Math.PI);
    expect(door.attribs.map((a: AttribEntity) => [a.tag, a.text])).toEqual([['NO', '101']]);
    expect(anon.block).toBe('*U1');
  });

  it('도면 공간 뷰포트 번호가 있는 최상위 객체는 도면 공간이다(블록 안은 아니다)', () => {
    const doc = readDwg(
      r12({
        layers: LAYERS,
        blocks: [{ name: 'B', flag: 0, entities: [ent(12, (b) => b.f64(0).f64(0)), ent(1, line3, { extra: 4 }), ent(13, () => {})] }],
        entities: [ent(1, line3, { extra: 4 }), ent(1, line3, { extra: 0 })],
      }),
    );
    expect(doc.blocks.get(PAPER_SPACE)?.entities).toHaveLength(1);
    expect(ms(doc)).toHaveLength(1);
    expect(doc.blocks.get('B')!.entities).toHaveLength(1);
  });

  it('지운 객체는 건너뛰고, 모르는 종류와 잘린 객체는 경고하고 나머지를 읽는다', () => {
    const cut = ent(1, line3);
    cut[2] = 200; // 크기가 구역을 넘는다
    const doc = readDwg(
      r12({
        layers: LAYERS,
        entities: [ent(1, line3, { deleted: true }), ent(21, line3), ent(1, line3, { handle: [0x01, 0x2a] }), cut],
      }),
    );
    expect(ms(doc).map((e) => e.handle)).toContain('12A');
    expect(ms(doc)).toHaveLength(1);
    expect(doc.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['entity.r12_unknown', 'dwg.object_skipped']));
  });

  it('확장 자료: 응용프로그램 번호·문자열·괄호·점·실수·정수를 R12 DXF 태그로', () => {
    const f64 = (v: number) => [...new Uint8Array(new Float64Array([v]).buffer)];
    const eed = [1, 1, 0, 0, 5, ...[...'HELLO'].map((c) => c.charCodeAt(0)), 2, 0, 10, ...f64(1), ...f64(2), ...f64(3), 40, ...f64(2.5), 70, 7, 0, 71, 9, 0, 0, 0, 2, 1];
    const doc = readDwg(r12({ layers: LAYERS, appids: ['ACAD', 'MYAPP'], entities: [ent(1, line3, { eed })] }));
    const x = (ms(doc)[0] as LineEntity).xdata!;
    expect(x[0]!.app).toBe('MYAPP');
    expect(x[0]!.items).toEqual([
      { code: 1000, value: 'HELLO' },
      { code: 1002, value: '{' },
      { code: 1010, value: { x: 1, y: 2, z: 3 } },
      { code: 1040, value: 2.5 },
      { code: 1070, value: 7 },
      { code: 1071, value: 9 },
      { code: 1002, value: '}' },
    ]);
  });

  it('블록 안 정점: 추가 플래그 → 고도 → 핸들 → 뷰포트 순서(에스토니아 공개 도면의 배치)', () => {
    const doc = readDwg(
      r12({
        layers: LAYERS,
        blocks: [
          {
            name: 'B',
            flag: 0,
            entities: [
              ent(12, (b) => b.f64(0).f64(0)),
              ent(19, (b) => b.u8(9), { f2: 0x01, extra: 4, handle: [0x15, 0xca] }),
              ent(20, (b) => b.f64(-22.8).f64(35.1).u8(32), { f2: 0x08, extra: 4, elevation: 8.9, handle: [0x15, 0xcb] }),
              ent(20, (b) => b.f64(1).f64(2).u8(32), { f2: 0x08, extra: 4, elevation: 9, handle: [0x15, 0xcc] }),
              ent(17, (b) => b.u32(0), { extra: 4 }),
              ent(13, () => {}),
            ],
          },
        ],
        entities: [],
      }),
    );
    const pl = doc.blocks.get('B')!.entities[0] as PolylineEntity;
    expect([...pl.verts]).toEqual([-22.8, 35.1, 8.9, 1, 2, 9]);
  });

  it('16MB가 넘는 블록 구역: 크기의 맨 위 바이트(0x41)까지 읽는다(오스트라바 공개 도면)', () => {
    const blockHead = ent(12, (b) => b.f64(0).f64(0));
    const base = r12({
      layers: LAYERS,
      blocks: [{ name: 'BIG', flag: 0, entities: [blockHead, ent(1, line3), ent(13, () => {})] }],
      entities: [ent(14, (b) => b.i16(0).f64(0).f64(0))],
    });
    // BLOCK 뒤에 지운 객체(32000바이트) 530개를 끼워 블록 구역을 16MB보다 크게 만든다
    const n = 530;
    const size = 32000;
    const bs = new DataView(base.buffer).getUint32(0x1c, true);
    const bz = new DataView(base.buffer).getUint32(0x20, true);
    const at = bs + blockHead.length;
    const out = new Uint8Array(base.length + n * size);
    out.set(base.subarray(0, at), 0);
    for (let i = 0; i < n; i++) {
      const q = at + i * size;
      out[q] = 0x81;
      out[q + 2] = size & 0xff;
      out[q + 3] = size >> 8;
    }
    out.set(base.subarray(at), at + n * size);
    new DataView(out.buffer).setUint32(0x20, (0x40000000 | (bz + n * size)) >>> 0, true);
    const doc = readDwg(out);
    expect(doc.blocks.get('BIG')!.entities.map((e) => e.type)).toEqual(['LINE']);
    expect(doc.warnings.map((w) => w.code)).not.toContain('dwg.object_skipped');
  });

  it('머리 변수와 코드 페이지: 범위·선종류 축척, CP949 도면층 이름', () => {
    const doc = readDwg(
      r12({
        codepage: 25,
        layers: [
          { name: '0', color: 7 },
          { name: [0xb5, 0xb5, 0xb8, 0xe9], color: -2 },
        ],
        entities: [ent(1, line3, { layer: 1 })],
        header: (b) => {
          b.put(0x78, new Bytes().f64(-1).f64(-2).f64(0).f64(10).f64(20).f64(0).a);
          b.put(0x132, new Bytes().f64(2.5).a);
        },
      }),
    );
    expect(doc.header.get('$EXTMIN')).toMatchObject({ x: -1, y: -2 });
    expect(doc.header.get('$LTSCALE')).toBe(2.5);
    const lay = [...doc.layers.values()].find((l) => l.name === '도면');
    expect(lay).toBeDefined();
    expect(lay!.off).toBe(true);
    expect((ms(doc)[0] as LineEntity).layer).toBe('도면');
  });
});

describe('R12 뷰포트의 보기 정보(ACAD MVIEW 확장 자료)', () => {
  it('R12 DXF로 쓰고 다시 읽어도 보기 중심·높이·동결 도면층이 남는다', () => {
    const doc = createNewDocument('metric');
    doc.layers.set('HIDDEN', { ...doc.layers.get('0')!, name: 'HIDDEN', handle: '' });
    const vp = {
      ...entityDefaults(),
      handle: '3A',
      layer: '0',
      type: 'VIEWPORT',
      center: { x: 5, y: 5, z: 0 },
      width: 10,
      height: 8,
      status: 2,
      id: 2,
      viewCenter: { x: 30, y: 40 },
      snapBase: { x: 0, y: 0 },
      snapSpacing: { x: 1, y: 1 },
      gridSpacing: { x: 1, y: 1 },
      viewDirection: { x: 0, y: 0, z: 1 },
      viewTarget: { x: 0, y: 0, z: 0 },
      lensLength: 50,
      frontClip: 0,
      backClip: 0,
      viewHeight: 12,
      snapAngle: 0,
      twistAngle: 0,
      circleSides: 100,
      flags: 0,
      frozenLayers: ['HIDDEN'],
      renderMode: 0,
      ucsPerViewport: false,
    } as ViewportEntity;
    doc.blocks.get(PAPER_SPACE)!.entities.push(vp);
    const back = readDxf(writeDxf(doc, { version: 'AC1009' }).data);
    const got = back.blocks.get(PAPER_SPACE)!.entities.find((e) => e.type === 'VIEWPORT' && (e as ViewportEntity).id === 2) as ViewportEntity;
    expect(got.viewCenter).toEqual({ x: 30, y: 40 });
    expect(got.viewHeight).toBe(12);
    expect(got.frozenLayers).toEqual(['HIDDEN']);
  });
});
