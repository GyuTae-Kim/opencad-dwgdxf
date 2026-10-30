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
 * 하지 않은 것(도움말에 없거나 근거가 약하다): 끌어서 여러 셀 고르기, Shift+화살표로 넓히기, 마지막 셀 Tab의 새 행, Delete로 내용 지우기,
 * 셀 그립(행·열 크기), 고른 셀의 특성 팔레트·바로 가기 메뉴, 한글 입력기로 바로 입력하기(조합 중인 글자는 명령행으로 간다 — 두 번 눌러 편집)
 */
import type { Entity, InsertEntity, TableEntity } from '../core/model';
import { tableKey } from '../core/model';
import { isEditableTable, tableFromEntity } from '../edit/table/entity';
import { type TableData, anchorOf, cellAt, cellRect, mergeAt } from '../edit/table/model';
import type { App } from './app';
import type { DocState } from './docstate';
import { type SubSelection, addHook } from './hooks';
import { editTableInPlace, fromTableLocal, tabCell, toTableLocal } from './tablecmds';
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

  const hook: TableCellSelection = {
    name: 'table-cells',
    click(w, picked, opt) {
      const st = app.active;
      if (!st) return false;
      const list = st.doc.blocks.get(tableKey(st.space))?.entities ?? [];
      const pickedEnt = picked ? st.doc.entityIndex.get(picked) : undefined;
      // 표 위에 그린 다른 객체가 잡혔으면 그 객체(예전처럼)
      if (picked && !isEditableTable(pickedEnt)) return false;
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
        const a = cellUnder(e, rt.data, rt.style.flow, w, opt.tol);
        if (!a) {
          // 잡힌 표의 격자선 가까이: 예전처럼 표 객체를 고른다
          if (pickedEnt === e) return false;
          continue;
        }
        const cur = live();
        if (opt.shift && cur && state && state.handle === e.handle) set(st, e.handle, state.anchor, a);
        else set(st, e.handle, a, a);
        return true;
      }
      return false;
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
