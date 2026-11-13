/**
 * DWG 원본 본문 보관(읽기)과 지문(읽기·쓰기 공용).
 * 모델이 일부만 담는 객체는 형식별 본문 비트를 남겨 두었다가 같은 버전으로 쓸 때 그대로 되쓴다.
 */
import type { DwgRawBody } from '../../core/model';
import { byteOfBit } from './bitstream';
import type { ObjectReader } from './objects/reader';
import { stringStreamRange } from './streams';
import { R2007 } from './version';

/** 공통 속성(쓸 때 모델에서 다시 만드는 값)은 지문에서 뺀다 */
const COMMON = new Set([
  'handle',
  'owner',
  'layer',
  'linetype',
  'color',
  'lineweight',
  'ltscale',
  'transparency',
  'invisible',
  'paperSpace',
  'xdata',
  'xdict',
  'reactors',
  'plotStyle',
  'material',
  'hyperlink',
  'dwgRaw',
  'graphics',
]);

/** 지문의 빠른 길이 훑는 값의 상한(넘으면 예전 길 — 순환 참조도 예전 길이 같은 오류를 낸다) */
const PLAIN_SCAN_LIMIT = 1 << 16;

/**
 * 공통 속성을 뺀 값들 안에 바이트 배열·평탄 좌표·Map·toJSON이 없으면 그 값들만 담은 새 객체(같은 키 차례)를, 있으면 null.
 * 그때는 바꾸개(replacer) 없이 JSON.stringify해도 바꾸개를 쓴 글과 같다(바꾸개가 바꾸는 값이 없다). 해석하지 않는 객체마다 지문을 남기는데,
 * 실제 작은 도면 820개 읽기 프로필에서 지문이 10.4%(바꾸개를 쓴 JSON.stringify 줄 8.2%)였다(127차)
 */
function plainCopy(o: object): Record<string, unknown> | null {
  if (Array.isArray(o) || ArrayBuffer.isView(o) || o instanceof Map || typeof (o as { toJSON?: unknown }).toJSON === 'function') return null;
  const top: Record<string, unknown> = {};
  const stack: unknown[] = [];
  for (const k of Object.keys(o)) {
    if (COMMON.has(k)) continue;
    if (k === '__proto__') return null;
    const v = (o as Record<string, unknown>)[k];
    top[k] = v;
    stack.push(v);
  }
  let budget = PLAIN_SCAN_LIMIT;
  while (stack.length) {
    const v = stack.pop();
    if (typeof v !== 'object' || v === null) continue;
    if (--budget < 0) return null;
    if (v instanceof Uint8Array || v instanceof Float64Array || v instanceof Map) return null;
    if (ArrayBuffer.isView(v)) continue;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push(v[i]);
      continue;
    }
    if (typeof (v as { toJSON?: unknown }).toJSON === 'function') return null;
    for (const k of Object.keys(v)) stack.push((v as Record<string, unknown>)[k]);
  }
  return top;
}

/** 모델 값의 지문(FNV-1a 32비트 16진) */
export function fingerprint(o: object): string {
  const plain = plainCopy(o);
  const s =
    plain !== null
      ? JSON.stringify(plain)
      : JSON.stringify(o, function (this: unknown, k: string, v: unknown) {
          if (this === o && COMMON.has(k)) return undefined;
          // 바이트 배열과 평탄 좌표(Float64Array)는 수 배열로(형식 배열은 JSON에서 {"0": …} 객체가 된다)
          if (v instanceof Uint8Array || v instanceof Float64Array) return Array.from(v);
          if (v instanceof Map) return [...v];
          return v;
        });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** 비트 구간을 앞으로 당겨 새 바이트 배열로 */
function copyBits(buf: Uint8Array, start: number, nbits: number): Uint8Array {
  const out = new Uint8Array((nbits + 7) >>> 3);
  if (nbits <= 0) return out;
  const sh = start & 7;
  const s = byteOfBit(start);
  if (sh === 0) {
    out.set(buf.subarray(s, s + out.length));
  } else {
    const rs = 8 - sh;
    const n = out.length;
    const last = buf.length - 1;
    for (let i = 0; i < n; i++) {
      const k = s + i;
      out[i] = ((buf[k] << sh) | (k < last ? buf[k + 1] >>> rs : 0)) & 0xff;
    }
  }
  const rest = nbits & 7;
  if (rest) out[out.length - 1] &= 0xff << (8 - rest);
  return out;
}

/**
 * 지금 읽은 객체(공통 자료까지 읽은 상태)의 형식별 본문을 떼어 낸다.
 * CRC가 맞지 않는 객체(망가졌거나 객체 지도가 엉뚱한 곳을 가리킨 것)는 남기지 않는다.
 */
export function captureRaw(or: ObjectReader, model: object): DwgRawBody | undefined {
  const h = or.h;
  if (!h.crcOk || h.endBit <= h.bodyBit) return undefined;
  const ver = or.ver;
  let dataEnd = h.handleBit;
  let strings: Uint8Array | undefined;
  let stringBits = 0;
  if (ver >= R2007) {
    const rg = stringStreamRange(or.str, h.startBit, h.handleBit);
    if (rg) {
      dataEnd = rg.start;
      stringBits = rg.end - rg.start;
      strings = copyBits(or.buf, rg.start, stringBits);
    } else dataEnd = h.handleBit - 1;
  }
  const dataBits = Math.max(0, dataEnd - h.bodyBit);
  const handleBits = Math.max(0, h.endBit - h.bodyHandleBit);
  const raw: DwgRawBody = {
    version: `AC${ver}`,
    typeName: h.typeName,
    typeNum: h.cls ? 0 : h.typeNum,
    data: copyBits(or.buf, h.bodyBit, dataBits),
    dataBits,
    handles: copyBits(or.buf, h.bodyHandleBit, handleBits),
    handleBits,
    fingerprint: fingerprint(model),
  };
  if (strings) {
    raw.strings = strings;
    raw.stringBits = stringBits;
  }
  if (h.dataStore) raw.dataStore = true;
  if (h.isEntity && or.lastGraphics && or.lastGraphics.length) raw.graphics = or.lastGraphics;
  return raw;
}
