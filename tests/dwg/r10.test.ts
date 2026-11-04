/**
 * 82차: R10(AC1006) DWG 읽기. R12와 같은 바이트 배치에 칸만 적다(공개 형식 설명 dwg_ac1006.ksy, CC0):
 * 표 레코드에 used·CRC가 없고, 객체에 추가 플래그·확장 자료·뷰포트 번호·CRC가 없으며, 선종류 번호가 1바이트, 고도가 두께보다 먼저다.
 * 표본은 저장소에 넣지 않으므로 바이트를 직접 조립한다(실제 R10 도면 대조는 작업 내역에 적었다).
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, DimensionEntity, InsertEntity, LineEntity, PolylineEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { readDwg } from '../../src/io/dwg';

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
    for (const x of new Uint8Array(new Float64Array([v]).buffer)) this.a.push(x);
    return this;
  }
  fixed(s: string, n: number): this {
    for (let i = 0; i < n; i++) this.u8(i < s.length ? s.charCodeAt(i) : 0);
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
  elevation?: number;
  thickness?: number;
  attribs?: boolean;
}

/** R10 객체: 종류, 모드, 크기, 도면층, 플래그 두 바이트, 색 → 선종류(1바이트) → 고도 → 두께, 본문(CRC 없음) */
function ent(type: number, body: (b: Bytes) => void, o: EntOpts = {}): number[] {
  let mode = 0;
  const pre = new Bytes();
  if (o.color !== undefined) {
    mode |= 1;
    pre.u8(o.color);
  }
  if (o.ltype !== undefined) {
    mode |= 2;
    pre.u8(o.ltype);
  }
  if (o.elevation !== undefined) {
    mode |= 4;
    if (type !== 1 && type !== 2 && type !== 22) pre.f64(o.elevation);
  }
  if (o.thickness !== undefined) {
    mode |= 8;
    pre.f64(o.thickness);
  }
  if (o.attribs) mode |= 0x80;
  const b = new Bytes();
  body(b);
  const out = new Bytes()
    .u8(type)
    .u8(mode)
    .i16(8 + pre.n + b.n)
    .i16(o.layer ?? 0)
    .u8(o.f2 ?? 0)
    .u8(o.f3 ?? 0);
  out.a.push(...pre.a, ...b.a);
  return out.a;
}

/** JUMP(18): 머리 바로 뒤 4바이트가 주소(맨 위 바이트 0x80이면 추가 구역 안 위치, 0이면 파일 안 위치) */
const jump = (raw: number) => new Bytes().u8(18).u8(0).i16(8).u32(raw >>> 0).a;

interface FileParts {
  layers: { name: string; color: number; ltype?: number }[];
  ltypes?: { name: string; desc: string }[];
  blocks?: { name: string; entities: number[][] }[];
  /** 객체 구역(객체 구역 시작 위치를 받아 JUMP 주소를 정할 수 있게) */
  entities: (es: number) => number[][];
  /** 추가 구역(객체 구역 시작 위치를 받는다) */
  extra?: (es: number) => number[][];
}

/** R10 파일: 머리(0x512) → 객체 구역 → 표(used·CRC 없는 레코드) → 블록 구역 → 추가 구역 */
function r10(p: FileParts): Uint8Array {
  const b = new Bytes();
  b.fixed('AC1006', 0x512);
  const es = b.n;
  for (const e of p.entities(es)) b.a.push(...e);
  const ee = b.n;
  const table = (at: number, size: number, recs: number[][]) => {
    const begin = b.n;
    for (const r of recs) {
      expect(r.length).toBe(size);
      b.a.push(...r);
    }
    b.put(at, new Bytes().i16(size).i16(recs.length).i16(0).u32(begin).a);
  };
  table(
    0x4a,
    187,
    (p.ltypes ?? [{ name: 'CONTINUOUS', desc: '' }]).map((l) => new Bytes().u8(0).fixed(l.name, 32).fixed(l.desc, 48).u8(65).u8(0).f64(0).fixed('', 96).a),
  );
  table(
    0x36,
    37,
    p.layers.map((l) => new Bytes().u8(0).fixed(l.name, 32).i16(l.color).i16(l.ltype ?? 0).a),
  );
  table(0x40, 194, [new Bytes().u8(0).fixed('STANDARD', 32).f64(0.5).f64(0.8).f64(0).u8(0).f64(0.2).fixed('txt', 64).fixed('', 64).a]);
  const blocks = p.blocks ?? [];
  const blockBytes = new Bytes();
  const addr: number[] = [];
  for (const blk of blocks) {
    addr.push(blockBytes.n);
    for (const e of blk.entities) blockBytes.a.push(...e);
  }
  table(
    0x2c,
    37,
    blocks.map((blk, i) => new Bytes().u8(0).fixed(blk.name, 32).u32((0x40000000 | addr[i]!) >>> 0).a),
  );
  for (const at of [0x54, 0x3ef, 0x500]) b.put(at, new Bytes().i16(40).i16(0).i16(0).u32(0).a);
  const bs = b.n;
  b.a.push(...blockBytes.a);
  const xs = b.n;
  const extra = new Bytes();
  for (const e of p.extra?.(es) ?? []) extra.a.push(...e);
  b.a.push(...extra.a);
  b.put(0x14, new Bytes().u32(es).u32(ee).u32(bs).u32(blockBytes.n).u32(xs).u32(extra.n).a);
  return new Uint8Array(b.a);
}

const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)?.entities ?? [];
const LAYERS = [
  { name: '0', color: 7 },
  { name: 'WALL', color: 1, ltype: 1 },
];

describe('R10 DWG 읽기', () => {
  it('선·원호: 1바이트 선종류, 고도가 두께보다 먼저, 고도 비트가 있는 선은 Z가 없다. 표 레코드에는 used가 없다', () => {
    const doc = readDwg(
      r10({
        layers: LAYERS,
        ltypes: [
          { name: 'CONTINUOUS', desc: 'Solid' },
          { name: 'DASHED', desc: '__ __' },
        ],
        entities: () => [
          ent(1, (b) => b.f64(1).f64(2).f64(3).f64(4), { layer: 1, color: 3, ltype: 1, elevation: 0 }),
          ent(8, (b) => b.f64(5).f64(6).f64(2).f64(0).f64(Math.PI / 2), { elevation: 7, thickness: 0.5 }),
        ],
      }),
    );
    expect(doc.version).toBe('AC1009');
    const [line, arc] = ms(doc) as [LineEntity, ArcEntity];
    expect([line.type, line.layer, line.color.aci, line.linetype, line.start, line.end]).toEqual(['LINE', 'WALL', 3, 'DASHED', { x: 1, y: 2, z: 0 }, { x: 3, y: 4, z: 0 }]);
    expect([arc.center, arc.radius, arc.thickness]).toEqual([{ x: 5, y: 6, z: 7 }, 2, 0.5]);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2);
    // 표 레코드: 이름 뒤 칸이 used(2) 없이 바로 온다
    expect([doc.layers.get('WALL')?.color.aci, doc.layers.get('WALL')?.linetype, doc.linetypes.get('DASHED')?.description]).toEqual([1, 'DASHED', '__ __']);
    expect([doc.textStyles.get('STANDARD')?.height, doc.textStyles.get('STANDARD')?.widthFactor]).toEqual([0.5, 0.8]);
    expect(doc.warnings).toEqual([]);
  });

  it('블록: 본문 없는 ENDBLK(8바이트)로 닫히고, 블록 표의 시작 주소는 이름 바로 뒤다', () => {
    const doc = readDwg(
      r10({
        layers: LAYERS,
        blocks: [{ name: 'B1', entities: [ent(12, (b) => b.f64(0).f64(0)), ent(1, (b) => b.f64(0).f64(0).f64(1).f64(1), { elevation: 0 }), ent(13, () => {})] }],
        entities: () => [ent(14, (b) => b.i16(0).f64(6).f64(1).f64(0.5).f64(0.5), { f2: 0x03 })],
      }),
    );
    const ins = ms(doc)[0] as InsertEntity;
    expect([ins.type, ins.block, ins.insert.x, ins.scale.x, ins.scale.y]).toEqual(['INSERT', 'B1', 6, 0.5, 0.5]);
    expect(doc.blocks.get('B1')?.entities.map((e) => e.type)).toEqual(['LINE']);
    expect(doc.warnings).toEqual([]);
  });

  it('JUMP: 객체 구역에서 추가 구역의 폴리선 머리로 갔다가 정점으로 돌아온다(추가 구역은 다시 읽지 않는다)', () => {
    const vertex = (x: number, y: number) => ent(20, (b) => b.f64(x).f64(y));
    // 객체 구역: 선, JUMP(→ 추가 구역 0), 정점 셋, SEQEND, 문자
    let vertsAt = 0;
    const doc = readDwg(
      r10({
        layers: LAYERS,
        entities: (es) => {
          const first = [ent(1, (b) => b.f64(0).f64(0).f64(1).f64(0), { elevation: 0 }), jump(0x80000000)];
          vertsAt = es + first.reduce((n, e) => n + e.length, 0);
          return [...first, vertex(0, 0), vertex(2, 0), vertex(2, 2), ent(17, (b) => b.u32(0)), ent(7, (b) => b.f64(1).f64(1).f64(0.25).text('R10'))];
        },
        // 추가 구역: 닫힌 폴리선 머리(본문 없음 + 플래그 바이트), JUMP(→ 정점)
        extra: () => [ent(19, (b) => b.u8(1), { f2: 0x01, attribs: true }), jump(vertsAt)],
      }),
    );
    const types = ms(doc).map((e) => e.type);
    expect(types).toEqual(['LINE', 'POLYLINE', 'TEXT']);
    const pl = ms(doc)[1] as PolylineEntity;
    expect([pl.flags & 1, [...pl.verts]]).toEqual([1, [0, 0, 0, 2, 0, 0, 2, 2, 0]]);
    expect((ms(doc)[2] as TextEntity).text).toBe('R10');
    expect(doc.warnings).toEqual([]);
  });

  it('3D 선(종류 21)은 Z가 늘 있는 선, 치수의 호 정의점은 3D 점이고 지시선 길이는 수 하나다', () => {
    const doc = readDwg(
      r10({
        layers: LAYERS,
        entities: () => [
          ent(21, (b) => b.f64(5).f64(9).f64(0).f64(6).f64(10).f64(1)),
          ent(
            23,
            (b) =>
              b
                .i16(-1)
                .f64(8).f64(8).f64(0)
                .f64(7.5).f64(8.5)
                .f64(1).f64(2).f64(3)
                .f64(4)
                .f64(0.5),
            { f2: 0xc0, f3: 0x01 },
          ),
        ],
      }),
    );
    const [l3, dim] = ms(doc) as [LineEntity, DimensionEntity];
    expect([l3.type, l3.start, l3.end]).toEqual(['LINE', { x: 5, y: 9, z: 0 }, { x: 6, y: 10, z: 1 }]);
    // 호 정의점 3D(16), 지시선 길이(40) 하나, 그다음 회전(50)이 제자리에서 읽힌다
    expect(dim.type).toBe('DIMENSION');
    expect(dim.rotation).toBeCloseTo(0.5);
    expect(doc.warnings).toEqual([]);
  });
});
