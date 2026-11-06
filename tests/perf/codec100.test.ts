/**
 * 100차: 모양별 쓰기 함수(codec.ts makeWriter — 89·97차)가 쓰는 바이트가, 쓰기 함수를 만들 수 없는 환경(eval 막힘 — 속성마다
 * slotStr·slotVal을 부르는 일반 반복)과 꼭 같은지 견준다. 부호화를 빠르게 고칠 때 바이트를 지켰는지 보는 기준 시험이다
 * (100차에 쓰기 함수 안에서 객체 칸을 바로 보내는 판을 재 보았으나 빨라지지 않아 넣지 않았다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Decoder, type Encoded, Encoder } from '../../src/worker/codec';

class Pt {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

/** 정해진 씨앗의 의사 난수(0 이상 1 미만) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 칸마다 여러 가지 값(수·문자열·일반 객체·원형 없는 객체·배열·형식 배열·Map·Set·클래스 객체·얼린 공유 객체·undefined·null·참거짓)이 섞인 객체들 */
function values(seed: number): unknown[] {
  const r = rng(seed);
  const shared = Object.freeze({ aci: 256 });
  const sharedPt = Object.freeze({ x: 1, y: 1, z: 1 });
  const slot = (): unknown => {
    const k = Math.floor(r() * 16);
    switch (k) {
      case 0:
        return r() * 1000;
      case 1:
        return Math.floor(r() * 300);
      case 2:
        return ['0', 'WALL', 'ByLayer', 'x'.repeat(50)][Math.floor(r() * 4)];
      case 3:
        return { x: r(), y: r(), z: 0 };
      case 4:
        return r() < 0.5 ? shared : sharedPt;
      case 5: {
        const o = Object.create(null) as Record<string, unknown>;
        o.a = 1;
        o.b = 'n';
        return o;
      }
      case 6:
        return [r(), r(), r()];
      case 7:
        return [1, 'a', { q: 2 }, null];
      case 8:
        return new Float64Array([r(), r()]);
      case 9:
        return new Map<string, unknown>([['k', { v: 1 }]]);
      case 10:
        return new Set([1, 'z']);
      case 11:
        return new Pt(r(), r());
      case 12:
        return undefined;
      case 13:
        return null;
      case 14:
        return r() < 0.5;
      default:
        return r() < 0.5 ? { aci: 7 } : { aci: 7, rgb: 0xff00 };
    }
  };
  const out: unknown[] = [];
  for (let i = 0; i < 400; i++) {
    // 모양 몇 가지를 되풀이해 짐작이 맞기도 틀리기도 하게
    const shape = Math.floor(r() * 5);
    const o: Record<string, unknown> = { type: 'T' + shape, handle: (0x100 + i).toString(16) };
    for (let j = 0; j < 3 + shape; j++) o['p' + j] = slot();
    if (shape === 4) o.sub = { kind: 'add', block: '*MODEL_SPACE', entity: { type: 'LINE', start: slot(), end: slot() } };
    out.push(o);
  }
  // 배열 안 객체·바로 앞 모양 짐작
  out.push(out.slice(0, 50));
  return out;
}

function encode(vs: unknown[]): Encoded {
  const enc = new Encoder();
  for (const v of vs) expect(enc.add(v)).toBe(true);
  return enc.finish();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('codec 모양별 쓰기 함수(100차)', () => {
  it('모양별 쓰기 함수의 부호화 바이트가 일반 반복(slotStr·slotVal)과 같다', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const vs = values(seed);
      const fast = encode(vs);
      // eval을 막은 환경처럼 쓰기 함수를 만들지 못하게 한다(makeWriter가 null — 속성마다 slotVal)
      vi.stubGlobal('Function', function blocked() {
        throw new EvalError('blocked');
      });
      const slow = encode(vs);
      vi.unstubAllGlobals();
      expect(fast.tags, String(seed)).toEqual(slow.tags);
      expect(fast.nums).toEqual(slow.nums);
      expect(fast.ints).toEqual(slow.ints);
      expect(fast.bins).toEqual(slow.bins);
      expect(fast.strs).toEqual(slow.strs);
      expect(fast.shapes).toEqual(slow.shapes);
      // 되살린 값은 구조화 복제와 같다(얼린 객체는 얼리지 않은 사본)
      const d = new Decoder(structuredClone(fast));
      const back: unknown[] = [];
      while (d.more()) back.push(d.next());
      expect(back).toEqual(structuredClone(vs));
    }
  });
});
