/**
 * 워커 → 메인 문서 보내기(codec·doctransfer)가 구조화 복제와 같은 문서를 되살리는지.
 */
import { describe, expect, it } from 'vitest';
import { Decoder, Encoder, encodedTransfer, releaseEncoded } from '../../src/worker/codec';
import { DocAssembler, type DocPart, ownIndexes, sendDocument } from '../../src/worker/doctransfer';
import { HandleIndex } from '../../src/core/handleindex';
import { readCadFile } from '../../src/io/index';
import { writeDwg } from '../../src/io/dwg/index';
import { type CadDocument, type Entity, SHARED_BYLAYER_COLOR } from '../../src/core/model';
import { syntheticDxf } from './synthetic';

/** postMessage 흉내: 옮길 버퍼는 넘기고 나머지는 구조화 복제 */
function message<T>(v: T, transfer: Transferable[] = []): T {
  return structuredClone(v, { transfer });
}

function roundTrip(values: unknown[]): unknown[] {
  const enc = new Encoder();
  for (const v of values) expect(enc.add(v)).toBe(true);
  const e = message(enc.finish(), encodedTransfer(enc.finish()));
  const d = new Decoder(e);
  const out: unknown[] = [];
  while (d.more()) out.push(d.next());
  return out;
}

/** 구조화 복제로 받은 문서를 메인이 쓰는 모양(핸들 색인을 HandleIndex로 — 100차) */
function received(doc: CadDocument): CadDocument {
  const copy = structuredClone(doc);
  ownIndexes(copy);
  return copy;
}

/** 문서를 doctransfer로 보내고 메인처럼(app/engine.ts) 되살린다 */
function transfer(doc: CadDocument, opt: { minEntities?: number; batch?: number } = {}): { doc: CadDocument; parts: number; raw: number } {
  let asm: DocAssembler | null = null;
  let full: CadDocument | null = null;
  let parts = 0;
  let raw = 0;
  sendDocument(
    doc,
    (d, streamed) => {
      const copy = message(d);
      if (streamed.length) asm = new DocAssembler(copy, message(streamed));
      else {
        ownIndexes(copy);
        full = copy;
      }
    },
    (p: DocPart, t) => {
      parts++;
      if (!p.enc) raw++;
      asm!.add(message(p, t));
    },
    undefined,
    opt,
  );
  const out = full ?? (asm as DocAssembler | null)?.doc;
  if (!out) throw new Error('문서가 오지 않았습니다');
  if (asm) expect((asm as DocAssembler).complete).toBe(true);
  return { doc: out, parts, raw };
}

describe('codec', () => {
  it('구조화 복제와 같은 값으로 되살린다', () => {
    class Pt {
      constructor(
        public x: number,
        public y: number,
      ) {}
      len(): number {
        return Math.hypot(this.x, this.y);
      }
    }
    const nullProto = Object.create(null) as Record<string, unknown>;
    nullProto.a = 1;
    nullProto.b = 'x';
    const values: unknown[] = [
      0,
      -0,
      NaN,
      Infinity,
      -Infinity,
      255,
      256,
      -1,
      3.25,
      1e300,
      '',
      'abc',
      '가나다',
      'x'.repeat(100),
      true,
      false,
      null,
      undefined,
      [],
      [1, 'a', null, undefined, [2, [3]]],
      { a: undefined, b: 1 },
      { '0': 'zero', b: 2, '1': 'one' },
      new Map<unknown, unknown>([
        ['k', { v: 1 }],
        [3, [1, 2]],
      ]),
      new Set(['a', 'b', 1]),
      new Uint8Array([1, 2, 3]),
      new Float64Array([1.5, -2, NaN]),
      new Int32Array([-1, 7]),
      new Uint8Array(new ArrayBuffer(16), 4, 5),
      nullProto,
      new Pt(3, 4),
      { nested: { deep: { deeper: [{ x: 1 }, { x: 2, y: 3 }] } } },
    ];
    const back = roundTrip(values);
    expect(back).toHaveLength(values.length);
    for (let i = 0; i < values.length; i++) expect(back[i]).toStrictEqual(structuredClone(values[i]));
    // -0과 NaN을 그대로
    expect(Object.is(back[1], -0)).toBe(true);
    expect(Number.isNaN(back[2])).toBe(true);
    // 뷰는 제 버퍼를 가진다(큰 버퍼를 함께 붙잡지 않게)
    const view = back[27] as Uint8Array;
    expect(view.byteOffset).toBe(0);
    expect(view.buffer.byteLength).toBe(5);
  });

  it('수만 든 배열(평탄 좌표)과 같은 모양 객체가 되풀이되어도 같다', () => {
    const nums = [1.5, -0, NaN, 3, 255, 256, -1, 1e-300, Infinity];
    const shapes = Array.from({ length: 50 }, (_, i) => ({ type: i % 2 ? 'A' : 'B', verts: [i, i + 0.5, 0, i * 2, -i, 0.25], widths: i % 3 ? undefined : [1, 2], at: { x: i, y: -i, z: 0 }, name: `n${i % 4}` }));
    // __proto__ 이름 속성(JSON.parse가 만든 제 속성)은 모양별 쓰기 함수 없이 일반 반복으로
    const proto = JSON.parse('{"__proto__": {"a": 1}, "b": [2, 3]}') as Record<string, unknown>;
    const values: unknown[] = [nums, [7], [0, 1], [1, 'a', 2], ...shapes, proto, proto];
    const back = roundTrip(values);
    for (let i = 0; i < values.length; i++) expect(back[i]).toStrictEqual(structuredClone(values[i]));
    const b0 = back[0] as number[];
    expect(Object.is(b0[1], -0)).toBe(true);
    expect(Number.isNaN(b0[2])).toBe(true);
    expect(Object.getOwnPropertyNames(back[values.length - 1])).toEqual(['__proto__', 'b']);
  });

  it('0~255 밖의 정수도 같은 값으로 되살린다(정수로 돌려주는 길 — -0·int32 밖·NaN은 그대로, 96차)', () => {
    const nums = [-1, -2, -3, 256, 70000, 2 ** 31 - 1, -(2 ** 31), 2 ** 31, -(2 ** 31) - 1, 2 ** 53, -0, 0.5, -1.5, NaN, Infinity, -Infinity, 1e300];
    const back = roundTrip(nums.map((v) => ({ lineweight: v }))) as { lineweight: number }[];
    for (let i = 0; i < nums.length; i++) expect(Object.is(back[i]!.lineweight, nums[i])).toBe(true);
  });

  it('얼린 객체는 한 번 보낸 안에서 같은 객체(얼리지 않은 사본)로 함께 쓴다', () => {
    const shared = Object.freeze({ aci: 256 });
    const back = roundTrip([{ color: shared }, { color: shared }, { color: { aci: 256 } }]) as { color: object }[];
    expect(back[0]!.color).toBe(back[1]!.color);
    expect(back[2]!.color).not.toBe(back[0]!.color);
    expect(Object.isFrozen(back[0]!.color)).toBe(false);
    expect(back[0]!.color).toStrictEqual({ aci: 256 });
  });

  it('다루지 않는 값이면 false', () => {
    const cyc: Record<string, unknown> = { a: 1 };
    cyc.self = cyc;
    const sparse = [1, , 3];
    for (const bad of [cyc, sparse, { big: 1n }, { f: () => 1 }, { d: new Date(0) }, { s: Symbol('s') }]) expect(new Encoder().add(bad)).toBe(false);
  });
});

describe('doctransfer', () => {
  const dxf = syntheticDxf(6000);

  it('큰 블록 객체를 묶음으로 보내 같은 문서를 되살린다(색인 순서·객체 포함)', () => {
    const doc = readCadFile(dxf, 'syn.dxf');
    const ms = doc.blocks.get('*MODEL_SPACE')!;
    const r = transfer(doc, { minEntities: 1000, batch: 700 });
    expect(r.parts).toBe(Math.ceil(ms.entities.length / 700));
    expect(r.raw).toBe(0);
    expect(r.doc).toStrictEqual(received(doc));
    expect(r.doc.entityIndex).toBeInstanceOf(HandleIndex);
    expect(r.doc.objects).toBeInstanceOf(HandleIndex);
    expect([...r.doc.entityIndex.keys()]).toEqual([...doc.entityIndex.keys()]);
    // 색인은 블록 안 객체(속성 포함) 그 자체를 가리킨다
    for (const b of r.doc.blocks.values())
      for (const e of b.entities) {
        expect(r.doc.entityIndex.get(e.handle)).toBe(e);
        if (e.type === 'INSERT') for (const a of e.attribs) expect(r.doc.entityIndex.get(a.handle)).toBe(a);
      }
    // 여러 블록을 따로 보내고 사이에 그대로 보내는 블록이 끼어도 색인 순서가 같다
    const many = transfer(doc, { minEntities: 3, batch: 500 });
    expect(many.doc.blocks.size).toBe(doc.blocks.size);
    expect([...many.doc.entityIndex.keys()]).toEqual([...doc.entityIndex.keys()]);
    expect(many.doc).toStrictEqual(received(doc));
    // 공유 ByLayer 색은 사본으로(얼리지 않음) 묶음 안에서 함께 쓴다
    const lines = r.doc.blocks.get('*MODEL_SPACE')!.entities.slice(0, 50).filter((e) => e.color.aci === 256 && e.color.rgb === undefined);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]!.color).not.toBe(SHARED_BYLAYER_COLOR);
    expect(lines[1]!.color).toBe(lines[0]!.color);
  });

  it('경량 폴리선·해치 폴리선 경계의 정점은 제 버퍼를 가진 Float64Array로 온다', () => {
    const doc = readCadFile(dxf, 'syn.dxf');
    const ents = transfer(doc, { minEntities: 1000, batch: 700 }).doc.blocks.get('*MODEL_SPACE')!.entities;
    const lws = ents.flatMap((e) => (e.type === 'LWPOLYLINE' ? [e.verts] : []));
    const hs = ents.flatMap((e) => (e.type === 'HATCH' ? e.paths.flatMap((p) => (p.polyline ? [p.polyline.verts] : [])) : []));
    expect(lws.length).toBeGreaterThan(10);
    expect(hs.length).toBeGreaterThan(10);
    for (const v of [...lws, ...hs]) {
      expect(v).toBeInstanceOf(Float64Array);
      // 묶음 버퍼를 함께 쓰지 않는다(편집으로 워커에 보낼 때 묶음 전체가 복제되지 않게)
      expect(v.byteOffset).toBe(0);
      expect(v.buffer.byteLength).toBe(v.byteLength);
    }
  });

  it('읽을 때 덩어리에서 뗀 정점은 구조화 복제로 보내기 전에 제 버퍼가 된다(덩어리 전체가 복사되지 않게)', () => {
    const owned = (v: Float64Array) => v.byteOffset === 0 && v.buffer.byteLength === v.byteLength;
    const arrays = (d: CadDocument, blocks: (b: { entities: Entity[] }) => boolean) =>
      [...d.blocks.values()].filter(blocks).flatMap((b) => b.entities.flatMap((e) => (e.type === 'LWPOLYLINE' ? [e.verts] : e.type === 'HATCH' ? e.paths.flatMap((p) => (p.polyline ? [p.polyline.verts] : [])) : [])));
    // 큰 블록을 묶음으로 보낼 때: 그대로 보내는 작은 블록만
    const doc = readCadFile(dxf, 'syn.dxf');
    expect(arrays(doc, () => true).some((v) => !owned(v))).toBe(true);
    // 작은 블록에 덩어리의 뷰를 가진 폴리선을 넣는다(핸들이 없어 색인 순서에는 끼지 않는다)
    const lw = doc.blocks.get('*MODEL_SPACE')!.entities.find((e) => e.type === 'LWPOLYLINE' && !owned(e.verts))!;
    [...doc.blocks.values()].find((b) => b.entities.length > 0 && b.entities.length < 1000)!.entities.push({ ...lw, handle: '' });
    let shell: CadDocument | null = null;
    sendDocument(doc, (d) => (shell = d), () => {}, undefined, { minEntities: 1000, batch: 700 });
    const small = arrays(shell!, (b) => b.entities.length > 0);
    expect(small.length).toBeGreaterThan(0);
    expect(small.every(owned)).toBe(true);
    // 문서 전체를 보낼 때: 모든 블록
    const whole = readCadFile(syntheticDxf(800), 'small.dxf');
    let sent: CadDocument | null = null;
    sendDocument(whole, (d) => (sent = d), () => {});
    const all = arrays(sent!, () => true);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every(owned)).toBe(true);
    // 부호화하지 못해 구조화 복제로 보내는 묶음의 객체도
    const odd = readCadFile(dxf, 'syn.dxf');
    (odd.blocks.get('*MODEL_SPACE')!.entities[10] as Entity & { odd?: unknown }).odd = new Date(5);
    const raws: Entity[] = [];
    sendDocument(odd, () => {}, (p) => void (p.entities && raws.push(...p.entities)), undefined, { minEntities: 1000, batch: 2000 });
    const rawArrays = arrays({ blocks: new Map([['X', { entities: raws }]]) } as unknown as CadDocument, () => true);
    expect(rawArrays.length).toBeGreaterThan(0);
    expect(rawArrays.every(owned)).toBe(true);
  });

  it('메인은 묶음을 다 푼 뒤 받은 버퍼를 바로 놓아 준다(객체의 형식 배열은 제 버퍼라 그대로 — 96차)', () => {
    const doc = readCadFile(dxf, 'syn.dxf');
    const shell: { d?: CadDocument; s?: [string, number][] } = {};
    const parts: DocPart[] = [];
    sendDocument(
      doc,
      (d, s) => Object.assign(shell, { d: message(d), s: message(s) }),
      (p, t) => parts.push(message(p, t)),
      undefined,
      { minEntities: 1000, batch: 700 },
    );
    expect(parts.length).toBeGreaterThan(1);
    const asm = new DocAssembler(shell.d!, shell.s!);
    const canRelease = typeof (new ArrayBuffer(0) as ArrayBuffer & { transfer?: unknown }).transfer === 'function';
    for (const p of parts) {
      const bufs = [p.enc!.tags, p.enc!.nums, p.enc!.ints, p.enc!.bins].map((a) => a.buffer);
      expect(bufs.some((b) => b.byteLength > 0)).toBe(true);
      asm.add(p);
      for (const b of bufs) expect(b.byteLength === 0).toBe(canRelease);
    }
    expect(asm.complete).toBe(true);
    // 버퍼를 놓아 준 뒤에도 되살린 문서는 같다(정점 배열은 묶음 버퍼의 복사본)
    expect(asm.doc).toStrictEqual(received(doc));
  });

  it('버퍼 일부만 차지하는 배열은 놓아 주지 않는다(함께 쓰는 버퍼)', () => {
    const enc = new Encoder();
    expect(enc.add({ v: new Float64Array([1, 2, 3]) })).toBe(true);
    const e = enc.finish();
    const big = new ArrayBuffer(e.bins.byteLength + 16);
    const part = new Uint8Array(big, 8, e.bins.byteLength);
    part.set(e.bins);
    const shared = { ...e, bins: part };
    expect(new Decoder(shared).next()).toEqual({ v: new Float64Array([1, 2, 3]) });
    releaseEncoded(shared);
    expect(big.byteLength).toBe(e.bins.byteLength + 16);
    expect([...new Float64Array(big, 8, 3)]).toEqual([1, 2, 3]);
  });

  it('DWG(원본 본문 바이트 포함)도 같다', () => {
    const src = readCadFile(dxf, 'syn.dxf');
    const dwg = writeDwg(src, { version: 'AC1032' as never }).data;
    const doc = readCadFile(dwg, 'syn.dwg');
    // 해석하지 않는 객체가 남기는 원본 본문(바이트 배열)
    const ents = doc.blocks.get('*MODEL_SPACE')!.entities;
    for (let i = 0; i < ents.length; i += 7) ents[i]!.dwgRaw = { version: 'AC1032', typeName: 'X', typeNum: 0, data: new Uint8Array([i & 255, 1, 2]), dataBits: 20, handles: new Uint8Array([9]), handleBits: 8, fingerprint: String(i) };
    const r = transfer(doc, { minEntities: 1000, batch: 1500 });
    expect(r.parts).toBeGreaterThan(1);
    expect(r.doc).toStrictEqual(received(doc));
  });

  it('객체가 적거나 색인을 블록에서 다시 만들 수 없으면 문서 전체를 보낸다', () => {
    expect(transfer(readCadFile(syntheticDxf(800), 'small.dxf')).parts).toBe(0);
    const doc = readCadFile(dxf, 'syn.dxf');
    // 색인 순서를 바꾼다
    const first = [...doc.entityIndex.entries()][0]!;
    doc.entityIndex.delete(first[0]);
    doc.entityIndex.set(first[0], first[1]);
    const r = transfer(doc, { minEntities: 1000 });
    expect(r.parts).toBe(0);
    expect(r.doc).toStrictEqual(received(doc));
  });

  it('부호화하지 못하는 객체가 든 묶음은 그대로(구조화 복제) 보낸다', () => {
    const doc = readCadFile(dxf, 'syn.dxf');
    const ms = doc.blocks.get('*MODEL_SPACE')!;
    (ms.entities[10] as Entity & { odd?: unknown }).odd = new Date(5);
    const r = transfer(doc, { minEntities: 1000, batch: 2000 });
    expect(r.raw).toBe(1);
    expect(r.doc).toStrictEqual(received(doc));
  });
});
