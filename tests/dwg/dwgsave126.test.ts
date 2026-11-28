/**
 * 126차: DWG 쓰기 계획의 쓴 핸들·쓸 객체 핸들을 Set 대신 비트 표 핸들 모음(HandleSet)에 두고, 폴리선 정점·SEQEND의 공통 자료를 폴리선마다 한 번 구하고,
 * 쓴 객체를 조밀한 핸들이면 자리 표로 고르고, 핸들 문자열 읽기(parseHandle)에 빠른 길을 두고, DD가 부를 때마다 배열을 만들지 않게 바꾼 뒤에도 결과가 같은지.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, LineEntity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { encoderFor } from '../../src/io/dwg/writer/codepage';
import { ObjectStore } from '../../src/io/dwg/writer/container';
import { HandleSet } from '../../src/core/handleset';
import { parseHandle } from '../../src/io/dwg/writer/util';

let seed = 2126;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

describe('핸들 모음(HandleSet)', () => {
  it('무작위 넣기·지우기·묻기가 Set<number>와 같다(비트 표 경계·아주 큰 값·정수 아닌 값 포함)', () => {
    const odd = [-1, -0, 0.5, 1.5, NaN, Infinity, -Infinity, 2 ** 25 - 1, 2 ** 25, 2 ** 25 + 1, 2 ** 31, 2 ** 32 + 7, 2 ** 40 + 3, 2 ** 52 - 1];
    for (let k = 0; k < 30; k++) {
      const hs = new HandleSet();
      const ref = new Set<number>();
      const range = 1 + Math.floor(rand() * (k % 3 === 0 ? 300 : 200000));
      for (let i = 0; i < 3000; i++) {
        const v = rand() < 0.1 ? pick(odd) : Math.floor(rand() * range);
        const op = rand();
        if (op < 0.5) {
          expect(hs.add(v)).toBe(hs);
          ref.add(v);
        } else if (op < 0.7) expect(hs.delete(v)).toBe(ref.delete(v));
        else expect(hs.has(v)).toBe(ref.has(v));
      }
      for (const v of [...odd, 0, 1, 31, 32, 33, range - 1, range, range + 1]) expect(hs.has(v)).toBe(ref.has(v));
      for (const v of ref) expect(hs.has(v)).toBe(true);
    }
  });

  it('비트 표를 넘는 값을 넣으면 늘리고, 그 사이 값은 없다', () => {
    const hs = new HandleSet();
    hs.add(5).add(13_000_000);
    expect(hs.has(5)).toBe(true);
    expect(hs.has(13_000_000)).toBe(true);
    expect(hs.has(12_999_999)).toBe(false);
    expect(hs.has(13_000_001)).toBe(false);
    expect(hs.delete(13_000_000)).toBe(true);
    expect(hs.delete(13_000_000)).toBe(false);
    expect(hs.has(13_000_000)).toBe(false);
    expect(hs.has(5)).toBe(true);
  });
});

/** 124차까지의 길: Map에 넣고 live로 걸러 핸들 순 */
function viaMap(puts: [number, Uint8Array][], live: Set<number>): [number, Uint8Array][] {
  const m = new Map<number, Uint8Array>();
  for (const [h, b] of puts) m.set(h, b);
  return [...m.entries()].filter(([h]) => live.has(h)).sort((a, b) => a[0] - b[0]);
}

function viaStore(puts: [number, Uint8Array][], live: { has(h: number): boolean }): [number, Uint8Array][] {
  const s = new ObjectStore();
  for (const [h, b] of puts) s.put(h, b);
  const { hs, bs } = s.sorted(live);
  return hs.map((h, i) => [h, bs[i]!]);
}

describe('쓴 객체 모음의 핸들 자리 표(조밀한 핸들)와 정렬(성긴 핸들)', () => {
  it('조밀·성긴 핸들, 엇갈린 차례, 같은 핸들 거듭, live 거르기가 Map과 같다', () => {
    for (let k = 0; k < 60; k++) {
      const n = 1 + Math.floor(rand() * 3000);
      // 0: 조밀(자리 표), 1: 객체 수의 4배 + 65536을 넘는 성긴 핸들(정렬), 2: 비트 표보다 큰 핸들 섞임(정렬)
      const mode = k % 3;
      const base = mode === 1 ? 70000 + 4 * n : 0;
      const range = mode === 0 ? 1 + Math.floor(rand() * 4 * n) : 1 + Math.floor(rand() * 10 * n);
      const puts: [number, Uint8Array][] = [];
      for (let i = 0; i < n; i++) {
        let h = base + 1 + Math.floor(rand() * range);
        if (mode === 2 && rand() < 0.05) h = 2 ** 33 + Math.floor(rand() * 100);
        // 폴리선처럼 머리 하나 뒤에 이어진 새 핸들 묶음
        if (rand() < 0.2) {
          const run = 1 + Math.floor(rand() * 8);
          for (let r = 0; r < run && i < n; r++, i++) puts.push([h + r, new Uint8Array([i & 0xff, i >> 8, r])]);
        } else puts.push([h, new Uint8Array([i & 0xff, i >> 8])]);
      }
      const live = new HandleSet();
      const ref = new Set<number>();
      for (const [h] of puts)
        if (rand() < 0.8) {
          live.add(h);
          ref.add(h);
        }
      expect(viaStore(puts, live)).toEqual(viaMap(puts, ref));
    }
  });
});

/** 125차까지의 parseHandle */
function parseHandleRef(h: string | undefined): number {
  if (!h) return 0;
  const t = h.trim();
  if (!/^[0-9A-Fa-f]{1,13}$/.test(t)) return 0;
  return parseInt(t, 16);
}

describe('핸들 문자열 읽기(parseHandle)', () => {
  it('무작위 문자열이 예전 길과 같다(공백·대소문자·16진 아닌 글자·13자 넘음)', () => {
    const hex = '0123456789abcdefABCDEF';
    const other = ['g', 'G', 'x', '-', '+', '.', ' ', '\t', '\n', ' ', '　', '﻿', '０', '١', 'é'];
    const fixed = [undefined, '', ' ', '0', '00', 'F', 'f', '0x1F', '1F ', ' 1F', ' 1F', '1F　', 'FFFFFFFFFFFFF', 'FFFFFFFFFFFFFF', '0000000000000', '00000000000001', '-1', '+1', '1e3', '1.5'];
    for (const s of fixed) expect(parseHandle(s)).toBe(parseHandleRef(s));
    for (let k = 0; k < 20000; k++) {
      const n = Math.floor(rand() * 16);
      let s = '';
      for (let i = 0; i < n; i++) s += rand() < 0.9 ? pick([...hex]) : pick(other);
      if (rand() < 0.1) s = pick(other) + s;
      if (rand() < 0.1) s += pick(other);
      expect(parseHandle(s)).toBe(parseHandleRef(s));
    }
  });
});

/** 125차까지의 DD(바이트마다 배열을 만들던 길) */
function ddRef(w: BitWriter, v: number, def: number): void {
  if (v === def || (Number.isNaN(v) && Number.isNaN(def))) {
    w.BB(0);
    return;
  }
  const s = new DataView(new ArrayBuffer(8));
  s.setFloat64(0, v, true);
  const vb = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => s.getUint8(k));
  s.setFloat64(0, def, true);
  const db = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => s.getUint8(k));
  if (vb[4] === db[4] && vb[5] === db[5] && vb[6] === db[6] && vb[7] === db[7]) {
    w.BB(1);
    for (let k = 0; k < 4; k++) w.RC(vb[k]!);
  } else if (vb[6] === db[6] && vb[7] === db[7]) {
    w.BB(2);
    w.RC(vb[4]!);
    w.RC(vb[5]!);
    for (let k = 0; k < 4; k++) w.RC(vb[k]!);
  } else {
    w.BB(3);
    w.RD(v);
  }
}

describe('DD(기본값 있는 BitDouble)', () => {
  it('무작위 값·기본값 쌍의 비트가 예전 길과 같다(바이트 경계 밖에서도)', () => {
    const enc = encoderFor('ANSI_1252');
    const a = new BitWriter(1032, enc);
    const b = new BitWriter(1032, enc);
    const special = [0, -0, 1, -1, NaN, Infinity, -Infinity, 5e-324, 1e308];
    for (let k = 0; k < 5000; k++) {
      const def = rand() < 0.1 ? pick(special) : (rand() - 0.5) * 10 ** Math.floor(rand() * 12);
      const r = rand();
      // 같음·낮은 4바이트만 다름·낮은 6바이트만 다름·모두 다름
      const v = r < 0.15 ? def : r < 0.4 ? def * (1 + 1e-12 * rand()) : r < 0.65 ? def * (1 + 1e-6 * rand()) : rand() < 0.1 ? pick(special) : (rand() - 0.5) * 1e6;
      const bits = Math.floor(rand() * 3);
      for (let i = 0; i < bits; i++) {
        a.B(1);
        b.B(1);
      }
      ddRef(a, v, def);
      b.DD(v, def);
    }
    expect(b.pos).toBe(a.pos);
    expect(Buffer.from(b.buf.subarray(0, (b.pos + 7) >>> 3)).equals(Buffer.from(a.buf.subarray(0, (a.pos + 7) >>> 3)))).toBe(true);
  });
});

const P = (x: number, y: number, z = 0) => ({ x, y, z });

function polyline(handle: string, kind: '2d' | '3d', x: number, props: Partial<Entity>): PolylineEntity {
  return {
    ...entityDefaults(),
    ...props,
    type: 'POLYLINE',
    handle,
    kind,
    flags: kind === '3d' ? 8 : 0,
    verts: new Float64Array([x, 0, 0, x + 1, 0, 1, x + 1, 1, 2, x, 2, 3]),
    elevation: 0,
    defaultStartWidth: 0,
    defaultEndWidth: 0,
    mCount: 0,
    nCount: 0,
    mDensity: 0,
    nDensity: 0,
    smoothType: 0,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  } as unknown as PolylineEntity;
}

function polyDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const lt0 = [...doc.linetypes.values()][0]!;
  const el = (length: number) => ({ length, flags: 0, scale: 1, rotation: 0, offset: { x: 0, y: 0 } });
  doc.linetypes.set('DASHED126', { ...lt0, name: 'DASHED126', handle: '', description: '', patternLength: 1, elements: [el(0.5), el(-0.5)] });
  const l0 = doc.layers.get('0')!;
  doc.layers.set('L126', { ...l0, name: 'L126', handle: '' });
  const ents: Entity[] = [
    polyline('B01', '2d', 0, { layer: 'L126', linetype: 'DASHED126', color: { aci: 3, rgb: 0x123456 }, lineweight: 50, ltscale: 2 }),
    polyline('B02', '3d', 4, { layer: 'l126', linetype: 'dashed126', color: { aci: 5 }, invisible: true }),
    polyline('B03', '2d', 8, { linetype: 'NOSUCH126' }),
    polyline('B04', '3d', 12, { linetype: 'ByBlock', lineweight: -2 }),
    { ...entityDefaults(), type: 'LINE', handle: 'B05', start: P(0, 0), end: P(1, 1) } as LineEntity,
  ];
  doc.blocks.get(MODEL_SPACE)!.entities.push(...ents);
  for (const e of ents) doc.entityIndex.set(e.handle, e);
  return doc;
}

/**
 * 이 문서를 125차 판(고치기 전)으로 쓴 바이트의 sha256 앞 16자(시각 고정, 임의 GUID 0 바이트).
 * AC1015는 138차부터 트루컬러 폴리선(B01)에 RTTcAl 확장 자료가 붙어 바뀐다 — 그 폴리선의 RGB를 빼면 125차 바이트 그대로(GOLDEN_ACI).
 * 157차부터 미터 새 도면(이 문서)의 MLEADERSTYLE 끊기 간격(DWG 본문 BD — DXF 143)을 DXF 쓰기·acadiso.dwt처럼 3.75로 써서(전에는 늘 0.125)
 * 다섯 판·GOLDEN_ACI 모두 쓴 값은 그 실수 하나만 다르다(DWG 쓰기에서 바뀐 곳은 그 기본값 한 줄, 두 값 모두 BD 64비트라 비트 길이는 같다 — 압축·CRC 때문에 파일 바이트는 더 넓게 바뀐다).
 * 아래 값은 157차 판으로 쓴 바이트다 — 126차가 지키는 「핸들 모음·정점 공통 자료로 바꿔도 같은 바이트」는 그 판끼리 그대로다
 */
const GOLDEN: Record<string, string> = {
  AC1032: '7d31021a8c66f306',
  AC1027: 'bd91ca1211c18389',
  AC1024: '132c363be76dd9b5',
  AC1018: '00ec7058229d6f91',
  AC1015: '439b7eae037f7c54',
};
const GOLDEN_ACI = 'ff256eae4b8d70df';

describe('폴리선 정점의 공통 자료를 폴리선마다 한 번 구하기', () => {
  /** 시각·GUID를 고정한 채 문서를 만들어 쓴 바이트의 sha256 앞 16자 */
  const hashOf = (make: () => CadDocument, version: 'AC1032' | 'AC1027' | 'AC1024' | 'AC1018' | 'AC1015') => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: unknown) => a) as never);
    // 346차: 새 도면·빈 값의 TDCREATE·TDUPDATE를 현지 벽시계로 쓴다(src/core/julian.ts) — 바이트가 시간대를 따르므로 UTC로 고정
    // (UTC에서는 현지 = UTC라 고치기 전과 같은 바이트 — 정답 해시 그대로)
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      return createHash('sha256').update(writeDwg(make(), { version }).data).digest('hex').slice(0, 16);
    } finally {
      vi.restoreAllMocks();
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  };
  it('AC1015: 트루컬러 폴리선의 RGB를 빼면 125차 바이트와 같다(바뀐 것은 RTTcAl 확장 자료뿐 — 138차)', () => {
    const aciOnly = () => {
      const doc = polyDoc();
      doc.entityIndex.get('B01')!.color = { aci: 3 };
      return doc;
    };
    expect(hashOf(aciOnly, 'AC1015')).toBe(GOLDEN_ACI);
  });
  for (const version of ['AC1032', 'AC1027', 'AC1024', 'AC1018', 'AC1015'] as const) {
    it(`${version}: 쓴 바이트가 고치기 전과 같다(정점·SEQEND 앞뒤 연결 포함)`, () => {
      expect(hashOf(polyDoc, version)).toBe(GOLDEN[version]);
    });

    it(`${version}: 다시 읽은 폴리선·정점이 그대로이고, 없는 선종류의 경고 개수는 객체마다(머리 1 + 정점 4 + SEQEND 1)`, () => {
      const res = writeDwg(polyDoc(), { version });
      expect(res.warnings.find((w) => w.code === 'dwg.write_missing_linetype')?.count).toBe(6);
      const back = readDwg(res.data);
      expect(back.warnings).toEqual([]);
      const ents = back.blocks.get(MODEL_SPACE)!.entities;
      expect(ents.map((e) => `${e.type}:${e.handle}`)).toEqual(['POLYLINE:B01', 'POLYLINE:B02', 'POLYLINE:B03', 'POLYLINE:B04', 'LINE:B05']);
      const [a, b, c, d] = ents as PolylineEntity[];
      expect(Array.from(a!.verts)).toEqual([0, 0, 0, 1, 0, 1, 1, 1, 2, 0, 2, 3]);
      expect(Array.from(b!.verts)).toEqual([4, 0, 0, 5, 0, 1, 5, 1, 2, 4, 2, 3]);
      expect(Array.from(c!.verts)).toEqual([8, 0, 0, 9, 0, 1, 9, 1, 2, 8, 2, 3]);
      expect(Array.from(d!.verts)).toEqual([12, 0, 0, 13, 0, 1, 13, 1, 2, 12, 2, 3]);
      expect([a!.layer, a!.linetype.toUpperCase(), a!.lineweight, a!.ltscale]).toEqual(['L126', 'DASHED126', 50, 2]);
      // R2000은 RTTcAl 확장 자료로 트루컬러가 돌아온다(138차 — 전에는 ACI 3만)
      expect([a!.color.aci, a!.color.rgb]).toEqual([3, 0x123456]);
      expect([b!.layer, b!.linetype.toUpperCase(), b!.color.aci, !!b!.invisible]).toEqual(['L126', 'DASHED126', 5, true]);
      expect([c!.linetype.toUpperCase(), d!.linetype.toUpperCase(), d!.lineweight]).toEqual(['BYLAYER', 'BYBLOCK', -2]);
    });
  }
});

describe('쓴 핸들 모음의 HANDSEED와 겹친 핸들', () => {
  for (const version of ['AC1032', 'AC1015'] as const) {
    it(`${version}: 비트 표를 넘는 문서 핸들 뒤에서 새 핸들을 주고 HANDSEED는 가장 큰 핸들 + 1, 겹친 핸들은 새로`, () => {
      const doc = createNewDocument('metric');
      const ents: Entity[] = [
        { ...entityDefaults(), type: 'LINE', handle: 'FFFFFFF0', start: P(0, 0), end: P(1, 1) } as LineEntity,
        { ...entityDefaults(), type: 'LINE', handle: 'C01', start: P(2, 0), end: P(3, 1) } as LineEntity,
        { ...entityDefaults(), type: 'LINE', handle: 'C01', start: P(4, 0), end: P(5, 1) } as LineEntity,
        polyline('C02', '2d', 6, {}),
      ];
      doc.blocks.get(MODEL_SPACE)!.entities.push(...ents);
      const res = writeDwg(doc, { version });
      const back = readDwg(res.data);
      const got = back.blocks.get(MODEL_SPACE)!.entities;
      expect(got.map((e) => e.handle).slice(0, 2)).toEqual(['FFFFFFF0', 'C01']);
      expect(parseInt(got[2]!.handle, 16)).toBeGreaterThan(0xfffffff0);
      expect(got[3]!.handle).toBe('C02');
      expect(Array.from((got[3] as PolylineEntity).verts)).toEqual([6, 0, 0, 7, 0, 1, 7, 1, 2, 6, 2, 3]);
      const seed = parseInt(String(back.header.get('$HANDSEED')), 16);
      let max = 0;
      for (const b of back.blocks.values()) for (const e of b.entities) max = Math.max(max, parseInt(e.handle, 16));
      for (const o of back.objects.values()) max = Math.max(max, parseInt(o.handle, 16));
      expect(seed).toBeGreaterThan(max);
    });
  }
});
