/**
 * 87차: normalizeHandle이 이미 정규화한 핸들을 그대로 돌려주는 빠른 길을 둔다. 결과는 예전 식(앞뒤 공백 빼기, 앞 0 빼기, 대문자)과 같아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { normalizeHandle } from '../../src/core/model';

const reference = (h: string) => h.trim().replace(/^0+(?=.)/, '').toUpperCase();

describe('normalizeHandle', () => {
  it('정규화한 핸들은 그대로, 나머지는 예전 식과 같은 값', () => {
    const fixed = ['', '0', '00', '000A', 'A', 'a', '1F', '1f', ' 1F ', '0x1F', 'FF00', '0FF', 'G', 'ZZ', '-1', '1 2', '\t7\n', 'ABCDEF0123456789', 'abcdef'];
    let seed = 7;
    const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const chars = '0123456789ABCDEFabcdefg -';
    const random = Array.from({ length: 5000 }, () => Array.from({ length: Math.floor(r() * 7) }, () => chars[Math.floor(r() * chars.length)]).join(''));
    for (const h of [...fixed, ...random]) expect(normalizeHandle(h), JSON.stringify(h)).toBe(reference(h));
  });

  it('수와 큰 정수는 16진 대문자', () => {
    expect([normalizeHandle(255), normalizeHandle(0x1fn), normalizeHandle(0)]).toEqual(['FF', '1F', '0']);
  });
});
