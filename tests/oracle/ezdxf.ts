/** ezdxf 요약을 만들어 .runtime/oracle에 캐시한다(로컬 개발 전용). */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodeCaret } from '../../src/io/dxf/records';

export const PYTHON = process.env.CAD_PYTHON ?? '/opt/homebrew/Caskroom/miniconda/base/envs/prisme-engine314/bin/python';
export const FIXTURES = process.env.CAD_FIXTURES ?? '/Users/sean/code/prisme-service/.runtime/cad2d-handoff/dwgref';
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CACHE = join(ROOT, '.runtime/oracle');

export const hasPython = existsSync(PYTHON);

export function ezdxfSummary(dxfPath: string): unknown {
  const st = statSync(dxfPath);
  const key = createHash('sha1').update(`${dxfPath}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 12);
  mkdirSync(CACHE, { recursive: true });
  const out = join(CACHE, `${basename(dxfPath)}.${key}.json`);
  if (!existsSync(out)) {
    execFileSync(PYTHON, ['-I', join(ROOT, 'scripts/oracle/ezdxf_dump.py'), dxfPath, out], { stdio: 'pipe' });
  }
  return decodeStrings(JSON.parse(readFileSync(out, 'utf8')));
}

/** ezdxf는 DXF 문자열의 캐럿 표기(^J, "^ ")를 그대로 두고 우리 리더는 푼다 → 기준 쪽 문자열도 푼다 */
function decodeStrings(v: unknown): unknown {
  if (typeof v === 'string') return decodeCaret(v);
  if (Array.isArray(v)) return v.map(decodeStrings);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [decodeCaret(k), decodeStrings(x)]));
  return v;
}
