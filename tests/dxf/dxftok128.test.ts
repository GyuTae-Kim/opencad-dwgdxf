/**
 * 128차: ASCII DXF 바이트 토큰화기가 흔한 그룹 코드 줄(공백 + 숫자)과 실수 줄([-]숫자[.숫자])을 줄 끝을 찾으며 바로 푼 뒤에도,
 * 레코드(종류·코드·값)와 오류(줄 번호까지)가 예전 문자열 토큰화기 + 실수 규칙(127차까지의 바이트 토큰화기와 같은 규칙 — tests/perf/tokenizer.test.ts)과 같은지.
 */
import { describe, expect, it } from 'vitest';
import { codepageToEncoding } from '../../src/core/codepage';
import { CadReadError } from '../../src/core/errors';
import { openDxf, parseDecimalBytes, valueKind } from '../../src/io/dxf/records';

let seed = 5128;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const enc = new TextEncoder();

/** 문자열 토큰화기 값에 바이트 토큰화기의 실수 규칙을 입힌다 */
function fastNumber(v: string): string | number {
  const b = enc.encode(v);
  const n = parseDecimalBytes(b, 0, b.length);
  return n === n ? n : v;
}

function records(data: Uint8Array, legacy: boolean): unknown[] {
  const out: unknown[] = [];
  try {
    const src = openDxf(data, codepageToEncoding, { legacyText: legacy });
    for (let r = src.stream.next(); r; r = src.stream.next()) {
      const values = legacy ? r.values.map((v, i) => (typeof v === 'string' && valueKind(r.codes[i]!) === 'dbl' ? fastNumber(v) : v)) : r.values;
      out.push({ type: r.type, codes: r.codes, values });
    }
  } catch (e) {
    out.push(e instanceof CadReadError ? { error: e.code, detail: e.detail } : { other: String(e) });
  }
  return out;
}

const CODE_LINES = ['  0', '0', ' 10', '10', '  8', '  5', '330', '100', ' 20', ' 30', ' 40', ' 70', '1001', '1040', '   1', '  2'];
const ODD_CODES = ['\t10', '+10', '-5', '0010', '1234567890', '12345678901', ' 10 ', '10x', ' ', '', '\u{b}20', '999', 'XX', 'A1', '-', ' 1 0'];
const DOUBLES = ['1.5', '-2.25', '0', '-0', '0.0', '-0.0', '.5', '5.', '-.25', '007.100', '123456789012345.6', '9007199254740993', '1e5', '1.0E-3', '1,5', '', '-',
  '.', ' 2.5', '2.5 ', '\t3', '+1', '1.2.3', 'abc', '1.0000000000000000000000001', '-12345678901234567890', '3.14159265358979323846', '--1', '-.',
  '0.00000000000000000000001', '-0.000000000000000000000000', '1.0000000000000000000001'];
const STRINGS = ['LINE', 'AcDbEntity', 'Layer A', '2A', '^J^I', 'a^ b', '', '  ', 'SECTION', 'ENTITIES', 'ENDSEC'];
const DOUBLE_CODES = [10, 20, 30, 11, 21, 40, 41, 42, 50, 1040, 1010];

/** 무작위 ASCII DXF: 레코드 머리(0) 뒤에 흔한 줄·낯선 줄을 섞고, 줄 끝은 \n·\r\n·\r\r\n을 섞으며, 끝 줄바꿈이 없을 수도 있다 */
function randomDxf(): Uint8Array {
  const lines: string[] = ['  0', 'SECTION', '  2', 'ENTITIES'];
  const tags = 1 + Math.floor(rand() * 60);
  for (let t = 0; t < tags; t++) {
    const r = rand();
    if (r < 0.1) lines.push(pick(['  0', '0']), pick(['LINE', 'CIRCLE', 'TEXT']));
    else if (r < 0.55) {
      const c = pick(DOUBLE_CODES);
      lines.push((rand() < 0.7 ? ' ' : '') + c, rand() < 0.75 ? String((pick([1, -1]) * Math.floor(rand() * 1e6)) / pick([1, 10, 1000, 7])) : pick(DOUBLES));
    } else if (r < 0.8) lines.push(pick(CODE_LINES), pick(rand() < 0.5 ? STRINGS : DOUBLES));
    else if (r < 0.85) lines.push(pick(ODD_CODES), pick(STRINGS));
    else lines.push(pick(CODE_LINES), pick(DOUBLES));
  }
  if (rand() < 0.8) lines.push('  0', 'ENDSEC', '  0', 'EOF');
  let s = '';
  for (let i = 0; i < lines.length; i++) {
    s += lines[i];
    if (i < lines.length - 1 || rand() < 0.7) s += pick(['\n', '\n', '\r\n', '\r\r\n']);
  }
  return enc.encode(s);
}

describe('128차 ASCII DXF 토큰화기의 그룹 코드·실수 줄 바로 풀기', () => {
  it('무작위 DXF 3,000개: 레코드·오류가 예전 문자열 토큰화기 + 실수 규칙과 같다', () => {
    let errors = 0;
    let numbers = 0;
    for (let n = 0; n < 3000; n++) {
      const data = randomDxf();
      const a = records(data, true);
      const b = records(data, false);
      expect(b).toEqual(a);
      if (a.some((x) => (x as { error?: string }).error)) errors++;
      for (const x of b) numbers += ((x as { values?: unknown[] }).values ?? []).filter((v) => typeof v === 'number').length;
    }
    // 잘못된 그룹 코드로 끝나는 경우와 수로 푼 실수가 넉넉히 있어야 두 길을 모두 견준 것이다
    expect(errors).toBeGreaterThan(100);
    expect(numbers).toBeGreaterThan(10000);
  });

  it('흔한 꼴: 실수 값이 수로, -0은 -0, 2^53 넘는 가수·소수 23자리는 글로', () => {
    const body = ['  0', 'SECTION', '  2', 'ENTITIES', '  0', 'LINE', ' 10', '-0', ' 20', '90071992547409930', ' 30', '0.00000000000000000000001', ' 11', '-1.5', '  0', 'EOF', ''].join('\r\n');
    const rec = (records(enc.encode(body), false) as { type: string; values: unknown[] }[]).find((r) => r.type === 'LINE')!;
    expect(Object.is(rec.values[0], -0)).toBe(true);
    expect(rec.values.slice(1)).toEqual(['90071992547409930', '0.00000000000000000000001', -1.5]);
  });
});
