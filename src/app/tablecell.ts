/**
 * 표 셀 고르기(28차): 명령 없이 표의 셀 안을 누르면 그 셀을 고른다(App.subSelections 고리 — 앱의 객체 선택과는 따로).
 *
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - "About Modifying Tables": 셀 안을 눌러 셀을 고르고, 다른 셀을 누르면 고른 셀이 그리로 옮겨 간다. 고른 셀을 두 번 누르면 그 셀 문자를 고치고,
 *   셀이 강조된 채 입력을 시작하면 그 셀 내용을 바꾼다. Shift를 누른 채 다른 셀 안을 누르면 두 셀과 그 사이의 셀을 모두 고른다.
 *   표 자체는 격자선을 눌러 고른다.
 * - "About Adding Text and Blocks to Tables": 다음 셀로는 Tab이나 화살표로 간다(셀 안 — 문자 편집 중에는 화살표가 커서를 옮긴다).
 * - "To Change the Appearance of Cell Borders": 셀 안을 눌러 고르고 Shift로 범위를 넓히며, Esc로 고른 것을 푼다.
 *
 * 정한 것:
 * - 셀 안이라도 격자선 가까이(고르기 허용 거리, 셀 크기의 1/4을 넘지 않게)는 예전처럼 표 객체를 고른다. 표 위에 그린 다른 객체가 잡히면 그 객체
 * - 고른 셀은 실선 테두리와 옅은 채움으로 강조한다(객체 선택의 점선과 다르게). 셀을 고르면 고른 객체는 풀리고, 객체를 고르거나 명령을 시작하면
 *   (ZOOM·PAN 같은 투명 명령은 빼고) 셀 고르기가 풀린다. 고르기는 도면을 바꾸지 않으므로 명령 취소 단계가 없다
 * - 화살표: 기준 셀(처음 누른 셀)에서 그 방향의 이웃 셀 하나로(병합 셀은 한 칸, 표 끝이면 그대로). Tab·Shift+Tab: 셀 편집기의 Tab과 같은 차례
 *   (마지막 셀이면 그대로 — 새 행은 도움말에 없다)
 * - 글자(Space 빼고)를 치면 기준 셀의 제자리 편집기를 그 글자로 바꾼 내용으로 연다. 확인하면 그 편집(Tab으로 옮긴 셀까지)이 명령 취소 한 단계
 * - 명령행에 친 글이 있거나 명령이 진행 중이면 키를 보지 않는다
 * 하지 않은 것(도움말에 없거나 근거가 약하다): Shift+화살표로 넓히기, 마지막 셀 Tab의 새 행, Delete로 내용 지우기,
 * 고른 셀의 특성 팔레트(끌어서 여러 셀 고르기는 30차)
 *
 * 29차(근거 — AutoCAD 도움말, 우리말 요약):
 * - "About Modifying Tables": 셀을 고르면 셀 테두리 가운데에 그립이 보이고, 셀의 그립을 끌면 그 셀과 그 열·행이 커지거나 작아진다.
 *   셀을 고른 채 오른쪽 누르기 메뉴로 열·행을 넣거나 지우고 이웃 셀을 합친다.
 * - "To Resize Rows or Columns in a Table": 셀을 눌러 고르고 그립을 끌어 그 셀이 든 행·열 전체의 크기를 바꾼다.
 * - "To Add Rows or Columns to a Table": 셀을 고르고 오른쪽 누르기 → 행 ▸ 위에·아래에 삽입, 열 ▸ 왼쪽에·오른쪽에 삽입.
 * - "Table Cell Ribbon Contextual Tab": 행 삭제(고른 행), 열 삭제(고른 열), 셀 병합(모두·행별·열별 — 고른 셀을 한 셀로), 셀 병합 해제.
 * 정한 것:
 * - 바로 가기 메뉴(오른쪽 클릭, 휴대폰은 안드로이드 길게 누르기): 위·아래에 행 삽입(화면 위·아래 — 위로 쌓는 표는 번호가 반대), 행 삭제, 왼쪽·오른쪽에 열 삽입,
 *   열 삭제, 셀 병합(모두·행별·열별), 셀 병합 해제. 범위가 표의 모든 행·열이면 지우기는 꺼짐, 한 셀이면 병합 꺼짐, 병합이 없으면 풀기 꺼짐.
 *   계산은 TABLECELL과 같은 cellOp, 한 번에 명령 취소 한 단계. 끝나면 같은 셀(넣은 행·열만큼 밀린 자리, 지운 뒤에는 그 자리의 셀, 병합·풀기는 그 범위)을 고른 채
 * - 셀 그립: 고른 범위의 네 변 가운데. 그 변을 끌어 그 변 쪽 열 폭·행 높이만 바꾸고 맞은편 변은 그대로(왼쪽·삽입점 쪽 변이면 표의 삽입점이 그만큼 옮겨진다).
 *   다른 열·행은 그대로, 행 높이는 문자에 맞춘다(문자보다 낮게는 줄지 않는다). 객체 그립처럼 누르고 놓을 점을 누르거나(터치도) 누른 채 끈다(GRIPEDIT의 ** 신축 **).
 *   그립 고르기 거리는 객체 그립과 같다(터치는 두 배 — GRIPSIZE 5에서 12px). 격자선 가까이(예전에 표 객체를 고르던 자리)·표 밖, 고른 범위 안은 그 변에서
 *   그립 거리와 범위 크기의 1/4 가운데 작은 것까지 그립이고, 이웃 셀 안(셀을 누르는 자리)은 그립이 아니다 — 작게 보이는 셀도 이웃 셀 가운데를 누르면 예전처럼 그 셀.
 *   그립 변은 누른 자리에서 옮긴 만큼 간다(손가락으로 그립 옆을 눌러도 튀지 않고 같은 자리를 다시 누르면 그대로 — 휴대폰 두 번 톡은 셀 편집).
 *   셀을 고른 누르기 바로 뒤 같은 자리의 두 번째 누르기도 두 번 누르기(셀 편집)
 * - 셀 내용 지우기(Delete)는 도움말에 근거가 없어(메뉴 설명은 "그 밖의 변경"뿐) 하지 않았다
 * - 입력기(한글 등)의 첫 조합 키(Process·229)를 고른 셀에서 받으면 셀 편집기를 빈 내용으로 열고 초점을 옮긴다 — 조합은 편집기에서 이어진다(키는 막지 않는다)
 *
 * 30차(근거 — AutoCAD 도움말, 우리말 요약):
 * - "About Modifying Tables": 여러 셀은 셀 위를 누르고 끌어 고른다.
 * - "Table Cell Ribbon Contextual Tab"의 정렬: 셀 내용을 위·아래 테두리에 대해 위·가운데·아래, 왼쪽·오른쪽 테두리에 대해 왼쪽·가운데·오른쪽으로 맞춘다.
 * 정한 것:
 * - 끌어서 고르기: 셀 안(누르면 셀을 고를 자리 — click과 같은 판정)에서 마우스·펜으로 누른 채 끌면 창·올가미 대신 누른 셀에서 지금 셀까지의 사각 범위
 *   (병합 셀을 덮게, 표 밖으로 나가면 그쪽 끝 행·열). Shift를 누른 채 같은 표에서 시작하면 지금 기준 셀에서 넓힌다. 격자선·표 밖·표 위의 객체·셀 그립에서
 *   시작한 끌기는 예전 그대로. 손가락 한 개 끌기는 앱의 화면 이동이라 그대로(셀 범위는 Shift+누르기나 마우스·펜). Shift+화살표는 도움말에 없어 하지 않았다
 * - 셀 메뉴의 정렬 ▸ 아홉 가지(TABLECELL 정렬과 같은 setAlign — 셀 재지정). 범위의 셀이 모두 그 정렬이면 ✓, 고르면 확정 한 번(이미 모두 그 정렬이면 바꾸지 않는다)
 */
import type { Entity, InsertEntity, TableEntity } from '../core/model';
import { tableKey } from '../core/model';
import { isEditableTable, tableFromEntity } from '../edit/table/entity';
import { type TableData, anchorOf, cellAt, cellName, cellRect, cloneTable, colOffset, mergeAt, rowOffset, setAlign } from '../edit/table/model';
import { ALIGN_LABEL, type TableStyle } from '../edit/table/style';
import { previewSegments } from '../edit/table/ops';
import type { App, CommandContext } from './app';
import type { DocState } from './docstate';
import { type ContextMenuItem, type SubSelection, addHook } from './hooks';
import { type CellOp, cellOp, commitTable, editTableInPlace, fitTable, fromTableLocal, lockedLayer, readPicked, tabCell, toTableLocal } from './tablecmds';
import type { Pt } from './view';

type Cell = { r: number; c: number };

/** 고른 셀 범위(병합 셀을 덮도록 넓힌 직사각형 r0..r1 × c0..c1, 끝 포함)와 기준 셀 */
export interface CellRange {
  handle: string;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  anchor: Cell;
}

export interface TableCellSelection extends SubSelection {
  /** 지금 고른 셀(없거나 대상이 사라졌으면 null) */
  current(): CellRange | null;
  /** 셀을 고른다(end를 주면 anchor에서 end까지 범위). 표가 아니거나 셀이 표 밖이면 false */
  select(handle: string, anchor: Cell, end?: Cell): boolean;
}

/** 두 셀을 품고 걸친 병합 셀을 모두 덮는 직사각형 범위 */
export function cellRange(t: TableData, a: Cell, b: Cell): { r0: number; c0: number; r1: number; c1: number } {
  let r0 = Math.min(a.r, b.r);
  let r1 = Math.max(a.r, b.r);
  let c0 = Math.min(a.c, b.c);
  let c1 = Math.max(a.c, b.c);
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of t.merges) {
      const mr1 = m.row + m.rows - 1;
      const mc1 = m.col + m.cols - 1;
      if (m.row > r1 || mr1 < r0 || m.col > c1 || mc1 < c0) continue;
      if (m.row < r0 || mr1 > r1 || m.col < c0 || mc1 > c1) {
        r0 = Math.min(r0, m.row);
        r1 = Math.max(r1, mr1);
        c0 = Math.min(c0, m.col);
        c1 = Math.max(c1, mc1);
        changed = true;
      }
    }
  }
  return { r0, c0, r1, c1 };
}

/** 화살표 방향의 이웃 셀(병합 셀은 한 칸, 표 방향 flow 1이면 행이 위로 쌓인다). 표 끝이면 null */
export function stepCell(t: TableData, a: Cell, dir: 'left' | 'right' | 'up' | 'down', flow: 0 | 1 = 0): Cell | null {
  const m = mergeAt(t, a.r, a.c) ?? { row: a.r, col: a.c, rows: 1, cols: 1 };
  let r = m.row;
  let c = m.col;
  if (dir === 'right') c = m.col + m.cols;
  else if (dir === 'left') c = m.col - 1;
  else {
    // 화면 아래 = 행 번호가 커지는 쪽(위에서 아래로 쌓는 표), 위로 쌓는 표는 반대
    const forward = (dir === 'down') === (flow !== 1);
    r = forward ? m.row + m.rows : m.row - 1;
  }
  if (r < 0 || r >= t.rows || c < 0 || c >= t.cols) return null;
  return anchorOf(t, r, c);
}

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

type Range = { r0: number; c0: number; r1: number; c1: number };

/** 셀 정렬 값(1~9 — 맨 위·중간·맨 아래 × 왼쪽·중심·오른쪽, MTEXT 부착점과 같은 번호) */
const ALIGN_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** 범위의 셀(병합 셀은 기준 셀만)이 모두 같은 정렬(재지정이 없으면 그 행 종류의 셀 스타일 값)이면 그 값, 섞였으면 0 */
export function rangeAlign(t: TableData, style: TableStyle, g: Range): number {
  let out = 0;
  for (let r = g.r0; r <= g.r1; r++)
    for (let c = g.c0; c <= g.c1; c++) {
      const m = mergeAt(t, r, c);
      if (m && (m.row !== r || m.col !== c)) continue;
      const a = t.cells[r * t.cols + c]?.align ?? style.cells[t.rowKinds[r] ?? 'data'].align;
      if (!out) out = a;
      else if (out !== a) return 0;
    }
  return out;
}

/** 셀 그립의 변(표 좌표): x0 왼쪽, x1 오른쪽, y0 아래, y1 위 */
export type CellSide = 'x0' | 'x1' | 'y0' | 'y1';
/** 그립 차례(grips()·gripAt의 번호): 오른쪽, 아래, 왼쪽, 위 */
export const CELL_SIDES: readonly CellSide[] = ['x1', 'y0', 'x0', 'y1'];

/** 범위의 표 좌표 사각형 */
export function rangeRect(t: TableData, g: Range, flow: 0 | 1): { x0: number; x1: number; y0: number; y1: number } {
  const a = cellRect(t, g.r0, g.c0, flow);
  const b = cellRect(t, g.r1, g.c1, flow);
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
}

/** 범위 변의 가운데(셀 그립 자리, 표 좌표) */
export function sideMid(q: { x0: number; x1: number; y0: number; y1: number }, side: CellSide): Pt {
  const mx = (q.x0 + q.x1) / 2;
  const my = (q.y0 + q.y1) / 2;
  return side === 'x0' ? { x: q.x0, y: my } : side === 'x1' ? { x: q.x1, y: my } : side === 'y0' ? { x: mx, y: q.y0 } : { x: mx, y: q.y1 };
}

/** 위쪽 변(y1)은 위에서 아래로 쌓는 표의 첫 행(r0), 위로 쌓는 표의 마지막 행(r1). 아래쪽(y0)은 그 반대 */
const sideRow = (g: Range, side: 'y0' | 'y1', flow: 0 | 1): number => ((side === 'y1') === (flow !== 1) ? g.r0 : g.r1);

/**
 * 셀 그립을 표 좌표 q까지 끈 표 정의(문자에 맞추기 전): 그 변 쪽의 열 폭(x0 → c0, x1 → c1)이나 행 높이(준 높이와 함께)만 바꾼다.
 * 그립 변이 q를 따라가는 만큼 늘거나 준다. 아주 좁게는 줄지 않는다(열은 좌우 여백 + 자료 문자 높이, 행은 위아래 여백 + 그 행 문자 높이 —
 * 원래 그보다 작았으면 원래 크기까지). 바뀌지 않으면 null
 */
export function resizeByGrip(t: TableData, style: TableStyle, g: Range, side: CellSide, q: Pt): TableData | null {
  const flow = style.flow;
  const rect = rangeRect(t, g, flow);
  const out = cloneTable(t);
  if (side === 'x0' || side === 'x1') {
    const c = side === 'x1' ? g.c1 : g.c0;
    const cur = t.colWidths[c]!;
    const grow = side === 'x1' ? q.x - rect.x1 : rect.x0 - q.x;
    const w = Math.max(Math.min(cur, 2 * style.hMargin + style.cells.data.height), cur + grow);
    if (!(Math.abs(w - cur) > 1e-12 * Math.max(1, cur))) return null;
    out.colWidths[c] = w;
    return out;
  }
  const r = sideRow(g, side, flow);
  const cur = t.rowHeights[r]!;
  const grow = side === 'y1' ? q.y - rect.y1 : rect.y0 - q.y;
  const cs = style.cells[t.rowKinds[r] ?? 'data'];
  const v = Math.max(Math.min(cur, 2 * style.vMargin + cs.height), cur + grow);
  if (!(Math.abs(v - cur) > 1e-12 * Math.max(1, cur))) return null;
  out.rowHeights[r] = v;
  out.baseRowHeights[r] = v;
  return out;
}

/**
 * 삽입점 쪽 변(왼쪽 x0, 위에서 아래로 쌓는 표의 위 y1, 위로 쌓는 표의 아래 y0)을 끌었을 때 범위의 맞은편 변을 그대로 두려고
 * 삽입점을 옮길 양(표 좌표, before → after는 문자에 맞춘 뒤). 다른 변이거나 옮길 것이 없으면 null
 */
export function gripInsertShift(before: TableData, after: TableData, g: Range, side: CellSide, flow: 0 | 1): Pt | null {
  if (side === 'x0') {
    const d = colOffset(after, g.c0 + 1) - colOffset(before, g.c0 + 1);
    return d ? { x: -d, y: 0 } : null;
  }
  const near = (side === 'y1' && flow !== 1) || (side === 'y0' && flow === 1);
  if (!near) return null;
  const d = rowOffset(after, g.r0 + 1) - rowOffset(before, g.r0 + 1);
  if (!d) return null;
  return { x: 0, y: flow === 1 ? -d : d };
}

/** 셀 그립을 누른 자리와 그 그립의 어긋남(도면 단위 — gripPress가 두고 cellGripEdit가 쓴다) */
const pressAt = new WeakMap<App, Pt>();

/**
 * 셀 그립 편집(GRIPEDIT가 'cell:'로 시작하는 그립을 누르면 부른다): id = cell:<변>:<기준 행>,<기준 열>:<끝 행>,<끝 열>.
 * 그립 변은 누른 자리에서 옮긴 만큼 간다(그립 옆을 눌러도 튀지 않고, 같은 자리를 다시 누르면 그대로 — 휴대폰 두 번 톡)
 */
export async function cellGripEdit(app: App, ctx: CommandContext, handle: string, id: string): Promise<void> {
  const m = /^cell:(x0|x1|y0|y1):(\d+),(\d+):(\d+),(\d+)$/.exec(id);
  const off = pressAt.get(app) ?? { x: 0, y: 0 };
  pressAt.delete(app);
  if (!m) return;
  const side = m[1] as CellSide;
  const anchor = { r: Number(m[2]), c: Number(m[3]) };
  const end = { r: Number(m[4]), c: Number(m[5]) };
  // 명령을 시작하며 풀린 셀 고르기를 다시(편집하는 동안 강조와 그립이 보이고, 끝나면 같은 셀)
  const reselect = () => void tableCellSelection(app)?.select(handle, anchor, end);
  reselect();
  try {
    const p = readPicked(app, handle, null);
    if (!p || lockedLayer(app, p.entity)) return;
    const t = p.data;
    const ok = (q: { r: number; c: number }) => q.r < t.rows && q.c < t.cols;
    if (!ok(anchor) || !ok(end)) return;
    const flow = p.style.flow;
    const g = cellRange(t, anchor, end);
    const grip = fromTableLocal(p.entity, sideMid(rangeRect(t, g, flow), side));
    // 기준점 = 누른 자리, 그립 변이 갈 자리 = 찍은 점 − 어긋남
    const base = { x: grip.x + off.x, y: grip.y + off.y };
    const target = (q: Pt): Pt => ({ x: q.x - off.x, y: q.y - off.y });
    const shifted = (s: Pt | null): TableEntity | InsertEntity => (s ? { ...p.entity, insert: { ...p.entity.insert, ...fromTableLocal(p.entity, s) } } : p.entity);
    const ghost = (q: Pt) => {
      const next = resizeByGrip(t, p.style, g, side, toTableLocal(p.entity, target(q)));
      if (!next) return [];
      const e2 = shifted(gripInsertShift(t, next, g, side, flow));
      const segs: number[] = [];
      for (const s of previewSegments(next, p.style)) {
        const a = fromTableLocal(e2, { x: s[0]!, y: s[1]! });
        const b = fromTableLocal(e2, { x: s[2]!, y: s[3]! });
        segs.push(a.x, a.y, b.x, b.y);
      }
      return [{ segs }];
    };
    ctx.print('** 신축 **');
    const r = await ctx.getPoint('신축점 지정 또는 [종료(X)]:', { base, keywords: [{ key: 'X', label: '종료' }], ghost });
    if (!('point' in r)) return;
    const cur = readPicked(app, handle, null);
    if (!cur) return;
    const next = resizeByGrip(cur.data, cur.style, g, side, toTableLocal(cur.entity, target(r.point)));
    if (!next) return;
    // 행 높이는 문자에 맞춘 뒤의 크기로 삽입점 옮김을 잰다
    const fitted = fitTable(app, next, cur.style);
    const s = gripInsertShift(cur.data, fitted, g, side, flow);
    commitTable(app, cur, fitted, 'GRIPEDIT', ctx.group, s ? fromTableLocal(cur.entity, s) : undefined);
  } finally {
    reselect();
  }
}

const sel = new WeakMap<App, TableCellSelection>();

/** 앱에 단 표 셀 고르기(registerTableCellSelection 뒤) */
export function tableCellSelection(app: App): TableCellSelection | null {
  return sel.get(app) ?? null;
}

export function registerTableCellSelection(app: App): TableCellSelection {
  const had = sel.get(app);
  if (had) return had;
  let state: { st: DocState; space: string; handle: string; anchor: Cell; end: Cell } | null = null;
  // 표 자료는 객체가 바뀔 때만 다시 읽는다(강조는 확대·이동마다 다시 그린다)
  const cache = new WeakMap<Entity, ReturnType<typeof tableFromEntity>>();
  const read = (e: TableEntity | InsertEntity, doc: DocState['doc']) => {
    let r = cache.get(e);
    if (r === undefined) {
      r = tableFromEntity(e, doc);
      cache.set(e, r);
    }
    return r;
  };
  const shown = (st: DocState, e: Entity): boolean => {
    const l = st.doc.layers.get(tableKey(e.layer));
    return !(l && (l.off || l.frozen));
  };
  /** 지금도 살아 있는 고른 셀(문서·공간이 바뀌었거나 표가 없어졌거나 셀이 표 밖이면 null) */
  const live = () => {
    const st = app.active;
    if (!state || !st || st !== state.st || st.space !== state.space || app.viewOnly) return null;
    const e = st.doc.entityIndex.get(state.handle);
    const owner = st.session.ownerOf(state.handle);
    if (!isEditableTable(e) || !owner || tableKey(owner) !== tableKey(state.space) || !shown(st, e)) return null;
    const rt = read(e, st.doc);
    if (!rt) return null;
    const t = rt.data;
    const ok = (q: Cell) => q.r >= 0 && q.c >= 0 && q.r < t.rows && q.c < t.cols;
    if (!ok(state.anchor) || !ok(state.end)) return null;
    return { st, e, rt, t, anchor: anchorOf(t, state.anchor.r, state.anchor.c), range: cellRange(t, state.anchor, state.end) };
  };
  const set = (st: DocState, handle: string, anchor: Cell, end: Cell) => {
    // 고른 객체는 푼다(셀과 객체를 함께 고르지 않는다)
    if (st.selection.size) app.clearSelection();
    state = { st, space: st.space, handle, anchor, end };
    app.refreshSelectionOverlay();
  };
  /** 셀 안의 점(격자선에서 margin보다 먼 자리)이면 그 셀(병합 셀은 기준 셀) */
  const cellUnder = (e: TableEntity | InsertEntity, t: TableData, flow: 0 | 1, w: Pt, tol: number): Cell | null => {
    const q = toTableLocal(e, w);
    const at = cellAt(t, q.x, q.y, flow);
    if (!at) return null;
    const a = anchorOf(t, at.r, at.c);
    const rc = cellRect(t, a.r, a.c, flow);
    const k = Math.min(Math.abs(e.scale.x || 1), Math.abs(e.scale.y || 1));
    // 격자선 가까이는 표 객체 고르기(도움말 — 표는 격자선을 눌러 고른다). 작게 보이는 셀(휴대폰)도 셀 안을 고를 수 있게 셀 크기의 1/4까지만
    const margin = Math.min(tol / k, 0.25 * Math.min(rc.x1 - rc.x0, rc.y1 - rc.y0));
    const d = Math.min(q.x - rc.x0, rc.x1 - q.x, q.y - rc.y0, rc.y1 - q.y);
    return d > margin ? a : null;
  };
  /**
   * 누른 자리가 고를 셀(click·dragStart가 같이 쓴다): 표 위에 그린 다른 객체가 잡혔거나 잡힌 표의 격자선 가까이면 null(예전처럼 그 객체·표 객체).
   * 아무것도 잡히지 않았으면 지금 공간의 보이는 표(위에 그린 것 먼저) 가운데 그 자리를 셀 안으로 품은 것
   */
  const cellHit = (st: DocState, w: Pt, picked: string | null, tol: number): { e: TableEntity | InsertEntity; a: Cell } | null => {
    const list = st.doc.blocks.get(tableKey(st.space))?.entities ?? [];
    const pickedEnt = picked ? st.doc.entityIndex.get(picked) : undefined;
    if (picked && !isEditableTable(pickedEnt)) return null;
    const cands: (TableEntity | InsertEntity)[] = [];
    if (pickedEnt && isEditableTable(pickedEnt)) cands.push(pickedEnt);
    else
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]!;
        if (isEditableTable(e) && shown(st, e)) cands.push(e);
      }
    for (const e of cands) {
      const rt = read(e, st.doc);
      if (!rt) continue;
      const a = cellUnder(e, rt.data, rt.style.flow, w, tol);
      if (!a) {
        // 잡힌 표의 격자선 가까이: 예전처럼 표 객체를 고른다
        if (pickedEnt === e) return null;
        continue;
      }
      return { e, a };
    }
    return null;
  };
  /** 끌어 고르는 셀 범위(30차): 누른 셀(기준)과 그 문서·공간·표 */
  let drag: { st: DocState; space: string; handle: string; anchor: Cell } | null = null;
  /** 표 좌표로 표 안에 가둔 점이 든 셀(끌기가 표 밖으로 나가면 그쪽 끝 행·열) */
  const cellClamped = (e: TableEntity | InsertEntity, t: TableData, flow: 0 | 1, w: Pt): Cell => {
    const q = toTableLocal(e, w);
    const x = Math.max(0, Math.min(colOffset(t, t.cols), q.x));
    const d = Math.max(0, Math.min(rowOffset(t, t.rows), flow === 1 ? q.y : -q.y));
    return cellAt(t, x, flow === 1 ? d : -d, flow) ?? { r: t.rows - 1, c: t.cols - 1 };
  };
  /**
   * 바로 가기 메뉴의 셀 작업(29차): TABLECELL과 같은 계산, 확정 한 번(명령 취소 한 단계). 끝나면 같은 셀을 고른 채 —
   * 앞에 넣은 행·열만큼 밀린 자리, 지운 뒤에는 그 자리(표 끝이면 마지막)의 셀, 병합·풀기는 그 범위
   */
  const applyCellOp = (handle: string, op: CellOp, label: string): void => {
    const cur = live();
    if (!cur || !state || state.handle !== handle) return;
    const p = readPicked(app, handle, null);
    if (!p || lockedLayer(app, p.entity)) return;
    const g = cur.range;
    const next = cellOp(p.data, g, op);
    if (!next) return;
    commitTable(app, p, next, label);
    app.cmd.print(`${label}: 표 ${next.rows}행 ${next.cols}열`);
    const a = state.anchor;
    const b = state.end;
    let na = a;
    let nb = b;
    if (op === 'rowBefore') (na = { r: a.r + 1, c: a.c }), (nb = { r: b.r + 1, c: b.c });
    else if (op === 'colLeft') (na = { r: a.r, c: a.c + 1 }), (nb = { r: b.r, c: b.c + 1 });
    else if (op === 'deleteRows') na = nb = { r: Math.min(g.r0, next.rows - 1), c: Math.min(a.c, next.cols - 1) };
    else if (op === 'deleteCols') na = nb = { r: Math.min(a.r, next.rows - 1), c: Math.min(g.c0, next.cols - 1) };
    else if (op === 'mergeAll' || op === 'mergeRows' || op === 'mergeCols' || op === 'unmerge') (na = { r: g.r0, c: g.c0 }), (nb = { r: g.r1, c: g.c1 });
    hook.select(handle, na, nb);
  };
  /**
   * 셀 메뉴의 정렬(30차): 고른 범위의 셀 정렬을 그 값으로 재지정한다(TABLECELL 정렬과 같은 setAlign — DXF·DWG 셀 재지정 170으로 남는다).
   * 범위의 셀이 이미 모두 그 정렬이면 바꾸지 않는다(명령 취소 단계 없음). 확정 한 번, 끝나면 같은 셀을 고른 채
   */
  const applyAlign = (handle: string, align: number): void => {
    const cur = live();
    if (!cur || !state || state.handle !== handle) return;
    const p = readPicked(app, handle, null);
    if (!p || lockedLayer(app, p.entity)) return;
    const g = cur.range;
    if (rangeAlign(p.data, p.style, g) === align) return;
    const a = state.anchor;
    const b = state.end;
    const next = setAlign(p.data, g.r0, g.c0, g.r1, g.c1, align);
    commitTable(app, p, next, '셀 정렬');
    app.cmd.print(`셀 정렬: 표 ${next.rows}행 ${next.cols}열`);
    hook.select(handle, a, b);
  };

  const hook: TableCellSelection = {
    name: 'table-cells',
    click(w, picked, opt) {
      const st = app.active;
      if (!st) return false;
      const hit = cellHit(st, w, picked, opt.tol);
      if (!hit) return false;
      const { e, a } = hit;
      const cur = live();
      if (opt.shift && cur && state && state.handle === e.handle) set(st, e.handle, state.anchor, a);
      else set(st, e.handle, a, a);
      return true;
    },
    dragStart(w, picked, opt) {
      // 30차 끌어서 여러 셀 고르기(도움말 "About Modifying Tables" — 여러 셀은 셀 위를 누르고 끌어 고른다). 누른 자리는 click과 같은 판정이고
      // Shift를 누른 채 같은 표에서 시작하면 지금 기준 셀에서 넓힌다(Shift+누르기와 같다)
      drag = null;
      const st = app.active;
      if (!st || app.viewOnly) return false;
      const hit = cellHit(st, w, picked, opt.tol);
      if (!hit) return false;
      const cur = live();
      const anchor = opt.shift && cur && state && state.handle === hit.e.handle ? state.anchor : hit.a;
      drag = { st, space: st.space, handle: hit.e.handle, anchor };
      return true;
    },
    dragTo(w, done) {
      const d = drag;
      if (done) drag = null;
      const st = app.active;
      if (!d || !st || st !== d.st || st.space !== d.space || app.viewOnly) return;
      const e = st.doc.entityIndex.get(d.handle);
      if (!isEditableTable(e)) return;
      const rt = read(e, st.doc);
      if (!rt) return;
      const t = rt.data;
      if (d.anchor.r >= t.rows || d.anchor.c >= t.cols) return;
      const end = cellClamped(e, t, rt.style.flow, w);
      // 지나간 사각 범위(병합 셀을 덮게 — live가 cellRange로 넓힌다). 범위가 그대로면 다시 그리지 않는다
      if (state && state.st === st && state.handle === d.handle && state.anchor.r === d.anchor.r && state.anchor.c === d.anchor.c && state.end.r === end.r && state.end.c === end.c) return;
      set(st, d.handle, d.anchor, end);
    },
    key(ev) {
      const cur = live();
      if (!cur || !state) {
        state = null;
        return false;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return false;
      const { st, t, anchor } = cur;
      const flow = cur.rt.style.flow;
      if (ev.key === 'Process' || ev.keyCode === 229) {
        // 입력기(한글 등)의 첫 조합 키(29차): 셀 편집기를 빈 내용으로 열고 초점을 옮겨 조합이 편집기에서 이어지게 한다.
        // 키는 맡지 않은 것으로 돌려준다(기본 동작을 막으면 조합이 끊길 수 있다 — 명령행·창은 이 키로 아무것도 하지 않는다)
        void editTableInPlace(app, state.handle, anchor, undefined, { replace: '' });
        return false;
      }
      if (ev.key === 'Escape') {
        app.clearSubSelections();
        return true;
      }
      const dir = ARROWS[ev.key];
      if (dir || ev.key === 'Tab') {
        const n = dir ? stepCell(t, anchor, dir, flow) : tabCell(t, anchor.r, anchor.c, ev.shiftKey);
        // 표 끝이면 그대로(키는 받는다 — 명령행 기록·초점 이동으로 넘기지 않는다)
        if (n) set(st, state.handle, n, n);
        return true;
      }
      if (ev.key.length === 1 && ev.key !== ' ') {
        // 고른 셀에 바로 입력: 그 셀 내용을 친 글자로 바꾸며 제자리 편집기를 연다
        const handle = state.handle;
        void editTableInPlace(app, handle, anchor, undefined, { replace: ev.key });
        return true;
      }
      return false;
    },
    active() {
      if (state && !live()) state = null;
      return !!state;
    },
    clear() {
      state = null;
      drag = null;
    },
    overlay() {
      const cur = live();
      if (!cur) return [];
      const { e, t, range } = cur;
      const flow = cur.rt.style.flow;
      const q0 = cellRect(t, range.r0, range.c0, flow);
      const q1 = cellRect(t, range.r1, range.c1, flow);
      const x0 = Math.min(q0.x0, q1.x0);
      const x1 = Math.max(q0.x1, q1.x1);
      const y0 = Math.min(q0.y0, q1.y0);
      const y1 = Math.max(q0.y1, q1.y1);
      const p = [
        fromTableLocal(e, { x: x0, y: y0 }),
        fromTableLocal(e, { x: x1, y: y0 }),
        fromTableLocal(e, { x: x1, y: y1 }),
        fromTableLocal(e, { x: x0, y: y1 }),
      ];
      const segs: number[] = [];
      for (let i = 0; i < 4; i++) segs.push(p[i]!.x, p[i]!.y, p[(i + 1) % 4]!.x, p[(i + 1) % 4]!.y);
      const tris = [p[0]!.x, p[0]!.y, p[1]!.x, p[1]!.y, p[2]!.x, p[2]!.y, p[0]!.x, p[0]!.y, p[2]!.x, p[2]!.y, p[3]!.x, p[3]!.y];
      return [{ segs, tris }];
    },
    grips() {
      const cur = live();
      if (!cur) return [];
      const q = rangeRect(cur.t, cur.range, cur.rt.style.flow);
      return CELL_SIDES.map((s) => fromTableLocal(cur.e, sideMid(q, s)));
    },
    gripAt(w, tol, pickTol) {
      const cur = live();
      if (!cur) return -1;
      const { e, t, range } = cur;
      const flow = cur.rt.style.flow;
      const q = rangeRect(t, range, flow);
      // 셀을 누르는 자리(셀 안, 그 셀 격자선에서 고르기 허용 거리·셀 크기의 1/4보다 먼 곳)인지. 고른 범위 밖의 그런 자리는 그립이 아니다 —
      // 작게 보이는 셀(휴대폰)도 이웃 셀 가운데를 누르면 예전처럼 그 셀을 고른다
      const inCell = !!cellUnder(e, t, flow, w, pickTol);
      const p = toTableLocal(e, w);
      const inRange = p.x >= q.x0 && p.x <= q.x1 && p.y >= q.y0 && p.y <= q.y1;
      if (inCell && !inRange) return -1;
      const kx = Math.abs(e.scale.x || 1);
      const ky = Math.abs(e.scale.y || 1);
      let best = -1;
      let bd = Infinity;
      CELL_SIDES.forEach((side, i) => {
        const g = fromTableLocal(e, sideMid(q, side));
        const d = Math.hypot(w.x - g.x, w.y - g.y);
        if (d > tol || d >= bd) return;
        if (inCell) {
          // 고른 범위 안은 그 변에서 그립 거리와 범위 크기의 1/4 가운데 작은 것까지만(더 안쪽은 셀 누르기 — 두 번 누르기로 셀 편집)
          const horiz = side === 'x0' || side === 'x1';
          const k = horiz ? kx : ky;
          const depth = (side === 'x0' ? p.x - q.x0 : side === 'x1' ? q.x1 - p.x : side === 'y0' ? p.y - q.y0 : q.y1 - p.y) * k;
          const size = (horiz ? q.x1 - q.x0 : q.y1 - q.y0) * k;
          if (depth > Math.min(tol, size / 4)) return;
        }
        bd = d;
        best = i;
      });
      return best;
    },
    gripPress(i, at) {
      const cur = live();
      const side = CELL_SIDES[i];
      if (!cur || !state || !side) return;
      const pt = fromTableLocal(cur.e, sideMid(rangeRect(cur.t, cur.range, cur.rt.style.flow), side));
      const id = `cell:${side}:${state.anchor.r},${state.anchor.c}:${state.end.r},${state.end.c}`;
      // 누른 자리와 그립의 어긋남(손가락으로 그립 옆을 눌러도 그 자리에서 옮긴 만큼만 — 같은 자리를 다시 누르면 그대로)
      pressAt.set(app, { x: at.x - pt.x, y: at.y - pt.y });
      // 객체 그립과 같은 그립 편집(GRIPEDIT — 누른 그립은 핫 그립 빨강)
      app.hotGrip = { point: pt, items: [{ handle: state.handle, id, point: pt }] };
      app.view.overlay.hotGrip = pt;
      void app.run('GRIPEDIT');
    },
    menu() {
      const cur = live();
      if (!cur || !state) return null;
      const { t, range: g } = cur;
      const flow = cur.rt.style.flow;
      const handle = state.handle;
      const m = mergeAt(t, g.r0, g.c0) ?? { row: g.r0, col: g.c0, rows: 1, cols: 1 };
      const one = m.row === g.r0 && m.col === g.c0 && m.row + m.rows - 1 === g.r1 && m.col + m.cols - 1 === g.c1;
      const merged = t.merges.some((x) => x.row <= g.r1 && x.row + x.rows - 1 >= g.r0 && x.col <= g.c1 && x.col + x.cols - 1 >= g.c0);
      const name = one ? cellName(g.r0, g.c0) : `${cellName(g.r0, g.c0)}:${cellName(g.r1, g.c1)}`;
      const run = (op: CellOp, label: string) => () => applyCellOp(handle, op, label);
      const items: ContextMenuItem[] = [
        { heading: `셀 ${name}` },
        // 화면 위·아래(위로 쌓는 표는 번호 차례가 반대)
        { label: '위에 행 삽입', run: run(flow === 1 ? 'rowAfter' : 'rowBefore', '위에 행 삽입') },
        { label: '아래에 행 삽입', run: run(flow === 1 ? 'rowBefore' : 'rowAfter', '아래에 행 삽입') },
        { label: '행 삭제', disabled: g.r1 - g.r0 + 1 >= t.rows, run: run('deleteRows', '행 삭제') },
        { separator: true },
        { label: '왼쪽에 열 삽입', run: run('colLeft', '왼쪽에 열 삽입') },
        { label: '오른쪽에 열 삽입', run: run('colRight', '오른쪽에 열 삽입') },
        { label: '열 삭제', disabled: g.c1 - g.c0 + 1 >= t.cols, run: run('deleteCols', '열 삭제') },
        { separator: true },
        {
          label: '셀 병합',
          disabled: one,
          items: [
            { label: '모두', run: run('mergeAll', '셀 병합') },
            { label: '행별', run: run('mergeRows', '셀 병합') },
            { label: '열별', run: run('mergeCols', '셀 병합') },
          ],
        },
        { label: '셀 병합 해제', disabled: !merged, run: run('unmerge', '셀 병합 해제') },
        { separator: true },
        // 30차 정렬(도움말 "Table Cell Ribbon Contextual Tab"의 Alignment — 위·가운데·아래 × 왼쪽·가운데·오른쪽). 범위의 셀이 모두 그 정렬이면 ✓
        {
          label: '정렬',
          items: ALIGN_ORDER.map((n) => ({ label: ALIGN_LABEL[n]!, ...(rangeAlign(t, cur.rt.style, g) === n ? { kbd: '✓' } : {}), run: () => applyAlign(handle, n) })),
        },
      ];
      return items;
    },
    current() {
      const cur = live();
      if (!cur || !state) return null;
      return { handle: state.handle, ...cur.range, anchor: cur.anchor };
    },
    select(handle, anchor, end = anchor) {
      const st = app.active;
      const e = st?.doc.entityIndex.get(handle);
      if (!st || !isEditableTable(e)) return false;
      const rt = read(e, st.doc);
      const t = rt?.data;
      const ok = (q: Cell) => !!t && q.r >= 0 && q.c >= 0 && q.r < t.rows && q.c < t.cols;
      if (!t || !ok(anchor) || !ok(end)) return false;
      set(st, handle, anchorOf(t, anchor.r, anchor.c), end);
      return true;
    },
  };
  addHook(app.subSelections, hook);
  sel.set(app, hook);
  return hook;
}
