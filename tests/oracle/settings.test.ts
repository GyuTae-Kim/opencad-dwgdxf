/**
 * 로컬 대조 설정(tests/oracle/ezdxf.ts): 경로·모듈 이름은 환경 변수로만 받고, ezdxf·DWG 기준 도구는 실제로 불러올 수 있을 때만 켠다.
 * 가짜 파이썬(받은 코드에 든 글로 성공·실패를 정하는 셸 스크립트)으로 확인한다.
 */
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'oracle-settings-'));
/** -I -c <코드>로 불렸을 때 코드에 pattern이 있으면 0, 없으면 1로 끝나는 가짜 파이썬 */
function fakePython(name: string, pattern: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\ncase "$3" in\n  *'${pattern}'*) exit 0 ;;\n  *) exit 1 ;;\nesac\n`);
  chmodSync(path, 0o755);
  return path;
}
const VARS = ['CAD_PYTHON', 'CAD_FIXTURES', 'CAD_DWG_ORACLE', 'CAD_DWG_PYTHON'] as const;

async function load(env: Partial<Record<(typeof VARS)[number], string>>) {
  vi.resetModules();
  for (const name of VARS) vi.stubEnv(name, env[name] ?? '');
  return import('./ezdxf');
}

afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('로컬 대조 설정', () => {
  it('아무것도 주지 않으면 모두 꺼지고, 표본 폴더는 없는 곳이다', async () => {
    const o = await load({});
    expect(o.PYTHON).toBe('');
    expect(o.hasPython).toBe(false);
    expect(o.hasDwgOracle()).toBe(false);
    expect(existsSync(o.FIXTURES)).toBe(false);
  });

  it('파이썬이 있어도 ezdxf를 불러오지 못하면 ezdxf 대조는 꺼진다', async () => {
    const o = await load({ CAD_PYTHON: fakePython('no-ezdxf', 'never-matches') });
    expect(o.hasPython).toBe(false);
  });

  it('ezdxf를 불러오면 켜지고, 기준 도구는 모듈 이름을 준 때만 그 파이썬으로 확인한다', async () => {
    const python = fakePython('with-ezdxf', 'import ezdxf');
    let o = await load({ CAD_PYTHON: python, CAD_FIXTURES: dir });
    expect(o.hasPython).toBe(true);
    expect(o.FIXTURES).toBe(dir);
    expect(o.hasDwgOracle()).toBe(false);
    // 모듈 이름이 있으면 그 이름으로 read_dwg를 들여오는 코드를 돌린다(CAD_DWG_PYTHON이 없으면 CAD_PYTHON으로)
    const oracle = fakePython('with-oracle', '"cad_ref.io"');
    o = await load({ CAD_PYTHON: python, CAD_DWG_ORACLE: 'cad_ref.io', CAD_DWG_PYTHON: oracle });
    expect(o.DWG_PYTHON).toBe(oracle);
    expect(o.READ_DWG_IMPORT).toContain('importlib.import_module("cad_ref.io").read_dwg');
    expect(o.hasDwgOracle()).toBe(true);
    o = await load({ CAD_PYTHON: python, CAD_DWG_ORACLE: 'cad_ref.io' });
    expect(o.DWG_PYTHON).toBe(python);
    expect(o.hasDwgOracle()).toBe(false);
  });

  it('모듈 이름이 파이썬 이름 꼴이 아니면 돌려 보지 않고 끈다', async () => {
    const python = fakePython('any', 'import');
    const o = await load({ CAD_PYTHON: python, CAD_DWG_ORACLE: 'x; import os' });
    expect(o.hasDwgOracle()).toBe(false);
  });
});
