/**
 * 125차: DWG 쓰기가 객체 바이트를 Map 대신 ObjectStore(넣은 차례 두 배열)에 모으고, 객체 지도를 핸들·위치 배열로 만들고,
 * R2004 이상 블록은 임시 모음 없이 바로 넣게 바꾼 뒤에도 결과가 같은지.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { ObjectStore, objectMap, objectMapOf } from '../../src/io/dwg/writer/container';
import { readObjectMap } from '../../src/io/dwg/handles';

let seed = 2125;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;

/** 124차까지의 길: Map에 넣고 live로 걸러 핸들 순 */
function viaMap(puts: [number, Uint8Array][], live: Set<number>): [number, Uint8Array][] {
  const m = new Map<number, Uint8Array>();
  for (const [h, b] of puts) m.set(h, b);
  return [...m.entries()].filter(([h]) => live.has(h)).sort((a, b) => a[0] - b[0]);
}

function viaStore(puts: [number, Uint8Array][], live: Set<number>): [number, Uint8Array][] {
  const s = new ObjectStore();
  for (const [h, b] of puts) s.put(h, b);
  const { hs, bs } = s.sorted(live);
  return hs.map((h, i) => [h, bs[i]!]);
}

describe('쓴 객체 모음(ObjectStore)', () => {
  it('무작위 차례·같은 핸들 거듭·live 거르기가 Map과 같다(같은 핸들은 마지막 바이트)', () => {
    for (let k = 0; k < 40; k++) {
      const n = Math.floor(rand() * 400);
      const range = 1 + Math.floor(rand() * 500);
      const puts: [number, Uint8Array][] = [];
      for (let i = 0; i < n; i++) puts.push([1 + Math.floor(rand() * range), new Uint8Array([i & 0xff, i >> 8])]);
      const live = new Set<number>();
      for (let h = 1; h <= range; h++) if (rand() < 0.8) live.add(h);
      expect(viaStore(puts, live)).toEqual(viaMap(puts, live));
    }
  });

  it('이미 오름차순이면 그 차례 그대로(live 거르기만)', () => {
    const puts: [number, Uint8Array][] = [];
    for (let h = 10; h < 2000; h += 1 + (h % 5)) puts.push([h, new Uint8Array([h & 0xff])]);
    const live = new Set(puts.map(([h]) => h).filter((h) => h % 7 !== 0));
    const got = viaStore(puts, live);
    expect(got).toEqual(viaMap(puts, live));
    expect(got.map(([h]) => h)).toEqual(puts.map(([h]) => h).filter((h) => h % 7 !== 0));
  });

  it('같은 핸들을 바로 이어 다시 넣어도 마지막 것', () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    const c = new Uint8Array([3]);
    const live = new Set([5, 6]);
    expect(viaStore([[5, a], [5, b], [6, c]], live)).toEqual([[5, b], [6, c]]);
    expect(viaStore([[6, c], [5, a], [6, b]], live)).toEqual([[5, a], [6, b]]);
  });
});

describe('객체 지도(핸들·위치 따로)', () => {
  it('여러 구역에 걸친 지도를 읽으면 같은 쌍', () => {
    const hs: number[] = [];
    const locs = new Float64Array(6000);
    let h = 1;
    let loc = 100;
    for (let i = 0; i < 6000; i++) {
      hs.push(h);
      locs[i] = loc;
      h += 1 + Math.floor(rand() * 300);
      loc += 5 + Math.floor(rand() * 5000);
    }
    const data = objectMapOf(hs, locs);
    expect(Buffer.from(objectMap(hs.map((x, i) => [x, locs[i]!]))).equals(Buffer.from(data))).toBe(true);
    const map = readObjectMap({ handles: data, warnings: [] } as never);
    expect([...map.entries()]).toEqual(hs.map((x, i) => [x, locs[i]!]));
  });
});

const P = (x: number, y: number) => ({ x, y, z: 0 });
function line(handle: string, x: number): LineEntity {
  return { ...entityDefaults(), type: 'LINE', handle, start: P(x, 0), end: P(x + 1, 1) } as LineEntity;
}

/** 2D 폴리선(정점 셋). broken이면 둘째 정점의 폭을 읽을 때 오류 — 폴리선 머리·첫 정점을 쓴 뒤 실패한다 */
function polyline(handle: string, x: number, broken: boolean): PolylineEntity {
  const widths = new Float64Array(6);
  return {
    ...entityDefaults(),
    type: 'POLYLINE',
    handle,
    kind: '2d',
    flags: 0,
    verts: new Float64Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0]),
    widths: broken
      ? new Proxy(widths, {
          get(t, k) {
            if (k === '2') throw new Error('읽을 수 없는 폭');
            return Reflect.get(t, k);
          },
        })
      : undefined,
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

/** 선 넷과 폴리선 둘. 셋째 선(시작점 없음)과 첫 폴리선(둘째 정점)은 쓰다 실패한다 */
function docWithBroken(): CadDocument {
  const doc = createNewDocument('metric');
  const ents: Entity[] = [
    line('A01', 0),
    polyline('A02', 2, true),
    { ...line('A03', 4), start: undefined } as unknown as Entity,
    line('A04', 6),
    polyline('A05', 8, false),
    line('A06', 10),
  ];
  doc.blocks.get(MODEL_SPACE)!.entities.push(...ents);
  for (const e of ents) doc.entityIndex.set(e.handle, e);
  return doc;
}

describe('쓰지 못한 도형을 빼는 길(블록 쓰기)', () => {
  for (const version of ['AC1032', 'AC1027', 'AC1018', 'AC1015'] as const) {
    it(`${version}: 실패한 도형(먼저 쓴 머리·정점 포함)만 빠지고 나머지는 그대로`, () => {
      const doc = docWithBroken();
      const res = writeDwg(doc, { version });
      expect(res.warnings.find((w) => w.code === 'dwg.write_entity_failed')?.count).toBe(2);
      const back = readDwg(res.data);
      const ents = back.blocks.get(MODEL_SPACE)!.entities;
      expect(ents.map((e) => `${e.type}:${e.handle}`)).toEqual(['LINE:A01', 'LINE:A04', 'POLYLINE:A05', 'LINE:A06']);
      expect((ents[0] as LineEntity).start.x).toBe(0);
      expect(Array.from((ents[2] as PolylineEntity).verts)).toEqual([8, 0, 0, 9, 0, 0, 9, 1, 0]);
      expect(back.entityIndex.has('A02')).toBe(false);
      expect(back.entityIndex.has('A03')).toBe(false);
      expect(back.warnings).toEqual([]);
    });
  }
});
