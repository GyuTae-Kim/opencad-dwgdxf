/**
 * DWG 비교 기준 만들기(로컬 개발 전용).
 * DWG 기준 도구(CAD_DWG_ORACLE 모듈의 read_dwg)를 블랙박스로만 불러 DWG를 같은 핸들의 DXF로 바꾸고,
 * 그 DXF를 ezdxf로 요약한다. 결과는 .runtime/oracle-dxf, .runtime/oracle에 캐시한다(설정은 tests/oracle/ezdxf.ts).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
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

/**
 * 기준 도구가 바꾼 DXF 경로(캐시에 없으면 만든다). 캐시에 없고 기준 도구도 없으면 null.
 * 여러 시험 파일(워커)이 같은 도면의 DXF를 함께 만들 수 있어, 임시 폴더에 다 쓴 뒤 옮긴다
 * (그대로 쓰면 다른 워커가 쓰는 중인 빈 파일을 읽는다 — 캐시가 빈 채로 전체 시험을 돌릴 때 "빈 파일입니다"로 실패했다).
 * 캐시 폴더의 .dxf는 쓰기 시험의 원본으로도 쓰이므로(writer-fixtures.ts) 임시 파일은 하위 폴더에 둔다.
 */
export function engineDxf(dwgPath: string): string | null {
  const base = basename(dwgPath).replace(/\.dwg$/i, '').replace(/ /g, '_');
  const out = join(DXF_CACHE, `${base}.dxf`);
  if (existsSync(out)) return out;
  if (!hasDwgOracle()) return null;
  mkdirSync(join(DXF_CACHE, 'tmp'), { recursive: true });
  const tmp = join(DXF_CACHE, 'tmp', `${process.pid}-${base}.dxf`);
  try {
    execFileSync(DWG_PYTHON, ['-I', '-c', ENGINE, dwgPath, tmp], { stdio: 'pipe', timeout: 120_000 });
    renameSync(tmp, out);
  } catch {
    rmSync(tmp, { force: true });
    return null;
  }
  return existsSync(out) ? out : null;
}
