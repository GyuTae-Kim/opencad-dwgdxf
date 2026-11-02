/**
 * 39차에서 임시 버퍼를 페이지마다 다시 쓰게 되었다. 앞 페이지가 푼 바이트가 짧게 풀린 뒤 페이지로 새어 들면 안 된다.
 */
import { describe, expect, it, vi } from 'vitest';
import { readR2004Container } from '../../src/io/dwg/container/r2004';
import { R2004 } from '../../src/io/dwg/version';
import { r2004Pages } from './corrupt35';

const pages = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/io/dwg/lz77', async (orig) => {
  const m = await orig<typeof import('../../src/io/dwg/lz77')>();
  return {
    ...m,
    // 시스템 페이지는 버퍼를 주지 않는다. 자료 페이지만 첫 페이지는 끝까지, 다음 페이지는 앞 4바이트만 푼 것처럼 쓴다
    decompressR18: (src: Uint8Array, start: number, end: number, size: number, out?: Uint8Array, at = 0) => {
      if (!out) return m.decompressR18(src, start, end, size);
      out.fill(0xaa, at, at + (pages.n++ === 0 ? size : 4));
      return out;
    },
  };
});

describe('R2004 임시 버퍼', () => {
  it('앞 페이지의 바이트가 짧게 풀린 뒤 페이지로 새지 않는다', () => {
    const sec = readR2004Container(r2004Pages(2, 512, 64, 2, [64, 16, 16]), R2004);
    expect(pages.n).toBe(2);
    expect([...sec.header.subarray(0, 6)]).toEqual([0xaa, 0xaa, 0xaa, 0xaa, 0, 0]);
    expect(sec.header.subarray(4).every((b) => b === 0)).toBe(true);
  });
});
