/** 훑기 결과 기록(records.jsonl 한 줄)의 꼴 — 워커가 만들고 요약·비교가 읽는다 */

export type Tally = Record<string, number>;

export interface StepError {
  /** 예외 이름과 글(숫자는 그대로 — 묶을 때 #으로 바꾼다) */
  err: string;
  /** 첫 호출 위치(src/… 상대 경로) */
  at?: string;
  /** CadReadError 코드 */
  code?: string;
}

export interface SpaceRecord {
  space: string;
  ok: boolean;
  ms: number;
  segs?: number;
  tris?: number;
  nan?: number;
  warn?: Tally;
  error?: StepError;
}

export interface RereadRecord {
  ok: boolean;
  ms: number;
  version?: string;
  warn?: Tally;
  error?: StepError;
  /** 종류별 개수 차이(다시 읽은 것 − 원본) */
  countDelta?: Tally;
  /** 객체(OBJECTS) 종류별 개수 차이 */
  objDelta?: Tally;
  /** 원본 핸들 중 다시 읽은 것에 없는 수 */
  missing?: number;
  /** 다시 읽은 것에만 있는 핸들 수 */
  extra?: number;
  /** 핸들로 맞춘 값 차이: "종류.속성" → 객체 수 */
  fieldDiffs?: Tally;
  /** 값 차이 보기(종류.속성마다 첫 하나) */
  samples?: Record<string, unknown>;
  layersLost?: string[];
  blocksLost?: string[];
}

export interface WriteRecord {
  ok: boolean;
  ms: number;
  size?: number;
  warn?: Tally;
  /** 쓰기 경고의 detail(코드별 첫 하나, 짧게) */
  detail?: Record<string, unknown>;
  error?: StepError;
  reread?: RereadRecord;
}

export interface OracleRecord {
  A?: import('./oracle').OracleDiff;
  B?: import('./oracle').OracleDiff;
  C?: import('./oracle').OracleDiff;
}

export interface FileRecord {
  /** 내용 sha256 */
  key: string;
  /** 로컬 경로(결과 폴더 밖으로 옮기지 않는다) */
  path: string;
  ext: string;
  size: number;
  dups: number;
  /** 머리로 짐작한 판 */
  sniff: string;
  /** 워커가 죽거나(EXIT) 시간이 넘은(TIMEOUT) 파일 */
  fatal?: string;
  read?: { ok: boolean; ms: number; warn?: Tally; error?: StepError };
  /** 읽은 판(AC1009~AC1032) */
  version?: string;
  /** dxf · dxf-binary · dwg */
  format?: string;
  nEnt?: number;
  nLayers?: number;
  nBlocks?: number;
  nLayouts?: number;
  counts?: Tally;
  scene?: { ms: number; spaces: SpaceRecord[]; error?: StepError };
  /** 장면이나 쓰기가 문서를 바꿨는지 */
  mutated?: string[];
  /** 대상 열쇠(dxf-AC1032, dwg-AC1032, dwg-AC1015, 같은 판) → 결과 */
  writes?: Record<string, WriteRecord>;
  oracle?: OracleRecord;
  ms: number;
}
