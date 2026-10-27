/**
 * DWG 비교 기준 만들기(로컬 개발 전용).
 * DWG 기준 도구(CAD_DWG_ORACLE 모듈의 read_dwg)를 블랙박스로만 불러 DWG를 같은 핸들의 DXF로 바꾸고,
 * 그 DXF를 ezdxf로 요약한다. 결과는 .runtime/oracle-dxf, .runtime/oracle에 캐시한다(설정은 tests/oracle/ezdxf.ts).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DWG_PYTHON, FIXTURES, READ_DWG_IMPORT, hasDwgOracle, hasPython } from '../oracle/ezdxf';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DXF_CACHE = join(ROOT, '.runtime/oracle-dxf');

export { FIXTURES, hasDwgOracle, hasPython };

/** 비교할 DWG 목록(그룹/이름) */
export function dwgFixtures(): { group: string; name: string; path: string }[] {
  const out: { group: string; name: string; path: string }[] = [];
  for (const group of ['samples', 'all-samples', 'templates']) {
    const dir = join(FIXTURES, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.toLowerCase().endsWith('.dwg')) continue;
      // all-samples의 sample_*는 samples와 같은 파일이다
      if (group === 'all-samples' && name.startsWith('sample_')) continue;
      const path = join(dir, name);
      if (existsSync(path)) out.push({ group, name, path });
    }
  }
  return out;
}

const ENGINE = `
import sys
${READ_DWG_IMPORT}
r = read_dwg(open(sys.argv[1], 'rb').read())
r.doc.saveas(sys.argv[2])
`;

/** 기준 도구가 바꾼 DXF 경로(캐시에 없으면 만든다). 캐시에 없고 기준 도구도 없으면 null */
export function engineDxf(dwgPath: string): string | null {
  const base = basename(dwgPath).replace(/\.dwg$/i, '').replace(/ /g, '_');
  const out = join(DXF_CACHE, `${base}.dxf`);
  if (existsSync(out)) return out;
  if (!hasDwgOracle()) return null;
  mkdirSync(DXF_CACHE, { recursive: true });
  try {
    execFileSync(DWG_PYTHON, ['-I', '-c', ENGINE, dwgPath, out], { stdio: 'pipe', timeout: 120_000 });
  } catch {
    return null;
  }
  return existsSync(out) ? out : null;
}
