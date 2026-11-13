/**
 * 127차: DWG 읽기에서 객체 CRC를 8바이트씩 표로 셈하고, R2004 계열 압축 풀기를 닫힘 없이 바꾸고(짧은 글자 줄은 바이트씩, 겹치지 않는 긴 되풀이는 copyWithin),
 * 객체 지도·종류·읽은 도형을 핸들 자리 표(HandleMap)에 두고, 원본 본문 지문을 바꾸개 없이 셀 수 있으면 그렇게 하고,
 * R12 읽기의 핸들 글을 표로 만들고 읽은 자리를 비트 표에 둔 뒤에도 결과가 전과 같은지. 예전 길은 이 파일에 그대로 옮겨 두고 견준다
 * (R12 태그를 묶어 넘기기는 tests/dwg/r12.test.ts가 실제 읽기로 본다).
 */
import { describe, expect, it } from 'vitest';
import { HandleMap } from '../../src/core/handlemap';
import { crc8 } from '../../src/io/dwg/crc';
import { DwgFormatError } from '../../src/io/dwg/bitstream';
import { decompressR18 } from '../../src/io/dwg/lz77';
import { fingerprint } from '../../src/io/dwg/rawbody';
import { PosSet, handleHex } from '../../src/io/dwg/r12';
import { compressR18 } from '../../src/io/dwg/writer/lz77enc';

let seed = 2127;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

/** 126차까지의 crc8(바이트씩) */
function crc8Old(seed0: number, data: Uint8Array, start: number, end: number): number {
  const table = new Uint16Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
    table[n] = c;
  }
  let dx = seed0 & 0xffff;
  for (let i = start; i < end; i++) {
    const al = (data[i]! ^ dx) & 0xff;
    dx = (dx >>> 8) ^ table[al]!;
  }
  return dx & 0xffff;
}

/** 126차까지의 decompressR18(닫힘 셋, 글자 줄 subarray, 되풀이 바이트씩) */
function decompressOld(src: Uint8Array, start: number, end: number, outSize: number, out?: Uint8Array, outOffset = 0): Uint8Array {
  const dst = out ?? new Uint8Array(outSize);
  const dstEnd = outOffset + outSize;
  let o = outOffset;
  let i = start;
  const literalLength = (): number => {
    const b = src[i]!;
    if (b === 0) {
      i++;
      let total = 0x0f;
      let c: number;
      while ((c = src[i++]!) === 0) {
        total += 0xff;
        if (i >= end) break;
      }
      return total + c + 3;
    }
    if (b < 0x10) {
      i++;
      return b + 3;
    }
    return 0;
  };
  const longOffset = (): number => {
    let b = src[i++]!;
    if (b !== 0) return b;
    let total = 0xff;
    while ((b = src[i++]!) === 0) {
      total += 0xff;
      if (i >= end) break;
    }
    return total + b;
  };
  const copyLiteral = (n: number): void => {
    let m = n;
    if (o + m > dstEnd) m = dstEnd - o;
    if (i + m > end) m = end - i;
    if (m > 0) {
      dst.set(src.subarray(i, i + m), o);
      o += m;
    }
    i += n;
  };
  copyLiteral(literalLength());
  while (i < end) {
    const op1 = src[i++]!;
    if (op1 === 0x11) break;
    let compBytes: number;
    let compOffset: number;
    let lit: number;
    if (op1 >= 0x40) {
      compBytes = (op1 >> 4) - 1;
      const op2 = src[i++]!;
      compOffset = (op2 << 2) | ((op1 & 0x0c) >> 2);
      lit = op1 & 3;
    } else if (op1 >= 0x21) {
      compBytes = op1 - 0x1e;
      const a = src[i++]!;
      const b = src[i++]!;
      compOffset = (a >> 2) | (b << 6);
      lit = a & 3;
    } else if (op1 === 0x20) {
      compBytes = longOffset() + 0x21;
      const a = src[i++]!;
      const b = src[i++]!;
      compOffset = (a >> 2) | (b << 6);
      lit = a & 3;
    } else if (op1 >= 0x10) {
      compBytes = (op1 & 7) + 2;
      if (compBytes === 2) compBytes = longOffset() + 9;
      const a = src[i++]!;
      const b = src[i++]!;
      compOffset = ((a >> 2) | (b << 6)) + 0x3fff + ((op1 & 8) << 11);
      lit = a & 3;
    } else {
      throw new DwgFormatError(`압축 자료의 잘못된 명령 0x${op1.toString(16)}`);
    }
    let from = o - compOffset - 1;
    if (from < outOffset) throw new DwgFormatError('압축 자료의 잘못된 거리');
    if (o + compBytes > dstEnd) compBytes = dstEnd - o;
    for (let k = 0; k < compBytes; k++) dst[o++] = dst[from++]!;
    if (lit === 0) lit = literalLength();
    copyLiteral(lit);
  }
  return dst;
}

/** 두 풀기의 결과(바이트 또는 오류 글)를 같은 꼴로 */
function run(f: () => Uint8Array): string {
  try {
    return Buffer.from(f()).toString('base64');
  } catch (e) {
    return `${(e as Error).name}:${(e as Error).message}`;
  }
}

/** 압축이 잘 되는 자료: 짧은·긴 되풀이(겹치는 것 포함), 0 줄, 무작위 조각을 섞는다 */
function sample(n: number): Uint8Array {
  const a = new Uint8Array(n);
  let p = 0;
  while (p < n) {
    const kind = rand();
    const len = Math.min(n - p, 1 + Math.floor(rand() * (kind < 0.3 ? 8 : 400)));
    if (kind < 0.35) for (let k = 0; k < len; k++) a[p + k] = Math.floor(rand() * 256);
    else if (kind < 0.55) a.fill(pick([0, 0x20, 0xff]), p, p + len);
    else if (p > 0) {
      // 앞 자료 되풀이(거리 1~ p, 길이가 거리보다 길 수 있다)
      const dist = 1 + Math.floor(rand() * Math.min(p, kind < 0.8 ? 64 : 40000));
      for (let k = 0; k < len; k++) a[p + k] = a[p + k - dist]!;
    }
    p += len;
  }
  return a;
}

describe('객체 CRC(crc8) 8바이트씩', () => {
  it('바이트씩 셈과 같다(길이 0~70 모든 시작 자리, 무작위 씨앗, 큰 버퍼, 끝이 버퍼 밖)', () => {
    const buf = new Uint8Array(4096);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(rand() * 256);
    for (const s0 of [0, 0xc0c1, 0xffff, 0x1234, 0x10000 + 0x55]) {
      for (let start = 0; start < 9; start++) for (let len = 0; len <= 70; len++) expect(crc8(s0, buf, start, start + len)).toBe(crc8Old(s0, buf, start, start + len));
      expect(crc8(s0, buf, 0, buf.length)).toBe(crc8Old(s0, buf, 0, buf.length));
      expect(crc8(s0, buf, 3, buf.length - 5)).toBe(crc8Old(s0, buf, 3, buf.length - 5));
      // 끝이 버퍼를 넘으면 넘는 바이트를 0처럼 셈한다(예전 길과 같다)
      expect(crc8(s0, buf, buf.length - 20, buf.length + 13)).toBe(crc8Old(s0, buf, buf.length - 20, buf.length + 13));
    }
    for (let k = 0; k < 200; k++) {
      const n = Math.floor(rand() * 3000);
      const a = new Uint8Array(n);
      for (let i = 0; i < n; i++) a[i] = rand() < 0.3 ? 0 : Math.floor(rand() * 256);
      const s = Math.floor(rand() * (n + 1));
      const e = s + Math.floor(rand() * (n - s + 1));
      const s0 = Math.floor(rand() * 0x10000);
      expect(crc8(s0, a, s, e)).toBe(crc8Old(s0, a, s, e));
    }
  });
});

describe('R2004 계열 압축 풀기', () => {
  it('압축기가 만든 자료를 예전 길과 같게 푼다(긴 되풀이·겹치는 되풀이·긴 글자 줄, 페이지 크기)', () => {
    for (let k = 0; k < 60; k++) {
      const input = sample(k % 10 === 0 ? 0x7400 : 1 + Math.floor(rand() * 6000));
      const comp = compressR18(input);
      const got = decompressR18(comp, 0, comp.length, input.length);
      expect(Buffer.from(got).equals(Buffer.from(input))).toBe(true);
      expect(run(() => decompressR18(comp, 0, comp.length, input.length))).toBe(run(() => decompressOld(comp, 0, comp.length, input.length)));
    }
  });

  it('남의 버퍼·자리에 풀기와 출력보다 긴·짧은 크기도 예전 길과 같다', () => {
    for (let k = 0; k < 40; k++) {
      const input = sample(1 + Math.floor(rand() * 3000));
      const comp = compressR18(input);
      const pad = Math.floor(rand() * 40);
      const wrapped = new Uint8Array(comp.length + pad * 2);
      wrapped.set(comp, pad);
      for (const size of [input.length, input.length + 77, Math.floor(input.length / 2), 1]) {
        const off = Math.floor(rand() * 50);
        const a = new Uint8Array(off + size + 30).fill(0xab);
        const b = new Uint8Array(off + size + 30).fill(0xab);
        const ra = run(() => decompressR18(wrapped, pad, pad + comp.length, size, a, off));
        const rb = run(() => decompressOld(wrapped, pad, pad + comp.length, size, b, off));
        expect(ra).toBe(rb);
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
      }
    }
  });

  it('망가진 자료(바이트 바꾸기·자르기·무작위)에서도 결과나 오류가 예전 길과 같다', () => {
    let errors = 0;
    for (let k = 0; k < 400; k++) {
      const input = sample(1 + Math.floor(rand() * 2000));
      let comp = compressR18(input);
      const kind = k % 4;
      if (kind === 0) {
        comp = comp.slice();
        for (let f = 0; f < 1 + Math.floor(rand() * 4); f++) comp[Math.floor(rand() * comp.length)] = Math.floor(rand() * 256);
      } else if (kind === 1) comp = comp.slice(0, Math.floor(rand() * comp.length));
      else if (kind === 2) {
        comp = new Uint8Array(1 + Math.floor(rand() * 300));
        for (let i = 0; i < comp.length; i++) comp[i] = Math.floor(rand() * 256);
      }
      // 끝을 버퍼 밖으로 잡는 경우도(읽는 자리가 버퍼를 넘는다)
      const end = kind === 3 ? comp.length + Math.floor(rand() * 20) : comp.length;
      const size = input.length + (rand() < 0.3 ? Math.floor(rand() * 100) : 0);
      const ra = run(() => decompressR18(comp, 0, end, size));
      const rb = run(() => decompressOld(comp, 0, end, size));
      if (ra.includes(':')) errors++;
      expect(ra).toBe(rb);
    }
    // 오류 길도 실제로 지났다
    expect(errors).toBeGreaterThan(20);
  });
});

/** 126차까지의 지문(값마다 바꾸개를 부른다) */
const COMMON_OLD = new Set(['handle', 'owner', 'layer', 'linetype', 'color', 'lineweight', 'ltscale', 'transparency', 'invisible', 'paperSpace', 'xdata', 'xdict', 'reactors', 'plotStyle', 'material', 'hyperlink', 'dwgRaw', 'graphics']);
function fingerprintOld(o: object): string {
  const s = JSON.stringify(o, function (this: unknown, k: string, v: unknown) {
    if (this === o && COMMON_OLD.has(k)) return undefined;
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
const fpBoth = (o: object): [string, string] => {
  const r = (f: () => string): string => {
    try {
      return f();
    } catch (e) {
      return `${(e as Error).name}`;
    }
  };
  return [r(() => fingerprint(o)), r(() => fingerprintOld(o))];
};

describe('원본 본문 지문(fingerprint) 빠른 길', () => {
  it('바꾸개를 부르던 예전 지문과 같다(공통 속성·안쪽 같은 이름·형식 배열·Map·Set·toJSON·빈 칸·특수 글자·수)', () => {
    const big: Record<string, unknown> = { type: 'DEEP' };
    let cur = big;
    for (let i = 0; i < 70000; i++) cur = (cur.next = { i }) as Record<string, unknown>;
    const cyc: Record<string, unknown> = { type: 'CYCLE', a: { b: {} } };
    (cyc.a as { b: Record<string, unknown> }).b.c = cyc;
    const protoKey = JSON.parse('{"type":"P","__proto__":{"x":1},"y":2}') as object;
    const samples: object[] = [
      { type: 'ACDBASSOCNETWORK', handle: '1F', owner: 'A', reactors: ['1', '2'], xdict: '3' },
      { type: 'X', handle: '2', raw: [{ code: 1, value: 'a"b\\c\n\u0001 😀\ud800' }, { code: 40, value: -0 }, { code: 41, value: NaN }, { code: 42, value: Infinity }, { code: 90, value: 1e21 }] },
      { type: 'X', raw: [{ code: 310, value: new Uint8Array([1, 2, 255]) }] },
      { type: 'X', verts: new Float64Array([0.1, -2, 3e-9]), more: [new Float64Array(2)] },
      { type: 'X', m: new Map<unknown, unknown>([['a', 1], [2, new Uint8Array([7])]]) },
      { type: 'X', s: new Set([1, 2]), i32: new Int32Array([1, -2]), f32: new Float32Array([0.5]), u16: new Uint16Array([9]) },
      { type: 'X', d: new Date(0), nested: { handle: 'kept', owner: 'kept', dwgRaw: { x: 1 } } },
      { type: 'X', u: undefined, f: () => 1, arr: [1, undefined, () => 2, , 4], sym: Symbol('s') },
      { 2: 'b', 1: 'a', type: 'NUMKEYS', z: { 10: 1, 9: 2, b: 3, a: 4 } },
      { type: 'X', graphics: new Uint8Array([1]), xdata: [{ app: 'A', items: [{ code: 1000, value: 'v' }] }], dwgRaw: { data: new Uint8Array(3) } },
      { type: 'X', toJSONish: { toJSON: 5 } },
      { type: 'X', obj: { toJSON: () => 'tj' } },
      [1, 2, { handle: 'h' }],
      new Map([['type', 'm']]),
      { toJSON: () => ({ handle: 'x', type: 'T' }) },
      { type: 'BIG', n: 10n as unknown as number },
      protoKey,
      big,
      cyc,
    ];
    for (const o of samples) {
      const [a, b] = fpBoth(o);
      expect(a).toBe(b);
    }
    // 무작위 모양
    for (let k = 0; k < 300; k++) {
      const make = (d: number): unknown => {
        const r = rand();
        if (d > 3 || r < 0.3) return pick([0, -0, 1.5, -7, 'x', '', 'é"\n', true, false, null, undefined, NaN]);
        if (r < 0.45) return Array.from({ length: Math.floor(rand() * 4) }, () => make(d + 1));
        if (r < 0.5) return new Uint8Array([Math.floor(rand() * 256)]);
        if (r < 0.53) return new Float64Array([rand()]);
        if (r < 0.55) return new Map([[pick(['k', 1]), make(d + 1)]]);
        const o: Record<string, unknown> = {};
        for (let i = 0; i < Math.floor(rand() * 5); i++) o[pick(['type', 'handle', 'owner', 'a', 'b', '3', 'reactors', 'xdata', 'graphics'])] = make(d + 1);
        return o;
      };
      const o = (make(0) ?? {}) as object;
      if (typeof o !== 'object') continue;
      const [a, b] = fpBoth(o);
      expect(a).toBe(b);
    }
  });
});

describe('R12 읽기의 핸들 글·읽은 자리 모음', () => {
  it('핸들 글이 126차 길(16진 두 글자 → 정규식으로 앞 0 빼기 → 대문자)과 같다', () => {
    const old = (d: Uint8Array, q: number, n: number): string => {
      let hex = '';
      for (let i = 0; i < n; i++) hex += d[q + i]!.toString(16).padStart(2, '0');
      return hex.replace(/^0+(?=.)/, '').toUpperCase();
    };
    const d = new Uint8Array(64);
    for (let k = 0; k < 3000; k++) {
      for (let i = 0; i < d.length; i++) d[i] = rand() < 0.4 ? 0 : rand() < 0.1 ? Math.floor(rand() * 16) : Math.floor(rand() * 256);
      const n = Math.floor(rand() * 10);
      const q = Math.floor(rand() * (d.length - n));
      expect(handleHex(d, q, n)).toBe(old(d, q, n));
    }
    for (const bytes of [[], [0], [0, 0], [0, 0, 0, 1], [0, 0x0a], [0x0a, 0], [0xff, 0xff], [0, 0, 0, 0, 0, 0, 0, 0]]) {
      const a = new Uint8Array(bytes);
      expect(handleHex(a, 0, a.length)).toBe(old(a, 0, a.length));
    }
  });

  it('읽은 자리 모음이 Set<number>와 같다(파일 길이 경계·밖·음수·소수)', () => {
    for (const len of [0, 1, 7, 8, 9, 1000, 65537]) {
      const ps = new PosSet(len);
      const ref = new Set<number>();
      for (let i = 0; i < 5000; i++) {
        const v = rand() < 0.1 ? pick([-1, 0.5, len, len + 1, len + 9, 2 ** 31, 2 ** 31 - 1, NaN]) : Math.floor(rand() * (len + 1));
        if (rand() < 0.5) {
          ps.add(v);
          ref.add(v);
        } else expect(ps.has(v)).toBe(ref.has(v));
      }
      for (const v of [...ref, 0, len, len + 1, -1]) expect(ps.has(v)).toBe(ref.has(v));
    }
  });
});

describe('핸들 자리 표(HandleMap)', () => {
  it('무작위 넣기·찾기·훑기가 Map<number, V>와 같다(조밀·성긴·아주 큰 핸들, 같은 핸들 다시 넣기, 음수·소수·-0·NaN)', () => {
    const odd = [-1, -0, 0, 0.5, 1.5, NaN, Infinity, -Infinity, 2 ** 25 - 1, 2 ** 25, 2 ** 25 + 1, 2 ** 31, 2 ** 32 + 7, 2 ** 40 + 3, 2 ** 52 - 1];
    for (let k = 0; k < 40; k++) {
      const hm = new HandleMap<number>();
      const ref = new Map<number, number>();
      const range = 1 + Math.floor(rand() * (k % 4 === 0 ? 300 : k % 4 === 1 ? 5_000_000 : 200_000));
      const steps = k % 5 === 0 ? 20000 : 3000;
      for (let i = 0; i < steps; i++) {
        const v = rand() < 0.08 ? pick(odd) : Math.floor(rand() * range);
        if (rand() < 0.6) {
          expect(hm.set(v, i)).toBe(hm);
          ref.set(v, i);
        } else {
          expect(hm.get(v)).toBe(ref.get(v));
          expect(hm.has(v)).toBe(ref.has(v));
        }
      }
      expect(hm.size).toBe(ref.size);
      expect([...hm]).toEqual([...ref]);
      expect([...hm.entries()]).toEqual([...ref.entries()]);
      expect([...hm.values()]).toEqual([...ref.values()]);
      expect(hm.keys).toEqual([...ref.keys()]);
      for (const v of [...odd, 1, 31, range - 1, range, range + 1]) expect(hm.get(v)).toBe(ref.get(v));
    }
  });

  it('작을 때 표 밖에 둔 핸들도 표가 커진 뒤 찾고 값을 바꾼다', () => {
    const hm = new HandleMap<string>();
    const ref = new Map<number, string>();
    // 처음엔 열쇠가 적어 큰 핸들은 Map에 들어간다
    for (const h of [200_000, 300_000, 150_000]) {
      hm.set(h, 'a' + h);
      ref.set(h, 'a' + h);
    }
    // 열쇠를 많이 넣어 표가 그 핸들들을 덮게 한다
    for (let h = 1; h < 120_000; h++) {
      hm.set(h * 3 + 1, 'b' + h);
      ref.set(h * 3 + 1, 'b' + h);
    }
    for (const h of [200_000, 300_000, 150_000]) {
      expect(hm.get(h)).toBe('a' + h);
      hm.set(h, 'c' + h);
      ref.set(h, 'c' + h);
    }
    expect([...hm]).toEqual([...ref]);
    expect(hm.size).toBe(ref.size);
  });
});
