/** 98차: DIMASSOC 핸들 글자 다듬기 — 이미 정규화한 글자는 그대로 두고, 아니면 전처럼(공백·소문자·앞 0·수) 다듬는다 */
import { describe, expect, it } from 'vitest';
import type { RawTag } from '../../src/core/model';
import { parseDimAssoc } from '../../src/edit/dim/assoc';

const rec = (dim: string | number, ids: (string | number)[]): RawTag[] => [
  { code: 100, value: 'AcDbDimAssoc' },
  { code: 330, value: dim },
  { code: 90, value: 1 },
  { code: 1, value: 'AcDbOsnapPointRef' },
  { code: 72, value: 1 },
  ...ids.map((v) => ({ code: 331, value: v })),
  { code: 10, value: 1 },
  { code: 20, value: 2 },
];

/** 97차까지의 다듬기(비교용) */
const old = (v: string | number): string => String(v).trim().toUpperCase().replace(/^0+(?=.)/, '');

describe('DIMASSOC 핸들 글자(98차)', () => {
  it('여러 꼴의 핸들이 97차 다듬기와 같은 글자가 된다', () => {
    const vals: (string | number)[] = ['A1', '9F', '0', '1', 'FFFF', '00A1', '9f', ' a1 ', '000', '0x1', 161, 0, 'G1', '', '\tB2\n', 'ß'];
    for (const v of vals) {
      const d = parseDimAssoc(rec(v, [v, '2B']));
      expect(d?.dimension).toBe(old(v));
      const want = [old(v), '2B'].filter((h) => h && h !== '0');
      expect(d?.refs[0]?.ids ?? []).toEqual(want);
    }
  });
});
