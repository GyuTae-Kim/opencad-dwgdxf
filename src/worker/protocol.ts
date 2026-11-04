/** 메인 스레드 ↔ 엔진 워커 메시지 */
import type { CadDocument } from '../core/model';
import type { DisplayList, PackedBoxes } from '../render/displaylist';
import type { LayerState, StyleSpec } from '../render/styles';
import type { WireOp } from './editwire';
import type { DocPart } from './doctransfer';
import type { Encoded } from './codec';
import type { PartialScene } from '../render/build';

export type ToWorker =
  | { type: 'init'; fontBase: string }
  /** view: 그림 영역 크기(CSS 픽셀) — 점진 빌드의 첫 화면을 정한다 */
  | { type: 'open'; id: number; name: string; data: ArrayBuffer; view?: { width: number; height: number } }
  /** ltFactor: 선종류 배율(PSLTSCALE), annoScale·annoAllVisible: 주석 축척 표현(배치 뷰포트의 모형 장면) */
  | { type: 'build'; id: number; docId: number; space: string; ltFactor?: number; annoScale?: string | null; annoAllVisible?: boolean }
  /** 메인에서 적용한 편집을 워커 문서에도 적용한다(응답 없음, 전송 형식은 editwire.ts) */
  | { type: 'edit'; docId: number; ops: WireOp[] }
  /** 큰 편집(작업 ENCODE_MIN_OPS개 이상)은 묶음 부호화해 버퍼를 옮긴다(editwire.ts encodeWire) */
  | { type: 'editEncoded'; docId: number; enc: Encoded }
  | { type: 'close'; docId: number }
  /** 워커가 편집을 적용하지 못했을 때(editFailed) 메인 문서로 바꾼다 */
  | { type: 'replace'; docId: number; doc: CadDocument }
  /** 메인에서 만든 문서(새 도면)를 받아 장면을 만든다 */
  | { type: 'adopt'; id: number; name: string; doc: CadDocument }
  /** 파일이 연결된 래스터 이미지 열쇠(장면에 이미지 그리기를 넣는다) */
  | { type: 'images'; keys: string[]; pdfPages?: [string, number, number][] }
  | { type: 'hide'; docId: number; handles: string[] }
  /** 사용자가 불러온 SHX 글꼴(문자 그리기에 쓴다). clear면 먼저 모두 지운다 */
  | { type: 'shx'; files: { name: string; data: ArrayBuffer }[]; clear?: boolean }
  /** 워커 문서를 파일로 쓴다 */
  | { type: 'save'; id: number; docId: number; format: SaveFormat; version: string; binary?: boolean };

export type SaveFormat = 'dxf' | 'dwg';

export interface PreviewView {
  rect: [number, number, number, number];
  margin: number;
}

export interface SceneMessage {
  list: DisplayList;
  /** 워커가 보낼 때 객체 상자(list.entities)를 형식 배열로 묶은 것. 메인(engine.ts)이 받자마자 list.entities로 푼다 */
  boxes?: PackedBoxes;
  styles: StyleSpec[];
  layers: LayerState[];
  layerIndex: [string, number][];
  warnings: { code: string; count: number }[];
  ms: number;
  /** 주석 객체 수 */
  annotative?: number;
}

export type FromWorker =
  | { type: 'progress'; id: number; stage: 'read' | 'fonts' | 'build' | 'document'; fraction: number }
  /** 문서(장면 뒤에 온다). streamed가 있으면 doc은 그 블록들의 객체를 뺀 껍데기이고, 뒤따르는 docpart로 채운다([블록 열쇠, 객체 수]) */
  | { type: 'document'; id: number; docId: number; doc: CadDocument; readMs: number; streamed: [string, number][] }
  | { type: 'docpart'; id: number; part: DocPart }
  | { type: 'scene'; id: number; docId: number; space: string; scene: SceneMessage }
  /** 점진 빌드의 미리 보기 조각(모형 공간). view: 첫 화면(맞춰 보일 사각형과 여백), 대표점이 없으면 null */
  | { type: 'partial'; id: number; part: PartialScene; view: PreviewView | null }
  | { type: 'saved'; id: number; data: ArrayBuffer; warnings: { code: string; message: string; count?: number; detail?: Record<string, unknown> }[]; ms: number }
  | { type: 'error'; id: number; code: string; message: string }
  /** 편집을 적용하지 못했다(그 문서는 메인이 replace로 다시 보낼 때까지 편집·저장을 받지 않는다 — 80차) */
  | { type: 'editFailed'; docId: number; message: string };
