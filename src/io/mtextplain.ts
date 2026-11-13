/**
 * MTEXT 글 도우미(DXF 쓰기·여러 줄 속성 기록 쓰기 공용). 124차에 dxf/wconvert.ts·dxf/wentities.ts에서 옮겼다 —
 * DWG 쓰기(워커 첫 조각)가 여러 줄 속성 기록(`mlattr-write.ts`)을 쓰려고 DXF 쓰기 조각 전체를 끌어오지 않게.
 */

/** MTEXT 서식 코드를 걷어 낸 줄 목록 */
export function mtextPlainLines(src: string): string[] {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '{' || ch === '}') continue;
    if (ch !== '\\' || i + 1 >= src.length) {
      out += ch;
      continue;
    }
    const c = src[i + 1]!;
    if (c === 'P') {
      out += '\n';
      i++;
    } else if (c === '~') {
      out += ' ';
      i++;
    } else if (c === '\\' || c === '{' || c === '}') {
      out += c;
      i++;
    } else if ('LlOoKkX'.includes(c)) {
      i++;
    } else if ('ACcFfHhQTWp'.includes(c)) {
      const j = src.indexOf(';', i + 2);
      i = j < 0 ? src.length : j;
    } else if (c === 'S') {
      const j = src.indexOf(';', i + 2);
      const body = src.slice(i + 2, j < 0 ? src.length : j);
      out += body.replace(/[\^#]/g, '/');
      i = j < 0 ? src.length : j;
    } else {
      out += ch;
    }
  }
  return out.split('\n');
}

/**
 * MTEXT 본문을 250자 조각으로(서로게이트 쌍을 자르지 않고, R2007 이전은 비ASCII를 7바이트로 보고 자른다).
 * 제어 문자와 ^는 파일에서 캐럿 표기 두 글자가 되므로 2로 센다.
 */
export function textChunks(text: string, utf8: boolean): string[] {
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let ch = text[i]!;
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      ch += text[i + 1]!;
      i++;
    }
    const n = c < 0x20 || c === 0x5e ? 2 : utf8 ? ch.length : c < 0x80 ? 1 : 7 * ch.length;
    if (size + n > 250) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out;
}
