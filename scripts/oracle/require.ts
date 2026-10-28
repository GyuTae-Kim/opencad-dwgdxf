/**
 * `npm run test:oracle`의 앞 단계: 로컬 대조 자료(환경 변수 — 설정은 tests/oracle/ezdxf.ts)를 모두 쓸 수 있는지 확인한다.
 * 하나라도 쓸 수 없으면 무엇이 없는지 알리고 1로 끝난다. `npm test`는 이때 대조 시험을 조용히 건너뛰므로,
 * 대조 시험이 실제로 돌았는지 이 단계로 보장한다(10차의 스플라인 대조 실패가 이렇게 숨었다).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DWG_ORACLE, FIXTURES, PYTHON, hasDwgOracle, hasPython } from '../../tests/oracle/ezdxf';

const missing: string[] = [];
if (!hasPython) missing.push(`CAD_PYTHON: ezdxf를 불러오는 파이썬이 아닙니다${PYTHON ? '' : '(값 없음)'}`);
if (!existsSync(join(FIXTURES, 'samples'))) missing.push('CAD_FIXTURES: samples/ 폴더가 있는 표본 폴더가 아닙니다');
if (!hasDwgOracle()) missing.push(`CAD_DWG_ORACLE: read_dwg를 불러오지 못합니다${DWG_ORACLE ? '' : '(값 없음)'}. 모듈이 다른 파이썬에 있으면 CAD_DWG_PYTHON도 줍니다`);
if (missing.length) {
  console.error(`로컬 대조 자료를 쓸 수 없어 시험을 돌리지 않습니다(README 개발 절):\n- ${missing.join('\n- ')}`);
  process.exit(1);
}
console.log('로컬 대조 자료: ezdxf, DWG 기준 도구, 표본 폴더를 모두 씁니다');
