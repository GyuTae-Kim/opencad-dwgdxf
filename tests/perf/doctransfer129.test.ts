/**
 * 129차: 워커 → 메인 문서 보내기에서 비도형 객체(objects)를 codec으로 부호화해 보낸다(doctransfer.ts encodeObjects·receiveDocument).
 * 받은 문서는 구조화 복제와 같아야 하고(차례·바이트 배열까지), 배치 객체의 layout은 doc.layouts의 같은 객체로 남아야 하며,
 * 부호화할 객체가 문서의 다른 곳과 같은 객체를 함께 쓰면 부호화하지 않고 지금처럼 구조화 복제한다.
 */
import { describe, expect, it } from 'vitest';
import { Decoder, Encoder, encodedTransfer } from '../../src/worker/codec';
import { type DocAssembler, ownIndexes, receiveDocument, receiveObjects, sendDocument } from '../../src/worker/doctransfer';
import { HandleIndex } from '../../src/core/handleindex';
import { readCadFile } from '../../src/io/index';
import { writeDwg } from '../../src/io/dwg/index';
import { type CadDocument, type CadObject, type DwgRawBody, type LayoutObject, createDocument } from '../../src/core/model';
import { syntheticDxf } from './synthetic';

/** postMessage 흉내: 옮길 버퍼는 넘기고 나머지는 구조화 복제 */
function message<T>(v: T, transfer: Transferable[] = []): T {
  return structuredClone(v, { transfer });
}

/** engine.ts처럼 보내고 받는다. encoded: 비도형 객체를 부호화해 보냈는지, kept: 그때 껍데기에 남긴 객체 종류 */
function transfer(doc: CadDocument, opt: { minEntities?: number; batch?: number; minObjects?: number } = {}): { doc: CadDocument; encoded: boolean; kept: string[] } {
  let asm: DocAssembler | null = null;
  let full: CadDocument | null = null;
  let encoded = false;
  let kept: string[] = [];
  sendDocument(
    doc,
    (d, streamed, objects) => {
      encoded = !!objects;
      if (objects) kept = [...d.objects.values()].map((o) => o.type);
      const m = message({ d, streamed, objects }, objects ? encodedTransfer(objects) : []);
      asm = receiveDocument(m.d, m.streamed, m.objects);
      if (!asm) full = m.d;
    },
    (p, t) => asm!.add(message(p, t)),
    undefined,
    opt,
  );
  const out = full ?? (asm as DocAssembler | null)?.doc;
  if (!out) throw new Error('문서가 오지 않았습니다');
  if (asm) expect((asm as DocAssembler).complete).toBe(true);
  return { doc: out, encoded, kept };
}

/** 구조화 복제로 받은 문서를 메인이 쓰는 모양으로(핸들 색인을 HandleIndex로) */
function received(doc: CadDocument): CadDocument {
  const copy = structuredClone(doc);
  ownIndexes(copy);
  return copy;
}

/** 합성 도면을 DWG로 쓰고 다시 읽은 문서(배치 객체·사전 등 실제 리더가 만든 비도형 객체) */
function dwgDoc(): CadDocument {
  const src = readCadFile(syntheticDxf(800), 'syn.dxf');
  return readCadFile(writeDwg(src, { version: 'AC1032' as never }).data, 'syn.dwg');
}

/** 원본 본문을 가진 사용자 객체를 n개 더한다(바이트 배열 크기 0·1·16·64·65·300 — 64바이트 이하는 힙 안 배열이 된다) */
function addObjects(doc: CadDocument, n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const h = (0x100000 + i).toString(16).toUpperCase();
    const size = [0, 1, 16, 64, 65, 300][i % 6]!;
    const raw: DwgRawBody = {
      version: 'AC1032',
      typeName: i % 2 ? 'AECC_TEST_A' : 'AECC_TEST_B',
      typeNum: 0,
      data: Uint8Array.from({ length: size }, (_, j) => (i + j) & 255),
      dataBits: size * 8,
      strings: new Uint8Array([i & 255, 7]),
      stringBits: 16,
      handles: new Uint8Array([3, (i >> 8) & 255, i & 255]),
      handleBits: 24,
      fingerprint: ((i * 2654435761) >>> 0).toString(16),
    };
    const o = { type: raw.typeName, handle: h, owner: 'C', reactors: ['C'], dwgRaw: raw } as CadObject;
    if (i % 5 === 0) o.xdata = [{ app: 'ACAD', items: [{ code: 1000, value: `x${i}` }] }];
    doc.objects.set(h, o);
    keys.push(h);
  }
  return keys;
}

const ownBuffer = (a: Uint8Array) => a.byteOffset === 0 && a.buffer.byteLength === a.byteLength;

describe('비도형 객체 부호화 보내기(129차)', () => {
  it('부호화해 보내도 구조화 복제와 같은 문서다(차례·바이트 배열·열쇠가 handle과 다른 항목 포함)', () => {
    const doc = dwgDoc();
    addObjects(doc, 1500);
    // 열쇠가 값의 handle과 다른 항목(OBJ_KEYED)과 사전(Map)
    doc.objects.set('ZZ', { type: 'AECC_TEST_A', handle: 'ZZ1', owner: 'C' } as CadObject);
    doc.objects.set('ZZ2', { type: 'DICTIONARY', handle: 'ZZ2', owner: 'C', entries: new Map([['A', '1F'], ['B', '20']]), hardOwner: false, cloning: 1 } as unknown as CadObject);
    const layouts = [...doc.objects.values()].filter((o) => o.type === 'LAYOUT').length;
    expect(layouts).toBeGreaterThan(0);
    for (const opt of [{}, { minEntities: 100, batch: 300 }]) {
      const r = transfer(doc, opt);
      expect(r.encoded).toBe(true);
      // 껍데기에는 배치 객체만 남는다
      expect(r.kept).toEqual(Array(layouts).fill('LAYOUT'));
      expect(r.doc).toStrictEqual(received(doc));
      expect(r.doc.objects).toBeInstanceOf(HandleIndex);
      expect([...r.doc.objects.keys()]).toEqual([...doc.objects.keys()]);
      expect(r.doc.objects.get('ZZ')!.handle).toBe('ZZ1');
      // 배치 객체의 layout은 doc.layouts의 그 배치 그대로(구조화 복제와 같게 같은 객체)
      for (const lay of r.doc.layouts) expect((r.doc.objects.get(lay.handle) as LayoutObject).layout).toBe(lay);
      // 바이트 배열은 객체마다 제 버퍼
      let n = 0;
      for (const o of r.doc.objects.values()) {
        const raw = o.dwgRaw;
        if (!raw) continue;
        for (const a of [raw.data, raw.handles, raw.strings, raw.graphics]) {
          if (a === undefined) continue;
          expect(a).toBeInstanceOf(Uint8Array);
          expect(ownBuffer(a)).toBe(true);
          n++;
        }
      }
      expect(n).toBeGreaterThanOrEqual(1500 * 3);
    }
  });

  it('부호화할 객체가 문서의 다른 곳이나 다른 객체와 같은 객체를 함께 쓰면 구조화 복제로 보내 같은 객체를 지킨다', () => {
    // 함께 쓰는 값이 없으면 같은 문서를 부호화한다(아래가 다른 까닭으로 부호화하지 않은 것이 아니다)
    const plain = dwgDoc();
    addObjects(plain, 1500);
    expect(transfer(plain).encoded).toBe(true);
    // 도면층과 함께 쓰는 일반 객체(안에 객체가 없는)
    const a = dwgDoc();
    const [h1, h2] = addObjects(a, 1500);
    const layer = [...a.layers.values()][0]!;
    const shared = { s: 'S' };
    (layer as unknown as { extra: unknown }).extra = shared;
    (a.objects.get(h1!) as unknown as { extra: unknown }).extra = shared;
    let r = transfer(a);
    expect(r.encoded).toBe(false);
    expect(r.doc).toStrictEqual(received(a));
    expect((r.doc.objects.get(h1!) as unknown as { extra: unknown }).extra).toBe((r.doc.layers.get(layer.name.toUpperCase()) as unknown as { extra: unknown }).extra);
    // 두 객체가 함께 쓰는 바이트 배열
    const b = dwgDoc();
    const [g1, g2] = addObjects(b, 1500);
    b.objects.get(g2!)!.dwgRaw!.handles = b.objects.get(g1!)!.dwgRaw!.handles;
    r = transfer(b);
    expect(r.encoded).toBe(false);
    expect(r.doc).toStrictEqual(received(b));
    expect(r.doc.objects.get(g2!)!.dwgRaw!.handles).toBe(r.doc.objects.get(g1!)!.dwgRaw!.handles);
    // 껍데기에 남기는 배치 객체(의 layout)와 함께 쓰는 값
    const c = dwgDoc();
    addObjects(c, 1500);
    const lay = c.layouts[0]!;
    (c.objects.get(h2!) as unknown as { plot: unknown }).plot = lay.plot;
    r = transfer(c);
    expect(r.encoded).toBe(false);
    expect(r.doc).toStrictEqual(received(c));
    expect((r.doc.objects.get(h2!) as unknown as { plot: unknown }).plot).toBe(r.doc.layouts[0]!.plot);
  });

  it('다루지 않는 값이 있거나 객체가 적거나 껍데기 나머지가 크면 그대로 보낸다(얼린 공유 객체는 부호화한다)', () => {
    const a = dwgDoc();
    const [h] = addObjects(a, 1500);
    (a.objects.get(h!) as unknown as { at: unknown }).at = new Date(5);
    let r = transfer(a);
    expect(r.encoded).toBe(false);
    expect(r.doc).toStrictEqual(received(a));
    // 객체가 기본 하한(1000개)보다 적다
    const small = dwgDoc();
    addObjects(small, 10);
    expect(small.objects.size).toBeLessThan(1000);
    r = transfer(small);
    expect(r.encoded).toBe(false);
    expect(r.doc).toStrictEqual(received(small));
    // 하한을 낮추면 적어도 부호화한다(나머지가 작은 문서)
    const tiny = createDocument();
    addObjects(tiny, 10);
    r = transfer(tiny, { minObjects: 1 });
    expect(r.encoded).toBe(true);
    expect(r.doc).toStrictEqual(received(tiny));
    // 껍데기 나머지가 객체 수의 8배를 넘는다
    const wide = dwgDoc();
    addObjects(wide, 1500);
    (wide as unknown as { note: unknown }).note = Array.from({ length: wide.objects.size * 10 }, (_, i) => ({ i }));
    r = transfer(wide);
    expect(r.encoded).toBe(false);
    expect(r.doc).toStrictEqual(received(wide));
    // 얼린 공유 객체(여러 객체가 함께 쓰는 값)는 막지 않는다
    const z = dwgDoc();
    const keys = addObjects(z, 1500);
    const axis = Object.freeze({ x: 0, y: 0, z: 1 });
    for (const k of keys.slice(0, 3)) (z.objects.get(k) as unknown as { normal: unknown }).normal = axis;
    r = transfer(z);
    expect(r.encoded).toBe(true);
    expect(r.doc).toStrictEqual(received(z));
  });

  it('남긴 배치 객체가 껍데기에 없으면 받기가 실패한다(조용히 빠뜨리지 않는다)', () => {
    const doc = dwgDoc();
    addObjects(doc, 1500);
    let shell: CadDocument | null = null;
    let enc: Parameters<typeof receiveObjects>[1] | undefined;
    sendDocument(
      doc,
      (d, _s, objects) => {
        shell = message(d);
        enc = objects;
      },
      () => {},
    );
    expect(enc).toBeDefined();
    shell!.objects.clear();
    expect(() => receiveObjects(shell!, enc!)).toThrow();
  });
});

describe('codec(129차)', () => {
  it('seen을 주면 이미 든 객체를 다시 만나면 false(얼린 객체는 함께 쓴다)', () => {
    const x = { v: 1 };
    const seen = new Set<object>();
    const enc = new Encoder(undefined, seen);
    expect(enc.add({ a: x })).toBe(true);
    expect(enc.add({ b: x })).toBe(false);
    for (const dup of [[1, 2, 'a'], new Uint8Array(3), new Map([[1, 2]])]) {
      const e = new Encoder(undefined, new Set());
      expect(e.add([dup, dup])).toBe(false);
      // seen 없이는 예전처럼 사본 둘
      expect(new Encoder().add([dup, dup])).toBe(true);
    }
    const frozen = Object.freeze({ aci: 256 });
    const f = new Encoder(undefined, new Set());
    expect(f.add([{ c: frozen }, { c: frozen }])).toBe(true);
    // 미리 넣어 둔 객체
    const pre = { p: 1 };
    expect(new Encoder(undefined, new Set([pre])).add({ q: [pre] })).toBe(false);
  });

  it('바이트 배열은 크기와 차림에 상관없이 제 버퍼로 같은 값이 된다', () => {
    const big = new Uint8Array(4000).map((_, i) => i & 255);
    const vals = [new Uint8Array(0), new Uint8Array([9]), big.subarray(0, 64), big.subarray(5, 70), big.subarray(100, 1100), big, new Int8Array([-1, 2]), new Float64Array([1.5, -0])];
    const enc = new Encoder();
    for (const v of vals) expect(enc.add({ v })).toBe(true);
    const e = message(enc.finish());
    const d = new Decoder(e);
    for (const v of vals) {
      const back = (d.next() as { v: ArrayBufferView }).v;
      expect(back).toStrictEqual(structuredClone(v.constructor === Uint8Array ? (v as Uint8Array).slice() : v));
      expect(back.constructor).toBe(v.constructor);
      expect(back.byteOffset).toBe(0);
      expect(back.buffer.byteLength).toBe(v.byteLength);
    }
  });
});
