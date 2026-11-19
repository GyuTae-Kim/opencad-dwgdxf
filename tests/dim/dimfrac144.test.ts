/**
 * 144차: 건축 단위(DIMLUNIT 4)에서 피트를 보이지 않을 때 분수 앞 정수 인치 0.
 * 실제 도면의 AutoCAD 치수 블록은 0 피트를 생략한 1인치 미만 분수를 분수만 쓰고(0'-0 3/4" → 3/4"),
 * 피트를 보이면 4'-0 3/4"처럼 0을 남긴다(Autodesk 치수 스타일 관리자 1차 단위 탭: 0'-6 1/2" → 6 1/2").
 */
import { describe, expect, it } from 'vitest';
import { DIM_VAR_DEFAULTS } from '../../src/core/dimvars';
import { dimensionText } from '../../src/edit/dim';

const T = (o: Record<string, number | string>, m: number, user = '') => dimensionText({ ...DIM_VAR_DEFAULTS, ...o }, 'linear', m, user).mtext;

describe('건축 단위 분수 앞 0(144차)', () => {
  it('피트를 보이지 않으면 분수만(쌓은 분수·쌓지 않은 분수, DIMZIN 0·3)', () => {
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 1, DIMZIN: 0, DIMTFAC: 0.8 }, 0.375)).toBe('{\\H0.8x;\\S3#8;}"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 1, DIMZIN: 3, DIMTFAC: 0.8 }, 0.125)).toBe('{\\H0.8x;\\S1#8;}"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 4, DIMFRAC: 2, DIMZIN: 3 }, 0.5625)).toBe('9/16"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 2, DIMFRAC: 0, DIMZIN: 0, DIMTFAC: 0.8 }, 0.25)).toBe('{\\H0.8x;\\S1/4;}"');
    // DIMZIN 11 = 3 + 8(소수 뒤 0 — 건축 단위에는 쓰이지 않음)
    expect(T({ DIMLUNIT: 4, DIMDEC: 4, DIMFRAC: 1, DIMZIN: 11, DIMTFAC: 0.7 }, 0.3125)).toBe('{\\H0.7x;\\S5#16;}"');
  });
  it('사용자 문자의 <>와 DIMPOST에도 같은 값', () => {
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 2, DIMZIN: 3 }, 0.5, '<> MAX.')).toBe('1/2" MAX.');
    expect(T({ DIMLUNIT: 4, DIMDEC: 4, DIMFRAC: 1, DIMZIN: 0, DIMTFAC: 0.8, DIMPOST: "<>'" }, 0.3125)).toBe('{\\H0.8x;\\S5#16;}"\'');
  });
  it('피트를 보이면 0을 남긴다(0 피트를 보이는 DIMZIN 1·2 포함)', () => {
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 1, DIMZIN: 0, DIMTFAC: 0.8 }, 12.5)).toBe('1\'-0{\\H0.8x;\\S1#2;}"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 2, DIMZIN: 3 }, 12.25)).toBe('1\'-0 1/4"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 2, DIMZIN: 1 }, 0.75)).toBe('0\'-0 3/4"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 2, DIMZIN: 2 }, 0.75)).toBe('0\'-0 3/4"');
  });
  it('정수 인치가 0이 아니거나 분수가 없으면 그대로, 분수 단위(DIMLUNIT 5)도 그대로', () => {
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMFRAC: 2, DIMZIN: 0 }, 6.5)).toBe('6 1/2"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMZIN: 3 }, 0)).toBe('0"');
    expect(T({ DIMLUNIT: 4, DIMDEC: 3, DIMZIN: 0 }, 6)).toBe('6"');
    expect(T({ DIMLUNIT: 5, DIMDEC: 2, DIMFRAC: 2 }, 0.75)).toBe('3/4');
  });
});
