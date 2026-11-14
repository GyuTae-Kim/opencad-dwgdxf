/**
 * 128차: DXF 리더(R12 DWG도 같은 리더를 쓴다)가 객체마다 공통 속성을 `{ type, ...entityDefaults() }` 펼치기 대신 같은 차례의 객체 글로 만들고,
 * VERTEX는 공통 속성 객체·태그 배열 없이 한 번 훑어 읽은 뒤에도 결과가 전과 같은지. 127차까지의 길(splitCommon + vertex)은 이 파일에 그대로 옮겨 두고 견준다.
 */
import { describe, expect, it } from 'vitest';
import type { EntityBase, RawTag } from '../../src/core/model';
import { BYLAYER, SHARED_BYLAYER_COLOR, entityDefaults } from '../../src/core/model';
import { PolyAccum } from '../../src/core/polyverts';
import { newEntityBase, parseVertex } from '../../src/io/dxf/entities';
import type { DxfRecord, TagValue } from '../../src/io/dxf/records';
import { DEG, Tags, handle, hexToBytes, int, name, num, parseColor, parseXData, str } from '../../src/io/dxf/tagutil';

let seed = 2128;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

/** 127차까지의 splitCommon(entities.ts) */
function splitCommonOld(rec: DxfRecord, keepRaw = false): { base: EntityBase; tags: Tags; graphics?: Uint8Array; raw?: RawTag[] } {
  const codes = rec.codes;
  const values = rec.values;
  const base: EntityBase = { type: rec.type, ...entityDefaults() };
  const sc: number[] = [];
  const sv: TagValue[] = [];
  const ss: string[] = [];
  const raw: RawTag[] | undefined = keepRaw ? [] : undefined;
  let sub = '';
  let aci: number | undefined;
  let rgb: number | undefined;
  let colorName: string | undefined;
  let gfx: string[] | null = null;
  let i = 0;
  for (; i < codes.length; i++) {
    const c = codes[i]!;
    const v = values[i]!;
    if (c >= 1000) break;
    if (c === 100) {
      sub = str(v).trim();
      if (raw && sub !== 'AcDbEntity') raw.push({ code: c, value: v });
      continue;
    }
    if (c === 101) {
      sub = 'Embedded:' + str(v).trim();
      if (raw) raw.push({ code: c, value: v });
      continue;
    }
    if (c === 102) {
      const s = str(v).trim();
      if (s.startsWith('{')) {
        const app = s.slice(1).toUpperCase();
        let j = i + 1;
        for (; j < codes.length; j++) {
          if (codes[j] === 102) break;
          if (app === 'ACAD_REACTORS' && codes[j] === 330) (base.reactors ??= []).push(handle(values[j]));
          else if (app === 'ACAD_XDICTIONARY' && codes[j] === 360) base.xdict = handle(values[j]);
        }
        i = j;
      }
      continue;
    }
    if (sub === '' || sub === 'AcDbEntity') {
      switch (c) {
        case 5:
          base.handle = handle(v);
          continue;
        case 330:
          if (base.owner === undefined) base.owner = handle(v);
          continue;
        case 8:
          base.layer = name(v);
          continue;
        case 6:
          base.linetype = name(v);
          continue;
        case 62:
          aci = int(v);
          continue;
        case 420:
          rgb = int(v);
          continue;
        case 430:
          colorName = str(v);
          continue;
        case 370:
          base.lineweight = int(v);
          continue;
        case 48:
          base.ltscale = num(v);
          continue;
        case 60:
          if (int(v) === 1) base.invisible = true;
          continue;
        case 67:
          if (int(v) === 1) base.paperSpace = true;
          continue;
        case 440: {
          const t = int(v) >>> 0;
          base.transparency = t & 0x01000000 ? -2 : t & 0x02000000 ? t & 0xff : -1;
          continue;
        }
        case 390:
          base.plotStyle = handle(v);
          continue;
        case 410:
        case 347:
        case 348:
        case 284:
          continue;
        case 92:
        case 160:
          if (sub === 'AcDbEntity') {
            gfx = [];
            continue;
          }
          break;
        case 310:
          if (sub === 'AcDbEntity' && gfx) {
            gfx.push(str(v));
            continue;
          }
          break;
      }
    }
    sc.push(c);
    sv.push(v);
    ss.push(sub);
    if (raw) raw.push({ code: c, value: v });
  }
  if (i < codes.length) base.xdata = parseXData(codes, values, i);
  if (aci !== undefined && aci < 0) aci = -aci;
  base.color = (aci === undefined || aci === BYLAYER) && rgb === undefined && !colorName ? SHARED_BYLAYER_COLOR : parseColor(aci, rgb, colorName);
  const out: { base: EntityBase; tags: Tags; graphics?: Uint8Array; raw?: RawTag[] } = { base, tags: new Tags(sc, sv, ss) };
  if (raw) out.raw = raw;
  if (gfx && gfx.length) out.graphics = hexToBytes(gfx.join(''));
  return out;
}

/** 127차까지의 parseVertex = vertex(splitCommon(rec)) */
function parseVertexOld(rec: DxfRecord, acc: PolyAccum, defaults?: { startWidth: number; endWidth: number }): void {
  const t = splitCommonOld(rec).tags;
  const flags = t.int(70);
  const p = t.point(10);
  const startWidth = t.has(40) ? t.num(40) : (defaults?.startWidth ?? 0);
  const endWidth = t.has(41) ? t.num(41) : (defaults?.endWidth ?? 0);
  const tangent = flags & 2 && t.has(50) ? t.num(50) * DEG : undefined;
  let face: number[] | undefined;
  if (t.has(71)) {
    face = [t.int(71), t.int(72), t.int(73), t.int(74)];
    while (face.length && face[face.length - 1] === 0) face.pop();
  }
  acc.add(p.x, p.y, p.z, t.num(42), startWidth, endWidth, flags, tangent, face);
}

/** PolyAccum 결과를 견줄 수 있는 꼴로(수는 비트 그대로 — -0·NaN 구분) */
function dump(acc: PolyAccum): unknown {
  const f = acc.finish();
  const bits = (a: ArrayLike<number> | undefined | null) => (a ? Array.from(new Uint8Array(Float64Array.from(a as ArrayLike<number>).buffer)) : a);
  return {
    verts: bits(f.verts),
    bulges: bits(f.bulges),
    widths: bits(f.widths),
    vflags: f.vflags ? bits(f.vflags) : f.vflags,
    tangents: f.tangents?.map((x) => (x === null ? null : bits([x]))),
    faceRecs: f.faceRecs?.map((x) => (x === null ? null : bits(x))),
  };
}

const NBSP = String.fromCharCode(0xa0);
const NUMS: TagValue[] = [0, -0, 1, -1, 2.5, 1e-300, 1e300, NaN, 3, 7, 0.1, -12.75];
const STRS: TagValue[] = ['0', '1', '  2', ' -3 ', '2.5', '1e3', 'abc', '', '  ', '0x10', '-0', '12abc', NBSP + '7'];
const value = (): TagValue => (rand() < 0.5 ? pick(NUMS) : pick(STRS));
const SUBS = ['AcDbEntity', 'AcDbVertex', 'AcDb2dVertex', 'AcDb3dPolylineVertex', 'AcDbFaceRecord', 'AcDbPolyFaceMeshVertex', ' AcDbEntity ', 'Other'];
const COMMON = [5, 330, 8, 6, 62, 420, 430, 370, 48, 60, 67, 440, 390, 410, 347, 348, 284, 92, 160, 310];
const OWN = [10, 20, 30, 40, 41, 42, 50, 70, 71, 72, 73, 74, 91, 11, 21];

/** 무작위 VERTEX 레코드: 공통 속성·하위 클래스 표지·102 묶음(닫히지 않은 것 포함)·101·확장 자료와 그 뒤 태그를 섞는다 */
function randomVertex(): DxfRecord {
  const codes: number[] = [];
  const values: TagValue[] = [];
  const t = (c: number, v: TagValue) => {
    codes.push(c);
    values.push(v);
  };
  const n = 1 + Math.floor(rand() * 18);
  for (let k = 0; k < n; k++) {
    const r = rand();
    if (r < 0.1) t(100, pick(SUBS));
    else if (r < 0.15) {
      t(102, pick(['{ACAD_REACTORS', '{ACAD_XDICTIONARY', '{APP', ' {X', '}', 'plain']));
      for (let j = Math.floor(rand() * 3); j > 0; j--) t(pick([330, 360, 10, 70, 42]), value());
      if (rand() < 0.8) t(102, '}');
    } else if (r < 0.17) t(101, 'Embedded Object');
    else if (r < 0.4) {
      const c = pick(COMMON);
      t(c, c === 310 ? 'AB12' : value());
    } else if (r < 0.55) {
      // 점 꼴(10 20 30)을 자주
      const b = pick([10, 10, 10, 11]);
      t(b, value());
      if (rand() < 0.8) t(b + 10, value());
      if (rand() < 0.7) t(b + 20, value());
    } else t(pick(OWN), value());
  }
  if (rand() < 0.15) {
    t(1001, 'APP');
    t(1000, 'x');
    t(10, 5);
    t(70, 9);
  }
  return { type: 'VERTEX', codes, values };
}

describe('128차 DXF 리더 공통 속성', () => {
  it('newEntityBase는 { type, ...entityDefaults() }와 키 차례·값이 같다(색은 splitCommon 끝에서 다시 정한다)', () => {
    for (const type of ['LINE', 'VERTEX', 'INSERT', '']) {
      const a = newEntityBase(type);
      const b: EntityBase = { type, ...entityDefaults() };
      expect(Object.keys(a)).toEqual(Object.keys(b));
      expect({ ...a, color: null }).toEqual({ ...b, color: null });
    }
  });

  it('parseVertex: 127차 길(splitCommon + vertex)과 같은 정점 자료 — 무작위 레코드 4,000개', () => {
    for (let round = 0; round < 40; round++) {
      const accA = new PolyAccum();
      const accB = new PolyAccum();
      for (let k = 0; k < 100; k++) {
        const rec = randomVertex();
        const defaults = rand() < 0.5 ? undefined : { startWidth: pick([0, 1.5, -0]), endWidth: pick([0, 2, NaN]) };
        parseVertexOld(rec, accA, defaults);
        parseVertex(rec, accB, defaults);
      }
      expect(dump(accB)).toEqual(dump(accA));
    }
  });

  it('parseVertex: 공통 속성·102 묶음 안의 10·70, 10 뒤에 낀 공통 속성, 확장 자료 뒤 태그', () => {
    const cases: DxfRecord[] = [
      // 10 뒤에 공통 속성(8)이 끼어도 남긴 차례로는 20이 바로 뒤
      { type: 'VERTEX', codes: [100, 10, 8, 20, 30, 70], values: ['AcDbEntity', 1, 'L', 2, 3, 1] },
      // 하위 클래스 안의 8은 남는다(10 바로 뒤가 8이라 Y 없음)
      { type: 'VERTEX', codes: [100, 10, 8, 20], values: ['AcDbVertex', 1, 'L', 2] },
      // 102 묶음 안의 10·70은 건너뛰고, 닫는 102 뒤부터 읽는다
      { type: 'VERTEX', codes: [102, 10, 70, 102, 10, 20, 70], values: ['{APP', 9, 9, '}', 1, 2, 4] },
      // 닫히지 않은 102 묶음은 끝까지 건너뛴다
      { type: 'VERTEX', codes: [10, 102, 20, 30], values: [1, '{APP', 2, 3] },
      // AcDbEntity의 92 뒤 310은 그림 자료라 빠지고, 하위 클래스 표지 없는 92는 남는다
      { type: 'VERTEX', codes: [92, 10, 100, 92, 310, 20], values: [1, 5, 'AcDbEntity', 3, 'AB', 6] },
      // 확장 자료(1001) 뒤 10·70은 읽지 않는다
      { type: 'VERTEX', codes: [70, 1001, 10, 70], values: ['3', 'APP', 7, 8] },
      // 문자열 값(ASCII DXF) — 정수 칸은 parseInt, 실수 칸은 parseFloat
      { type: 'VERTEX', codes: [10, 20, 30, 42, 70, 71, 72, 73, 74, 50, 40, 41], values: ['1.5', ' 2', 'x', '0.25', ' 3', '1', '-2', '0', '0', '90', '1e1', ''] },
    ];
    for (const rec of cases) {
      const accA = new PolyAccum();
      const accB = new PolyAccum();
      parseVertexOld(rec, accA, { startWidth: 0.5, endWidth: 0.75 });
      parseVertex(rec, accB, { startWidth: 0.5, endWidth: 0.75 });
      expect(dump(accB)).toEqual(dump(accA));
    }
  });
});
