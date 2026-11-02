/**
 * 39차: 파일 크기로 막지 않으므로 기기가 버퍼를 잡지 못하는 일이 생긴다. 이것은 파일 손상이 아니라 메모리 안내로 알려야 한다.
 */
import { describe, expect, it, vi } from 'vitest';
import { openErrorInfo } from '../../src/app/openerror';
import { CadReadError } from '../../src/core/errors';
import { readDwg } from '../../src/io/dwg';

const failure = vi.hoisted(() => ({ message: '' }));
vi.mock('../../src/io/dwg/container/r2004', () => ({
  readR2004Container: () => {
    throw new RangeError(failure.message);
  },
}));

const file = new Uint8Array(0x100);
file.set(new TextEncoder().encode('AC1018'));

describe('버퍼를 잡지 못한 파일', () => {
  it.each(['Array buffer allocation failed', 'Out of memory'])('%s는 메모리 안내로 간다', (message) => {
    failure.message = message;
    expect(() => readDwg(file)).toThrow(RangeError);
    expect(openErrorInfo('internal', message).code).toBe('memory');
  });

  it('형식 밖의 크기는 손상이다', () => {
    failure.message = 'Invalid typed array length: 1152921504606846976';
    expect(() => readDwg(file)).toThrow(CadReadError);
  });
});
