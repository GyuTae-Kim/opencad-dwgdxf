/**
 * 도면을 열지 못했을 때의 안내(순수 함수): 무엇이 문제인지(message)와 무엇을 하면 되는지(hint).
 * code는 해석 엔진의 오류 코드(core/errors.ts의 CadErrorCode)나 앱이 붙인 코드(size_limit·read·worker·worker_load·internal)다.
 * 문구는 사전(site/locales)에 그대로 있는 문장이어야 다른 언어에서도 옮겨진다 — 그래서 이름·문제·할 일을 " — "와 줄바꿈으로 나눠 잇는다.
 */
import { errorMessage, type CadErrorCode } from '../core/errors';

export interface OpenErrorInfo {
  code: string;
  message: string;
  hint: string;
}

/** 앱이 여는 가장 큰 파일(그보다 크면 읽지 않고 알린다) */
export const OPEN_MAX_BYTES = 512 * 1024 * 1024;

const ENGINE_CODES = new Set<string>(['file.empty', 'file.unrecognized', 'file.too_large', 'dxf.invalid', 'dwg.unsupported_version', 'dwg.corrupt', 'dwg.encrypted']);

const HINTS: Record<string, string> = {
  'file.empty': '내려받기나 복사가 끝까지 되었는지 확인한 뒤 다시 여십시오.',
  'file.unrecognized': 'DWG·DXF 도면만 열 수 있습니다. 확장자만 바꾼 파일은 열리지 않으며, SKP·STEP·NC 파일은 OpenCAD의 다른 도구로 여십시오.',
  'file.too_large': '쓰지 않는 블록·도면층을 지우거나(PURGE) 도면을 나눠 저장한 뒤 다시 여십시오.',
  size_limit: '쓰지 않는 블록·도면층을 지우거나(PURGE) 도면을 나눠 저장한 뒤 다시 여십시오.',
  'dxf.invalid': '저장하다 끊긴 파일일 수 있습니다. 원래 프로그램에서 DXF나 DWG로 다시 저장한 뒤 여십시오.',
  'dwg.unsupported_version': 'DWG는 R13~R2018 형식을 엽니다(AutoCAD 2018 이후 버전도 이 형식으로 저장합니다). 원래 프로그램에서 R2018 이하 DWG나 DXF로 다시 저장한 뒤 여십시오.',
  'dwg.corrupt': '원래 프로그램의 복구(RECOVER) 기능으로 고쳐 다시 저장하거나 DXF로 저장한 뒤 여십시오.',
  'dwg.encrypted': '원래 프로그램에서 암호를 해제하고 다시 저장한 뒤 여십시오.',
  worker: '파일이 너무 크거나 기기 메모리가 모자랄 수 있습니다. 다른 탭을 닫고 다시 열거나 컴퓨터에서 여십시오.',
  memory: '파일이 너무 크거나 기기 메모리가 모자랄 수 있습니다. 다른 탭을 닫고 다시 열거나 컴퓨터에서 여십시오.',
  worker_load: '인터넷 연결을 확인한 뒤 페이지를 새로 고치십시오.',
  read: '파일을 다른 곳으로 옮기거나 지우지 않았는지 확인한 뒤 다시 고르십시오.',
  internal: '원래 프로그램에서 DXF로 다시 저장해 여십시오. 그래도 열리지 않으면 GitHub 이슈로 알려 주십시오.',
};

/** 오류 코드와 엔진이 보낸 문구로 안내를 만든다 */
export function openErrorInfo(code: string, detail = ''): OpenErrorInfo {
  if (ENGINE_CODES.has(code)) return { code, message: errorMessage(code as CadErrorCode), hint: HINTS[code]! };
  if (code === 'size_limit') return { code, message: '512MB보다 큰 파일은 열 수 없습니다.', hint: HINTS.size_limit! };
  if (code === 'worker') return { code, message: '도면을 읽던 작업이 멈췄습니다.', hint: HINTS.worker! };
  if (code === 'read') return { code, message: '파일을 읽지 못했습니다.', hint: HINTS.read! };
  if (code === 'worker_load') return { code, message: '도면 처리 모듈을 불러오지 못했습니다.', hint: HINTS.worker_load! };
  // 메모리 할당 실패(아주 큰 파일)는 엔진 안에서 잡혀 일반 오류로 온다
  if (/allocation failed|out of memory|invalid array length|maximum call stack/i.test(detail)) return { code: 'memory', message: '메모리가 모자라 도면을 열지 못했습니다.', hint: HINTS.memory! };
  return { code: 'internal', message: detail ? `파일을 열지 못했습니다: ${detail}` : '파일을 열지 못했습니다.', hint: HINTS.internal! };
}

/** 알림·명령행에 쓸 한 덩어리 글(이름 — 문제, 다음 줄에 할 일) */
export function openErrorText(name: string, info: OpenErrorInfo): string {
  return `${name} — ${info.message}\n${info.hint}`;
}
