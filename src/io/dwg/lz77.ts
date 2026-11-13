/** R2004 계열 압축 풀기(사양 4.7, LZ77 변형) */
import { DwgFormatError } from './bitstream';

/** 이보다 짧은 글자 줄·되풀이는 바이트씩 옮긴다(subarray·copyWithin 부르기가 더 비싸다) */
const SHORT_COPY = 32;

/**
 * src[start..end)를 풀어 정확히 outSize 바이트를 돌려준다(남는 칸은 0).
 * out을 주면 그 버퍼의 outOffset부터 쓴다.
 *
 * 127차: 읽는 자리·쓰는 자리를 함수 안 변수로만 두었다(전에는 닫힘 셋이 함께 써서 그 변수들이 문맥 객체에 있었다).
 * 짧은 글자 줄은 바이트씩, 겹치지 않는 긴 되풀이는 copyWithin으로 옮긴다. 풀린 바이트·오류는 전과 같다(tests/dwg/dwgread127.test.ts)
 */
export function decompressR18(
  src: Uint8Array,
  start: number,
  end: number,
  outSize: number,
  out?: Uint8Array,
  outOffset = 0,
): Uint8Array {
  const dst = out ?? new Uint8Array(outSize);
  const dstEnd = outOffset + outSize;
  const srcLen = src.length;
  let o = outOffset;
  let i = start;

  // 첫 글자 줄 길이
  let lit: number;
  {
    const b = src[i];
    if (b === 0) {
      i++;
      let total = 0x0f;
      let c: number;
      while ((c = src[i++]) === 0) {
        total += 0xff;
        if (i >= end) break;
      }
      lit = total + c + 3;
    } else if (b < 0x10) {
      i++;
      lit = b + 3;
    } else lit = 0;
  }
  for (;;) {
    // 글자 줄 옮기기(lit 바이트, 출력·입력 끝에서 자른다)
    {
      let m = lit;
      if (o + m > dstEnd) m = dstEnd - o;
      if (i + m > end) m = end - i;
      if (m > 0) {
        if (m < SHORT_COPY && i + m <= srcLen) {
          for (let k = 0; k < m; k++) dst[o + k] = src[i + k]!;
        } else dst.set(src.subarray(i, i + m), o);
        o += m;
      }
      i += lit;
    }
    if (!(i < end)) break;
    const op1 = src[i++];
    if (op1 === 0x11) break;
    let compBytes: number;
    let compOffset: number;
    if (op1 >= 0x40) {
      compBytes = (op1 >> 4) - 1;
      const op2 = src[i++];
      compOffset = (op2 << 2) | ((op1 & 0x0c) >> 2);
      lit = op1 & 3;
    } else if (op1 >= 0x21) {
      compBytes = op1 - 0x1e;
      const a = src[i++];
      const b = src[i++];
      compOffset = (a >> 2) | (b << 6);
      lit = a & 3;
    } else if (op1 === 0x20 || op1 >= 0x10) {
      // 긴 길이(0x20, 또는 0x10~0x1F에서 아래 세 비트가 0): 0이 아닌 바이트가 나올 때까지 0xFF씩 더한다
      let longLen = 0;
      if (op1 === 0x20 || (op1 & 7) === 0) {
        let b = src[i++];
        if (b !== 0) longLen = b;
        else {
          let total = 0xff;
          while ((b = src[i++]) === 0) {
            total += 0xff;
            if (i >= end) break;
          }
          longLen = total + b;
        }
      }
      const a = src[i++];
      const b = src[i++];
      if (op1 === 0x20) {
        compBytes = longLen + 0x21;
        compOffset = (a >> 2) | (b << 6);
      } else {
        // 0x10~0x1F(0x11은 끝): 길이는 아래 세 비트(0이면 긴 길이), 비트 3은 거리에 0x4000을 더한다.
        // 거리가 0x7FFF를 넘는 것은 32KiB보다 큰 페이지 지도·섹션 지도뿐이다(실제 107MB DWG의 페이지 지도로 확인)
        compBytes = (op1 & 7) === 0 ? longLen + 9 : (op1 & 7) + 2;
        compOffset = ((a >> 2) | (b << 6)) + 0x3fff + ((op1 & 8) << 11);
      }
      lit = a & 3;
    } else {
      throw new DwgFormatError(`압축 자료의 잘못된 명령 0x${op1.toString(16)}`);
    }
    // 앞서 풀린 자료에서 복사(거리 = compOffset + 1, 길이가 거리보다 길 수 있다 — 그때는 바이트씩 앞에서부터)
    let from = o - compOffset - 1;
    if (from < outOffset) throw new DwgFormatError('압축 자료의 잘못된 거리');
    if (o + compBytes > dstEnd) compBytes = dstEnd - o;
    if (compBytes >= SHORT_COPY && compBytes <= compOffset + 1) {
      dst.copyWithin(o, from, from + compBytes);
      o += compBytes;
    } else for (let k = 0; k < compBytes; k++) dst[o++] = dst[from++];
    if (lit === 0) {
      const b = src[i];
      if (b === 0) {
        i++;
        let total = 0x0f;
        let c: number;
        while ((c = src[i++]) === 0) {
          total += 0xff;
          if (i >= end) break;
        }
        lit = total + c + 3;
      } else if (b < 0x10) {
        i++;
        lit = b + 3;
      } else lit = 0;
    }
  }
  return dst;
}
