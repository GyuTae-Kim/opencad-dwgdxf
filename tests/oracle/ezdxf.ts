/**
 * 로컬 대조 시험의 설정과 ezdxf 요약(로컬 개발 전용). 경로·모듈 이름은 저장소에 두지 않고 환경 변수로만 받는다.
 * 값이 없거나 쓸 수 없으면 그 대조 시험은 건너뛴다(CI와 같다).
 * - CAD_PYTHON: ezdxf를 불러올 수 있는 파이썬 실행 파일(ezdxf 대조)
 * - CAD_FIXTURES: 표본 도면 폴더(samples·samples-dxf·all-samples·templates 등, 읽기만)
 * - CAD_DWG_ORACLE: read_dwg(bytes)를 내보내는 파이썬 모듈 이름(DWG 기준 도구 대조 — 블랙박스로 부른다)
 * - CAD_DWG_PYTHON: 그 모듈을 불러올 수 있는 파이썬(없으면 CAD_PYTHON). 기준 도구와 ezdxf가 다른 환경에 있을 때만 준다
 * 요약 결과는 .runtime/oracle에 캐시한다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodeCaret } from '../../src/io/dxf/records';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CACHE = join(ROOT, '.runtime/oracle');

/** ezdxf가 있는 파이썬(CAD_PYTHON, 없으면 빈 글) */
export const PYTHON = process.env.CAD_PYTHON ?? '';
/** 표본 도면 폴더(CAD_FIXTURES). 주지 않으면 없는 폴더라 표본을 쓰는 시험은 모두 건너뛴다 */
export const FIXTURES = process.env.CAD_FIXTURES || join(ROOT, '.runtime/no-cad-fixtures');
/** read_dwg를 내보내는 모듈 이름(CAD_DWG_ORACLE, 없으면 빈 글) */
export const DWG_ORACLE = process.env.CAD_DWG_ORACLE ?? '';
/** 그 모듈을 부를 파이썬(CAD_DWG_PYTHON, 없으면 CAD_PYTHON) */
export const DWG_PYTHON = process.env.CAD_DWG_PYTHON || PYTHON;

/** python으로 code를 돌려 오류 없이 끝나는지(파이썬이 없거나 실패하면 false) */
function runs(python: string, code: string): boolean {
  if (!python || !existsSync(python)) return false;
  try {
    execFileSync(python, ['-I', '-c', code], { stdio: 'ignore', timeout: 120_000 });
    return true;
  } catch {
    return false;
  }
}

/** ezdxf 대조를 할 수 있는지: CAD_PYTHON이 ezdxf를 실제로 불러올 때만 참 */
export const hasPython = runs(PYTHON, 'import ezdxf');

const MODULE_NAME = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;
/** 파이썬 코드 맨 앞에 두어 read_dwg를 들여오는 줄(모듈 이름은 CAD_DWG_ORACLE) */
export const READ_DWG_IMPORT = `import importlib\nread_dwg = importlib.import_module(${JSON.stringify(DWG_ORACLE)}).read_dwg`;

let dwgOracle: boolean | undefined;
/** DWG 기준 도구 대조를 할 수 있는지: 모듈 이름이 있고 DWG_PYTHON이 그 모듈의 read_dwg를 실제로 불러올 때만 참(처음 한 번 확인) */
export function hasDwgOracle(): boolean {
  dwgOracle ??= MODULE_NAME.test(DWG_ORACLE) && runs(DWG_PYTHON, `${READ_DWG_IMPORT}\nassert callable(read_dwg)`);
  return dwgOracle;
}

export function ezdxfSummary(dxfPath: string): unknown {
  const st = statSync(dxfPath);
  const key = createHash('sha1').update(`${dxfPath}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 12);
  mkdirSync(CACHE, { recursive: true });
  const out = join(CACHE, `${basename(dxfPath)}.${key}.json`);
  if (!existsSync(out)) {
    // 다른 워커가 같은 요약을 쓰는 중에 읽지 않게 임시 이름에 다 쓴 뒤 옮긴다
    const tmp = `${out}.${process.pid}.tmp`;
    try {
      execFileSync(PYTHON, ['-I', join(ROOT, 'scripts/oracle/ezdxf_dump.py'), dxfPath, tmp], { stdio: 'pipe' });
      renameSync(tmp, out);
    } finally {
      rmSync(tmp, { force: true });
    }
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
