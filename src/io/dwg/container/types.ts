import type { ReadWarning } from '../../../core/model';

/**
 * 버전별 파일 구조를 풀어 낸 결과. 이후 단계(헤더·클래스·객체 읽기)는 이 형태만 본다.
 */
export interface DwgSections {
  ver: number;
  /** 파일 헤더의 코드 페이지 번호 */
  codepage: number;
  /** 유지보수 버전(0x0B) */
  maintVer: number;
  /** AcDb:Header(시작 표지 포함) */
  header: Uint8Array;
  /** AcDb:Classes(시작 표지 포함) */
  classes: Uint8Array | null;
  /** AcDb:Handles(객체 지도) */
  handles: Uint8Array;
  /** 객체 자료. R2000 이하는 파일 전체(객체 지도의 위치가 파일 절대 주소) */
  objects: Uint8Array;
  /** AcDb:Template(MEASUREMENT) */
  template?: Uint8Array | null;
  /** AcDb:SummaryInfo(R2004+) */
  summaryInfo?: Uint8Array | null;
  /** R2013+ 자료 저장소(AcDb:AcDsPrototype_1b: ACIS 형상 등). 해석하지 않고 같은 버전으로 되쓸 때 그대로 둔다 */
  dataStore?: { data: Uint8Array; compressed: boolean; pageSize: number } | null;
  /** 보안 플래그(R2004+) */
  securityFlags?: number;
  warnings: ReadWarning[];
}

export function warn(list: ReadWarning[], code: string, message: string, detail?: Record<string, unknown>): void {
  const w = list.find((x) => x.code === code && x.message === message);
  if (w) {
    w.count = (w.count ?? 1) + 1;
    return;
  }
  list.push(detail ? { code, message, count: 1, detail } : { code, message, count: 1 });
}
