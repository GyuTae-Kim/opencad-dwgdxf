/**
 * 앱 컨트롤러: 문서·화면·명령·선택·스냅을 묶는다.
 * 직접 조작 입력(AutoCAD 2026 기본 설정과 같게): 동적 입력 칸·상대 좌표(dyninput.ts), 객체 스냅 재지정(osnap-override.ts),
 * 연장선·평행 획득(snap.ts), 선택한 객체 끌어 옮기기(dragmove.ts), 올가미(lasso.ts), 오른쪽 클릭 메뉴(ctxmenu.ts),
 * Ctrl 단축키(keys.ts), 다기능 그립 메뉴·여러 핫 그립, Shift 임시 직교. 화면 이벤트는 view.ts가 넘긴다.
 * OPTIONS·시스템 변수(GRIPS·GRIPSIZE·APERTURE·AUTOSNAP·PICKFIRST·PICKADD·PICKAUTO·SELECTIONPREVIEW·SHORTCUTMENU …)는
 * settings에 읽어 두고 바뀌면 바로 다시 읽는다(settings.ts, sysvars.ts onSysvarChange). 화면은 view.prefs로 같은 값을 본다.
 */
import { currentUcs, dirToUcs, isWorld, toUcs, toWcs } from './ucs';
import { beginOpen, type InputKind } from 'opencad-site-kit/analytics';
import { viewportModel } from './psltscale';
import type { Entity, ViewportEntity } from '../core/model';
import { MODEL_SPACE, normalizeHandle, tableKey } from '../core/model';
import { formatLength } from '../core/units';
import { OutlineLibrary } from '../text/fonts';
import { TextEngine } from '../text/layout';
import { collectTextUsage } from '../text/collect';
import { EngineClient, EngineError, type OpenResult } from './engine';
import { openErrorInfo, openErrorText, type OpenErrorInfo } from './openerror';
import { LoadPreview } from './loadpreview';
import { DocState } from './docstate';
import { CadView, type OverlayGeom, type Pt, type SnapKind } from './view';
import { CommandLine, parsePointInput } from './commandline';
import type { MeasureResult } from './measure-result';
import { Picker } from './pick';
import { SELECT_HELP, SELECT_METHODS, SELECT_OPTIONS, runSelectMethod, selectMethodOf } from './selmethod';
import { DEFAULT_SNAPS, SNAP_NAMES, type SnapPoint, type ViewportSnap, findSnaps, mergeSnaps } from './snap';
import { type ViewportPick, geometryToPaper, layoutXfs, viewportPick, viewportSnaps } from './vpsnap';
import { coverBoxes } from './overlay-place';
import { type Acquired, type PolarTip, objectTrack, polarTrack } from './tracking';
import { type PolarSettings, angleBase, clockwise, otrackDirections, polarAddList, polarDirections, polarReference, shiftAcquire, trackAngleText } from './polar';
import { gripPoints } from '../edit/geom';
import { dynGrips, isDynamicReference } from '../edit/dynblock';
import { spaceTolerance } from '../render/build';
import { ask, closeMenu, keyboardControl, showMenu, toast } from './ui/dom';
import { kindName as entityKindName } from '../edit/extract';
import { EditManager } from './edits';
import { OverlayScene, type ViewportXf, layoutViewports, paperInfo } from './scene';
import { expandXrefBounds } from './refs';
import type { EditOp } from '../edit/session';
import { isEditableTable } from '../edit/table/entity';
import { type CommandFallback, type CommitHook, type ContextMenuItem, type ContextMenuMode, type ContextMenuProvider, type DblClickHandler, type EntityClickHandler, type GripMenuProvider, type InputFilter, type PendingInput, type PointFilter, type ResolvedPoint, bindCommitHooks } from './hooks';
import { cycleIsoPlane } from './viewtools-iso';
import { maximized } from './viewtools-vpmax';
import { DynInput, dynRelative } from './dyninput';
import { type Override, parseOverride, runPointOverride } from './osnap-override';
import { type ExtAnchor, findExtAnchor, segmentDirAt } from './snap';
import { DragGhost, type DropAction, commitDrag, dropMenuItems, pasteDragAsBlock, pressKind } from './dragmove';
import { Lasso } from './lasso';
import { CtrlTap, ctrlAction } from './keys';
import { commandLineMenu, commandMenu, idleMenu, osnapItems, showContextMenu } from './ctxmenu';
import { listGroups } from '../edit/util/groups';
import {
  type PickMode,
  type Settings,
  autoWindow,
  contextAction,
  gripHoverMenu,
  gripPickRadius,
  gripsOn,
  magnetCursor,
  objectTrackOn,
  pickMode,
  polarTrackOn,
  previewOn,
  readSettings,
  showSnapTip,
  showTrackTip,
  usePickfirst,
  withTracking,
} from './settings';
import { browserSysvar, browserSysvarText, onSysvarChange, setBrowserSysvar } from './sysvars';
import { COORDS_NOTE, coordsMode, coordsText, nextCoordsMode } from './coords';
import { optionValue } from './options';

export class CancelError extends Error {
  constructor() {
    super('취소');
  }
}

export interface Keyword {
  key: string;
  label: string;
}

/** 찍은 점의 객체 스냅(연관 치수 등). 결과의 snap이 null이면 스냅 없이 찍었거나 좌표를 입력한 것 */
export interface PointSnap {
  kind: SnapKind;
  handle?: string;
  handle2?: string;
  /** 지연된 접점(getPoint의 deferTan): point는 원·호 위 찍은 자리, 접점은 명령이 다음 점으로 구한다 */
  deferred?: boolean;
  /** 도면 공간에서 뷰포트에 보이는 모형 객체에 잡은 점(getPoint의 viewportSnaps — handle·handle2는 모형 객체): 그 뷰포트와 모형 좌표 */
  viewport?: ViewportSnap;
}

/**
 * 점 요청의 결과. 클릭으로 찍었으면 그때 누른 보조키(shift·ctrl, ⌘는 ctrl로)를 눌렀을 때만 true로 싣는다
 * (그립 복사의 Ctrl 간격 맞춤 등). 좌표 입력·스냅 재지정으로 만든 점에는 없다.
 * z: 좌표 입력(x,y,z·@ 상대 좌표·원통·구 좌표)·점 필터(.XY 등)가 정한 WCS Z. 없으면 Z를 주지 않은 점이다(3D 명령은 고도를 쓴다).
 * point는 늘 평면 좌표이고, 2D 명령은 z를 쓰지 않는다(평면 객체는 고도에 그린다)
 */
export type PointResult = { point: Pt; z?: number; snap?: PointSnap | null; shift?: boolean; ctrl?: boolean } | { keyword: string } | { text: string } | { enter: true };

interface PointRequest {
  kind: 'point';
  prompt: string;
  /** 기준점(z가 있으면 3D 명령의 기준점 — @ 상대 좌표가 그 Z를 잇는다) */
  base: (Pt & { z?: number }) | null;
  keywords: Keyword[];
  /** 끌기 미리보기. snap은 지금 커서가 잡은 객체 스냅(지연된 접점 미리보기 등) */
  rubber?: (p: Pt, snap?: PointSnap | null) => { pts: number[]; closed?: boolean; fill?: boolean; dashed?: boolean }[];
  ghost?: (p: Pt) => OverlayGeom[];
  /** 커서 툴팁 글(DIST 다중 점의 누적 거리). 객체 스냅·추적 툴팁이 먼저다 */
  tip?: (p: Pt) => string | null;
  /** 접점(TAN)을 지연된 접점으로 받는다(명령이 다음 점을 받은 뒤 접점을 구한다 — LINE·PLINE·XLINE·CIRCLE) */
  deferTan: boolean;
  /** 지연된 접점을 선에도 받는다(원을 그리는 명령) */
  deferTanLines: boolean;
  /** 이 요청에서만 쓰는 객체 스냅(객체 스냅이 꺼져 있어도 — CIRCLE Ttr·TTT의 접점). 찍은 곳에 없으면 다시 묻는다 */
  snaps: ReadonlySet<SnapKind> | null;
  /** Ctrl(⌘)을 눌렀다 떼면(그 사이 다른 키·클릭 없이) 이 키워드로 끝낸다(다기능 그립의 Ctrl 순환) */
  ctrlTap: string | null;
  /** 객체에 잡힌 스냅 점의 Z를 결과 z로(LINE·CIRCLE 중심·3D 명령 — AutoCAD OSNAPZ 0, 1이면 받지 않는다) */
  snapZ: boolean;
  /** 도면 공간에서 뷰포트에 보이는 모형 객체에도 스냅한다(DIST — vpsnap.ts) */
  viewportSnaps: boolean;
  allowText: boolean;
  /** 명령이 글을 받는다고 한 요청(allowText): 객체 스냅 재지정 이름도 글로 돌려준다 */
  freeText: boolean;
  /** 숫자만 입력하면 직접 거리 입력 대신 문자로 돌려준다(각도·축척 입력) */
  preferNumber: boolean;
  /** 이 입력을 기다리는 명령(실행의 취소 신호). 명령이 끝날 때 자기 요청만 치운다 */
  signal: AbortSignal;
  resolve: (r: PointResult) => void;
  reject: (e: unknown) => void;
}

/**
 * 객체를 고른 결과. shift: 고를 때 Shift를 누르고 있었는지(자르기·연장 전환 등).
 * viewport: 도면 공간에서 뷰포트에 보이는 모형 객체를 고른 것(getEntity의 viewportPick — handle은 모형 객체, point는 종이 좌표)
 */
export type EntityPick = { handle: string; point: Pt; shift?: boolean; viewport?: ViewportSnap };
export type EntityResult = EntityPick | { keyword: string } | { enter: true };
/** getEntity(…, { emptyPick: true })에서 빈 곳을 누르거나 좌표를 입력한 결과(point는 도면 좌표, 스냅 없음) */
export type EmptyPick = { point: Pt; empty: true; shift?: boolean };
/**
 * getEntity 옵션. emptyPick: 빈 곳 클릭·좌표 입력도 돌려받는다(EmptyPick).
 * viewportPick: 배치의 도면 공간에서 그 자리에 배치 객체가 없으면 단일 뷰포트에 보이는 모형 객체를 고른다(치수 명령 — vpsnap.viewportPick)
 */
export interface EntityOptions {
  emptyPick?: boolean;
  viewportPick?: boolean;
}

interface EntityRequest {
  kind: 'entity';
  prompt: string;
  keywords: Keyword[];
  emptyPick: boolean;
  viewportPick: boolean;
  signal: AbortSignal;
  resolve: (r: EntityResult | EmptyPick) => void;
  reject: (e: unknown) => void;
}

/** 객체 선택 중 한 번의 고르기(명령 취소 U가 되돌린다). removed: 바꾸기(PICKADD 0)로 빠진 것 */
interface SelectStep {
  handles: string[];
  mode: 'add' | 'remove';
  removed?: string[];
}

interface SelectRequest {
  kind: 'select';
  prompt: string;
  keywords: Keyword[];
  remove: boolean;
  /** 단일(SI): 한 번 고르면 끝 */
  single: boolean;
  /** 다중(M): 강조 없이 모아 두었다가 Enter로 더한다 */
  multiple: string[] | null;
  /** 이 선택 프롬프트에서 고른 단계(U) */
  history: SelectStep[];
  signal: AbortSignal;
  resolve: (r: { handles: string[] } | { keyword: string }) => void;
  reject: (e: unknown) => void;
}

type Request = PointRequest | EntityRequest | SelectRequest;

export type { CommitHook, ContextMenuItem, ContextMenuProvider, EntityClickHandler, InputFilter, PendingInput, PointFilter, ResolvedPoint } from './hooks';

/** 점 요청 옵션(CommandContext.getPoint) */
export interface PointOptions {
  /** 기준점(고무줄·@ 상대 좌표). z가 있으면(3D 명령) @ 상대 좌표가 그 Z를 잇는다 */
  base?: (Pt & { z?: number }) | null;
  keywords?: Keyword[];
  rubber?: PointRequest['rubber'];
  ghost?: PointRequest['ghost'];
  /** 커서 툴팁 글(객체 스냅 이름·추적 툴팁이 없을 때) */
  tip?: PointRequest['tip'];
  allowText?: boolean;
  preferNumber?: boolean;
  /** 접점 스냅을 지연된 접점으로 받는다 */
  deferTan?: boolean;
  /** 지연된 접점을 선에도 받는다(원을 그리는 명령) */
  deferTanLines?: boolean;
  /** 이 요청에서만 쓰는 객체 스냅(객체 스냅이 꺼져 있어도) */
  snaps?: SnapKind[];
  /** Ctrl을 눌렀다 떼면 이 키워드로 끝낸다 */
  ctrlTap?: string;
  /**
   * 객체에 잡힌 스냅 점(끝점·중간점·중심·교차점·근처점 등)의 Z를 결과 z로 받는다(LINE·CIRCLE 중심·3DPOLY·3DFACE — AutoCAD OSNAPZ 0).
   * OSNAPZ 1(App.osnapZ)이면 받지 않는다(지금 고도)
   */
  snapZ?: boolean;
  /**
   * 배치의 도면 공간에서 뷰포트에 보이는 모형 객체에도 스냅한다(도움말 "To Set Dimension Scale for Creating Dimensions in a Layout":
   * 도면 공간에서 객체 스냅으로 모형 공간 점에 스냅한다). 결과 snap.viewport에 그 뷰포트와 모형 좌표를 싣는다(DIST의 투영 거리)
   */
  viewportSnaps?: boolean;
}

export interface CommandContext {
  app: App;
  /** measure: 측정 결과 값(명령행 글은 그대로, 휴대폰 보기 모드의 결과 카드가 쓴다) */
  print(text: string, cls?: 'err' | 'res', measure?: MeasureResult): void;
  getPoint(prompt: string, opt?: PointOptions): Promise<PointResult>;
  getEntity(prompt: string, keywords?: Keyword[]): Promise<EntityResult>;
  /** viewportPick만: 도면 공간에서 뷰포트에 보이는 모형 객체도 고른다(결과의 viewport) */
  getEntity(prompt: string, keywords: Keyword[] | undefined, opt: EntityOptions & { emptyPick?: false }): Promise<EntityResult>;
  /** emptyPick: 빈 곳 클릭·좌표 입력도 EmptyPick으로 돌려받는다(기존 호출의 동작은 그대로) */
  getEntity(prompt: string, keywords: Keyword[] | undefined, opt: EntityOptions): Promise<EntityResult | EmptyPick>;
  /** 객체 고르기(이미 고른 것이 있으면 그것). 빈 배열이면 아무것도 고르지 않음 */
  getSelection(prompt?: string, opt?: { keywords?: Keyword[]; noPickfirst?: boolean }): Promise<string[]>;
  /** 명령 안의 여러 단계를 한 번의 명령 취소로 묶는 번호 */
  group: number;
  /** 다른 명령 안에서 투명 명령으로 도는지('ZOOM 등 — 끝나면 바깥 명령으로 돌아간다) */
  transparent?: boolean;
}

export interface Command {
  name: string;
  aliases?: string[];
  title: string;
  /** 다른 명령 중에도 실행(ZOOM 같은 투명 명령) */
  transparent?: boolean;
  /** 열린 도면이 없어도 실행 */
  noDoc?: boolean;
  /**
   * 프롬프트에서 작은따옴표를 붙여 친 이름('DIST)만 투명 명령으로 돈다. 리본·휴대폰 단추·메뉴로 시작하면
   * 투명이 아닌 명령처럼 앞 명령을 끝낸다(transparent가 참이면 이 값은 보지 않는다)
   */
  quotedTransparent?: boolean;
  run(ctx: CommandContext, arg?: string): Promise<void> | void;
}

export interface UiHooks {
  refreshTabs(): void;
  refreshLayouts(): void;
  refreshStatus(): void;
  refreshPalette(): void;
  showStart(show: boolean): void;
  setBusy(text: string | null, fraction?: number): void;
  /** 진행 상자 뒤로 그림이 보이게(도면을 여는 동안의 미리 보기) */
  setBusySeeThrough?(on: boolean): void;
  setCoords(text: string): void;
  openPalette(tab: string): void;
  /** 시작 화면에 열기 실패 안내를 남긴다(없으면 알림으로) */
  showOpenError?(name: string, info: OpenErrorInfo): void;
}

export class App {
  readonly engine: EngineClient;
  readonly view: CadView;
  readonly cmd: CommandLine;
  readonly fontLib: OutlineLibrary;
  readonly text: TextEngine;
  readonly docs: DocState[] = [];
  active: DocState | null = null;
  readonly edits: EditManager;
  ui!: UiHooks;
  readonly commands = new Map<string, Command>();
  private readonly aliases = new Map<string, string>();
  osnapOn = true;
  readonly snapModes = new Set<SnapKind>(DEFAULT_SNAPS);
  /**
   * OSNAPZ(AutoCAD 도움말: 저장하지 않는 세션 변수, 초기값 0). 켜면(1) 객체 스냅 점의 Z 대신 지금 고도(ELEVATION)를 쓴다.
   * 스냅의 Z를 받는 명령(LINE·CIRCLE 중심·3DPOLY·3DFACE)에만 뜻이 있다. OPTIONS 제도 탭의 "Z 값을 현재 고도로 대체"와 같은 값
   */
  osnapZ = false;
  private ortho = false;
  /** 격자 표시(F7)·격자 스냅(F9) */
  gridOn = false;
  snapOn = false;
  /** 극좌표 추적(F10)의 증분 각도, 라디안. 이 브라우저 변수 POLARANG(도)를 읽고 쓴다(AutoCAD는 레지스트리) */
  get polarInc(): number {
    return (this.settings.polarAng * Math.PI) / 180;
  }

  set polarInc(rad: number) {
    setBrowserSysvar('POLARANG', Math.round(((rad * 180) / Math.PI) * 1e9) / 1e9);
    if (this.settings.polarAng !== browserSysvar('POLARANG')) this.applySettings('POLARANG');
  }

  /** 극좌표 추가 각도(도, POLARADDANG — POLARMODE 4일 때 쓴다) */
  private polarAdd: number[] = [];
  /** 문서마다 마지막으로 그린 선분의 진행 방향(라디안) — 상대 극좌표(POLARMODE 1)의 0도 방향 */
  private readonly lastSegment = new WeakMap<DocState, number>();
  /** Shift로 획득(POLARMODE 8): 이번에 Shift를 누른 채 이미 뒤집은 스냅점(같은 점에 머무는 동안 다시 뒤집지 않는다) */
  private shiftAcq: Pt | null = null;
  /** 동적 입력(F12): 커서 옆에 프롬프트·거리·입력 중인 값 */
  dynOn = true;
  /**
   * 휴대폰 보기 모드: 보기·치수 확인만(그립 편집·두 번 눌러 편집·도면 영역 오른쪽 클릭 메뉴를 막고, 누르면 그 객체 하나만 고른다).
   * 화면(리본·명령행 숨김, 보기 단추 줄)은 ui/mobileview.ts가 맡는다
   */
  viewOnly = false;
  /** 정밀 조준 없이 손가락으로 찍은 점: 손가락이 가려 보지 못하므로 객체 스냅 조준창을 넓힌다 */
  private blindTouch = false;
  private acquired: Acquired[] = [];
  private acqCandidate: { p: Pt; timer: number } | null = null;
  private request: Request | null = null;
  private running: { name: string; ctrl: AbortController } | null = null;
  private lastCommand: string | null = null;
  private groupSerial = 0;
  /** 고른 핸들을 넓히는 고리(PICKSTYLE 그룹 선택 등) */
  selectionExpander: ((handles: string[]) => string[]) | null = null;
  /** 확장 지점: 점 요청에서 객체 스냅이 잡히지 않은 점의 해석(추적·격자 스냅·직교)을 대신한다 — 등각투영 제도 */
  readonly pointFilters: PointFilter[] = [];
  /** 확장 지점: 명령행 입력을 요청보다 먼저 본다 — 점 프롬프트의 DRAG */
  readonly inputFilters: InputFilter[] = [];
  /** 확장 지점: 끌기 미리보기 모드(DRAGMODE 0 끄기·1 켜기·2 자동). 없으면 자동 */
  dragPreviewMode: (() => number) | null = null;
  /** 확장 지점: 명령 없이 Ctrl+클릭한 객체(하이퍼링크 linkClick보다 먼저) — 연관 배열 항목 고르기 */
  readonly entityClickHandlers: EntityClickHandler[] = [];
  /** 확장 지점: 명령 없이 두 번 누른 객체(종류별 기본 편집보다 먼저) */
  readonly dblClickHandlers: DblClickHandler[] = [];
  /** 확장 지점: 다기능 그립 메뉴 항목(그립 위에 커서를 올리거나 오른쪽 클릭) */
  readonly gripMenuProviders: GripMenuProvider[] = [];
  /** 확장 지점: 등록되지 않은 이름을 쳤을 때(알 수 없는 명령 안내보다 먼저) — 시스템 변수 이름 바로 입력 */
  readonly commandFallbacks: CommandFallback[] = [];
  /** 확장 지점: 편집 확정 고리(문서를 열 때 편집 세션에 잇는다) — 주석 축척·도면층 이전·연관 배열 경로 따라가기 */
  readonly commitHooks: CommitHook[] = [];
  /** 확장 지점: 도면 영역 오른쪽 클릭 메뉴(기본·편집·명령 모드)에 항목 더하기 */
  readonly contextMenuProviders: ContextMenuProvider[] = [];
  /** 누른 채 끌기를 올가미로(AutoCAD LASSO 켜짐). 끄면 직사각형 창 */
  lassoOn = true;
  /** 최근 명령(앞이 최근, 오른쪽 클릭·명령행 메뉴) */
  readonly recentCommands: string[] = [];
  /** 최근 입력(명령 중에 친 좌표·값, 앞이 최근) */
  readonly recentInputs: string[] = [];
  /** 동적 입력 칸(거리·각도 또는 X·Y)의 잠금 */
  readonly dyn = new DynInput();
  /** 객체 스냅 재지정(다음 한 점만): 그 점 요청과 쓸 스냅(빈 집합 = 스냅 없이) */
  private snapOverride: { req: Request; modes: Set<SnapKind> } | null = null;
  /** 임시 추적점(TT): 그 점 요청에서만 객체 스냅 추적이 꺼져 있어도 쓴다 */
  private tempTrack: { req: Request; points: Acquired[] } | null = null;
  /** 연장선 획득점·평행 방향(커서를 끝점·선분 위에 잠시 머물러 얻는다)과 얻는 중인 후보 */
  private extAnchors: ExtAnchor[] = [];
  private parDirs: { dir: Pt; at: Pt }[] = [];
  private extCandidate: { key: string; timer: number } | null = null;
  /** Shift를 누르고 있는지(임시 직교 반전) */
  private shiftHeld = false;
  /** 마지막 포인터 이동(Shift를 누르고 뗄 때 다시 해석) */
  private lastMove: { w: Pt; s: Pt; ev: PointerEvent } | null = null;
  /** 왼쪽 버튼을 누른 곳의 뜻(명령이 없을 때): 그립, 끌어 옮기기, 창·올가미 */
  private press: { kind: 'grip' | 'move' | 'window'; world: Pt; screen: Pt; ghost?: DragGhost; lasso?: Lasso; started?: boolean } | null = null;
  /** 오른쪽 버튼 끌어 놓기(고른 객체 위에서 누른 자리, 끄는 동안의 미리보기, 놓은 뒤 메뉴가 열려 있는지) */
  private rightPress: { world: Pt; ghost?: DragGhost; menu?: boolean } | null = null;
  /** 명령 없이 객체를 고른 마지막 클릭(두 번 누르기의 두 번째 클릭이 막 생긴 그립을 눌러도 그립 편집으로 가지 않게) */
  private lastPickClick: { time: number; screen: Pt } | null = null;
  /** 핫 그립(Shift+클릭으로 여럿) */
  private hotGrips: Pt[] = [];
  /** 커서가 올라간 그립과 다기능 그립 메뉴 타이머 */
  private hoverGrip: { point: Pt; timer: number; shown: boolean } | null = null;
  /** 창·올가미 선택 미리보기를 다시 구할 시각 */
  private previewAt = 0;
  /** 마지막 점 요청과 DRAG로 끌기 미리보기를 켠 점 요청(DRAGMODE 켜기) */
  private lastPointRequest: PointRequest | null = null;
  private dragFor: PointRequest | null = null;
  /** 직전 선택(P 옵션) */
  lastSelection: string[] = [];
  /** 마지막 점(LASTPOINT). z: 그 점을 Z와 함께 정했을 때(좌표 입력의 Z·3D 명령의 정점) — @ 상대 좌표가 잇는다 */
  lastPoint: (Pt & { z?: number }) | null = null;
  private cursorWorld: Pt | null = null;
  private windowStart: { screen: Pt; world: Pt; viaClick: boolean } | null = null;
  private pickers = new Map<string, Picker>();
  private hoverHandle: string | null = null;
  private hoverTimer = 0;
  private readonly fontsReady = new WeakMap<DocState, Promise<void>>();
  /** OPTIONS·시스템 변수에서 읽은 화면·입력 설정(바뀌면 onSysvarChange로 다시 읽는다) */
  settings: Settings = readSettings(optionValue);

  constructor(drawingParent: HTMLElement) {
    const fontBase = new URL('fonts/noto-sans-kr/', document.baseURI).href;
    this.engine = new EngineClient(fontBase);
    this.fontLib = new OutlineLibrary(fontBase);
    this.text = new TextEngine(this.fontLib);
    this.view = new CadView(drawingParent);
    this.edits = new EditManager(this);
    this.cmd = new CommandLine(drawingParent, {
      submit: (t) => this.onInput(t, true),
      cancel: () => this.cancel(),
      suggest: (p) => this.suggest(p),
      keyword: (k) => this.onInput(k),
      repeat: () => {
        if (this.lastCommand) void this.run(this.lastCommand);
      },
    });
    // 도면 위 측정 결과 글·커서 툴팁이 비킬 떠 있는 판: 명령행과 셸이 더하는 것(휴대폰 보기 모드의 측정 띠·특성 시트)
    this.view.covers = () => coverBoxes(this.view.el, [this.cmd.el, ...this.coverEls]);
    this.view.on({
      move: (w, s, ev) => this.onMove(w, s, ev),
      down: (w, s, ev) => this.onDown(w, s, ev),
      click: (w, s, ev) => this.onClick(w, s, ev),
      drag: (a, b, done, ev) => this.onDrag(a, b, done, ev),
      context: (w, s, ev, held) => this.onContext(w, s, ev, held),
      rightDown: (w, s, ev) => this.onRightDown(w, s, ev),
      rightDrag: (a, b, phase, ev) => this.onRightDrag(a, b, phase, ev),
      dblclick: (w, s) => this.onDblClick(w, s),
      leave: () => {
        // COORDS 0은 지정한 점을 그대로 둔다. 점을 묻는 동안에도 마지막 값을 둬서 좌표 표시를 눌러 COORDS를 바꿀 수 있게 한다
        if (coordsMode() !== 0 && this.request?.kind !== 'point') this.ui.setCoords('');
      },
      viewChanged: () => {
        this.refreshSelectionOverlay();
        this.ui?.refreshStatus();
        this.scheduleDetail();
      },
      viewportView: (vp, patch) => this.onViewportView(vp, patch),
    });
    // 길게 눌러 정밀 조준: 보기 모드이거나 명령이 점·객체를 기다릴 때
    this.view.aimEnabled = () => this.viewOnly || !!this.request;
    this.cmd.onChange = (t) => {
      this.view.overlay.dynInput = this.dynOn && t ? t : null;
      this.updateDynFields();
      this.view.requestOverlay();
    };
    // 동적 입력 칸의 Tab, 올가미 중 스페이스바(명령행 입력란에 초점이 있어도)
    this.cmd.intercept = (ev) => this.interceptKey(ev);
    this.cmd.onContext = (ev) => showContextMenu(ev.clientX, ev.clientY, commandLineMenu(this, () => this.cmd.historyText(), this.cmd.selectedText()));
    this.view.onRestore = () => {
      for (const d of this.docs) {
        for (const sc of d.scenes.values()) sc.reupload(this.view.renderer);
        for (const v of d.ltVariants.values()) v.scene.reupload(this.view.renderer);
      }
    };
    this.view.viewportModel = (st, vx) => viewportModel(this, st, vx);
    // 설정: 화면이 같은 값을 보게 넣고, OPTIONS·SYSVDLG·변수 이름 입력·setvar로 바뀌면 바로 다시 읽는다
    this.applySettings();
    onSysvarChange((name) => this.applySettings(name));
    this.view.gridInfo = () => {
      const st = this.active;
      if (!this.gridOn || !st) return null;
      let limits: [number, number, number, number] | undefined;
      if (st.onLayout) {
        const lay = st.layoutFor(st.displaySpace);
        if (lay) {
          const p = paperInfo(lay, null);
          limits = [p.minX, p.minY, p.maxX, p.maxY];
        }
      }
      return { x: st.grid.x, y: st.grid.y, major: st.grid.major, baseX: st.snap.baseX, baseY: st.snap.baseY, limits, ucs: currentUcs(st) };
    };
    window.addEventListener('keydown', (ev) => {
      this.ctrlTapKey(ev, true);
      this.onKey(ev);
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.key === 'Shift') this.setShift(false);
      this.ctrlTapKey(ev, false);
    });
    // Ctrl을 누른 채 찍거나 창을 떠나면 Ctrl 한 번 누르기가 아니다
    window.addEventListener('pointerdown', () => this.ctrlTap.cancel(), true);
    window.addEventListener('blur', () => this.ctrlTap.cancel());
    // 앱 안에서는 브라우저 기본 메뉴를 막는다(입력란·편집 가능한 곳·고른 글이 있을 때는 그대로)
    if (typeof document.addEventListener === 'function')
      document.addEventListener(
        'contextmenu',
        (ev) => {
          const t = ev.target as HTMLElement | null;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest?.('a[href]'))) return;
          const sel = window.getSelection?.();
          if (sel && !sel.isCollapsed) return;
          ev.preventDefault();
        },
        true,
      );
    window.addEventListener('beforeunload', (ev) => {
      if (this.docs.some((d) => d.session?.dirty)) ev.preventDefault();
    });
  }

  // -------------------------------------------------------------------------
  // 명령 등록·실행
  // -------------------------------------------------------------------------

  register(c: Command): void {
    this.commands.set(c.name.toUpperCase(), c);
    for (const a of c.aliases ?? []) this.aliases.set(a.toUpperCase(), c.name.toUpperCase());
  }

  /** 별칭을 더하거나(name) 지운다(null) — ALIASEDIT·사용자 별칭 */
  setAlias(alias: string, name: string | null): void {
    const a = alias.trim().toUpperCase();
    if (!a) return;
    if (name === null) this.aliases.delete(a);
    else this.aliases.set(a, name.trim().toUpperCase());
  }

  /** 지금 등록된 별칭 [별칭, 명령 이름] 목록 */
  aliasEntries(): [string, string][] {
    return [...this.aliases.entries()];
  }

  findCommand(name: string): Command | undefined {
    // 명령행판(-VIEW 등)이 따로 있으면 그것, 없으면 앞의 -를 떼고 찾는다
    const raw = name.trim().toUpperCase().replace(/^[_.']+/, '');
    const dash = this.commands.get(raw) ?? this.commands.get(this.aliases.get(raw) ?? '');
    if (dash) return dash;
    const n = raw.replace(/^-+/, '');
    return this.commands.get(n) ?? this.commands.get(this.aliases.get(n) ?? '');
  }

  private suggest(prefix: string): { name: string; title: string }[] {
    const p = prefix.toUpperCase().replace(/^[_.'-]+/, '');
    const out: { name: string; title: string; score: number }[] = [];
    const seen = new Set<string>();
    for (const [a, n] of this.aliases) {
      if (a.startsWith(p)) {
        const c = this.commands.get(n)!;
        out.push({ name: a, title: `${c.name} · ${c.title}`, score: a === p ? 0 : 1 + a.length });
      }
    }
    for (const c of this.commands.values()) {
      const n = c.name.toUpperCase();
      if ((n.startsWith(p) || c.title.includes(prefix)) && !seen.has(n)) {
        seen.add(n);
        out.push({ name: c.name, title: c.title, score: n === p ? 0 : 2 + n.length });
      }
    }
    return out.sort((a, b) => a.score - b.score);
  }

  /** 명령 실행. arg가 있으면 첫 프롬프트의 답으로 쓴다. quoted: 프롬프트에서 작은따옴표를 붙여 친 이름(quotedTransparent 명령이 투명으로) */
  async run(name: string, arg?: string, quoted = false): Promise<void> {
    const c = this.findCommand(name);
    if (!c) {
      const raw = name.trim().toUpperCase().replace(/^[_.']+/, '');
      for (const f of this.commandFallbacks) if (await f.run(raw, arg)) return;
      this.cmd.print(`알 수 없는 명령 "${name}". 도움말은 F1을 누르십시오.`, 'err');
      return;
    }
    if (!c.noDoc && !this.active) {
      this.cmd.print('열린 도면이 없습니다. 먼저 파일을 여십시오.', 'err');
      return;
    }
    const transparent = !!c.transparent || (quoted && !!c.quotedTransparent);
    const prev = this.running && !transparent ? this.running : null;
    if (prev) {
      this.cancel(true);
      // 앞 명령은 취소를 받은 뒤에도 더 묻지 못하고(요청이 곧바로 거절된다), 남긴 미리보기는 지금 지운다.
      // 앞 명령의 정리(finally)는 마이크로태스크 뒤에 오므로 새 명령의 요청·프롬프트를 건드리지 않게 한다.
      prev.ctrl.abort();
      this.resetCommandUi();
    }
    const outer = this.running && transparent ? this.running : null;
    const nested = !!outer;
    const saved = nested ? this.request : null;
    if (nested) this.request = null;
    const ctrl = new AbortController();
    if (!nested) this.running = { name: c.name, ctrl };
    this.lastCommand = c.name;
    remember(this.recentCommands, c.name);
    this.cmd.print(`명령: ${c.name}`);
    this.clearHover();
    this.clearGripHover();
    const ctx: CommandContext = {
      app: this,
      print: (t, cls, measure) => this.cmd.print(t, cls, measure),
      getPoint: (prompt, opt) => this.requestPoint(prompt, opt, ctrl.signal),
      getEntity: ((prompt: string, kws?: Keyword[], opt?: EntityOptions) => this.requestEntity(prompt, kws ?? [], ctrl.signal, opt ?? {})) as CommandContext['getEntity'],
      getSelection: (prompt, opt) => this.requestSelection(prompt ?? '객체 선택:', opt ?? {}, ctrl.signal),
      group: ++this.groupSerial,
      transparent: nested,
    };
    try {
      await c.run(ctx, arg);
    } catch (e) {
      if (e instanceof CancelError) this.cmd.print('*취소*');
      else {
        console.error(e);
        this.cmd.print(`오류: ${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    } finally {
      // 자기 것만 치운다: 이 명령이 끝나기 전에 다른 명령이 이어받았으면(취소 직후 같은 틱의 새 명령, 스크립트,
      // 명령 안에서 시작한 명령) 그 명령의 요청·프롬프트·미리보기는 그대로 둔다
      if (this.request?.signal === ctrl.signal) this.request = null;
      if (nested) {
        // 바깥 명령이 아직 그 입력을 기다리면 되돌린다(그 사이 취소·이어받기로 끝났으면 되돌리지 않는다)
        if (!this.request && saved && !saved.signal.aborted && this.running === outer) {
          this.request = saved;
          this.cmd.setPrompt(this.promptOf(saved));
          // 커서 옆 안내도 바깥 명령의 것으로(25차 헤드리스에서 찾음: 투명 명령의 안내가 커서를 움직일 때까지 남았다 — 휴대폰은 다음 터치까지)
          this.view.overlay.tip = saved.kind === 'select' ? saved.prompt.replace(/:\s*$/, '') : saved.prompt.replace(/\[.*$/, '').replace(/:\s*$/, '');
          this.view.requestOverlay();
        }
      } else {
        if (this.running?.ctrl === ctrl) this.running = null;
        if (!this.running) this.resetCommandUi();
      }
    }
  }

  /** 명령의 프롬프트·미리보기·추적 표시를 지운다 */
  private resetCommandUi(): void {
    this.cmd.setPrompt('');
    const o = this.view.overlay;
    o.rubber = [];
    o.ghost = [];
    o.marks = [];
    o.hotGrip = null;
    o.hotGrips = [];
    o.dynFields = null;
    this.hotGrips = [];
    this.snapOverride = null;
    this.tempTrack = null;
    this.clearTracking();
    o.tip = null;
    this.view.requestOverlay();
  }

  get busyCommand(): string | null {
    return this.running?.name ?? null;
  }

  /** 직전 명령(Enter·오른쪽 클릭 반복) */
  get lastCommandName(): string | null {
    return this.lastCommand;
  }

  /** 명령 밖의 편집(끌어 옮기기 등)이 쓸 명령 취소 묶음 번호 */
  nextGroup(): number {
    return ++this.groupSerial;
  }

  /** 명령이 기다리는 입력(스크립트 실행기가 다음 입력을 넣을 때를 안다). 없으면 null */
  get pendingInput(): PendingInput | null {
    return this.request;
  }

  cancel(silent = false): void {
    if (this.request) {
      const r = this.request;
      this.request = null;
      r.reject(new CancelError());
    } else if (this.running) {
      this.running.ctrl.abort();
      this.running = null;
      if (!silent) this.cmd.print('*취소*');
    } else if (this.rightPress && (this.rightPress.ghost || this.rightPress.menu)) {
      // 오른쪽 버튼 끌기·끌어 놓기 메뉴: Esc는 끌기만 그만둔다(선택은 그대로 — 메뉴의 [취소]와 같다)
      if (this.rightPress.menu) closeMenu();
      this.endRightDrag();
    } else if (this.windowStart || this.press?.lasso) {
      this.windowStart = null;
      this.press = null;
      this.view.overlay.windowRect = null;
      this.view.overlay.lasso = null;
      this.view.overlay.preview = [];
      this.view.requestOverlay();
    } else if (this.hotGrips.length) {
      // Esc 한 번 = 핫 그립 풀기, 두 번 = 선택 해제(AutoCAD와 같다)
      this.hotGrips = [];
      this.view.overlay.hotGrips = [];
      this.view.requestOverlay();
    } else if (this.active && this.active.selection.size) {
      this.clearSelection();
    }
    this.cmd.setPrompt('');
  }

  /** 명령이 취소(abort)되면 그 명령의 요청을 거절한다(지금 요청이면 치운다) */
  private dropRequest(req: Request, reject: (e: unknown) => void): void {
    if (this.request === req) this.request = null;
    reject(new CancelError());
  }

  private promptOf(r: Request): string {
    if (!r.keywords.length) return r.prompt;
    if (r.prompt.includes('[')) return r.prompt;
    // 키워드가 모두 <기본값>으로 보이면 그대로(DIST "두 번째 점 지정 또는 <다중 점>:" — M을 쳐도 된다)
    if (r.keywords.every((k) => r.prompt.includes(`<${k.label}>`))) return r.prompt;
    const kw = r.keywords.map((k) => `${k.label}(${k.key})`).join('/');
    return r.prompt.replace(/:$/, '') + ` [${kw}]:`;
  }

  private requestPoint(prompt: string, opt: Parameters<CommandContext['getPoint']>[1] = {}, signal: AbortSignal): Promise<PointResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new CancelError());
      const req: PointRequest = {
        kind: 'point',
        prompt,
        base: opt.base ?? null,
        keywords: opt.keywords ?? [],
        rubber: opt.rubber,
        ghost: opt.ghost,
        tip: opt.tip,
        deferTan: !!opt.deferTan,
        deferTanLines: !!opt.deferTanLines,
        snaps: opt.snaps?.length ? new Set(opt.snaps) : null,
        ctrlTap: opt.ctrlTap ?? null,
        snapZ: !!opt.snapZ,
        viewportSnaps: !!opt.viewportSnaps,
        allowText: !!opt.allowText || !!opt.preferNumber,
        freeText: !!opt.allowText,
        preferNumber: !!opt.preferNumber,
        signal,
        resolve: (r) => {
          if (this.request === req) this.request = null;
          resolve(r);
        },
        reject,
      };
      this.request = req;
      this.lastPointRequest = req;
      this.dyn.sync(req);
      // 연장선·평행 획득점은 점을 찍을 때마다 새로(AutoCAD와 같다)
      this.extAnchors = [];
      this.parDirs = [];
      this.refreshAcquired();
      this.cmd.setPrompt(this.promptOf(req));
      this.view.overlay.tip = prompt.replace(/\[.*$/, '').replace(/:\s*$/, '');
      signal.addEventListener('abort', () => this.dropRequest(req, reject), { once: true });
      this.view.requestOverlay();
    });
  }

  private async requestSelection(prompt: string, opt: { keywords?: Keyword[]; noPickfirst?: boolean }, signal: AbortSignal): Promise<string[]> {
    const st = this.active;
    if (!st) return [];
    if (st.selection.size && !opt.noPickfirst) {
      if (usePickfirst(this.settings.pickfirst)) {
        const hs = [...st.selection];
        this.lastSelection = hs;
        return hs;
      }
      // PICKFIRST 0(명사/동사 선택 끄기): 명령 전에 고른 것은 쓰지 않고 풀고 새로 묻는다(AutoCAD와 같다)
      this.clearSelection();
    }
    const kws: Keyword[] = [
      { key: 'ALL', label: '전체' },
      { key: 'P', label: '이전' },
      { key: 'L', label: '마지막' },
      { key: 'R', label: '제거' },
      { key: 'A', label: '추가' },
      ...(opt.keywords ?? []),
    ];
    // 선택 방식(W·C·BOX·WP·CP·F)과 그 밖의 옵션(G·M·AU·SI·U): 명령의 키워드가 먼저
    for (const m of [...SELECT_METHODS, ...SELECT_OPTIONS]) if (!kws.some((k) => k.key.toUpperCase() === m.key)) kws.push(m);
    let removing = false;
    let single = false;
    let multiple: string[] | null = null;
    const history: SelectStep[] = [];
    /** 이 프롬프트에서 고른 단계(U가 되돌린다) */
    const step = (hs: string[], mode: 'add' | 'remove') => this.selectStep(history, hs, mode);
    const done = () => {
      const hs = [...st.selection];
      this.lastSelection = hs;
      return hs;
    };
    for (;;) {
      const r = await new Promise<{ handles: string[] } | { keyword: string }>((resolve, reject) => {
        if (signal.aborted) return reject(new CancelError());
        const req: SelectRequest = {
          kind: 'select',
          prompt,
          keywords: kws,
          remove: removing,
          single,
          multiple,
          history,
          signal,
          resolve: (x) => {
            if (this.request === req) this.request = null;
            removing = req.remove;
            multiple = req.multiple;
            resolve(x);
          },
          reject,
        };
        this.request = req;
        this.cmd.setPrompt(removing ? '객체 제거:' : prompt);
        this.view.overlay.tip = prompt.replace(/:\s*$/, '');
        signal.addEventListener('abort', () => this.dropRequest(req, reject), { once: true });
        this.view.requestOverlay();
      });
      if ('handles' in r) {
        this.lastSelection = r.handles;
        return r.handles;
      }
      const k = r.keyword.toUpperCase();
      const mode = removing ? 'remove' : 'add';
      let picked = false;
      if (k === 'ALL') {
        const scene = st.scenes.get(st.space);
        const hs = (scene?.entities ?? []).map((b) => b.handle).filter((h) => {
          const e = st.doc.entityIndex.get(h);
          const l = e ? st.layers.get(tableKey(e.layer)) : undefined;
          return !!e && (!l || (l.on && !l.frozen));
        });
        const ed = st.edits.get(st.space);
        for (const b of ed?.overlay?.entities ?? []) if (!hs.includes(b.handle)) hs.push(b.handle);
        step(hs.filter((h) => !ed?.hidden.has(h) || ed.live.has(h)), mode);
        this.cmd.print(`${st.selection.size}개를 찾음`);
        picked = true;
      } else if (k === 'P') {
        step(this.lastSelection.filter((h) => st.doc.entityIndex.has(h)), mode);
        picked = true;
      } else if (k === 'L') {
        const last = this.lastCreated.filter((h) => st.doc.entityIndex.has(h)).slice(-1);
        step(last, mode);
        picked = true;
      } else if (opt.keywords?.some((x) => x.key.toUpperCase() === k)) return Promise.reject(Object.assign(new Error('keyword'), { keyword: k }));
      else if (k === 'SI') single = true;
      else if (k === 'AU') {
        // 자동: 객체를 누르면 고르고 빈 곳이면 창(이미 기본 동작)
      } else if (k === 'M') multiple = [];
      else if (k === 'U') {
        const last = history.pop();
        if (!last) this.cmd.print('되돌릴 선택이 없습니다.');
        else {
          this.setSelection(last.handles, last.mode === 'add' ? 'remove' : 'add');
          // 바꾸기(PICKADD 0)로 빠졌던 것은 되살린다
          if (last.removed?.length) this.setSelection(last.removed, 'add');
          this.cmd.print(`${last.handles.length + (last.removed?.length ?? 0)}개를 되돌림, 총 ${st.selection.size}개`);
        }
      } else if (k === 'G') {
        const g = await this.requestPoint('그룹 이름 입력:', { allowText: true }, signal);
        const name = 'text' in g ? g.text.trim() : '';
        if (name) {
          const grp = listGroups(st.doc).find((x) => x.name.toUpperCase() === name.toUpperCase());
          if (!grp) this.cmd.print(`그룹 "${name}"이(가) 없습니다.`, 'err');
          else {
            const hs = grp.group.entities.map((h) => normalizeHandle(h)).filter((h) => st.doc.entityIndex.has(h));
            step(this.expandPick(hs), mode);
            this.cmd.print(`${hs.length}개를 찾음`);
            picked = true;
          }
        }
      } else {
        const m = selectMethodOf(k);
        const pk = m ? this.picker() : null;
        if (m && pk) {
          const hs = await runSelectMethod(m, { getPoint: (p, o) => this.requestPoint(p, o, signal), print: (t, c) => this.cmd.print(t, c) }, pk);
          if (hs) {
            step(this.expandPick(hs), mode);
            this.cmd.print(`${hs.length}개를 찾음`);
            picked = true;
          }
        }
      }
      // 단일(SI): 한 번 고르면 끝
      if (single && picked) return done();
    }
  }

  /** 객체 선택 중 한 번의 고르기: 실제로 바뀐 것만 단계로 남긴다(U). replace(PICKADD 0)는 더한 것과 뺀 것을 한 단계로 */
  private selectStep(history: SelectStep[], hs: string[], mode: PickMode): void {
    const st = this.active;
    if (!st) return;
    const before = new Set(st.selection);
    this.setSelection(hs, mode);
    const added = [...st.selection].filter((h) => !before.has(h));
    const removed = [...before].filter((h) => !st.selection.has(h));
    if (mode === 'replace') {
      if (added.length || removed.length) history.push({ handles: added, mode: 'add', removed });
      return;
    }
    const changed = mode === 'add' ? added : removed;
    if (changed.length) history.push({ handles: changed, mode });
  }

  /** 마지막으로 만든 객체(L 옵션) */
  lastCreated: string[] = [];
  /** 명령행 말고 보기 위에 떠 있는 판(셸이 더한다 — 휴대폰 보기 모드의 측정 띠·특성 시트). 도면 위 글이 비킨다(overlay-place.ts) */
  coverEls: Element[] = [];
  /** 파일이 연결된 래스터 이미지(열쇠 = 파일 이름 소문자) */
  readonly imageKeys = new Set<string>();
  /** 파일이 연결된 PDF 언더레이 페이지(열쇠 → 폭·높이, 인치) */
  readonly pdfPages = new Map<string, readonly [number, number]>();
  /** 선택한 객체의 그립(화면에 보이는 것) */
  gripList: { handle: string; id: string; point: Pt }[] = [];
  /**
   * 누른 그립(GRIPEDIT 명령이 쓴다). point = 누른 그립 점, items = 함께 움직일 그립(같은 점에 겹친 그립과
   * Shift+클릭으로 고른 다른 핫 그립 — 항목마다 제 그립 점)
   */
  hotGrip: { point: Pt; items: { handle: string; id: string; point: Pt }[] } | null = null;
  /** 파일을 연 뒤(빠진 글꼴 안내 등) */
  onOpened: ((st: DocState) => void) | null = null;
  /** 뷰포트 표(타일 뷰포트 구성)가 편집으로 바뀌었을 때(VPORTS가 연결한다) */
  onVportsChanged: ((st: DocState) => void) | null = null;

  /** 명령행에 글을 넣은 것처럼(투명 명령의 결과를 멈춘 프롬프트에 넣을 때 등) */
  submitInput(text: string): void {
    this.onInput(text);
  }

  /** 사람이 Enter를 누른 것처럼(오른쪽 클릭 메뉴의 입력): 동적 입력 칸을 잠갔으면 그 점 */
  acceptInput(): void {
    this.onInput('', true);
  }

  /** 지금 점 요청에 객체 스냅 재지정(END·FROM·M2P·TT·.X …)을 건다(바로 가기 메뉴). 점 요청이 아니거나 이름이 아니면 false */
  applyOverrideInput(key: string): boolean {
    const r = this.request;
    const ov = parseOverride(key);
    if (r?.kind !== 'point' || !ov) return false;
    this.cmd.print(`${this.promptOf(r)} ${key}`);
    void this.applyOverride(r, ov);
    return true;
  }

  private requestEntity(prompt: string, keywords: Keyword[], signal: AbortSignal, opt: EntityOptions = {}): Promise<EntityResult | EmptyPick> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new CancelError());
      const req: EntityRequest = {
        kind: 'entity',
        prompt,
        keywords,
        emptyPick: !!opt.emptyPick,
        viewportPick: !!opt.viewportPick,
        signal,
        resolve: (r) => {
          if (this.request === req) this.request = null;
          resolve(r);
        },
        reject,
      };
      this.request = req;
      this.cmd.setPrompt(this.promptOf(req));
      this.view.overlay.tip = prompt.replace(/\[.*$/, '').replace(/:\s*$/, '');
      signal.addEventListener('abort', () => this.dropRequest(req, reject), { once: true });
      this.view.requestOverlay();
    });
  }

  /**
   * 명령행 입력. interactive: 사람이 명령행·커서 옆에 친 입력(동적 입력의 상대 좌표 기본을 쓴다).
   * 스크립트·AutoLISP·submitInput은 늘 절대 좌표(AutoCAD처럼 동적 입력과 무관)
   */
  private onInput(text: string, interactive = false): void {
    for (const f of this.inputFilters) if (f.input(text, this.request)) return;
    const r = this.request;
    if (!r) {
      if (!text) return;
      // 투명 명령 접두사 '
      void this.run(text);
      return;
    }
    const t = text.trim();
    if (r.kind === 'select') {
      if (!t) {
        // 다중(M): 모아 둔 것을 더하고 선택 프롬프트로 돌아간다
        if (r.multiple) {
          const hs = this.expandPick(r.multiple);
          r.multiple = null;
          this.selectStep(r.history, hs, r.remove ? 'remove' : 'add');
          this.cmd.print(`${hs.length}개를 찾음, 총 ${this.active?.selection.size ?? 0}개`);
          if (r.single) r.resolve({ handles: [...(this.active?.selection ?? [])] });
          return;
        }
        r.resolve({ handles: [...(this.active?.selection ?? [])] });
        return;
      }
      // 객체 선택 중에도 투명 명령('FILTER 등)
      if (t.startsWith("'")) {
        void this.run(t.slice(1), undefined, true);
        return;
      }
      const up = t.toUpperCase();
      if (up === 'R' || up === 'REMOVE') {
        r.remove = true;
        this.cmd.setPrompt('객체 제거:');
        return;
      }
      if (up === 'A' || up === 'ADD') {
        r.remove = false;
        this.cmd.setPrompt(r.prompt);
        return;
      }
      const kw = r.keywords.find((k) => k.key.toUpperCase() === up || k.label === t);
      if (kw) {
        r.resolve({ keyword: kw.key });
        return;
      }
      this.cmd.print(`*잘못된 선택* ${SELECT_HELP}`, 'err');
      return;
    }
    // 동적 입력 칸을 잠갔으면 Enter·값으로 그 칸들을 합친 점
    if (r.kind === 'point' && this.dynOn && interactive && this.dyn.locked) {
      const st = this.active;
      const p = st ? this.dyn.resolve(t, r.base, this.cursorWorld, currentUcs(st), st.units.aunits, st.units) : null;
      if (p) {
        if (this.outsideLimits(p)) return;
        this.cmd.print(`${this.promptOf(r)} ${[...this.dyn.locks.filter((x) => x !== null), t].filter(Boolean).join(' ')}`);
        // 거리·각도 칸은 기준점에서 평면으로 잰다: Z는 기준점 그대로(3D 명령의 기준점에 Z가 있을 때)
        const bz = r.base?.z;
        const p3 = r.base && bz !== undefined ? { ...p, z: bz } : p;
        this.lastPoint = p3;
        this.finishPoint(r, { ...App.pointResult(p3), snap: null });
        return;
      }
    }
    if (!t) {
      r.resolve({ enter: true });
      return;
    }
    const up = t.toUpperCase();
    const kw = r.keywords.find((k) => k.key.toUpperCase() === up || k.label === t);
    if (kw) {
      this.cmd.print(`${this.promptOf(r)} ${t}`);
      r.resolve({ keyword: kw.key });
      return;
    }
    if (t.startsWith("'")) {
      void this.run(t.slice(1), undefined, true);
      return;
    }
    if (r.kind === 'point') {
      if (r.preferNumber && /^-?[\d.]+(?:e-?\d+)?$/i.test(t)) {
        this.cmd.print(`${this.promptOf(r)} ${t}`);
        remember(this.recentInputs, t);
        r.resolve({ text: t });
        return;
      }
      // 객체 스냅 재지정(END·FROM·M2P·TT·.X …): 글을 받는 프롬프트에서는 글 그대로
      const ov = r.freeText ? null : parseOverride(t);
      if (ov) {
        this.cmd.print(`${this.promptOf(r)} ${t}`);
        void this.applyOverride(r, ov);
        return;
      }
      const p = this.parsePoint(r, interactive && this.dynOn && r.base ? dynRelative(t) : t);
      if (p) {
        if (this.outsideLimits(p)) return;
        this.cmd.print(`${this.promptOf(r)} ${t}`);
        remember(this.recentInputs, t);
        this.lastPoint = p;
        this.finishPoint(r, { ...App.pointResult(p), snap: null });
        return;
      }
      if (r.allowText) {
        remember(this.recentInputs, t);
        r.resolve({ text: t });
        return;
      }
      const tc = this.findCommand(t);
      if (tc?.transparent) {
        void this.run(t);
        return;
      }
      this.cmd.print('점이 올바르지 않습니다. 예: 100,50  @20,0  @30<45', 'err');
      return;
    }
    // 객체 프롬프트에서 빈 곳을 받는 요청(emptyPick)은 좌표 입력도 점으로
    if (r.emptyPick) {
      const p = this.parsePoint(null, interactive && this.dynOn && this.lastPoint ? dynRelative(t) : t);
      if (p) {
        this.cmd.print(`${this.promptOf(r)} ${t}`);
        this.lastPoint = p;
        r.resolve({ point: { x: p.x, y: p.y }, empty: true });
        return;
      }
    }
    this.cmd.print('객체를 선택하거나 옵션을 입력하십시오.', 'err');
  }

  /**
   * 좌표 글 읽기: 현재 UCS(* 로 시작하면 WCS), @는 기준점(없으면 마지막 점)에서, 숫자 하나는 커서 방향 직접 거리.
   * Z: 이 앱의 UCS는 평면 안의 원점·회전뿐이라(Z축 = WCS Z) Z는 그대로 지나간다. 기준점·마지막 점에 Z가 없으면(평면 점)
   * dz를 준 상대 좌표는 고도에서 잰다
   */
  private parsePoint(r: PointRequest | null, t: string): (Pt & { z?: number }) | null {
    const base = r?.base ?? null;
    const dir = this.cursorWorld && base ? { x: this.cursorWorld.x - base.x, y: this.cursorWorld.y - base.y } : null;
    const u = currentUcs(this.active);
    const wcs = t.startsWith('*');
    const conv = !wcs && !isWorld(u);
    const lastW = base ?? this.lastPoint;
    const lastZ = lastW?.z;
    const last = lastW ? { ...(conv ? toUcs(u, lastW) : { x: lastW.x, y: lastW.y }), ...(lastZ !== undefined ? { z: lastZ } : {}) } : null;
    // 극좌표의 각도는 도면 단위의 0 방향(ANGBASE)에서 양의 방향(ANGDIR)으로
    const pu = parsePointInput(wcs ? t.slice(1) : t, last, dir && conv ? dirToUcs(u, dir) : dir, this.elevation(), this.active?.units);
    if (!pu) return null;
    const w = conv ? toWcs(u, pu) : { x: pu.x, y: pu.y };
    return pu.z === undefined ? w : { ...w, z: pu.z };
  }

  /** 새 객체의 고도(ELEVATION, 배치에서는 PELEVATION — draw.ts currentElevation과 같다). Z를 주지 않은 점의 Z(조회 명령도) */
  elevation(): number {
    const st = this.active;
    const v = st?.doc.header.get(st.isModel === false ? '$PELEVATION' : '$ELEVATION');
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  /**
   * 커서 자리의 Z(상태 막대 좌표): 객체에 잡힌 스냅 점이면 그 점의 Z(OSNAPZ 0 — 도움말 "About Using Object Snaps in 3D"),
   * OSNAPZ 1이거나 스냅이 없으면 지금 고도(커서는 고도의 XY 평면 위 — 도움말 ELEV: X·Y만 준 점의 Z가 고도)
   */
  cursorZ(snap: ResolvedPoint['snap']): number {
    return !this.osnapZ && snap?.z !== undefined && Number.isFinite(snap.z) ? snap.z : this.elevation();
  }

  /** 점 결과: point는 평면 좌표만, Z를 정한 입력이면 z(2D 명령은 쓰지 않는다) */
  private static pointResult(p: Pt & { z?: number }): { point: Pt; z?: number } {
    return p.z === undefined ? { point: { x: p.x, y: p.y } } : { point: { x: p.x, y: p.y }, z: p.z };
  }

  /** 점 요청을 점으로 끝낸다(그 요청의 스냅 재지정·임시 추적점도 끝) */
  private finishPoint(r: PointRequest, res: PointResult): void {
    if (this.snapOverride?.req === r) this.snapOverride = null;
    this.snapCycle = null;
    if (this.tempTrack?.req === r) {
      this.tempTrack = null;
      this.refreshAcquired();
    }
    // COORDS 0: 상태 막대 좌표는 점을 지정할 때만(그 점의 절대 좌표 — Z는 준 Z, 커서로 찍은 점이면 그 자리의 Z, 아니면 고도)
    if ('point' in res && this.active && coordsMode() === 0) {
      const p = res.point;
      const at = this.lastResolved && Math.abs(this.lastResolved.x - p.x) < 1e-9 && Math.abs(this.lastResolved.y - p.y) < 1e-9;
      this.ui.setCoords(coordsText(this.active, p, res.z ?? (at ? this.coordsZ : this.elevation()), null));
    }
    r.resolve(res);
  }

  /** 상태 막대 좌표 표시 방식을 돌린다(도움말: 점을 물을 때 좌표 표시를 누르거나 Ctrl+I — COORDS 0 → 1 → 2 → 0) */
  cycleCoords(): void {
    const v = nextCoordsMode(coordsMode());
    setBrowserSysvar('COORDS', v);
    this.cmd.print(COORDS_NOTE[v]);
    const m = this.lastMove;
    if (m && v !== 0) this.onMove(m.w, m.s, m.ev, true);
  }

  /**
   * 객체 스냅 재지정: 스냅은 다음 한 점에만 쓰고, TT는 임시 추적점을 더하고, FROM·M2P·점 필터는 점을 더 물어 그 점으로 끝낸다.
   * 더 묻는 동안 Esc는 명령 전체를 취소한다(AutoCAD와 같다)
   */
  private async applyOverride(r: PointRequest, ov: Override): Promise<void> {
    const back = () => {
      if (r.signal.aborted) return false;
      this.request = r;
      this.cmd.setPrompt(this.promptOf(r));
      this.view.overlay.tip = r.prompt.replace(/\[.*$/, '').replace(/:\s*$/, '');
      this.view.requestOverlay();
      return true;
    };
    if (ov.kind === 'snap') {
      this.snapOverride = { req: r, modes: new Set(ov.modes) };
      // AutoCAD처럼 "대상:"을 묻는다(NON은 원래 프롬프트)
      if (ov.modes.length) this.cmd.setPrompt('대상:');
      if (this.lastMove) this.onMove(this.lastMove.w, this.lastMove.s, this.lastMove.ev, true);
      return;
    }
    try {
      if (ov.kind === 'tt') {
        const q = await this.requestPoint('임시 OTRACK 점 지정:', {}, r.signal);
        if (!back()) return;
        if ('point' in q) {
          if (this.tempTrack?.req !== r) this.tempTrack = { req: r, points: [] };
          this.tempTrack.points.push({ p: q.point, label: '임시 추적점' });
          this.refreshAcquired();
        }
        return;
      }
      const st = this.active;
      const p = await runPointOverride(ov, {
        // 더 묻는 점도 원래 요청처럼 스냅의 Z를 받고(3D 명령), 뷰포트 안 모형 객체에 스냅한다(DIST — 만든 점은 스냅 없는 점이다)
        getPoint: (prompt, o) => this.requestPoint(prompt, { ...(o ?? {}), snapZ: r.snapZ, viewportSnaps: r.viewportSnaps }, r.signal),
        print: (t, c) => this.cmd.print(t, c),
        ucs: currentUcs(st),
        elevation: this.elevation(),
      });
      if (!back()) return;
      if (p) {
        if (this.outsideLimits(p)) return;
        this.lastPoint = p;
        this.finishPoint(r, { ...App.pointResult(p), snap: null });
      }
    } catch (e) {
      // 더 묻는 중에 취소하면 명령도 취소
      if (!(e instanceof CancelError) || r.signal.aborted) return;
      if (this.request === r || !this.request) {
        this.request = null;
        r.reject(new CancelError());
      }
    }
  }

  // -------------------------------------------------------------------------
  // 문서
  // -------------------------------------------------------------------------

  async openFile(name: string, data: ArrayBuffer, input: InputKind = 'local', attempt = beginOpen(input, name.split('.').pop() ?? 'other')): Promise<DocState | null> {
    const size = data.byteLength;
    this.ui.setBusy(`${name} 여는 중…`, 0);
    // 점진 빌드: 장면을 만드는 동안 오는 조각을 먼저 그린다(문서·장면이 다 오면 탭을 연다)
    const preview = new LoadPreview(this.view.renderer);
    const showPreview = () => {
      this.ui.showStart(false);
      this.ui.setBusySeeThrough?.(true);
      this.view.setLoadPreview(preview);
    };
    try {
      const res = await this.engine.open(
        name,
        data,
        (stage, f) => {
          const label = stage === 'read' ? '도면 읽는 중' : stage === 'fonts' ? '글꼴 받는 중' : stage === 'build' ? '화면 그리는 중' : stage === 'scene' || stage === 'document' ? '도면 정보 받는 중' : '처리 중';
          this.ui.setBusy(`${label}…`, stage === 'read' ? f * 0.6 : stage === 'fonts' ? 0.62 : stage === 'build' ? 0.64 + f * 0.26 : stage === 'document' ? 0.9 + f * 0.1 : 0.9);
        },
        (part, view) => {
          const first = preview.empty;
          preview.add(part, view);
          if (first && !preview.empty) showPreview();
          this.view.requestRender();
        },
        { width: this.view.width, height: this.view.height },
      );
      this.view.setLoadPreview(null);
      preview.dispose();
      const st = this.addDocument(res, name, size);
      const w = st.warnings.filter((x) => x.code !== 'entity.not_drawn' || (x.count ?? 0) > 0);
      this.cmd.print(`${name}: ${res.doc.format.toUpperCase()} ${res.doc.version}, 객체 ${res.doc.entityIndex.size.toLocaleString()}개, 읽기 ${Math.round(res.readMs)}ms, 그리기 ${Math.round(res.model.ms)}ms`);
      for (const x of w.slice(0, 6)) this.cmd.print(`참고: ${x.message}${x.count ? ` (${x.count})` : ''}`);
      this.onOpened?.(st);
      attempt.success();
      return st;
    } catch (e) {
      const info = openErrorInfo(e instanceof EngineError ? e.code : 'internal', e instanceof Error ? e.message : String(e));
      this.reportOpenError(name, info);
      attempt.error(info.code === 'file.empty' ? 'empty' : info.code === 'file.unrecognized' || info.code === 'dwg.unsupported_version' || info.code === 'dwg.encrypted' ? 'unsupported' : 'parse_error');
      return null;
    } finally {
      this.view.setLoadPreview(null);
      preview.dispose();
      this.ui.showStart(!this.active);
      this.ui.setBusy(null);
    }
  }

  /**
   * 열지 못한 까닭과 할 일을 알린다: 명령행에 남기고, 시작 화면이면 그 위의 안내 상자에, 도면을 보는 중이면 알림으로.
   * 알림은 화면 읽기 프로그램이 바로 읽는다(role="alert")
   */
  reportOpenError(name: string, info: OpenErrorInfo): void {
    const text = openErrorText(name, info);
    this.cmd.print(`${name} — ${info.message}`, 'err');
    this.cmd.print(info.hint);
    if (!this.active && this.ui.showOpenError) this.ui.showOpenError(name, info);
    else toast(text, 'error', 9000);
  }

  /** 워커가 읽었거나 받아 둔 문서를 탭으로 연다 */
  addDocument(res: OpenResult, name: string, size: number): DocState {
    const st = new DocState(res.docId, res.doc, name, size, res.readMs);
    st.addScene(this.view.renderer, res.model, MODEL_SPACE);
    this.edits.attach(st);
    bindCommitHooks(this, st);
    this.docs.push(st);
    this.activate(st);
    this.initialView(st);
    void this.loadFonts(st);
    return st;
  }

  private loadFonts(st: DocState): Promise<void> {
    let p = this.fontsReady.get(st);
    if (!p) {
      const usage = collectTextUsage(st.doc);
      p = usage.needsOutline ? Promise.all([this.fontLib.require(usage.codes), this.fontLib.requireLatin(usage.latin)]).then(() => undefined).catch(() => undefined) : Promise.resolve();
      p.then(() => this.pickers.clear());
      this.fontsReady.set(st, p);
    }
    return p;
  }

  /** 저장된 *Active 뷰가 범위와 겹치고 충분히 크면 그 화면, 아니면 전체 보기 */
  private initialView(st: DocState): void {
    // *Active가 여럿이면 타일 뷰포트로 연다
    if (st.doc.vports.filter((v) => v.name.toUpperCase() === '*ACTIVE').length > 1 && this.onVportsChanged) {
      this.onVportsChanged(st);
      if (st.tiles) return;
    }
    const vp = st.doc.vports.find((v) => v.name.toUpperCase() === '*ACTIVE');
    const b = st.scenes.get(MODEL_SPACE)?.bounds;
    if (vp && b && vp.height > 0 && Number.isFinite(vp.center.x)) {
      const aspect = vp.aspect > 0 ? vp.aspect : this.view.width / this.view.height;
      const hw = (vp.height * aspect) / 2;
      const hh = vp.height / 2;
      const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY);
      const overlaps = !(vp.center.x + hw < b.minX || vp.center.x - hw > b.maxX || vp.center.y + hh < b.minY || vp.center.y - hh > b.maxY);
      if (overlaps && vp.height >= ext * 0.02 && vp.height <= ext * 50) {
        this.view.zoomRect(vp.center.x - hw, vp.center.y - hh, vp.center.x + hw, vp.center.y + hh, false, 0);
        return;
      }
    }
    this.view.zoomExtents(false);
  }

  activate(st: DocState | null): void {
    this.cancel(true);
    this.active = st;
    this.view.setState(st);
    this.hoverHandle = null;
    this.ui.showStart(!st);
    this.ui.refreshTabs();
    this.ui.refreshLayouts();
    this.ui.refreshStatus();
    this.ui.refreshPalette();
    this.refreshSelectionOverlay();
    document.title = st ? `${st.name} - OpenCAD DWG·DXF`
      : document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? 'OpenCAD DWG·DXF';
  }

  /** 문서 닫기(저장하지 않은 변경이 있으면 먼저 묻는다) */
  async close(st: DocState, force = false): Promise<boolean> {
    if (!force && st.session?.dirty) {
      const answer = await ask(`${st.saveName}`, '저장하지 않은 변경이 있습니다. 닫기 전에 저장할까요?', [
        { label: '저장', value: 'save', primary: true },
        { label: '저장 안 함', value: 'discard' },
        { label: '취소', value: 'cancel' },
      ]);
      if (answer === 'cancel' || answer === null) return false;
      if (answer === 'save') {
        this.activate(st);
        await this.run('QSAVE');
        if (st.session.dirty) return false;
      }
    }
    this.closeNow(st);
    return true;
  }

  /** 객체 위 풍선말(하이퍼링크 등). 없으면 null */
  hoverTip: ((handle: string) => string | null) | null = null;
  /** Ctrl+클릭한 객체를 처리했으면 true(하이퍼링크 열기) */
  linkClick: ((handle: string) => boolean) | null = null;

  /** 문서를 닫은 뒤(자동 저장본 지우기 등) */
  onClosed: ((st: DocState) => void) | null = null;

  private closeNow(st: DocState): void {
    const i = this.docs.indexOf(st);
    if (i < 0) return;
    this.docs.splice(i, 1);
    this.onClosed?.(st);
    this.edits.detach(st);
    st.dispose(this.view.renderer);
    for (const k of [...this.pickers.keys()]) if (k.startsWith(`${st.docId}:`)) this.pickers.delete(k);
    if (this.active === st) this.activate(this.docs[Math.min(i, this.docs.length - 1)] ?? null);
    else this.ui.refreshTabs();
  }

  /** 공간 장면이 없으면 워커에서 그려 온다 */
  async ensureScene(st: DocState, space: string): Promise<void> {
    const key = tableKey(space);
    if (st.scenes.has(key)) return;
    let p = st.buildPending.get(key);
    if (!p) {
      this.ui.setBusy('배치 그리는 중…', 0.5);
      p = this.engine
        .build(st.docId, key)
        .then((msg) => {
          st.addScene(this.view.renderer, msg, key);
          expandXrefBounds(this, st, key);
        })
        .finally(() => {
          st.buildPending.delete(key);
          this.ui.setBusy(null);
        });
      st.buildPending.set(key, p);
    }
    await p;
  }

  /** MSPACE에서 뷰포트 확대·이동: 뷰를 곧바로 바꾸고, 멈추면 한 번의 편집(명령 취소 한 단계)으로 기록한다 */
  private vpViewPending: { st: DocState; layout: string; before: ViewportEntity; timer: number } | null = null;

  private onViewportView(vp: ViewportEntity, patch: Pick<ViewportEntity, 'viewHeight' | 'viewCenter'>): void {
    const st = this.active;
    if (!st?.msVp) return;
    let p = this.vpViewPending;
    if (p && (p.st !== st || p.before.handle !== vp.handle)) {
      this.flushViewportView();
      p = null;
    }
    if (!p) p = this.vpViewPending = { st, layout: st.msVp.layout, before: { ...vp, viewCenter: { ...vp.viewCenter } }, timer: 0 };
    vp.viewHeight = patch.viewHeight;
    vp.viewCenter = { ...patch.viewCenter };
    clearTimeout(p.timer);
    p.timer = window.setTimeout(() => this.flushViewportView(), 500);
  }

  /** 미뤄 둔 뷰포트 뷰 변경을 기록한다 */
  flushViewportView(): void {
    const p = this.vpViewPending;
    if (!p) return;
    this.vpViewPending = null;
    clearTimeout(p.timer);
    const cur = p.st.doc.entityIndex.get(p.before.handle);
    if (!cur || cur.type !== 'VIEWPORT') return;
    const after = { ...cur, viewCenter: { ...cur.viewCenter } };
    // 지금 객체는 이미 바뀌어 있으므로 원래 값으로 되돌린 뒤 편집으로 적용한다
    Object.assign(cur, { viewHeight: p.before.viewHeight, viewCenter: p.before.viewCenter });
    p.st.session.commit({ label: 'ZOOM', ops: [{ kind: 'modify', block: p.layout, before: p.before, after }] });
  }

  /** 배치의 뷰포트로 들어가 모형을 다룬다(MSPACE). 비틀린 뷰포트는 아직 못 들어간다 */
  enterViewport(st: DocState, vp: ViewportEntity): boolean {
    if (vp.twistAngle) {
      this.cmd.print('비틀린 뷰포트는 아직 모형 공간으로 들어갈 수 없습니다.', 'err');
      return false;
    }
    const layout = st.msVp?.layout ?? st.space;
    if (!st.layoutFor(layout) || layout === MODEL_SPACE) return false;
    this.flushViewportView();
    if (st.msVp?.handle === vp.handle) return true;
    this.cancel(true);
    st.msVp = { layout, handle: vp.handle };
    st.space = MODEL_SPACE;
    st.selection.clear();
    this.view.setState(st);
    this.ui.refreshLayouts();
    this.ui.refreshStatus();
    this.ui.refreshPalette();
    this.refreshSelectionOverlay();
    return true;
  }

  /** 뷰포트에서 나와 종이 공간으로(PSPACE) */
  exitViewport(st: DocState): void {
    if (!st.msVp) return;
    this.flushViewportView();
    this.cancel(true);
    st.space = st.msVp.layout;
    st.msVp = null;
    st.selection.clear();
    this.view.setState(st);
    this.ui.refreshLayouts();
    this.ui.refreshStatus();
    this.ui.refreshPalette();
    this.refreshSelectionOverlay();
  }

  /** 모형·배치 전환 */
  async setSpace(space: string): Promise<void> {
    const st = this.active;
    if (!st) return;
    const key = tableKey(space);
    if (st.msVp) {
      this.flushViewportView();
      const lay = st.msVp.layout;
      st.msVp = null;
      st.space = lay;
      if (key === lay) {
        this.view.setState(st);
        this.ui.refreshLayouts();
        this.ui.refreshStatus();
        return;
      }
    }
    if (st.space === key) return;
    if (st.blockEdit) {
      await this.closeBlockEditor(true);
      if (st.space === key) return;
    }
    this.cancel(true);
    await this.ensureScene(st, key);
    st.space = key;
    st.selection.clear();
    this.view.setState(st);
    if (!st.cameras.has(key)) this.view.zoomExtents(false);
    this.ui.refreshLayouts();
    this.ui.refreshStatus();
    this.ui.refreshPalette();
    this.refreshSelectionOverlay();
  }

  // -------------------------------------------------------------------------
  // 깊이 확대: 보이는 영역을 지금 확대에 맞는 정밀도로 다시 나눈다(AutoCAD의 재생성과 같은 일)
  // -------------------------------------------------------------------------

  private detailTimer = 0;

  scheduleDetail(): void {
    clearTimeout(this.detailTimer);
    this.detailTimer = window.setTimeout(() => this.updateDetail(), 250);
  }

  private dropDetail(): void {
    const d = this.view.detail;
    if (!d) return;
    d.scene.dispose(this.view.renderer);
    this.view.detail = null;
    this.view.requestRender();
  }

  private updateDetail(): void {
    const st = this.active;
    if (!st || !st.isModel || st.msVp || !st.scenes.get(st.space)) return this.dropDetail();
    const cam = this.view.camera();
    const vis = this.view.visibleWorld();
    // 기본 장면의 현-곡선 오차가 0.6픽셀을 넘을 때, 또는 성기게 그린 촘촘한 해치가 있는 공간을 확대했을 때만
    const b = st.scenes.get(st.space)?.bounds;
    const zoomedIn = !!b && (vis[2] - vis[0]) * (vis[3] - vis[1]) * 16 < (b.maxX - b.minX) * (b.maxY - b.minY);
    const dense = st.denseHatch.has(st.space) && zoomedIn;
    if (!dense && spaceTolerance(st.doc, st.space) * cam.scale < 0.6) return this.dropDetail();
    const d = this.view.detail;
    if (
      d &&
      d.docId === st.docId &&
      d.space === st.space &&
      d.gen === st.gen &&
      d.region[0] <= vis[0] &&
      d.region[1] <= vis[1] &&
      d.region[2] >= vis[2] &&
      d.region[3] >= vis[3] &&
      cam.scale <= d.scale * 1.5 &&
      cam.scale >= d.scale / 4
    )
      return;
    const pk = this.picker();
    if (!pk) return;
    const w = vis[2] - vis[0];
    const hgt = vis[3] - vis[1];
    const region: [number, number, number, number] = [vis[0] - w * 0.5, vis[1] - hgt * 0.5, vis[2] + w * 0.5, vis[3] + hgt * 0.5];
    const handles = pk.overlapping(region);
    if (handles.length > 30000) return this.dropDetail();
    const block = st.doc.blocks.get(st.space);
    if (!block) return;
    const want = new Set(handles);
    const list = block.entities.filter((e) => want.has(e.handle) && !st.hiddenObjects.has(e.handle));
    const scene = new OverlayScene(this.view.renderer, st.doc, list, this.text, st.space, 0.3 / cam.scale, this.imageKeys, this.pdfPages, dense ? region : undefined);
    this.dropDetail();
    this.view.detail = { docId: st.docId, space: st.space, gen: st.gen, region, scale: cam.scale, scene };
    this.view.requestRender();
  }

  /** 객체 숨기기·격리(HIDEOBJECTS·ISOLATEOBJECTS): 이 객체들을 그리지도 고르지도 않는다. 빈 목록이면 모두 보인다 */
  setHiddenObjects(st: DocState, handles: Iterable<string>): void {
    st.hiddenObjects.clear();
    for (const h of handles) st.hiddenObjects.add(h);
    for (const h of st.hiddenObjects) st.selection.delete(h);
    this.engine.hide(st.docId, [...st.hiddenObjects]);
    this.dropDetail();
    this.edits.rebuildEverything(st);
    this.ui.refreshStatus();
    this.refreshSelectionOverlay();
  }

  /** 블록 편집기 열기: 블록 정의를 공간처럼 열어 그리기·수정 명령으로 고친다 */
  async openBlockEditor(name: string): Promise<boolean> {
    const st = this.active;
    if (!st) return false;
    const key = tableKey(name);
    const blk = st.doc.blocks.get(key);
    if (!blk) return false;
    if (st.blockEdit) await this.closeBlockEditor(true);
    this.cancel(true);
    st.blockEdit = { name: blk.name, key, back: st.space, depth: st.session.depth };
    await this.ensureScene(st, key);
    st.space = key;
    st.selection.clear();
    this.view.setState(st);
    if (!st.cameras.has(key)) this.view.zoomExtents(false);
    this.ui.refreshLayouts();
    this.ui.refreshStatus();
    this.ui.refreshPalette();
    this.refreshSelectionOverlay();
    return true;
  }

  /** 블록 편집기 닫기. save가 거짓이면 연 뒤의 변경을 되돌린다 */
  async closeBlockEditor(save: boolean): Promise<void> {
    const st = this.active;
    const be = st?.blockEdit;
    if (!st || !be) return;
    this.cancel(true);
    if (!save) while (st.session.depth > be.depth && st.session.undo());
    await this.edits.flush(st);
    st.blockEdit = null;
    st.space = be.back;
    st.scenes.get(be.key)?.dispose(this.view.renderer);
    st.scenes.delete(be.key);
    st.edits.get(be.key)?.overlay?.dispose(this.view.renderer);
    st.edits.delete(be.key);
    st.cameras.delete(be.key);
    this.resetPicker(st, be.key);
    st.selection.clear();
    this.view.setState(st);
    this.ui.refreshLayouts();
    this.ui.refreshStatus();
    this.ui.refreshPalette();
    this.refreshSelectionOverlay();
  }

  picker(): Picker | null {
    const st = this.active;
    return st ? this.pickerFor(st, st.space) : null;
  }

  /** 공간 하나의 고르기(도면 공간의 뷰포트 안 모형 스냅은 모형 공간 것을 쓴다) */
  pickerFor(st: DocState, space: string): Picker | null {
    const scene = st.scenes.get(space);
    if (!scene) return null;
    const key = `${st.docId}:${space}`;
    let p = this.pickers.get(key);
    if (!p) {
      p = new Picker(st.doc, scene.entities, this.text, space);
      this.pickers.set(key, p);
      const ed = st.edits.get(space);
      if (ed) {
        for (const h of ed.hidden) p.exclude.add(h);
        p.extra = ed.overlay ? [...ed.overlay.entities] : [];
      }
    }
    return p;
  }

  /** 편집 뒤 고르기 상태(제외·추가 객체)를 맞춘다 */
  updatePicker(st: DocState, space: string, changed: Iterable<string>): void {
    const p = this.pickers.get(`${st.docId}:${space}`);
    if (!p) return;
    const ed = st.spaceEdits(space);
    p.exclude.clear();
    for (const h of ed.hidden) p.exclude.add(h);
    p.extra = ed.overlay ? [...ed.overlay.entities] : [];
    p.invalidate(changed);
  }

  resetPicker(st: DocState, space: string): void {
    this.pickers.delete(`${st.docId}:${space}`);
  }

  /** 변경을 한 번의 명령으로 적용한다(명령 취소 단위) */
  commit(label: string, ops: EditOp[]): void {
    const st = this.active;
    if (!st || !ops.length) return;
    st.session.commit({ label, ops });
  }

  entity(handle: string): Entity | undefined {
    return this.active?.doc.entityIndex.get(handle);
  }

  // -------------------------------------------------------------------------
  // 선택
  // -------------------------------------------------------------------------

  /** 고를 수 있는 객체만 남기는 고리(참조 편집: 작업 세트에 없는 객체 잠금) */
  selectionFilter: ((handles: string[]) => string[]) | null = null;

  setSelection(handles: Iterable<string>, mode: 'replace' | 'add' | 'remove' = 'replace'): void {
    const st = this.active;
    if (!st) return;
    if (mode !== 'remove' && this.selectionFilter) handles = this.selectionFilter([...handles]);
    if (mode === 'replace') st.selection.clear();
    for (const h of handles) {
      if (mode === 'remove') st.selection.delete(h);
      else st.selection.add(h);
    }
    this.refreshSelectionOverlay();
    this.ui.refreshPalette();
    this.ui.refreshStatus();
  }

  clearSelection(): void {
    this.setSelection([], 'replace');
  }

  /** 휴대폰 보기 모드 켜고 끄기: 켜면 진행 중 명령을 그만두고 그립을 치운다 */
  setViewOnly(on: boolean): void {
    if (this.viewOnly === on) return;
    this.viewOnly = on;
    if (on && this.running) this.cancel();
    this.refreshSelectionOverlay();
    this.view.requestOverlay();
  }

  /**
   * 설정을 다시 읽어 화면(view.prefs·선택 상자)에 넣는다. name: 바뀐 변수 — 지금 보이는 그립·미리보기를 그에 맞게 고친다
   * (없으면 처음 읽기)
   */
  applySettings(name?: string): void {
    const before = this.settings.autosnap;
    this.settings = readSettings(optionValue);
    const v = this.view;
    v.prefs = this.settings;
    if (!name || name === 'PICKBOX') v.overlay.pickbox = this.settings.pickbox;
    if (!name || name === 'POLARADDANG') this.polarAdd = polarAddList(browserSysvarText('POLARADDANG'));
    if (!name) return;
    if (name === 'POLARMODE' || name === 'POLARANG' || name === 'POLARADDANG') {
      // 추적 방식이 바뀌면 기다리던 획득을 버린다(자동 ↔ Shift)
      this.updateAcquire(null);
      this.ui?.refreshStatus();
    }
    if (name === 'AUTOSNAP') {
      // 추적 비트(8·16)는 F10·F11과 같은 상태: 어디서 바꿨든(F10·F11·상태 막대·DSETTINGS·OPTIONS·변수 입력·setvar) 같은 값을 본다
      const as = this.settings.autosnap;
      // 직교와 극좌표 추적은 함께 켤 수 없다(극좌표를 켜면 직교를 끈다)
      if (polarTrackOn(as) && !polarTrackOn(before)) this.ortho = false;
      if (!objectTrackOn(as) && objectTrackOn(before)) this.clearTracking();
      this.ui?.refreshStatus();
    }
    if (name === 'GRIPS' || name === 'GRIPSIZE') {
      this.clearGripHover();
      if (!gripsOn(this.settings.grips)) {
        this.hotGrips = [];
        v.overlay.hotGrips = [];
      }
      this.refreshSelectionOverlay();
    } else if (name === 'SELECTIONPREVIEW') {
      this.clearHover();
      v.overlay.preview = [];
    }
    v.requestOverlay();
  }

  /** 직교(F8). 켜면 극좌표 추적을 끈다(AutoCAD: 둘은 함께 켤 수 없다) */
  get orthoOn(): boolean {
    return this.ortho;
  }

  set orthoOn(on: boolean) {
    this.ortho = on;
    if (on && this.polarOn) this.polarOn = false;
  }

  /** 극좌표 추적(F10): AUTOSNAP 8과 같은 상태라 이 브라우저에 저장된다(AutoCAD는 레지스트리). 켜면 직교를 끈다 */
  get polarOn(): boolean {
    return polarTrackOn(this.settings.autosnap);
  }

  set polarOn(on: boolean) {
    if (on) this.ortho = false;
    this.setTracking({ polar: on });
  }

  /** 객체 스냅 추적(F11): AUTOSNAP 16과 같은 상태(이 브라우저에 저장) */
  get otrackOn(): boolean {
    return objectTrackOn(this.settings.autosnap);
  }

  set otrackOn(on: boolean) {
    this.setTracking({ otrack: on });
  }

  /** 극좌표 추적 설정(POLARMODE·POLARANG·POLARADDANG — 이 브라우저) */
  get polar(): PolarSettings {
    return { mode: this.settings.polarMode, inc: this.settings.polarAng, add: this.polarAdd };
  }

  /**
   * 그리는 명령(LINE·PLINE)이 선분을 하나 그렸다: 그 끝의 진행 방향(라디안)을 상대 극좌표(POLARMODE 1)의 0도 방향으로 둔다.
   * AutoCAD 제도 설정 도움말의 "마지막으로 그린 세그먼트". 문서마다 따로
   */
  noteSegment(dir: number): void {
    if (this.active && Number.isFinite(dir)) this.lastSegment.set(this.active, dir);
  }

  /** 지금 문서에서 마지막으로 그린 선분의 방향(없으면 null) */
  lastSegmentDir(): number | null {
    return this.active ? (this.lastSegment.get(this.active) ?? null) : null;
  }

  /** AUTOSNAP의 추적 비트를 바꾼다(바뀌면 onSysvarChange → applySettings가 화면·상태 막대를 맞춘다) */
  private setTracking(v: { polar?: boolean; otrack?: boolean }): void {
    const cur = browserSysvar('AUTOSNAP');
    const next = withTracking(cur, v);
    if (next !== cur) setBrowserSysvar('AUTOSNAP', next);
    // 구독이 없는 환경에서도 값이 맞게
    if (this.settings.autosnap !== next) this.applySettings('AUTOSNAP');
  }

  refreshSelectionOverlay(): void {
    const st = this.active;
    const o = this.view.overlay;
    o.selection = [];
    o.grips = [];
    this.gripList = [];
    if (st && st.selection.size) {
      const p = this.picker();
      if (p) {
        let n = 0;
        for (const h of st.selection) {
          if (n++ > 3000) break;
          o.selection.push(p.geometry(h));
        }
        // 그립(GRIPS 0이면 보이지도, 누르지도 않는다. 보기 모드도 없다)
        if (st.selection.size <= 200 && gripsOn(this.settings.grips) && !this.viewOnly) {
          // 객체별 그립(편집 커널): 누르면 그립 편집(신축·이동·회전·축척·대칭)
          for (const h of st.selection) {
            const e = st.doc.entityIndex.get(h);
            if (!e) continue;
            try {
              for (const g of gripPoints(e, st.doc)) this.gripList.push({ handle: h, id: g.id, point: g.point });
            } catch {
              /* 그립이 없는 객체 */
            }
            if (e.type === 'INSERT') {
              try {
                for (const g of dynGrips(st.doc, e)) this.gripList.push({ handle: h, id: g.id, point: g.point });
              } catch {
                /* 동적 블록 정의를 읽지 못함 */
              }
            }
            if (this.gripList.length > 2000) break;
          }
          o.grips = this.gripList.map((g) => g.point);
        }
      }
    }
    this.view.requestOverlay();
  }

  private clearHover(): void {
    if (this.hoverHandle) {
      this.hoverHandle = null;
      this.view.overlay.hover = null;
      this.view.requestOverlay();
    }
  }

  // -------------------------------------------------------------------------
  // 화면 입력
  // -------------------------------------------------------------------------

  /** 지금 점 요청에서 쓸 객체 스냅(재지정이 있으면 그것, 객체 스냅이 꺼져 있으면 null) */
  private snapModesFor(r: Request | null): ReadonlySet<SnapKind> | null {
    if (r?.kind !== 'point') return null;
    if (this.snapOverride?.req === r) return this.snapOverride.modes;
    if (r.snaps) return r.snaps;
    return this.osnapOn ? this.snapModes : null;
  }

  /** 스냅·추적·직교를 적용한 점(동적 입력 칸을 잠갔으면 그 값에 묶는다) */
  private resolvePoint(w: Pt): ResolvedPoint {
    const r = this.request;
    if (r?.kind !== 'point') return { p: w, snap: null };
    return this.dynLock(r, this.resolveRaw(r, w));
  }

  private resolveRaw(r: PointRequest, w: Pt): ResolvedPoint {
    const st = this.active!;
    const pk = this.picker();
    const modes = this.snapModesFor(r);
    this.lastSnaps = [];
    // 배치의 도면 공간에서 뷰포트에 보이는 모형 객체에도 스냅하는 요청(DIST — vpsnap.ts)
    const vpModel = r.viewportSnaps && !st.isModel && !st.msVp && modes?.size ? this.pickerFor(st, MODEL_SPACE) : null;
    if ((pk || vpModel) && modes?.size) {
      // 조준창(APERTURE, 픽셀). 보지 못하고 손가락으로 찍은 점은 두 배
      const aperture = this.settings.aperture * this.view.pixelSize() * (this.blindTouch ? 2 : 1);
      // Tab으로 도는 중이면 Tab을 누른 자리의 후보 목록을 그대로 쓴다(커서가 조준창 밖으로 나가면 처음부터)
      const cyc = this.snapCycle;
      if (cyc && (cyc.req !== r || Math.hypot(w.x - cyc.at.x, w.y - cyc.at.y) > aperture)) this.snapCycle = null;
      let list = this.snapCycle?.list;
      if (!list) {
        const scores = new Map<SnapPoint, number>();
        const own = pk ? findSnaps(st.doc, pk, w, aperture, modes, r.base, { ext: this.extAnchors, par: this.parDirs.map((d) => d.dir), deferTan: r.deferTan, deferTanLines: r.deferTanLines }, scores) : [];
        const vps = vpModel ? viewportSnaps(st.doc, layoutXfs(st.doc, st.layoutFor(st.displaySpace)), vpModel, st.layers, w, aperture, modes, r.base, scores) : [];
        list = mergeSnaps(own, vps, scores, aperture);
      }
      this.lastSnaps = list;
      const s = this.snapCycle ? list[this.snapCycle.i % list.length] : list[0];
      if (s) {
        const p = { x: s.x, y: s.y };
        // 연장선·평행은 정렬선을 함께 보인다
        const track = s.lines?.length ? { p, lines: s.lines, tip: SNAP_NAMES[s.kind] ?? '' } : undefined;
        return { p, snap: { p, kind: s.kind, handle: s.handle, handle2: s.handle2, ...(s.deferred ? { deferred: true } : {}), ...(s.z !== undefined ? { z: s.z } : {}), ...(s.viewport ? { viewport: s.viewport } : {}) }, track };
      }
    }
    // 확장 지점: 객체 스냅이 없으면 고리가 추적·격자 스냅·직교를 대신할 수 있다(등각투영 제도)
    for (const f of this.pointFilters) {
      const res = f.resolve(w, { base: r.base, acquired: this.acquired });
      if (res) return res;
    }
    const tol = 8 * this.view.pixelSize();
    const fmt = (v: number) => formatLength(v, st.units);
    // Shift를 누르는 동안 직교를 뒤집는다(켜져 있으면 끄고, 꺼져 있으면 켠다)
    const ortho = this.orthoOn !== this.shiftHeld;
    // 극좌표 각도는 도면 단위의 0 방향(UCS X축 + ANGBASE)에서 ANGDIR 쪽으로(절대), POLARMODE 1이면 마지막으로 그린 선분에서(상대).
    // 증분 각도의 배수와 POLARMODE 4면 추가 각도. 툴팁 각도는 그 0 방향에서 같은 쪽으로 재서 AUNITS·AUPREC로 보인다
    const ua = currentUcs(st).angle;
    const ps = this.polar;
    const units = st.units;
    const cw = clockwise(units);
    const polarActive = this.polarOn && !ortho;
    const pref = polarReference(ps.mode, ua, this.lastSegmentDir(), angleBase(units));
    const pa = polarActive ? polarDirections(ps, pref.ref, cw) : null;
    const ptip: PolarTip = { ref: pref.ref, cw, angle: (a) => trackAngleText(a, units, pref.relative), label: pref.relative ? '상대 극좌표' : '극좌표' };
    // 획득점: 객체 스냅 추적이 켜져 있으면 획득한 점, 임시 추적점(TT)은 꺼져 있어도
    const temp = this.tempTrack?.req === r ? this.tempTrack.points : [];
    const acq = [...(this.otrackOn ? this.acquired : []), ...temp];
    if (acq.length) {
      // 획득점에서는 수평·수직(POLARMODE 2이고 극좌표 추적 중이면 극좌표 추적 설정의 각도 — 절대 극좌표와 같은 0 방향). 툴팁은 절대 각도
      const atip: PolarTip = { ref: ua + angleBase(units), cw, angle: (a) => trackAngleText(a, units, false) };
      const t = objectTrack(acq, w, otrackDirections(ps, polarActive, ua, units), tol, r.base, pa, fmt, atip, ptip);
      if (t) return { p: t.p, snap: null, track: t };
    }
    if (r.base && pa) {
      const t = polarTrack(r.base, w, pa, tol, fmt, ptip);
      if (t) return { p: t.p, snap: null, track: t };
    }
    // 격자 스냅(객체 스냅·추적이 먼저)
    if (this.snapOn) w = this.snapToGrid(w);
    if (r.base && ortho) {
      // 직교는 UCS 축 방향
      const u = currentUcs(st);
      const d = dirToUcs(u, { x: w.x - r.base.x, y: w.y - r.base.y });
      const keep = Math.abs(d.x) >= Math.abs(d.y) ? { x: d.x, y: 0 } : { x: 0, y: d.y };
      const c = Math.cos(u.angle);
      const sn = Math.sin(u.angle);
      return { p: { x: r.base.x + keep.x * c - keep.y * sn, y: r.base.y + keep.x * sn + keep.y * c }, snap: null };
    }
    return { p: w, snap: null };
  }

  /** 동적 입력 칸을 잠갔으면 점을 그 값(거리·각도 또는 X·Y)에 묶는다 */
  private dynLock(r: PointRequest, res: ResolvedPoint): ResolvedPoint {
    const st = this.active;
    if (!st || !this.dynOn || !this.dyn.locked) return res;
    return { p: this.dyn.constrain(r.base, res.p, currentUcs(st), st.units.aunits, st.units), snap: null };
  }

  /**
   * 객체 스냅 추적점 획득: 스냅점 위에 잠시 머물면 획득(다시 머물면 해제). POLARMODE 8이면 머무는 것으로는 얻지 않고
   * Shift를 누른 채 스냅점을 지나거나 스냅점 위에서 Shift를 누르면 바로 얻는다(AutoCAD "Shift 키를 눌러 획득")
   */
  private updateAcquire(snap: { p: Pt; kind: SnapKind } | null): void {
    const c = this.acqCandidate;
    if (!snap || !this.otrackOn || this.request?.kind !== 'point') {
      if (c) clearTimeout(c.timer);
      this.acqCandidate = null;
      this.shiftAcq = null;
      return;
    }
    const p = snap.p;
    const label = SNAP_NAMES[snap.kind] ?? '점';
    if (shiftAcquire(this.settings.polarMode)) {
      if (c) clearTimeout(c.timer);
      this.acqCandidate = null;
      if (!this.shiftHeld) {
        this.shiftAcq = null;
        return;
      }
      if (this.shiftAcq && samePt(this.shiftAcq, p)) return;
      this.shiftAcq = p;
      this.toggleAcquired(p, label);
      return;
    }
    if (c && Math.abs(c.p.x - snap.p.x) < 1e-9 && Math.abs(c.p.y - snap.p.y) < 1e-9) return;
    if (c) clearTimeout(c.timer);
    this.acqCandidate = { p, timer: window.setTimeout(() => this.toggleAcquired(p, label), 450) };
  }

  /** 획득점을 더하거나(이미 있으면) 뺀다. 일곱 개까지(오래된 것부터 버린다) */
  private toggleAcquired(p: Pt, label: string): void {
    const i = this.acquired.findIndex((a) => Math.abs(a.p.x - p.x) < 1e-9 && Math.abs(a.p.y - p.y) < 1e-9);
    if (i >= 0) this.acquired.splice(i, 1);
    else {
      this.acquired.push({ p, label });
      if (this.acquired.length > 7) this.acquired.shift();
    }
    this.refreshAcquired();
    this.view.requestOverlay();
  }

  /**
   * 연장선(EXT)·평행(PAR) 획득: 선·호·열린 폴리선의 끝점 위에 잠시 머물면 연장선 획득점, 기준점이 있을 때 선분 위에 머물면 평행 방향.
   * 같은 끝점·방향은 한 번만, 연장선은 네 개·평행은 두 개까지(오래된 것부터 버린다)
   */
  private updateExtPar(w: Pt): void {
    const r = this.request;
    const modes = this.snapModesFor(r);
    const pk = this.picker();
    const wantExt = !!modes?.has('ext');
    const wantPar = !!modes?.has('par') && r?.kind === 'point' && !!r.base;
    if (!pk || (!wantExt && !wantPar)) return this.dropExtCandidate();
    const ap = this.settings.aperture * this.view.pixelSize();
    const a = wantExt ? findExtAnchor(pk, w, ap) : null;
    const d = !a && wantPar ? segmentDirAt(pk, w, ap * 0.6) : null;
    const key = a ? `e${a.p.x},${a.p.y}` : d ? `p${d.dir.x.toFixed(9)},${d.dir.y.toFixed(9)}` : '';
    if (!key) return this.dropExtCandidate();
    if (this.extCandidate?.key === key) return;
    this.dropExtCandidate();
    this.extCandidate = {
      key,
      timer: window.setTimeout(() => {
        this.extCandidate = null;
        if (this.request !== r) return;
        if (a && !this.extAnchors.some((x) => samePt(x.p, a.p))) {
          this.extAnchors.push(a);
          if (this.extAnchors.length > 4) this.extAnchors.shift();
        }
        if (d && !this.parDirs.some((x) => Math.abs(x.dir.x * d.dir.y - x.dir.y * d.dir.x) < 1e-9)) {
          this.parDirs.push(d);
          if (this.parDirs.length > 2) this.parDirs.shift();
        }
        this.refreshAcquired();
        this.view.requestOverlay();
      }, 400),
    };
  }

  private dropExtCandidate(): void {
    if (this.extCandidate) clearTimeout(this.extCandidate.timer);
    this.extCandidate = null;
  }

  /** 획득점 표시(+): 객체 스냅 추적·임시 추적점·연장선·평행. 같은 점(끝점을 추적과 연장선이 함께 얻음)은 + 하나 */
  private refreshAcquired(): void {
    const temp = this.tempTrack && this.tempTrack.req === this.request ? this.tempTrack.points : [];
    const all = [...this.acquired.map((a) => a.p), ...temp.map((a) => a.p), ...this.extAnchors.map((a) => a.p), ...this.parDirs.map((d) => d.at)];
    this.view.overlay.acquired = all.filter((p, i) => !all.slice(0, i).some((q) => samePt(p, q)));
  }

  private clearTracking(): void {
    this.acquired = [];
    if (this.acqCandidate) clearTimeout(this.acqCandidate.timer);
    this.acqCandidate = null;
    this.extAnchors = [];
    this.parDirs = [];
    this.dropExtCandidate();
    this.view.overlay.acquired = [];
    this.view.overlay.tracks = [];
  }

  /** Shift를 누르고 뗄 때(키보드): 임시 직교가 바로 보이게 마지막 커서 점을 다시 해석한다 */
  private setShift(on: boolean): void {
    if (this.shiftHeld === on) return;
    this.shiftHeld = on;
    const m = this.lastMove;
    if (m && this.request?.kind === 'point') this.onMove(m.w, m.s, m.ev, true);
  }

  /** 동적 입력 칸(점 요청, 동적 입력이 켜져 있고 숫자·글 프롬프트가 아닐 때) */
  private updateDynFields(p?: Pt): void {
    const o = this.view.overlay;
    const r = this.request;
    const st = this.active;
    const q = p ?? this.lastResolved ?? this.cursorWorld;
    if (!st || !this.dynOn || r?.kind !== 'point' || r.allowText || !o.cursor || !q) {
      o.dynFields = null;
      return;
    }
    o.dynFields = this.dyn.fields(r.base, q, this.cmd.input.value, currentUcs(st), (v) => formatLength(v, st.units), st.units);
  }

  /** 마지막으로 해석한 커서 점(동적 입력 칸) */
  private lastResolved: Pt | null = null;
  /** 커서 자리의 Z(상태 막대 좌표 — COORDS 0이 찍은 점에 쓴다) */
  private coordsZ = 0;

  private onMove(w: Pt, s: Pt, ev: PointerEvent, fromKey = false): void {
    const o = this.view.overlay;
    // 터치는 커서가 없다. 정밀 조준(길게 누르기) 중에는 손가락 위 십자선을 마우스 커서처럼 쓴다
    const aiming = this.view.aiming;
    o.cursor = ev.pointerType === 'touch' && !aiming ? null : s;
    this.cursorWorld = w;
    this.lastMove = { w, s, ev };
    if (!fromKey) this.shiftHeld = ev.shiftKey;
    const st = this.active;
    if (!st) return;
    const r = this.request;
    if (r?.kind === 'point') this.updateExtPar(w);
    const { p, snap, track } = this.resolvePoint(w);
    this.lastResolved = p;
    o.snap = snap;
    // AutoSnap 마그넷(AUTOSNAP 4): 잡은 스냅점에 십자선을 붙인다. 끄면 표식기만 스냅점에 보이고 십자선은 커서 자리
    if (snap && o.cursor) o.cursor = magnetCursor(o.cursor, this.view.worldToScreen(snap.p.x, snap.p.y), this.settings.autosnap);
    o.tracks = track ? track.lines.map((l) => ({ from: l.from, dir: l.dir })) : [];
    this.updateAcquire(snap);
    if (r?.kind === 'point') {
      // 끌기 미리보기(DRAGMODE)가 꺼져 있으면 명령의 미리보기 대신 기준점 고무줄만
      const drag = this.dragPreviewOn(r);
      o.rubber = r.rubber && drag ? r.rubber(p, snap) : r.base ? [{ pts: [r.base.x, r.base.y, p.x, p.y], dashed: false }] : [];
      o.ghost = r.ghost && drag ? r.ghost(p) : [];
      this.updateDynFields(p);
      // 툴팁: 객체 스냅 이름(AUTOSNAP 2), 추적 거리·각도(AUTOSNAP 32). 끄면 그 자리에 보통 문구
      const as = this.settings.autosnap;
      if (snap && showSnapTip(as)) o.tip = snap.deferred ? '지연된 접점' : (SNAP_NAMES[snap.kind] ?? null);
      else if (track && !snap && showTrackTip(as)) o.tip = track.tip;
      else if (r.tip) o.tip = r.tip(p);
      else if (!this.dynOn) o.tip = null;
      else if (r.base && !o.dynFields) {
        const d = Math.hypot(p.x - r.base.x, p.y - r.base.y);
        let a = (Math.atan2(p.y - r.base.y, p.x - r.base.x) * 180) / Math.PI;
        if (a < 0) a += 360;
        o.tip = `${formatLength(d, st.units)} < ${a.toFixed(1)}°`;
      } else o.tip = r.prompt.replace(/\[.*$/, '').replace(/:\s*$/, '');
    }
    if (this.windowStart) {
      o.windowRect = { a: this.windowStart.screen, b: s };
      this.updateSelectPreview();
    }
    // 상태 막대 좌표(도움말 COORDS — coords.ts): 1은 절대 좌표 X, Y, Z(Z도 절대 값), 2는 점을 물을 때 기준점에서 상대 극좌표,
    // 0은 점을 지정할 때만(finishPoint). 이 앱의 UCS는 평면 안의 원점·회전뿐이라 Z는 WCS Z 그대로
    this.coordsZ = this.cursorZ(snap);
    const cm = coordsMode();
    if (cm !== 0) this.ui.setCoords(coordsText(st, p, this.coordsZ, cm === 2 && r?.kind === 'point' ? r.base : null));
    // 다기능 그립: 선택한 객체의 그립 위(명령 없음)
    if (!r && !this.running && !this.press) this.updateGripHover(w, ev);
    // 선택 미리보기(가만히 있을 때)
    if (!r && !this.windowStart && !this.press && (ev.pointerType !== 'touch' || aiming)) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => this.updateHover(w), 40);
    } else if (r?.kind === 'entity' || r?.kind === 'select') {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => this.updateHover(w), 30);
    }
    this.view.requestOverlay();
  }

  // ------------------------------------------------------------------------- 다기능 그립

  /** 커서 근처의 그립(그립 상자보다 2픽셀 넉넉히 — GRIPSIZE 5에서 6픽셀, 터치는 두 배) */
  private gripAt(w: Pt, touch = false): { handle: string; id: string; point: Pt } | null {
    if (!this.gripList.length) return null;
    const gt = gripPickRadius(this.settings.gripSize, touch) * this.view.pixelSize();
    let best: { handle: string; id: string; point: Pt } | null = null;
    let bd = Infinity;
    for (const g of this.gripList) {
      const d = Math.hypot(g.point.x - w.x, g.point.y - w.y);
      if (d <= gt && d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  /**
   * 그립 위에 커서가 오면 분홍, 약 0.5초 머물면 다기능 그립 메뉴(항목이 있고 GRIPMULTIFUNCTIONAL 비트 2일 때).
   * 메뉴는 그립에서 멀어지면 닫는다
   */
  private updateGripHover(w: Pt, ev: PointerEvent): void {
    const g = ev.pointerType !== 'touch' && this.active?.selection.size ? this.gripAt(w) : null;
    const cur = this.hoverGrip;
    if (g && cur && samePt(cur.point, g.point)) return;
    if (cur) {
      clearTimeout(cur.timer);
      if (cur.shown) {
        // 커서를 메뉴로 옮기는 동안은 둔다
        if (!g && Math.hypot(w.x - cur.point.x, w.y - cur.point.y) <= 40 * this.view.pixelSize()) return;
        closeMenu();
      }
    }
    if (!g && !cur) return;
    const cx = ev.clientX;
    const cy = ev.clientY;
    // 커서를 올리면 뜨는 메뉴는 GRIPMULTIFUNCTIONAL 비트 2일 때만(오른쪽 클릭 메뉴는 늘)
    const menu = gripHoverMenu(this.settings.gripMultifunctional);
    this.hoverGrip = g ? { point: g.point, shown: false, timer: menu ? window.setTimeout(() => this.showGripMenu(g.point, cx, cy), 500) : 0 } : null;
    this.view.overlay.hoverGrip = g ? g.point : null;
    this.view.requestOverlay();
  }

  private clearGripHover(): void {
    if (this.hoverGrip) clearTimeout(this.hoverGrip.timer);
    this.hoverGrip = null;
    if (this.view.overlay.hoverGrip) {
      this.view.overlay.hoverGrip = null;
      this.view.requestOverlay();
    }
  }

  /** 그 점의 그립들에 고리(App.gripMenuProviders)가 붙인 메뉴 항목(같은 이름은 한 번) */
  gripMenuItems(point: Pt): ContextMenuItem[] {
    const st = this.active;
    if (!st) return [];
    const out: ContextMenuItem[] = [];
    const seen = new Set<string>();
    for (const g of this.gripList) {
      if (!samePt(g.point, point)) continue;
      const e = st.doc.entityIndex.get(g.handle);
      if (!e) continue;
      for (const pv of this.gripMenuProviders) {
        for (const it of pv.items(g, e, st) ?? []) {
          if (seen.has(it.label)) continue;
          seen.add(it.label);
          out.push({ label: it.label, run: () => void it.run() });
        }
      }
    }
    return out;
  }

  private showGripMenu(point: Pt, x: number, y: number): void {
    const h = this.hoverGrip;
    if (!h || !samePt(h.point, point) || this.request || this.running) return;
    const items = this.gripMenuItems(point);
    if (!items.length) return;
    h.shown = true;
    this.view.el.title = '';
    showContextMenu(x + 6, y + 6, items);
  }

  /** 이 점 요청에서 명령의 끌기 미리보기(ghost·rubber)를 보이는지: 자동(2)이거나, 켜기(1)이고 이 요청에서 DRAG를 입력했을 때 */
  private dragPreviewOn(r: PointRequest): boolean {
    const m = this.dragPreviewMode ? this.dragPreviewMode() : 2;
    return m === 2 || (m === 1 && this.dragFor === r);
  }

  /** DRAG: 지금(마지막) 점 요청에서 끌기 미리보기를 보인다(DRAGMODE 켜기일 때 쓴다) */
  dragPreviewNow(): void {
    this.dragFor = this.lastPointRequest;
    this.view.requestOverlay();
  }

  private updateHover(w: Pt): void {
    const pk = this.picker();
    if (!pk) return;
    const tol = this.view.overlay.pickbox * this.view.pixelSize();
    const h = pk.pick(w.x, w.y, tol);
    // 객체 요청(viewportPick)에서 배치 객체가 없으면 뷰포트에 보이는 모형 객체를 종이 위치에 강조한다
    const r = this.request;
    const vp = !h && r?.kind === 'entity' ? this.viewportPickAt(r, w, tol) : null;
    const key = vp ? `vp:${vp.pick.viewport.handle}:${vp.pick.handle}` : h;
    if (key === this.hoverHandle) return;
    this.hoverHandle = key;
    // 호버 강조는 선택 미리보기(SELECTIONPREVIEW)가 켜져 있을 때만(하이퍼링크 툴팁은 그대로)
    const show = previewOn(this.settings.selectionPreview, !!this.request || !!this.running);
    if (vp) {
      const g = this.pickerFor(this.active!, MODEL_SPACE)?.geometry(vp.pick.handle);
      this.view.overlay.hover = show && g ? geometryToPaper(vp.vx, g) : null;
      this.view.el.title = '';
    } else {
      this.view.overlay.hover = show && h && !this.active?.selection.has(h) ? pk.geometry(h) : null;
      this.view.el.title = h && this.hoverTip && !this.request ? (this.hoverTip(h) ?? '') : '';
    }
    this.view.requestOverlay();
  }

  /**
   * 객체 요청(viewportPick)에서 배치 객체가 없는 자리: 배치의 도면 공간이면 단일 뷰포트에 보이는 모형 객체(vpsnap.viewportPick)와
   * 그 뷰포트 변환. 모형 공간·뷰포트 안 모형 공간(MSPACE)·블록 편집기에서는 null(전과 같다)
   */
  private viewportPickAt(r: EntityRequest, w: Pt, tol: number): { pick: ViewportPick; vx: ViewportXf } | null {
    return r.viewportPick ? this.viewportObjectAt(w, tol) : null;
  }

  /**
   * 배치의 도면 공간에서 종이 점 w(허용 거리 tol, 종이 단위)에 단일 뷰포트로 보이는 모형 객체와 그 뷰포트 변환(vpsnap.viewportPick).
   * 객체 요청의 viewportPick과 스마트 치수 DIM의 마우스 아래 객체(24차)가 쓴다. 모형 공간·MSPACE·블록 편집기에서는 null
   */
  viewportObjectAt(w: Pt, tol: number): { pick: ViewportPick; vx: ViewportXf } | null {
    const st = this.active;
    if (!st || st.isModel || st.msVp) return null;
    const model = this.pickerFor(st, MODEL_SPACE);
    if (!model) return null;
    const vxs = layoutXfs(st.doc, st.layoutFor(st.displaySpace));
    const pick = viewportPick(vxs, model, st.layers, w, tol);
    const vx = pick && vxs.find((v) => v.vp.handle === pick.viewport.handle);
    return pick && vx ? { pick, vx } : null;
  }

  /** 종이 좌표의 점이 든 뷰포트(가장 앞) */
  viewportAt(st: DocState, p: Pt): ViewportEntity | null {
    const lay = st.layoutFor(st.displaySpace);
    if (!lay) return null;
    const vps = layoutViewports(st.doc, lay);
    for (let i = vps.length - 1; i >= 0; i--) {
      const v = vps[i]!;
      if (Math.abs(p.x - v.center.x) <= v.width / 2 && Math.abs(p.y - v.center.y) <= v.height / 2) return v;
    }
    return null;
  }

  private onClick(w: Pt, s: Pt, ev: PointerEvent): void {
    closeMenu();
    this.press = null;
    const st = this.active;
    if (!st) return;
    if (st.msVp) {
      // MSPACE: 활성 뷰포트 밖을 누르면 그 자리의 뷰포트를 활성으로(없으면 무시)
      const pp = this.view.paperPoint(s.x, s.y);
      const at = this.viewportAt(st, pp);
      if (!at) return;
      if (at.handle !== st.msVp.handle) {
        if (this.request) {
          this.flushViewportView();
          if (!at.twistAngle) st.msVp.handle = at.handle;
          this.view.requestRender();
          this.view.requestOverlay();
        } else this.enterViewport(st, at);
        return;
      }
    }
    const r = this.request;
    if (r?.kind === 'point') {
      this.shiftHeld = ev.shiftKey;
      this.blindTouch = ev.pointerType === 'touch' && !this.view.aiming;
      let resolved: ResolvedPoint;
      try {
        resolved = this.resolvePoint(w);
      } finally {
        this.blindTouch = false;
      }
      const { p, snap } = resolved;
      // 스냅 재지정(NON 말고)·요청의 스냅이 잡히지 않은 곳이면 다시 묻는다
      const ov = this.snapOverride?.req === r ? this.snapOverride.modes : r.snaps;
      if (ov?.size && !snap && !(this.dynOn && this.dyn.locked)) {
        this.cmd.print('객체 스냅 점을 찾지 못했습니다. 다시 지정하십시오.', 'err');
        return;
      }
      if (this.outsideLimits(p)) return;
      // 스냅의 Z를 받는 요청(snapZ — LINE·CIRCLE 중심·3DPOLY·3DFACE)은 객체에 잡힌 스냅 점의 Z를 받는다(OSNAPZ 0).
      // OSNAPZ 1이면 그 Z를 지금 고도로 바꾼다(Z 없이 — 명령이 고도를 쓴다). 그 밖의 점·요청은 Z 없이(고도)
      const z = r.snapZ && !this.osnapZ && snap?.z !== undefined ? snap.z : undefined;
      this.lastPoint = z === undefined ? p : { ...p, z };
      this.finishPoint(r, { point: p, ...(z !== undefined ? { z } : {}), snap: snap ? { kind: snap.kind, handle: snap.handle, handle2: snap.handle2, ...(snap.deferred ? { deferred: true } : {}), ...(snap.viewport ? { viewport: snap.viewport } : {}) } : null, ...(ev.shiftKey ? { shift: true } : {}), ...(ev.ctrlKey || ev.metaKey ? { ctrl: true } : {}) });
      return;
    }
    const pk = this.picker();
    if (!pk) return;
    const tol = this.view.overlay.pickbox * this.view.pixelSize() * (ev.pointerType === 'touch' ? 3 : 1);
    const shift = ev.shiftKey ? { shift: true as const } : {};
    if (r?.kind === 'entity') {
      const h = pk.pick(w.x, w.y, tol);
      // 배치 객체가 먼저, 없으면(viewportPick) 단일 뷰포트에 보이는 모형 객체
      const vp = h ? null : this.viewportPickAt(r, w, tol);
      if (h) r.resolve({ handle: h, point: w, ...shift });
      else if (vp) r.resolve({ handle: vp.pick.handle, point: w, viewport: vp.pick.viewport, ...shift });
      else if (r.emptyPick) {
        this.lastPoint = w;
        r.resolve({ point: w, empty: true, ...shift });
      }
      return;
    }
    if (r?.kind === 'select') {
      if (this.windowStart?.viaClick) {
        this.finishWindow(this.windowStart.screen, s, ev, r.remove);
        return;
      }
      const pickIt = (h: string) => {
        this.clearHover();
        // 다중(M): 강조 없이 모았다가 Enter로 더한다
        if (r.multiple) {
          if (!r.multiple.includes(h)) r.multiple.push(h);
          this.cmd.print('1개를 찾음');
          return;
        }
        // PICKADD: 1·2 더하기(Shift 빼기), 0 바꾸기(Shift 더하기)
        this.pickedInSelect(r, this.expandPick([h]), pickMode(this.settings.pickadd, { shift: ev.shiftKey, removing: r.remove }));
      };
      if (this.cycleMenu(pk, w, tol, ev, pickIt)) return;
      const h = pk.pick(w.x, w.y, tol);
      if (h) {
        pickIt(h);
        return;
      }
      // 빈 곳: 창 선택 시작(PICKAUTO 1). 끄면 W·C 같은 선택 방식을 쳐야 한다
      if (!autoWindow(this.settings.pickauto, true)) {
        this.cmd.print(`*잘못된 선택* ${SELECT_HELP}`, 'err');
        return;
      }
      this.windowStart = { screen: s, world: w, viaClick: true };
      this.previewAt = 0;
      this.view.overlay.windowRect = { a: s, b: s };
      this.view.requestOverlay();
      return;
    }
    // 선택
    if (this.windowStart?.viaClick) {
      this.finishWindow(this.windowStart.screen, s, ev);
      return;
    }
    // 그립: 누르면 그립 편집, Shift+클릭은 핫 그립 더하기·빼기(보기 모드는 그립이 없다)
    if (!r && !this.viewOnly && st.selection.size && this.gripList.length && !this.busyCommand) {
      const g = this.gripAt(w, ev.pointerType === 'touch');
      // 방금 객체를 고른 클릭과 같은 자리를 곧바로 다시 누르면 두 번 누르기다(AutoCAD처럼 그립 편집 대신 dblclick이 맡는다)
      const lp = this.lastPickClick;
      if (g && !ev.shiftKey && lp && isDoubleClickFollowUp(lp, performance.now(), s)) {
        this.lastPickClick = null;
        return;
      }
      if (g) {
        this.clickGrip(g.point, ev.shiftKey);
        return;
      }
    }
    const h = pk.pick(w.x, w.y, tol);
    // Ctrl+클릭: 확장 지점(연관 배열 항목 고르기 등)이 먼저, 그다음 하이퍼링크를 따라간다
    if (h && (ev.ctrlKey || ev.metaKey) && !r && (this.entityClickHandlers.some((f) => f.click(h, w)) || this.linkClick?.(h))) return;
    const pickIt = (h: string) => {
      const hs = this.expandPick([h]);
      // PICKADD 1·2: 더하기(Shift로 누르면 고른 것은 빼고 아니면 더한다), 0: 바꾸기(Shift 더하기·빼기). 보기 모드는 누른 것 하나(정보 카드)
      this.setSelection(hs, this.viewOnly ? 'replace' : pickMode(this.settings.pickadd, { shift: ev.shiftKey, selected: st.selection.has(h) }));
      this.clearHover();
      if (!r) this.lastPickClick = { time: performance.now(), screen: s };
    };
    if (h && this.cycleMenu(pk, w, tol, ev, pickIt)) return;
    if (h) {
      pickIt(h);
      return;
    }
    if (ev.pointerType === 'touch') {
      this.clearSelection();
      return;
    }
    // 빈 곳: 창 선택 시작(클릭-클릭, PICKAUTO 4)
    if (!autoWindow(this.settings.pickauto, false)) return;
    this.windowStart = { screen: s, world: w, viaClick: true };
    this.previewAt = 0;
    this.view.overlay.windowRect = { a: s, b: s };
    this.view.requestOverlay();
  }

  /**
   * 그립을 눌렀을 때. Shift면 핫 그립에 더하거나 빼고(명령은 시작하지 않는다), 아니면 그립 편집(GRIPEDIT):
   * 누른 그립이 핫 그립 가운데 하나면 모든 핫 그립을, 아니면 그 그립 하나를(같은 점에 겹친 그립은 함께) 넘긴다
   */
  private clickGrip(point: Pt, shift: boolean): void {
    this.clearGripHover();
    closeMenu();
    const i = this.hotGrips.findIndex((p) => samePt(p, point));
    if (shift) {
      if (i >= 0) this.hotGrips.splice(i, 1);
      else this.hotGrips.push(point);
      this.view.overlay.hotGrips = [...this.hotGrips];
      this.view.requestOverlay();
      return;
    }
    const points = i >= 0 ? [...this.hotGrips] : [point];
    const items = this.gripList.filter((g) => points.some((p) => samePt(p, g.point))).map((g) => ({ handle: g.handle, id: g.id, point: g.point }));
    this.hotGrips = [];
    this.hotGrip = { point, items };
    this.view.overlay.hotGrips = points.filter((p) => !samePt(p, point));
    this.view.overlay.hotGrip = point;
    void this.run('GRIPEDIT');
  }

  /** 객체 선택 프롬프트에서 고른 것(단계로 남기고, 단일이면 끝) */
  private pickedInSelect(r: SelectRequest, hs: string[], mode: PickMode): void {
    this.selectStep(r.history, hs, mode);
    if (r.single && this.request === r) r.resolve({ handles: [...(this.active?.selection ?? [])] });
  }

  /** 왼쪽 버튼을 눌렀을 때(명령이 없거나 객체 선택 중): 그립·끌어 옮기기·창 가운데 무엇인지 정해 둔다 */
  private onDown(w: Pt, s: Pt, ev: PointerEvent): void {
    this.press = null;
    const st = this.active;
    const r = this.request;
    if (!st || ev.pointerType === 'touch' || (r && r.kind !== 'select') || this.windowStart?.viaClick) return;
    let kind: 'grip' | 'move' | 'window' = 'window';
    if (!r && !this.running && st.selection.size) {
      const onGrip = !!this.gripAt(w);
      const hit = onGrip ? null : (this.picker()?.pick(w.x, w.y, this.view.overlay.pickbox * this.view.pixelSize()) ?? null);
      kind = pressKind({ onGrip, hit, selected: st.selection, busy: false });
    }
    this.press = { kind, world: w, screen: s };
    this.previewAt = 0;
  }

  private onDrag(a: Pt, b: Pt, done: boolean, ev: PointerEvent): void {
    const st = this.active;
    // 그립을 눌러 끌기: 그립 편집을 시작하고, 놓은 곳을 그 점으로(클릭-클릭과 같은 결과)
    if (this.press?.kind === 'grip') {
      const pr = this.press;
      if (!pr.started) {
        pr.started = true;
        const g = this.gripAt(pr.world);
        if (g) this.clickGrip(g.point, false);
      }
      if (done) {
        this.press = null;
        if (this.request?.kind === 'point') this.onClick(this.view.screenToWorld(b.x, b.y), b, ev);
      }
      return;
    }
    if (!st || (this.request && this.request.kind !== 'select')) return;
    const pr = this.press ?? (this.press = { kind: 'window', world: this.view.screenToWorld(a.x, a.y), screen: { x: a.x, y: a.y } });
    this.clearGripHover();
    if (pr.kind === 'move') {
      this.dragMove(pr, b, done, ev);
      return;
    }
    const remove = this.request?.kind === 'select' ? this.request.remove : false;
    // 빈 곳을 누른 채 끌어 고르기는 PICKAUTO(객체 선택 프롬프트 1, 명령 프롬프트 4)가 켜져 있을 때만
    if (!this.windowStart && !autoWindow(this.settings.pickauto, this.request?.kind === 'select')) {
      if (done) this.press = null;
      return;
    }
    // 누른 채 끌기: 올가미(AutoCAD 기본), 끄면 직사각형 창
    if (this.lassoOn && !this.windowStart) {
      const lasso = pr.lasso ?? (pr.lasso = new Lasso(pr.screen));
      lasso.add(b);
      const o = this.view.overlay;
      o.lasso = { pts: lasso.pts, mode: lasso.mode };
      o.windowRect = null;
      this.cmd.setPrompt(`${lasso.label} 옵션을 순환하려면 스페이스바를 누르십시오.`);
      if (!done) {
        this.updateSelectPreview();
        this.view.requestOverlay();
        return;
      }
      this.press = null;
      o.lasso = null;
      o.preview = [];
      this.restorePrompt();
      if (!lasso.usable) {
        this.finishWindow(a, b, ev, remove);
        return;
      }
      const pk = this.picker();
      if (pk) this.applyPicked(this.expandPick(lasso.select(pk, (p) => this.view.screenToWorld(p.x, p.y))), pickMode(this.settings.pickadd, { shift: ev.shiftKey, removing: remove }));
      this.view.requestOverlay();
      return;
    }
    this.view.overlay.windowRect = { a, b };
    this.updateSelectPreview();
    this.view.requestOverlay();
    if (done) {
      this.press = null;
      this.finishWindow(a, b, ev, remove);
    }
  }

  /** 올가미·창 선택이 끝난 뒤 명령행 프롬프트를 되돌린다 */
  private restorePrompt(): void {
    const r = this.request;
    this.cmd.setPrompt(!r ? '' : r.kind === 'select' ? (r.remove ? '객체 제거:' : r.prompt) : this.promptOf(r));
  }

  /** 선택한 객체를 끌어 옮기기(놓을 때 Ctrl·⌘이면 복사) */
  private dragMove(pr: NonNullable<App['press']>, b: Pt, done: boolean, ev: PointerEvent): void {
    const st = this.active!;
    const wb = this.view.screenToWorld(b.x, b.y);
    const d = { x: wb.x - pr.world.x, y: wb.y - pr.world.y };
    const copy = ev.ctrlKey || ev.metaKey;
    const o = this.view.overlay;
    if (!pr.ghost) {
      const pk = this.picker();
      pr.ghost = new DragGhost(pk ? [...st.selection].slice(0, 3000).map((h) => pk.geometry(h)) : []);
      this.clearHover();
    }
    if (!done) {
      o.ghost = pr.ghost.at(d.x, d.y);
      o.rubber = [{ pts: [pr.world.x, pr.world.y, wb.x, wb.y], dashed: true }];
      o.tip = copy ? '복사' : '이동';
      this.view.requestOverlay();
      return;
    }
    this.press = null;
    o.ghost = [];
    o.rubber = [];
    o.tip = null;
    this.view.requestOverlay();
    void commitDrag(this, [...st.selection], d, copy);
  }

  /**
   * 오른쪽 버튼을 눌렀다(마우스·펜): 명령이 없고 고른 객체 위(그립이 아닌 곳 — 왼쪽 끌기와 같은 판정)면 끌어 놓기를 지켜본다.
   * 보기 모드·명령 중·선택 없음·손가락은 아니다(손가락의 길게 누르기는 정밀 조준)
   */
  private onRightDown(w: Pt, _s: Pt, ev: PointerEvent): boolean {
    void _s;
    if (this.rightPress?.menu) closeMenu();
    this.rightPress = null;
    const st = this.active;
    if (!st || this.viewOnly || this.request || this.running || !st.selection.size || ev.pointerType === 'touch' || this.windowStart) return false;
    const onGrip = !!this.gripAt(w);
    const hit = onGrip ? null : (this.picker()?.pick(w.x, w.y, this.view.overlay.pickbox * this.view.pixelSize()) ?? null);
    if (pressKind({ onGrip, hit, selected: st.selection, busy: false }) !== 'move') return false;
    this.rightPress = { world: w };
    return true;
  }

  /**
   * 오른쪽 버튼으로 고른 객체를 끈다: 미리보기가 따라오고, 놓으면 그 자리에 메뉴(여기로 이동·여기로 복사·블록으로 붙여넣기·취소 —
   * AutoCAD 도움말 "About Copying Objects"). 기준점은 누른 자리. 메뉴가 닫히면(고르든 Esc·바깥을 누르든) 미리보기를 치운다
   */
  private onRightDrag(a: Pt, b: Pt, phase: 'move' | 'drop' | 'cancel', ev: PointerEvent): void {
    void a;
    const st = this.active;
    const pr = this.rightPress;
    if (!st || !pr || pr.menu) return;
    if (phase === 'cancel') {
      this.endRightDrag();
      return;
    }
    const wb = this.view.screenToWorld(b.x, b.y);
    const d = { x: wb.x - pr.world.x, y: wb.y - pr.world.y };
    const o = this.view.overlay;
    if (!pr.ghost) {
      const pk = this.picker();
      pr.ghost = new DragGhost(pk ? [...st.selection].slice(0, 3000).map((h) => pk.geometry(h)) : []);
      this.clearHover();
    }
    o.ghost = pr.ghost.at(d.x, d.y);
    o.rubber = [{ pts: [pr.world.x, pr.world.y, wb.x, wb.y], dashed: true }];
    o.tip = null;
    this.view.requestOverlay();
    if (phase === 'move') return;
    pr.menu = true;
    const handles = [...st.selection];
    const base = { ...pr.world };
    const act = (k: DropAction) => {
      if (this.active !== st) return;
      if (k === 'block') void pasteDragAsBlock(this, handles, base, wb);
      else void commitDrag(this, handles, d, k === 'copy');
    };
    showMenu(ev.clientX, ev.clientY, dropMenuItems(act), { onClose: () => this.rightPress === pr && this.endRightDrag() });
  }

  /** 오른쪽 버튼 끌어 놓기를 끝낸다(미리보기를 치운다) */
  private endRightDrag(): void {
    if (!this.rightPress) return;
    this.rightPress = null;
    const o = this.view.overlay;
    o.ghost = [];
    o.rubber = [];
    this.view.requestOverlay();
  }

  /** 창·올가미로 고른 것을 선택에 더하거나 빼거나 바꾼다(객체 선택 중이면 단계로 남기고 단일이면 끝) */
  private applyPicked(hits: string[], mode: PickMode): void {
    const r = this.request;
    if (r?.kind === 'select') this.pickedInSelect(r, hits, mode);
    else this.setSelection(hits, mode);
  }

  private finishWindow(a: Pt, b: Pt, ev: PointerEvent, remove = false): void {
    this.windowStart = null;
    this.view.overlay.windowRect = null;
    this.view.overlay.preview = [];
    const pk = this.picker();
    if (!pk) return;
    const wa = this.view.screenToWorld(a.x, a.y);
    const wb = this.view.screenToWorld(b.x, b.y);
    const crossing = b.x < a.x;
    const rect: [number, number, number, number] = [Math.min(wa.x, wb.x), Math.min(wa.y, wb.y), Math.max(wa.x, wb.x), Math.max(wa.y, wb.y)];
    const hits = this.expandPick(pk.select(rect, crossing));
    // PICKADD: 1·2 더하기(Shift 빼기), 0 바꾸기(Shift 더하기)
    this.applyPicked(hits, pickMode(this.settings.pickadd, { shift: ev.shiftKey, removing: remove }));
    this.view.requestOverlay();
  }

  /** 창·올가미를 끄는 동안 걸릴 객체를 강조(선택 미리보기 — SELECTIONPREVIEW가 켜져 있을 때). 0.1초에 한 번, 300개까지 */
  private updateSelectPreview(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now < this.previewAt) return;
    this.previewAt = now + 100;
    const pk = this.picker();
    const o = this.view.overlay;
    if (!pk) return;
    if (!previewOn(this.settings.selectionPreview, !!this.request || !!this.running)) {
      o.preview = [];
      return;
    }
    let hits: string[] = [];
    if (o.lasso && this.press?.lasso?.usable) hits = this.press.lasso.select(pk, (p) => this.view.screenToWorld(p.x, p.y));
    else if (o.windowRect) {
      const { a, b } = o.windowRect;
      const wa = this.view.screenToWorld(a.x, a.y);
      const wb = this.view.screenToWorld(b.x, b.y);
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 2) hits = pk.select([Math.min(wa.x, wb.x), Math.min(wa.y, wb.y), Math.max(wa.x, wb.x), Math.max(wa.y, wb.y)], b.x < a.x);
    }
    const sel = this.active?.selection;
    o.preview = hits
      .filter((h) => !sel?.has(h))
      .slice(0, 300)
      .map((h) => pk.geometry(h));
  }

  /** 선택 순환(SELECTIONCYCLING 2): 겹친 객체가 여럿이면 목록에서 고르게 한다. 목록을 띄웠으면 true */
  selectionCycling = 0;
  private cycleMenu(pk: Picker, w: Pt, tol: number, ev: PointerEvent, pick: (h: string) => void): boolean {
    if (this.selectionCycling !== 2) return false;
    const all = pk.pickAll(w.x, w.y, tol);
    if (all.length < 2) return false;
    const st = this.active!;
    const items = all.slice(0, 20).map((h) => {
      const e = st.doc.entityIndex.get(h);
      return {
        label: e ? `${entityKindName(e.type)} · ${e.layer}` : h,
        run: () => pick(h),
        hover: () => {
          this.view.overlay.hover = pk.geometry(h);
          this.view.requestOverlay();
        },
      };
    });
    showMenu(ev.clientX + 8, ev.clientY + 8, [{ heading: `선택 순환 — ${all.length}개 겹침` }, ...items]);
    return true;
  }

  private expandPick(hs: string[]): string[] {
    return this.selectionExpander ? this.selectionExpander(hs) : hs;
  }

  /** 한계 검사(LIMCHECK·PLIMCHECK)가 켜져 있고 점이 한계 밖이면 알리고 true */
  private outsideLimits(p: Pt): boolean {
    const st = this.active;
    if (!st || st.blockEdit) return false;
    const cmd = this.running?.name;
    if (cmd === 'ZOOM' || cmd === 'PAN' || cmd === 'LIMITS') return false;
    const model = st.space === MODEL_SPACE;
    const h = st.doc.header;
    if (Number(h.get(model ? '$LIMCHECK' : '$PLIMCHECK') ?? 0) !== 1) return false;
    const v2 = (k: string) => {
      const v = h.get(k);
      return v && typeof v === 'object' ? { x: v.x, y: v.y } : null;
    };
    const layout = model ? null : st.layoutFor(st.space);
    const lo = model ? v2('$LIMMIN') : (layout?.limitsMin ?? v2('$PLIMMIN'));
    const hi = model ? v2('$LIMMAX') : (layout?.limitsMax ?? v2('$PLIMMAX'));
    if (!lo || !hi) return false;
    const e = 1e-9 * Math.max(1, Math.abs(hi.x - lo.x), Math.abs(hi.y - lo.y));
    if (p.x >= lo.x - e && p.x <= hi.x + e && p.y >= lo.y - e && p.y <= hi.y + e) return false;
    this.cmd.print('**한계 밖', 'err');
    return true;
  }

  private onDblClick(w: Pt, sp: Pt): void {
    const st = this.active;
    if (!st || this.request) return;
    // 배치: 뷰포트 안을 두 번 누르면 모형 공간으로, MSPACE에서 뷰포트 밖이면 종이 공간으로
    if (st.onLayout && !st.blockEdit) {
      const at = this.viewportAt(st, this.view.paperPoint(sp.x, sp.y));
      if (st.msVp && !at) {
        this.exitViewport(st);
        return;
      }
      if (!st.msVp && at) {
        const hit = this.picker()?.pick(w.x, w.y, this.view.overlay.pickbox * this.view.pixelSize());
        if (!hit || hit === at.handle) {
          this.enterViewport(st, at);
          return;
        }
      }
    }
    // 보기 모드: 뷰포트 들어가고 나가기만, 객체 편집은 열지 않는다
    if (this.viewOnly) return;
    const pk = this.picker();
    const h = pk?.pick(w.x, w.y, this.view.overlay.pickbox * this.view.pixelSize());
    if (!h) {
      // 27차: 표의 빈 셀 안은 격자선·문자에서 멀어 잡히지 않는다 — 그 자리를 셀로 품은 표가 있으면 그 셀 제자리 편집(없으면 예전처럼 아무것도 않는다)
      void import('./tablecmds').then((m) => m.editTableCellAt(this, w));
      return;
    }
    const e = st.doc.entityIndex.get(h);
    if (e && this.dblClickHandlers.some((f) => f.dblclick(h, e, w))) return;
    // 표는 셀 편집, 여러 줄은 여러 줄 편집 도구
    const tableLike = (x: Entity | undefined): boolean => isEditableTable(x);
    if (tableLike(e)) {
      this.setSelection([h], 'replace');
      void import('./tablecmds').then((m) => m.editTableAt(this, h, w));
      return;
    }
    // 외부 참조를 두 번 누르면 참조 편집(AutoCAD와 같다)
    if (e?.type === 'INSERT' && ((this.active?.doc.blocks.get(tableKey(e.block))?.flags ?? 0) & 4) !== 0) {
      this.setSelection([h], 'replace');
      void this.run('REFEDIT', `${h}@${w.x},${w.y}`);
      return;
    }
    if (e?.type === 'ARCALIGNEDTEXT') {
      this.setSelection([h], 'replace');
      void this.run('ARCTEXT');
      return;
    }
    if (e?.type === 'MLINE') {
      this.setSelection([h], 'replace');
      void this.run('MLEDIT');
      return;
    }
    if (e?.type === 'HATCH') {
      this.setSelection([h], 'replace');
      void this.run('HATCHEDIT');
      return;
    }
    // 문자·치수·속성 블록은 두 번 누르면 바로 고친다(AutoCAD와 같다)
    if (e && (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTDEF' || e.type === 'DIMENSION' || (e.type === 'INSERT' && e.attribs.some((a) => !(a.attFlags & 2))))) {
      this.setSelection([h], 'replace');
      void import('./editcmds').then((m) => m.editText(this, h));
      return;
    }
    // 그 밖의 기본 편집(AutoCAD 2026 두 번 누르기 동작): 폴리선 PEDIT, 스플라인 SPLINEDIT, 블록 참조 BEDIT, 형상 객체 빠른 특성
    const cmd = e ? dblClickCommand(e) : null;
    this.setSelection([h], 'replace');
    if (cmd && this.findCommand(cmd)) {
      void this.run(cmd);
      return;
    }
    this.ui.openPalette('props');
  }

  /**
   * 오른쪽 클릭(SHORTCUTMENU, AutoCAD 2026 기본 11): 명령 중 옵션이 없는 프롬프트·객체 선택은 바로 Enter, 옵션이 있으면 명령 모드 메뉴,
   * Shift·Ctrl+오른쪽 클릭(점 프롬프트)은 객체 스냅 재지정 메뉴. 명령이 없으면 그립 위는 다기능 그립 메뉴, 그 밖은 편집·기본 모드 메뉴.
   * 모드 메뉴를 끄면 Enter(명령이 없으면 직전 명령 반복), 시간에 민감한 오른쪽 클릭(16)은 held(누른 시간)가 짧으면 Enter·길면 메뉴
   */
  private onContext(w: Pt, _s: Pt, ev: MouseEvent, held?: number): void {
    void _s;
    closeMenu();
    // 끌지 않은 오른쪽 클릭이다(끌어 놓기를 지켜보던 것은 끝)
    this.endRightDrag();
    // 보기 모드: 편집 명령 메뉴를 띄우지 않는다(안드로이드 길게 누르기도 여기로 온다)
    if (this.viewOnly) return;
    if (this.windowStart) {
      this.windowStart = null;
      this.view.overlay.windowRect = null;
      this.view.overlay.preview = [];
    }
    const st = this.active;
    const r = this.request;
    const providers = (mode: ContextMenuMode): ContextMenuItem[] => {
      const out: ContextMenuItem[] = [];
      const sel = st ? [...st.selection] : [];
      for (const pv of this.contextMenuProviders) {
        const its = pv.items({ mode, selection: sel, point: w, st });
        if (its?.length) out.push({ separator: true }, ...its);
      }
      return out;
    };
    if (r?.kind === 'point' && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) {
      showContextMenu(ev.clientX, ev.clientY, [{ heading: '객체 스냅 재지정' }, ...osnapItems(this)]);
      return;
    }
    const sm = this.settings.shortcutMenu;
    const dur = this.settings.shortcutMenuDuration;
    if (r) {
      if (contextAction(sm, 'command', r.kind !== 'select' && r.keywords.length > 0, held, dur) === 'enter') {
        this.onInput('', true);
        return;
      }
      showContextMenu(ev.clientX, ev.clientY, commandMenu(this, r, providers('command')));
      return;
    }
    if (st && !this.running && st.selection.size) {
      const g = this.gripAt(w);
      const items = g ? this.gripMenuItems(g.point) : [];
      if (items.length) {
        this.clearGripHover();
        showContextMenu(ev.clientX, ev.clientY, items);
        return;
      }
    }
    const sel = st ? [...st.selection] : [];
    // 기본·편집 모드 메뉴를 껐으면(또는 짧게 눌렀으면) 직전 명령 반복
    if (contextAction(sm, sel.length ? 'edit' : 'default', true, held, dur) === 'enter') {
      if (this.lastCommand && !this.running) void this.run(this.lastCommand);
      return;
    }
    const extra: ContextMenuItem[] = [];
    if (st && sel.length === 1 && isDynamicReference(st.doc, st.doc.entityIndex.get(sel[0]!))) {
      extra.push({ label: '동적 블록 특성', run: () => void this.run('DYNPROPS') }, { label: '블록 재설정', run: () => void this.run('RESETBLOCK') });
    }
    extra.push(...providers(sel.length ? 'edit' : 'default'));
    showContextMenu(ev.clientX, ev.clientY, idleMenu(this, w, extra).items);
  }

  // -------------------------------------------------------------------------
  // 키보드
  // -------------------------------------------------------------------------

  /**
   * 명령행 입력란이 키를 처리하기 전에 본다: 올가미 중 스페이스바(종류 순환), 동적 입력의 Tab(칸 잠그고 옮기기).
   * 처리했으면 true(명령행은 기본 동작을 막고 넘어간다)
   */
  private interceptKey(ev: KeyboardEvent): boolean {
    if (ev.key === ' ' && this.press?.lasso) return this.cycleLasso();
    if (ev.key === 'Tab' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !this.cmd.suggesting) return this.snapTab() || this.dynTab();
    return false;
  }

  /** Ctrl(⌘) 한 번 누르기(다기능 그립의 Ctrl 순환) */
  private readonly ctrlTap = new CtrlTap();

  /** 키 누름·뗌을 Ctrl 한 번 누르기로 본다: 지금 점 요청이 받겠다고 했으면(ctrlTap) 그 키워드로 끝낸다 */
  private ctrlTapKey(ev: KeyboardEvent, down: boolean): void {
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (down) {
      this.ctrlTap.keyDown(ev, t);
      return;
    }
    if (!this.ctrlTap.keyUp(ev, t)) return;
    const r = this.request;
    if (r?.kind !== 'point' || !r.ctrlTap) return;
    this.finishPoint(r, { keyword: r.ctrlTap });
  }

  /** 마지막으로 찾은 객체 스냅 후보(알맞은 차례) */
  private lastSnaps: SnapPoint[] = [];
  /** 스냅 표식 위 Tab 순환: Tab을 처음 누른 자리(at)의 후보 목록과 지금 차례 */
  private snapCycle: { req: PointRequest; at: Pt; list: SnapPoint[]; i: number } | null = null;

  /**
   * 스냅 표식 위의 Tab: 조준창 안에 겹친 스냅 후보가 둘 넘으면 다음 후보로 돈다(AutoCAD와 같다 — 커서를 조준창 밖으로 옮기면 처음부터).
   * 동적 입력 칸에 친 값이 있으면 그 칸 잠그기(dynTab)가 먼저다
   */
  private snapTab(): boolean {
    const r = this.request;
    const m = this.lastMove;
    if (r?.kind !== 'point' || !m || this.cmd.input.value.trim()) return false;
    if (this.snapCycle?.req === r) this.snapCycle.i++;
    else if (this.lastSnaps.length > 1) this.snapCycle = { req: r, at: m.w, list: this.lastSnaps, i: 1 };
    else return false;
    this.onMove(m.w, m.s, m.ev, true);
    return true;
  }

  /** 올가미를 끄는 중 스페이스바: 걸침 → 윈도우 → 울타리 */
  private cycleLasso(): boolean {
    const l = this.press?.lasso;
    if (!l) return false;
    l.cycle();
    this.view.overlay.lasso = { pts: l.pts, mode: l.mode };
    this.cmd.setPrompt(`${l.label} 옵션을 순환하려면 스페이스바를 누르십시오.`);
    this.previewAt = 0;
    this.updateSelectPreview();
    this.view.requestOverlay();
    return true;
  }

  /** 동적 입력의 Tab: 지금 칸에 친 값을 잠그고 다음 칸으로(점 요청에서만, 그 밖에는 Tab을 넘긴다) */
  private dynTab(): boolean {
    const r = this.request;
    const st = this.active;
    if (!st || !this.dynOn || r?.kind !== 'point' || r.allowText) return false;
    if (this.dyn.tab(this.cmd.input.value, !!r.base, st.units.aunits)) this.cmd.clearInput();
    const m = this.lastMove;
    if (m) this.onMove(m.w, m.s, m.ev, true);
    else {
      this.updateDynFields();
      this.view.requestOverlay();
    }
    return true;
  }

  /** Enter(Ctrl+J·Ctrl+M·도면 위 Enter): 명령 중이면 입력, 아니면 직전 명령 반복 */
  private pressEnter(inCmd: boolean): void {
    if (inCmd) this.cmd.submitCurrent();
    else if (this.request) this.onInput('', true);
    else if (this.lastCommand) void this.run(this.lastCommand);
  }

  /** Ctrl 단축키(keys.ts)의 동작 */
  private ctrlKey(a: NonNullable<ReturnType<typeof ctrlAction>>, inCmd: boolean): void {
    if ('enter' in a) return this.pressEnter(inCmd);
    if ('cancel' in a) {
      if (inCmd) this.cmd.escape();
      else this.cancel();
      return;
    }
    if ('run' in a) {
      void this.run(a.run);
      return;
    }
    switch (a.toggle) {
      case 'grid':
        return this.toggleGrid();
      case 'snap':
        return this.toggleSnap();
      case 'ortho':
        return this.toggleOrtho();
      case 'osnap':
        return this.toggleOsnap();
      case 'polar':
        return this.togglePolar();
      case 'coords':
        return this.cycleCoords();
      case 'pickstyle':
        void import('./util2-select').then((m) => {
          const v = m.pickstyle() ^ 1;
          m.setPickstyle(v);
          this.cmd.print(`<그룹 ${v & 1 ? '켜기' : '끄기'}>`);
        });
        return;
    }
  }

  private onKey(ev: KeyboardEvent): void {
    const t = ev.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const inCmd = t === this.cmd.input;
    const mod = ev.ctrlKey || ev.metaKey;
    if (ev.key === 'Shift') this.setShift(true);
    // 대화상자·메뉴 안의 키는 그 상자가 받는다(글자가 뒤의 명령행으로 가거나, Enter가 단추 대신 명령을 끝내지 않게)
    if (t?.closest?.('.dialog-back, .menu, .language-list')) return;
    // 명령행 입력란의 키는 명령행이 먼저 처리했다(intercept). 여기서는 막힌 키를 다시 보지 않는다
    if (inCmd && ev.defaultPrevented && (ev.key === ' ' || ev.key === 'Tab')) return;
    // Ctrl 제도 보조·입력 키(글을 고치는 다른 입력란에서는 그 입력란의 키)
    const ca = !typing || inCmd ? ctrlAction(ev) : null;
    if (ca) {
      ev.preventDefault();
      this.ctrlKey(ca, inCmd);
      return;
    }
    // 기능 키는 어디서나
    switch (ev.key) {
      case 'F1':
        ev.preventDefault();
        void this.run('HELP');
        return;
      case 'F2':
        ev.preventDefault();
        this.cmd.toggleHistory();
        return;
      case 'F3':
        ev.preventDefault();
        this.toggleOsnap();
        return;
      case 'F5':
        // 등각평면 전환(도면이 없으면 브라우저 새로 고침을 막지 않는다)
        if (!this.active) break;
        ev.preventDefault();
        cycleIsoPlane(this);
        return;
      case 'F7':
        ev.preventDefault();
        this.toggleGrid();
        return;
      case 'F8':
        ev.preventDefault();
        this.toggleOrtho();
        return;
      case 'F9':
        ev.preventDefault();
        this.toggleSnap();
        return;
      case 'F10':
        ev.preventDefault();
        this.togglePolar();
        return;
      case 'F11':
        ev.preventDefault();
        this.toggleOtrack();
        return;
      case 'F12':
        ev.preventDefault();
        this.toggleDyn();
        return;
    }
    if (mod && ev.shiftKey && !ev.altKey) {
      const k = ev.key.toLowerCase();
      if (k === 'z' && !typing) {
        ev.preventDefault();
        void this.run('REDO');
        return;
      }
      if (k === 's') {
        ev.preventDefault();
        void this.run('SAVEAS');
        return;
      }
      if (k === 'l' && !typing) {
        ev.preventDefault();
        void this.run('LAYERSTATE');
        return;
      }
    }
    if (mod && !ev.shiftKey && !ev.altKey) {
      const k = ev.key.toLowerCase();
      if (k === 'e' && !typing && this.active) {
        ev.preventDefault();
        cycleIsoPlane(this);
        return;
      }
      // 최대화한 뷰포트에서 다음 뷰포트로(최대화 중이 아니면 브라우저 새로 고침 그대로)
      if (k === 'r' && !typing && maximized(this.active)) {
        ev.preventDefault();
        void this.run('VPMAXNEXT');
        return;
      }
      if (k === 'o') {
        ev.preventDefault();
        void this.run('OPEN');
        return;
      }
      if (k === '1') {
        ev.preventDefault();
        void this.run('PROPERTIES');
        return;
      }
      if (k === 'z' && !typing) {
        ev.preventDefault();
        void this.run('U');
        return;
      }
      if (k === 'y' && !typing) {
        ev.preventDefault();
        void this.run('REDO');
        return;
      }
      if (k === 'n') {
        ev.preventDefault();
        void this.run('NEW');
        return;
      }
      if ((k === 'c' || k === 'x') && !typing && this.active?.selection.size) {
        ev.preventDefault();
        // Ctrl+Shift+C = 기준점을 두고 복사(AutoCAD와 같다)
        void this.run(k === 'c' ? (ev.shiftKey ? 'COPYBASE' : 'COPYCLIP') : 'CUTCLIP');
        return;
      }
      if (k === 'v' && !typing) {
        ev.preventDefault();
        // Ctrl+Shift+V = 블록으로 붙여넣기
        void this.run(ev.shiftKey ? 'PASTEBLOCK' : 'PASTECLIP');
        return;
      }
      if (k === 's') {
        ev.preventDefault();
        void this.run('QSAVE');
        return;
      }
      if (k === '9') {
        ev.preventDefault();
        this.cmd.el.hidden = !this.cmd.el.hidden;
        return;
      }
      if (k === '2' && !typing) {
        // 디자인센터 열기·닫기(AutoCAD와 같다)
        ev.preventDefault();
        void this.run('ADCENTER');
        return;
      }
      if (k === 'p') {
        ev.preventDefault();
        void this.run('PLOT');
        return;
      }
      if (k === 'a' && !typing) {
        ev.preventDefault();
        void this.run('SELECTALL');
        return;
      }
      if (k === 'tab' || ev.key === 'Tab') {
        ev.preventDefault();
        this.cycleDoc(1);
        return;
      }
      if (ev.key === 'PageDown' || ev.key === 'PageUp') {
        ev.preventDefault();
        this.cycleLayout(ev.key === 'PageDown' ? 1 : -1);
        return;
      }
    }
    if (typing && !inCmd) return;
    if (inCmd) return; // 명령행이 직접 처리
    // 키보드로 초점을 옮긴 단추·링크·탭은 Enter·Space·Tab을 그 컨트롤이 받는다(마우스로 누른 뒤에는 AutoCAD처럼 입력 마침·명령 반복)
    if ((ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Tab') && !mod && keyboardControl(t)) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancel();
      return;
    }
    if (this.interceptKey(ev)) {
      ev.preventDefault();
      return;
    }
    if ((ev.key === 'Enter' || ev.key === ' ') && !mod) {
      ev.preventDefault();
      this.pressEnter(false);
      return;
    }
    if (ev.key === 'Delete' || (ev.key === 'Backspace' && !this.request)) {
      ev.preventDefault();
      if (!this.request && this.active?.selection.size) void this.run('ERASE');
      return;
    }
    // 글자는 명령행으로
    if (ev.key.length === 1 && !mod && !ev.altKey && ev.key !== ' ') {
      ev.preventDefault();
      this.cmd.typeChar(ev.key);
    }
  }

  toggleOsnap(): void {
    this.osnapOn = !this.osnapOn;
    this.cmd.print(`<객체 스냅 ${this.osnapOn ? '켜기' : '끄기'}>`);
    this.ui.refreshStatus();
  }

  toggleGrid(on = !this.gridOn): void {
    this.gridOn = on;
    this.cmd.print(`<격자 ${this.gridOn ? '켜기' : '끄기'}>`);
    this.view.requestOverlay();
    this.ui.refreshStatus();
  }

  toggleSnap(on = !this.snapOn): void {
    this.snapOn = on;
    this.cmd.print(`<스냅 ${this.snapOn ? '켜기' : '끄기'}>`);
    this.ui.refreshStatus();
  }

  /** 격자 스냅: 스냅 기준점에서 간격의 배수로 */
  private snapToGrid(w: Pt): Pt {
    const st = this.active;
    if (!st || st.msVp) return w;
    const s = st.snap;
    const u = currentUcs(st);
    const q = toUcs(u, w);
    return toWcs(u, { x: s.baseX + Math.round((q.x - s.baseX) / s.x) * s.x, y: s.baseY + Math.round((q.y - s.baseY) / s.y) * s.y });
  }

  toggleOrtho(): void {
    // 직교와 극좌표 추적은 함께 켤 수 없다(켜면 극좌표 추적 — AUTOSNAP 8 — 을 끈다)
    this.orthoOn = !this.orthoOn;
    this.cmd.print(`<직교 ${this.orthoOn ? '켜기' : '끄기'}>`);
    this.ui.refreshStatus();
  }

  /** F10·Ctrl+U·상태 막대 단추: AUTOSNAP 8을 뒤집는다(켜면 직교를 끈다) */
  togglePolar(): void {
    this.polarOn = !this.polarOn;
    this.cmd.print(`<극좌표 ${this.polarOn ? '켜기' : '끄기'}>`);
    this.ui.refreshStatus();
  }

  toggleDyn(): void {
    this.dynOn = !this.dynOn;
    if (!this.dynOn) {
      this.view.overlay.dynInput = null;
      this.view.overlay.dynFields = null;
      this.view.requestOverlay();
    }
    this.cmd.print(`<동적 입력 ${this.dynOn ? '켜기' : '끄기'}>`);
    this.ui.refreshStatus();
  }

  /** F11·상태 막대 단추: AUTOSNAP 16을 뒤집는다(끄면 획득점을 지운다 — applySettings) */
  toggleOtrack(): void {
    this.otrackOn = !this.otrackOn;
    this.cmd.print(`<객체 스냅 추적 ${this.otrackOn ? '켜기' : '끄기'}>`);
    this.ui.refreshStatus();
  }

  cycleDoc(d: number): void {
    if (!this.docs.length) return;
    const i = this.active ? this.docs.indexOf(this.active) : -1;
    this.activate(this.docs[(i + d + this.docs.length) % this.docs.length]!);
  }

  cycleLayout(d: number): void {
    const st = this.active;
    if (!st) return;
    const keys = st.layouts.map((l) => tableKey(l.blockName));
    const i = keys.indexOf(st.space);
    void this.setSpace(keys[(i + d + keys.length) % keys.length]!);
  }

  /** 선택한 객체(없으면 고르게 한다) */
  async selectedOrPick(ctx: CommandContext, prompt = '객체 선택:'): Promise<string[]> {
    const st = this.active!;
    if (st.selection.size) return [...st.selection];
    const out: string[] = [];
    for (;;) {
      const r = await ctx.getEntity(out.length ? `${prompt} (Enter = 끝)` : prompt);
      if ('enter' in r) break;
      if ('handle' in r) {
        out.push(r.handle);
        this.setSelection([r.handle], 'add');
      }
      if (out.length && 'handle' in r && st.selection.size) continue;
    }
    return out;
  }

  /** 선택 하이라이트 형상(오버레이) */
  geometryOf(handle: string): OverlayGeom | null {
    return this.picker()?.geometry(handle) ?? null;
  }
}

/** 최근 목록 앞에 넣는다(같은 것은 앞으로, 열 개까지) */
function remember(list: string[], v: string): void {
  const t = v.trim();
  if (!t) return;
  const i = list.indexOf(t);
  if (i >= 0) list.splice(i, 1);
  list.unshift(t);
  if (list.length > 10) list.length = 10;
}

/** 같은 점(그립·획득점 비교) */
function samePt(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) <= 1e-9 * Math.max(1, Math.abs(a.x) + Math.abs(a.y)) && Math.abs(a.y - b.y) <= 1e-9 * Math.max(1, Math.abs(a.x) + Math.abs(a.y));
}

/** 두 번 누른 객체의 기본 편집 명령(표·참조·호 문자·여러 줄·해치·문자는 앞에서 처리). 없으면 null(특성 팔레트) */
export function dblClickCommand(e: Entity): string | null {
  switch (e.type) {
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return 'PEDIT';
    case 'SPLINE':
      return e.helix ? 'QUICKPROPERTIES' : 'SPLINEDIT';
    case 'INSERT':
      return 'BEDIT';
    case 'LINE':
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
    case 'POINT':
    case 'RAY':
    case 'XLINE':
    case 'SOLID':
    case 'TRACE':
    case '3DFACE':
    case 'LEADER':
    case 'WIPEOUT':
      return 'QUICKPROPERTIES';
    default:
      return null;
  }
}

/** 두 번 누르기 판정: 객체를 고른 클릭 뒤 500ms(Windows 기본 두 번 누르기 간격) 안에 4px 안쪽을 다시 눌렀는가 */
export function isDoubleClickFollowUp(prev: { time: number; screen: Pt }, now: number, screen: Pt): boolean {
  return now - prev.time <= 500 && Math.hypot(screen.x - prev.screen.x, screen.y - prev.screen.y) <= 4;
}
