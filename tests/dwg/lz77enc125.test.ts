/**
 * 125차: R2004 계열 압축기(compressR18)를 버퍼를 다시 쓰고 찾는 대로 내보내게 바꾼 뒤에도 내는 바이트가 예전과 같은지.
 * 기준은 124차까지의 구현을 그대로 옮긴 refCompress(부를 때마다 해시 표·출력 버퍼·(길이, 거리) 목록을 새로 만든다).
 */
import { describe, expect, it } from 'vitest';
import { decompressR18 } from '../../src/io/dwg/lz77';
import { compressR18 } from '../../src/io/dwg/writer/lz77enc';

// ---- 124차 구현(기준) ----
const MAX_NEAR = 0x3fff;
const MAX_FAR = MAX_NEAR;
class Out {
  buf = new Uint8Array(1024);
  n = 0;
  push(b: number): void {
    if (this.n >= this.buf.length) {
      const nb = new Uint8Array(this.buf.length * 2);
      nb.set(this.buf);
      this.buf = nb;
    }
    this.buf[this.n++] = b & 0xff;
  }
  bytes(src: Uint8Array, from: number, to: number): void {
    for (let i = from; i < to; i++) this.push(src[i]!);
  }
}
function literalLength(o: Out, n: number): void {
  if (n <= 18) {
    o.push(n - 3);
    return;
  }
  o.push(0);
  let rem = n - 3 - 0x0f;
  while (rem > 0xff) {
    o.push(0);
    rem -= 0xff;
  }
  o.push(rem);
}
function longValue(o: Out, v: number): void {
  if (v <= 0xff) {
    o.push(v);
    return;
  }
  o.push(0);
  let rem = v - 0xff;
  while (rem > 0xff) {
    o.push(0);
    rem -= 0xff;
  }
  o.push(rem);
}
function match(o: Out, len: number, dist: number, lit: number): boolean {
  const d = dist - 1;
  const small = lit >= 1 && lit <= 3 ? lit : 0;
  if (d <= 0x3ff && len <= 14) {
    o.push(((len + 1) << 4) | ((d & 3) << 2) | small);
    o.push(d >> 2);
  } else if (d <= MAX_NEAR) {
    if (len <= 33) o.push(0x1e + len);
    else {
      o.push(0x20);
      longValue(o, len - 0x21);
    }
    o.push(((d & 0x3f) << 2) | small);
    o.push(d >> 6);
  } else {
    const dd = d - 0x3fff;
    if (len <= 17) o.push(0x10 + len - 2);
    else {
      o.push(0x10);
      longValue(o, len - 9);
    }
    o.push(((dd & 0x3f) << 2) | small);
    o.push(dd >> 6);
  }
  return small !== 0;
}
function refCompress(input: Uint8Array): Uint8Array {
  let src = input;
  if (src.length > 0 && src.length < 4) {
    src = new Uint8Array(4);
    src.set(input);
  }
  const n = src.length;
  const o = new Out();
  const HASH = 1 << 15;
  const head = new Int32Array(HASH).fill(-1);
  const hash = (i: number) => Math.imul((src[i]! << 16) ^ (src[i + 1]! << 8) ^ src[i + 2]!, 0x9e3779b1) >>> 17;
  const ops: { lit: number; len: number; dist: number }[] = [];
  let litStart = 0;
  let i = 0;
  while (i + 3 <= n) {
    const h = hash(i) & (HASH - 1);
    const cand = head[h]!;
    head[h] = i;
    let len = 0;
    let dist = 0;
    if (cand >= 0 && i - cand <= MAX_FAR) {
      let l = 0;
      const max = Math.min(n - i, 0xffff);
      while (l < max && src[cand + l] === src[i + l]) l++;
      dist = i - cand;
      len = l;
      if (dist - 1 > MAX_NEAR && len < 4) len = 0;
    }
    if (len >= 3 && !(ops.length === 0 && i - litStart > 0 && i - litStart < 4)) {
      ops.push({ lit: i - litStart, len, dist });
      for (let k = 1; k < len && i + k + 3 <= n; k++) head[hash(i + k) & (HASH - 1)] = i + k;
      i += len;
      litStart = i;
    } else i++;
  }
  const tail = n - litStart;
  let pos = 0;
  const first = ops.length ? ops[0]!.lit : tail;
  if (first > 0) literalLength(o, first);
  o.bytes(src, 0, first);
  pos = first;
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]!;
    pos += op.len;
    const nextLit = k + 1 < ops.length ? ops[k + 1]!.lit : tail;
    const inOp = match(o, op.len, op.dist, nextLit);
    if (!inOp && nextLit > 0) literalLength(o, nextLit);
    o.bytes(src, pos, pos + nextLit);
    pos += nextLit;
  }
  o.push(0x11);
  o.push(0);
  o.push(0);
  return o.buf.slice(0, o.n);
}

// ---- 입력 만들기 ----
let seed = 125;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
const randomBytes = (n: number, alpha = 256): Uint8Array => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(rand() * alpha);
  return a;
};
/** 무작위 글자와 되돌아 복사(거리·길이 무작위)를 섞은 입력 */
const lzish = (n: number): Uint8Array => {
  const a = new Uint8Array(n);
  const alpha = 1 + Math.floor(rand() * 255);
  for (let i = 0; i < n; i++) {
    if (i > 10 && rand() < 0.3) {
      const d = 1 + Math.floor(rand() * Math.min(i, 0x5000));
      const L = Math.floor(rand() * 300);
      for (let j = 0; j < L && i < n; j++, i++) a[i] = a[i - d]!;
      i--;
    } else a[i] = Math.floor(rand() * alpha);
  }
  return a;
};
/** 무작위 바탕에 거리 d로 길이 len의 같은 조각을 둔 입력(거리 경계 시험) */
const atDistance = (d: number, len: number, lead = 64): Uint8Array => {
  const a = randomBytes(lead + d + len + 32);
  for (let k = 0; k < len; k++) a[lead + d + k] = a[lead + k]!;
  return a;
};

const same = (input: Uint8Array): void => {
  const want = refCompress(input);
  const got = compressR18(input);
  expect(got.length).toBe(want.length);
  expect(Buffer.from(got).equals(Buffer.from(want))).toBe(true);
  // 푼 결과도 원본
  const back = decompressR18(got, 0, got.length, input.length);
  expect(Buffer.from(back).equals(Buffer.from(input))).toBe(true);
};

describe('R2004 압축기(125차): 예전 구현과 같은 바이트', () => {
  it('짧은 입력·빈 입력·0만 있는 쪽', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 17, 18, 19, 20]) same(randomBytes(n));
    same(new Uint8Array(0x7400));
    same(new Uint8Array([7, 7, 7]));
  });

  it('글자만 긴 입력(글자 길이 확장 0x00 여러 개)', () => {
    for (const n of [18 + 0xff, 18 + 0xff + 1, 18 + 0xff * 3 + 7, 4000]) same(randomBytes(n));
  });

  it('긴 같은 바이트(일치 길이 상한 0xffff, 긴 길이 확장)', () => {
    same(new Uint8Array(200000).fill(0x41));
    const a = randomBytes(70000, 2);
    same(a);
  });

  it('거리 경계(0x3ff·0x400·0x3fff·0x4000)와 짧은·긴 일치', () => {
    for (const d of [1, 2, 3, 4, 0x3fe, 0x3ff, 0x400, 0x401, 0x3ffe, 0x3fff, 0x4000, 0x4001])
      for (const len of [3, 4, 14, 15, 16, 33, 34, 300]) same(atDistance(d, len));
  });

  it('첫 글자 1~3바이트 뒤의 일치(첫 묶음 규칙)', () => {
    for (const lead of [1, 2, 3, 4, 5]) {
      // 주기 lead로 되풀이: 첫 일치가 lead 자리(1~3이면 첫 묶음 규칙에 걸린다)에서 나온다
      for (const n of [lead + 3, lead + 4, lead + 40]) {
        const a = new Uint8Array(n);
        for (let i = 0; i < n; i++) a[i] = 5 + (i % lead);
        same(a);
      }
      // 앞에 다른 글자 lead개를 두고 3바이트 주기
      const b = new Uint8Array(lead + 40);
      for (let i = 0; i < lead; i++) b[i] = 200 + i;
      for (let i = lead; i < b.length; i++) b[i] = (i - lead) % 3;
      same(b);
    }
  });

  it('되돌아 복사를 섞은 무작위 입력', () => {
    for (let k = 0; k < 80; k++) same(lzish(Math.floor(rand() * 0x7400 * 1.2)));
  });

  it('잇단 호출이 앞 입력의 해시 칸을 쓰지 않는다(다시 쓰는 표)', () => {
    const a = lzish(0x7400);
    const b = new Uint8Array(0x7400);
    b.set(a.subarray(0, 0x3000), 0x2000); // a의 내용을 b 안에 — 앞 호출의 칸을 쓰면 일치가 달라진다
    for (const x of [a, b, a, randomBytes(9), b]) same(x);
  });

  it('출력이 큰 입력 뒤에도 같다(출력 버퍼를 키웠다 놓아 줌)', () => {
    same(randomBytes(3 << 20));
    same(lzish(5000));
    same(randomBytes(64));
  });

  it('돌려준 배열은 다음 호출에 덮이지 않는다', () => {
    const x = lzish(6000);
    const first = compressR18(x);
    const copy = first.slice();
    compressR18(lzish(6000));
    expect(Buffer.from(first).equals(Buffer.from(copy))).toBe(true);
  });
});
