/**
 * 89차: 워커 전송 부호화(codec.ts)를 빠르게 한 뒤에도 부호화 결과는 바이트까지 88차 판과 같아야 한다(받는 쪽·저장한 결과가 그대로).
 * 기대 지문은 88차 판(a0829d2)의 Encoder로 같은 합성 값(codecinput.ts)을 부호화해 얻었다.
 * 고친 몫: 속성 자리 문자열은 그 자리에 바로 앞에 쓴 문자열과 같으면 문자열 표를 찾지 않고, 객체의 모양은 그 자리(속성·배열 안)에서
 * 지난번에 쓴 모양부터 맞춰 본다. 둘 다 표에서 찾은 번호·모양 찾기가 내는 번호와 같은 값을 쓴다.
 */
import { describe, expect, it } from 'vitest';
import { Decoder, Encoder, type Encoded } from '../../src/worker/codec';
import { codecInput, encodedDigest } from './codecinput';

const encodeAll = (values: unknown[]): Encoded => {
  const enc = new Encoder();
  for (const v of values) expect(enc.add(v)).toBe(true);
  return enc.finish();
};

const decodeAll = (e: Encoded): unknown[] => {
  const d = new Decoder(e);
  const out: unknown[] = [];
  while (d.more()) out.push(d.next());
  return out;
};

/** Encoded 안에서 그 문자열이 표에 몇 번 들었는지 */
const count = (e: Encoded, s: string) => e.strs.filter((x) => x === s).length;

describe('부호화 바이트 고정(89차)', () => {
  it('합성 값의 부호화 결과가 88차 판과 바이트까지 같다', () => {
    const seeds = [1, 2, 3];
    const want = [
      '9b4c70bc4dc00499822c6df1e38cbe766aca9d0158c687eaa7079a120b69bf61',
      'a1c4a2b846b7ff71073ba9fbc418ec1f0dc84472458f5f17ea319ef6b0d41acd',
      'b94b101b59bcd64ba42350ccb600fda0f56d21f2f91fb6e3409c68c4767eea68',
    ];
    expect(seeds.map((s) => encodedDigest(encodeAll(codecInput(s))))).toEqual(want);
    // 한 Encoder에 이어서(모양·문자열 표·자리 기억을 함께 쓴다)
    expect(encodedDigest(encodeAll(seeds.flatMap((s) => codecInput(s))))).toBe('467725da4a2665cf1e75990db652711c90249edab97e203fd28fdb87efc1365a');
  });

  it('합성 값을 구조화 복제와 같은 값으로 되살린다', () => {
    const values = codecInput(4);
    const back = decodeAll(encodeAll(values));
    expect(back).toHaveLength(values.length);
    for (let i = 0; i < values.length; i++) expect(back[i]).toStrictEqual(structuredClone(values[i]));
  });

  it('같은 자리에 같은 문자열이 이어지거나 번갈아 나와도 문자열 표에는 한 번만 든다', () => {
    const e = encodeAll([
      { layer: 'A', type: 'LINE' },
      { layer: 'A', type: 'ARC' },
      { layer: 'B', type: 'LINE' },
      { layer: 'A', type: 'ARC' },
      ['A', 'B', 'LINE'],
      { type: 'ARC', layer: 'B' },
    ]);
    expect(e.strs).toEqual(['A', 'LINE', 'ARC', 'B']);
    expect(decodeAll(e)[3]).toStrictEqual({ layer: 'A', type: 'ARC' });
  });

  it('바로 앞과 같은 문자열도 그 자리 점수를 올린다(늘 새 값이 끼어도 되풀이되는 값은 표에서 다시 찾는다)', () => {
    const vals: unknown[] = [];
    for (let c = 0; c < 3; c++) {
      for (let j = 0; j < 10; j++) vals.push({ kind: 'k', name: 'R' });
      for (let j = 0; j < 40; j++) vals.push({ kind: 'k', name: `U${c}-${j}` });
    }
    for (let j = 0; j < 10; j++) vals.push({ kind: 'k', name: 'R' });
    const e = encodeAll(vals);
    expect(count(e, 'R')).toBe(1);
    expect(count(e, 'k')).toBe(1);
    // 늘 새 값만 오는 자리는 33번째부터 표를 찾지 않는다(같은 값이 다시 와도 새로 든다)
    const h = encodeAll([...Array.from({ length: 40 }, (_, i) => ({ handle: `H${i}` })), { handle: 'H0' }]);
    expect(count(h, 'H0')).toBe(2);
  });

  it('속성 자리·배열 안에서 모양이 바뀌어도 모양마다 이름 차례가 맞다', () => {
    const items = [{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 1, c: 2 }, { b: 1, a: 2 }, { a: 1, b: 2, c: 3 }, {}, { a: 1 }, { a: 5, b: 6 }];
    const values: unknown[] = [items, ...items.map((p) => ({ type: 'X', at: p })), { type: 'X', at: [items[0], items[2]] }, { type: 'X', at: null }];
    const e = encodeAll(values);
    expect(e.shapes).toEqual([['a', 'b'], ['a', 'c'], ['b', 'a'], ['a', 'b', 'c'], [], ['a'], ['type', 'at']]);
    const back = decodeAll(e);
    for (let i = 0; i < values.length; i++) expect(back[i]).toStrictEqual(structuredClone(values[i]));
    // 되살린 객체의 이름 차례도 그대로
    expect(Object.keys((back[0] as object[])[3]!)).toEqual(['b', 'a']);
  });
});
