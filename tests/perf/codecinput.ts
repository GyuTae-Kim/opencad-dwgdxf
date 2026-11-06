/**
 * 부호화(codec.ts) 바이트 고정 시험용 합성 값. 씨앗 있는 난수라 언제 만들어도 같은 값이다.
 * 부호화가 갈래를 타는 자리를 고루 지나게 만든다: 같은 자리에 같은 문자열이 이어지거나(도면층) 몇 개가 번갈아 나오고(종류),
 * 늘 새 값이라 그 자리가 표 찾기를 그만두는 것(핸들), 배열 안 문자열, 40자 안팎의 긴 문자열, 첫 이름과 이름 수가 같은 여러 모양,
 * 배열·속성 자리에서 모양이 바뀌는 객체, 얼린 공유 객체, 원형이 없는 객체·클래스 객체·`__proto__` 제 속성, -0·NaN, 수만 든 배열, Map·Set·형식 배열.
 */
import { createHash } from 'node:crypto';

export interface EncodedParts {
  tags: Uint8Array;
  nums: Float64Array;
  ints: Int32Array;
  strs: string[];
  shapes: string[][];
  bins: Uint8Array;
}

/** 부호화 결과 전체(바이트 배열 넷 + 문자열 표 + 모양)의 sha256 */
export function encodedDigest(e: EncodedParts): string {
  const h = createHash('sha256');
  for (const k of ['tags', 'nums', 'ints', 'bins'] as const) h.update(`${k}:${e[k].byteLength}:`).update(new Uint8Array(e[k].buffer, e[k].byteOffset, e[k].byteLength));
  h.update(JSON.stringify(e.strs)).update(JSON.stringify(e.shapes));
  return h.digest('hex');
}

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

class Pt {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export function codecInput(seed: number): unknown[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const shared = [Object.freeze({ aci: 256 }), Object.freeze({ aci: 0, rgb: 5 }), Object.freeze({ k: 'v', n: [1, 2] })];
  const POOL = ['0', 'A', 'B', 'LAYER-1', 'ByLayer', 'Continuous', '가나', 'x'.repeat(40), 'y'.repeat(41), '', 'DIM', 'HATCH'];
  let uniq = seed * 100000;
  const handle = () => (uniq++).toString(16).toUpperCase();
  const num = () => pick([0, -0, 1, 255, 256, -1, 3.5, NaN, Infinity, -Infinity, 1e300, r() * 1000, Math.floor(r() * 300)]);
  const str = () => {
    const k = r();
    if (k < 0.5) return pick(POOL);
    if (k < 0.85) return handle();
    if (k < 0.95) return 'long-' + 'z'.repeat(Math.floor(r() * 60));
    return String.fromCharCode(0xac00 + Math.floor(r() * 50)) + pick(POOL);
  };
  // 첫 이름·이름 수가 같은 모양 여럿(모양 찾기가 후보를 여럿 견준다)
  const KEYS = ['type', 'handle', 'layer', 'linetype', 'color', 'x', 'y', 'z', 'name', 'value', 'owner', 'kind', 'block', 'verts', 'items', '0', '1', 'a b'];
  const shapes: string[][] = Array.from({ length: 14 }, (_, i) => (i < 4 ? ['type', ...[...KEYS.slice(1)].sort(() => r() - 0.5).slice(0, 3)] : [...KEYS].sort(() => r() - 0.5).slice(0, Math.floor(r() * 7))));
  const val = (d: number): unknown => {
    const k = r();
    if (k < 0.25) return num();
    if (k < 0.5) return str();
    if (k < 0.55) return pick([true, false, null, undefined]);
    if (d > 3) return str();
    if (k < 0.62) return Array.from({ length: Math.floor(r() * 6) }, num);
    if (k < 0.66) return Array.from({ length: Math.floor(r() * 5) }, () => (r() < 0.5 ? obj(d + 1) : val(d + 1)));
    if (k < 0.69) return pick(shared);
    if (k < 0.71) return new Map<unknown, unknown>([[str(), val(d + 1)], [num(), str()]]);
    if (k < 0.73) return new Set([str(), num(), str()]);
    if (k < 0.75) return pick([new Uint8Array([1, 2, 3]), new Float64Array([1.5, -0, NaN]), new Int32Array([-7]), new Uint8Array(new ArrayBuffer(16), 3, 5), new Float32Array(3), new Uint16Array([9, 8])]);
    if (k < 0.76) {
      const o = Object.create(null) as Record<string, unknown>;
      o.a = str();
      o.b = num();
      return o;
    }
    if (k < 0.77) return new Pt(num(), num());
    if (k < 0.78) return JSON.parse(`{"__proto__": ${JSON.stringify(str())}, "b": 1}`) as unknown;
    return obj(d + 1);
  };
  const obj = (d: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (const key of pick(shapes)) o[key] = val(d);
    return o;
  };
  const out: unknown[] = [];
  // 자리 점수 흐름: 같은 자리에 R 10번 → 새 값 40개 → … → R 10번(R은 표에서 다시 찾아져야 한다)
  for (let c = 0; c < 3; c++) {
    for (let j = 0; j < 10; j++) out.push({ kind: 'k', name: 'R' });
    for (let j = 0; j < 40; j++) out.push({ kind: 'k', name: `U${seed}-${c}-${j}` });
  }
  for (let j = 0; j < 10; j++) out.push({ kind: 'k', name: 'R' });
  const layers = Array.from({ length: 1 + Math.floor(r() * 40) }, (_, i) => `L${i}`);
  const types = ['LINE', 'ARC', 'CIRCLE', 'POINT', 'TEXT'];
  for (let i = 0; i < 300; i++) {
    const m = r();
    if (m < 0.5) {
      // 객체 줄: 도면층은 이어지고 종류는 번갈아, 핸들은 늘 새 값, 배열 안 핸들(반응자), 점은 속성 자리 객체
      const run = 1 + Math.floor(r() * 30);
      const L = pick(layers);
      for (let j = 0; j < run; j++)
        out.push({
          type: types[(i + j) % (2 + (i % 4))]!,
          handle: handle(),
          layer: r() < 0.8 ? L : pick(layers),
          linetype: r() < 0.9 ? 'ByLayer' : pick(POOL),
          color: r() < 0.7 ? shared[0] : { aci: Math.floor(r() * 256) },
          start: r() < 0.9 ? { x: num(), y: num(), z: 0 } : { x: num(), y: num() },
          reactors: r() < 0.3 ? [handle(), pick(POOL)] : undefined,
          note: r() < 0.3 ? str() : undefined,
        });
    } else if (m < 0.6) {
      // 배열 안 객체의 모양이 바뀐다(같은 모양이 이어지다 다른 모양 — 확장 자료 항목·정점 등)
      out.push(Array.from({ length: 2 + Math.floor(r() * 12) }, (_, j) => (j % 5 === 4 ? { code: 1000, value: str(), extra: j } : r() < 0.2 ? { value: str(), code: 1070 } : { code: 1000 + j, value: pick(['{', '}', 'DSTYLE', str()]) })));
    } else out.push(val(0));
  }
  return out;
}
