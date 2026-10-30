/**
 * 표 명령: TABLE(테이블 삽입), TABLEDIT(셀 문자 편집), TABLECELL(행·열 삽입·삭제, 병합·병합 해제, 정렬, 행 높이·열 폭),
 * TABLESTYLE(테이블 스타일 관리), CTABLESTYLE(현재 테이블 스타일).
 * 프롬프트는 AutoCAD 2026 한국어판을 따른다. 표 계산은 src/edit/table의 순수 함수가 한다.
 */
import type { CadColor, CadDocument, Entity, InsertEntity, TableEntity } from '../core/model';
import { tableKey } from '../core/model';
import { ACI_RGB } from '../core/color';
import { tableBlockEntities } from '../edit/table/geometry';
import type { EditOp } from '../edit/session';
import type { App, CommandContext, Keyword } from './app';
import type { Pt } from './view';
import { currentProps } from './draw';
import { dialog, form, h } from './ui/dom';
import { type CellKind, type TableStyle, type TableStyleEntry, ALIGN_LABEL, KIND_LABEL, cloneTableStyle, currentTableStyle, defaultTableStyle, isMetric, listTableStyles } from '../edit/table/style';
import {
  type MergeMode,
  type TableData,
  anchorOf,
  cellAt,
  cellIndex,
  cellName,
  columnName,
  createTable,
  deleteCols,
  deleteRows,
  cellRect,
  fitRowHeights,
  getText,
  insertCols,
  insertRows,
  setText,
  mergeAt,
  mergeCells,
  setAlign,
  setRowKind,
  tableHeight,
  tableWidth,
  unmergeCells,
} from '../edit/table/model';
import { isEditableTable, tableFromEntity } from '../edit/table/entity';
import { addTableOps, deleteTableStyleOps, previewSegments, restyleTablesOps, saveTableStyleOps, tablesUsingStyle, updateTableOps } from '../edit/table/ops';
import { EDITOR_MIN_PX, type TextEditor, activeEditor, openTextEditor } from './textedit/editor';
import { newGroup } from './annoscale-core';
import type { Camera } from './docstate';
import { PHONE_WIDTH } from './ui/layout';
import { escapeMText } from '../edit/field/evaluate';


// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

/** 여러 줄 문자 높이 재기(행 높이 맞춤용) */
function measurer(app: App, doc: CadDocument): (text: string, height: number, width: number, textStyle: string) => number {
  return (text, height, width, textStyle) => {
    try {
      const lay = app.text.layoutMText({ text, height, width, attachment: 1, lineSpacingStyle: 1, lineSpacingFactor: 1, style: doc.textStyles.get(tableKey(textStyle)) });
      // 글자 상자는 글꼴마다 위아래 여유가 달라 줄 수로 센다(줄 간격 = 높이 × 5/3)
      const step = height * (5 / 3);
      const lines = Math.max(1, Math.round((lay.maxY - lay.minY - height) / step) + 1);
      return height + (lines - 1) * step;
    } catch {
      return height;
    }
  };
}

export interface PickedTable {
  entity: TableEntity | InsertEntity;
  space: string;
  data: TableData;
  style: TableStyle;
  styleHandle: string | undefined;
  cell: { r: number; c: number } | null;
}

/** 표 좌표(삽입점 원점, 회전·축척을 푼다) */
export function toTableLocal(e: TableEntity | InsertEntity, p: Pt): Pt {
  const ang = e.type === 'ACAD_TABLE' ? Math.atan2(e.direction.y, e.direction.x) : e.rotation;
  const dx = p.x - e.insert.x;
  const dy = p.y - e.insert.y;
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  return { x: (dx * c - dy * s) / (e.scale.x || 1), y: (dx * s + dy * c) / (e.scale.y || 1) };
}

/** 표의 방향(라디안) */
const tableAngle = (e: TableEntity | InsertEntity): number => (e.type === 'ACAD_TABLE' ? Math.atan2(e.direction.y, e.direction.x) : e.rotation);

/** 표 좌표 → 도면 좌표(toTableLocal의 반대) */
export function fromTableLocal(e: TableEntity | InsertEntity, q: Pt): Pt {
  const ang = tableAngle(e);
  const x = q.x * (e.scale.x || 1);
  const y = q.y * (e.scale.y || 1);
  return { x: e.insert.x + x * Math.cos(ang) - y * Math.sin(ang), y: e.insert.y + x * Math.sin(ang) + y * Math.cos(ang) };
}

/** 셀 문자의 자리(도면 좌표): 표 그림(geometry.ts tableBlockEntities)의 셀 MTEXT와 같은 부착점·폭·높이·문자 스타일, 방향은 표 방향 */
export function cellTextPlace(
  e: TableEntity | InsertEntity,
  t: TableData,
  style: TableStyle,
  r: number,
  c: number,
): { at: Pt; attachment: number; width: number; height: number; textStyle: string; rotation: number } {
  const cs = style.cells[t.rowKinds[r] ?? 'data'];
  const align = t.cells[cellIndex(t, r, c)]?.align ?? cs.align;
  const q = cellRect(t, r, c, style.flow);
  const col = (align - 1) % 3;
  const row = Math.floor((align - 1) / 3);
  const x = col === 0 ? q.x0 + style.hMargin : col === 1 ? (q.x0 + q.x1) / 2 : q.x1 - style.hMargin;
  const y = row === 0 ? q.y1 - style.vMargin : row === 1 ? (q.y0 + q.y1) / 2 : q.y0 + style.vMargin;
  const kx = Math.abs(e.scale.x || 1);
  const ky = Math.abs(e.scale.y || 1);
  return {
    at: fromTableLocal(e, { x, y }),
    attachment: align,
    width: Math.max(0, q.x1 - q.x0 - 2 * style.hMargin) * kx,
    height: cs.height * ky,
    textStyle: cs.textStyle || 'Standard',
    rotation: tableAngle(e),
  };
}

/** Tab(다음)·Shift+Tab(이전) 셀: 왼쪽에서 오른쪽, 위에서 아래(병합 셀은 한 칸 — 셀 편집 대화상자의 Tab과 같은 차례). 끝이면 null */
export function tabCell(t: TableData, r: number, c: number, back: boolean): { r: number; c: number } | null {
  const order: { r: number; c: number }[] = [];
  for (let i = 0; i < t.rows; i++)
    for (let j = 0; j < t.cols; j++) {
      const m = mergeAt(t, i, j);
      if (!m || (m.row === i && m.col === j)) order.push({ r: i, c: j });
    }
  const a = anchorOf(t, r, c);
  const k = order.findIndex((o) => o.r === a.r && o.c === a.c) + (back ? -1 : 1);
  return k >= 0 && k < order.length ? order[k]! : null;
}

export function readPicked(app: App, handle: string, point: Pt | null): PickedTable | null {
  const st = app.active!;
  const e = st.doc.entityIndex.get(handle);
  if (!isEditableTable(e)) return null;
  const space = st.session.ownerOf(handle);
  if (!space) return null;
  const rt = tableFromEntity(e, st.doc);
  if (!rt) return null;
  let cell: { r: number; c: number } | null = null;
  if (point) {
    const q = toTableLocal(e, point);
    const at = cellAt(rt.data, q.x, q.y, rt.style.flow);
    cell = at ? anchorOf(rt.data, at.r, at.c) : null;
  }
  return { entity: e, space, data: rt.data, style: rt.style, styleHandle: rt.styleEntry?.handle, cell };
}

export function lockedLayer(app: App, e: Entity): boolean {
  const l = app.active!.doc.layers.get(tableKey(e.layer));
  if (l?.locked) {
    app.cmd.print('객체가 잠긴 도면층에 있습니다.', 'err');
    return true;
  }
  return false;
}

/** 표 셀 고르기(표가 아니거나 셀 밖이면 다시 묻는다). Enter면 null */
export async function pickCell(app: App, ctx: CommandContext, prompt: string, keywords: Keyword[] = []): Promise<PickedTable | { keyword: string } | null> {
  for (;;) {
    const r = await ctx.getEntity(prompt, keywords);
    if ('enter' in r) return null;
    if ('keyword' in r) return { keyword: r.keyword };
    const p = readPicked(app, r.handle, r.point);
    if (!p) {
      ctx.print('표가 아닙니다.', 'err');
      continue;
    }
    if (!p.cell) {
      ctx.print('셀 안을 고르십시오.', 'err');
      continue;
    }
    return p;
  }
}

/** 행 높이를 문자에 맞춘 표 정의(commitTable이 적용하는 것과 같다) */
export function fitTable(app: App, data: TableData, style: TableStyle): TableData {
  return fitRowHeights(data, style, measurer(app, app.active!.doc));
}

/** 표 정의를 적용한다(행 높이를 문자에 맞춘 뒤). insert를 주면 표의 삽입점도 옮긴다(셀 그립의 왼쪽·위쪽 — 29차) */
export function commitTable(app: App, p: Pick<PickedTable, 'entity' | 'space' | 'style' | 'styleHandle'>, data: TableData, label: string, group?: number, insert?: Pt): TableEntity {
  const st = app.active!;
  const fitted = fitTable(app, data, p.style);
  const r = updateTableOps(st.doc, () => st.session.newHandle(), p.entity, p.space, fitted, p.style, p.styleHandle);
  // 바뀐 표 객체(작업의 after와 같은 것)는 새로 만든 것이라 그 자리에서 고쳐도 원본은 그대로다
  if (insert) r.table.insert = { x: insert.x, y: insert.y, z: r.table.insert.z };
  st.session.commit({ label, ops: r.ops, group });
  return r.table;
}

/**
 * 표 셀 작업(29차): TABLECELL과 고른 셀의 바로 가기 메뉴가 함께 쓴다. 행·열의 앞뒤는 번호 차례(rowBefore = r0 앞 —
 * 위에서 아래로 쌓는 표에서 위, 위로 쌓는 표에서 아래)
 */
export type CellOp = 'rowBefore' | 'rowAfter' | 'deleteRows' | 'colLeft' | 'colRight' | 'deleteCols' | 'mergeAll' | 'mergeRows' | 'mergeCols' | 'unmerge';

/**
 * 셀 범위 g(병합 셀을 덮도록 넓힌 r0..r1 × c0..c1)에 작업한 표 정의. 할 수 없으면 null
 * (모든 행·열 지우기, 한 셀만 병합, 병합이 없는 범위의 병합 해제)
 */
export function cellOp(t: TableData, g: { r0: number; c0: number; r1: number; c1: number }, op: CellOp): TableData | null {
  switch (op) {
    case 'rowBefore':
      return insertRows(t, g.r0, 1);
    case 'rowAfter':
      return insertRows(t, g.r1 + 1, 1);
    case 'deleteRows':
      return deleteRows(t, g.r0, g.r1);
    case 'colLeft':
      return insertCols(t, g.c0, 1);
    case 'colRight':
      return insertCols(t, g.c1 + 1, 1);
    case 'deleteCols':
      return deleteCols(t, g.c0, g.c1);
    case 'mergeAll':
      return mergeCells(t, g.r0, g.c0, g.r1, g.c1, 'all');
    case 'mergeRows':
      return mergeCells(t, g.r0, g.c0, g.r1, g.c1, 'rows');
    case 'mergeCols':
      return mergeCells(t, g.r0, g.c0, g.r1, g.c1, 'cols');
    case 'unmerge':
      return unmergeCells(t, g.r0, g.c0, g.r1, g.c1);
  }
}

// ---------------------------------------------------------------------------
// 셀 문자 편집기(표 전체 격자)
// ---------------------------------------------------------------------------

const INPUT_CSS = 'width:100%;min-width:72px;box-sizing:border-box;resize:vertical;background:var(--bg-input);color:var(--text);border:1px solid var(--border-soft);border-radius:3px;padding:3px 5px;font:13px var(--font)';

/**
 * 셀 문자 편집 대화상자. 병합된 셀은 하나의 칸, 줄바꿈은 여러 줄 문자 문단(\P).
 * Enter 아래 셀, Alt+Enter·Shift+Enter 줄바꿈, Tab·Shift+Tab 다음·이전 셀, Ctrl+Enter 확인, Esc 취소.
 */
export function editCellsDialog(title: string, t: TableData, focus: { r: number; c: number } | null): Promise<TableData | null> {
  return new Promise((resolve) => {
    let done = false;
    const inputs = new Map<number, HTMLTextAreaElement>();
    const table = h('table', { style: 'border-collapse:collapse;width:100%' });
    const head = h('tr', {}, h('th', { style: 'width:28px' }));
    for (let c = 0; c < t.cols; c++) head.append(h('th', { style: 'color:var(--text-dim);font-weight:500;padding:2px' }, columnName(c)));
    table.append(head);
    for (let r = 0; r < t.rows; r++) {
      const tr = h('tr', {}, h('th', { style: 'color:var(--text-dim);font-weight:500;padding:2px 4px', title: KIND_LABEL[t.rowKinds[r] ?? 'data'] }, String(r + 1)));
      for (let c = 0; c < t.cols; c++) {
        const m = mergeAt(t, r, c);
        if (m && (m.row !== r || m.col !== c)) continue;
        const ta = h('textarea', { rows: 1, 'aria-label': `셀 ${cellName(r, c)}`, style: INPUT_CSS + (t.rowKinds[r] !== 'data' ? ';font-weight:600' : '') });
        ta.value = (t.cells[cellIndex(t, r, c)]?.text ?? '').replace(/\\P/g, '\n');
        inputs.set(cellIndex(t, r, c), ta);
        tr.append(h('td', { colspan: m?.cols ?? 1, rowspan: m?.rows ?? 1, style: 'padding:2px;vertical-align:top' }, ta));
      }
      table.append(tr);
    }
    const body = h(
      'div',
      {},
      h('div', { style: 'max-height:60vh;overflow:auto' }, table),
      h('div', { style: 'margin-top:6px;color:var(--text-dim)' }, 'Enter 아래 셀 · Alt+Enter 줄 바꿈 · Tab 다음 셀 · Ctrl+Enter 확인'),
    );
    const read = (): TableData => {
      const out: TableData = structuredClone(t);
      for (const [i, ta] of inputs) out.cells[i]!.text = ta.value.replace(/\r?\n/g, '\\P');
      return out;
    };
    const back = dialog(title, body, [
      { label: '취소', run: () => ((done = true), resolve(null)) },
      { label: '확인', primary: true, run: () => ((done = true), resolve(read())) },
    ]);
    const box = back.querySelector('.dialog') as HTMLElement | null;
    if (box) box.style.width = `min(${Math.min(1100, 160 + t.cols * 150)}px, 100%)`;
    const order = [...inputs.keys()];
    for (const [i, ta] of inputs) {
      ta.addEventListener('keydown', (ev) => {
        const k = ev as KeyboardEvent;
        k.stopPropagation();
        if (k.key !== 'Enter') return;
        if (k.ctrlKey || k.metaKey) {
          k.preventDefault();
          (back.querySelector('footer .btn.primary') as HTMLButtonElement | null)?.click();
          return;
        }
        if (k.altKey || k.shiftKey) return;
        // 아래 셀(병합 셀은 그 아래)
        k.preventDefault();
        const r = Math.floor(i / t.cols);
        const c = i % t.cols;
        const m = mergeAt(t, r, c);
        const below = r + (m?.rows ?? 1);
        if (below < t.rows) {
          const a = anchorOf(t, below, c);
          inputs.get(cellIndex(t, a.r, a.c))?.focus();
        } else inputs.get(order[(order.indexOf(i) + 1) % order.length]!)?.focus();
      });
    }
    setTimeout(() => {
      const a = focus ? anchorOf(t, focus.r, focus.c) : { r: 0, c: 0 };
      const ta = inputs.get(cellIndex(t, a.r, a.c)) ?? inputs.values().next().value;
      ta?.focus();
      ta?.select();
    });
    new MutationObserver((_, obs) => {
      if (!back.isConnected) {
        obs.disconnect();
        if (!done) resolve(null);
      }
    }).observe(document.body, { childList: true });
  });
}

/**
 * 표의 셀을 편집한다(두 번 누르기·TEXTEDIT·특성 팔레트). 누른 자리가 셀 안이면 그 셀 자리의 제자리 편집기(27차),
 * 자리가 없거나(특성 팔레트) 셀 밖이면 표 전체 셀 편집 대화상자
 */
export async function editTableAt(app: App, handle: string, point: Pt | null): Promise<void> {
  const p = readPicked(app, handle, point);
  if (!p || lockedLayer(app, p.entity)) return;
  if (p.cell) return editTableInPlace(app, handle, p.cell);
  const out = await editCellsDialog('테이블 셀 편집', p.data, p.cell);
  if (!out) return;
  commitTable(app, p, out, 'TABLEDIT');
}

/**
 * 두 번 누른 자리에 객체가 잡히지 않았을 때(표의 빈 셀 안은 격자선·문자에서 멀어 잡히지 않는다): 지금 공간의 보이는 표 가운데
 * 그 자리를 셀로 품은 것(위에 그린 것 먼저)의 셀 제자리 편집(27차 — 도움말: 셀 안을 두 번 눌러 고친다). 표가 없으면 아무것도 하지 않는다
 */
export async function editTableCellAt(app: App, w: Pt): Promise<boolean> {
  const st = app.active;
  if (!st) return false;
  const list = st.doc.blocks.get(tableKey(st.space))?.entities ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]!;
    if (!isEditableTable(e)) continue;
    const l = st.doc.layers.get(tableKey(e.layer));
    if (l && (l.off || l.frozen)) continue;
    const p = readPicked(app, e.handle, w);
    if (!p?.cell) continue;
    app.setSelection([e.handle], 'replace');
    await editTableAt(app, e.handle, w);
    return true;
  }
  return false;
}

/**
 * 표 셀 제자리 편집(27차): 셀 문자 자리(부착점·폭·높이·방향)에 문자 편집기를 띄운다.
 * 근거(AutoCAD 도움말 "About Adding Text and Blocks to Tables", 우리말 요약): 셀을 두 번 눌러 그 셀의 문자를 고치고, 다음 셀로는 Tab으로 가며
 * 셀 안의 화살표는 커서를 옮긴다. 줄이 늘면 그 행의 높이가 늘어난다. TABLEDIT — 셀을 골라 그 자리에서 입력한다.
 * - Tab·Shift+Tab: 지금 셀을 확인하고 다음·이전 셀(병합 셀은 한 칸, 대화상자의 Tab과 같은 차례). 마지막 셀에서 Tab이면 끝
 * - 같은 표의 다른 셀을 누르면 그 셀로, 표 밖을 누르거나 Ctrl+Enter면 확인하고 끝, Esc는 지금 셀만 버리고 끝
 * - 고친 셀은 바로 표에 반영한다(행 높이 맞춤). 한 번의 편집(여러 셀)은 명령 취소 한 단계(group)
 * - 도구 모음의 "모든 셀"은 지금 셀을 확인한 뒤 표 전체 셀 편집 대화상자(휴대폰처럼 Tab이 없을 때)
 * 28차:
 * - opt.replace: 고른 셀에서 바로 친 글자로 그 셀 내용을 바꾸며 시작한다(도움말 — 셀을 고른 채 입력하면 내용을 바꾼다). 첫 셀에만 쓴다
 * - opt.label: 고친 셀의 명령 취소 이름(TABLE 뒤 첫 셀 입력은 TABLE)
 * - 휴대폰(폭 480px 이하): 편집기 도구 모음을 도면 영역 위 끝에 붙이고, 셀 글자가 편집기 최소 글자보다 작게 보이면 그 크기까지 확대해
 *   편집 셀과 바로 위 행을 도구 모음 아래로 옮긴다. 편집 상자는 좌우 안쪽 여백 없이 셀 문자 폭이라 옆 셀을 가리지 않는다. 편집이 끝나면 예전 보기로 되돌린다
 *   (편집 중에 사용자가 보기를 바꿨으면 그대로 둔다)
 * - 열 때 고른 표 셀(셀 고르기 상태)은 푼다
 */
export async function editTableInPlace(app: App, handle: string, start: { r: number; c: number }, group = newGroup(), opt: { replace?: string; label?: string } = {}): Promise<void> {
  let cur = start;
  let replace = opt.replace;
  const label = opt.label ?? 'TABLEDIT';
  app.clearSubSelections();
  const phone = phoneLayout();
  // 휴대폰 확대 전 보기와 마지막으로 맞춘 보기
  let saved: Camera | null = null;
  let last: Camera | null = null;
  try {
    for (;;) {
      const p = readPicked(app, handle, null);
      if (!p || lockedLayer(app, p.entity)) return;
      const a = anchorOf(p.data, Math.min(cur.r, p.data.rows - 1), Math.min(cur.c, p.data.cols - 1));
      const place = cellTextPlace(p.entity, p.data, p.style, a.r, a.c);
      const original = getText(p.data, a.r, a.c);
      const text = replace !== undefined ? escapeMText(replace) : original;
      replace = undefined;
      let next: { r: number; c: number } | null = null;
      let all = false;
      const pending = openTextEditor(
        app,
        {
          mode: 'mtext',
          label: `테이블 셀 편집 — ${cellName(a.r, a.c)}`,
          text,
          height: place.height,
          style: place.textStyle,
          attachment: place.attachment,
          width: place.width,
          rotation: place.rotation,
          at: place.at,
          color: p.entity.color,
          layer: p.entity.layer,
          noEntityProps: true,
          extra: [{ label: '모든 셀', title: '표의 모든 셀을 대화상자에서 고칩니다', run: (ed) => ((all = true), ed.confirm()) }],
          ...(phone ? { barDock: 'top' as const, tight: true } : {}),
        },
        {
          onTab: (back) => {
            next = tabCell(p.data, a.r, a.c, back);
            return true;
          },
          onCanvasClick: (w) => {
            // 같은 표의 다른 셀이면 지금 셀을 확인하고 그 셀로(편집기는 닫고 다시 띄운다)
            if (!isEditableTable(app.active?.doc.entityIndex.get(handle))) return false;
            const q = toTableLocal(p.entity, w);
            const at = cellAt(p.data, q.x, q.y, p.style.flow);
            if (at) next = anchorOf(p.data, at.r, at.c);
            return false;
          },
        },
      );
      const ed = activeEditor();
      if (phone && ed) {
        const before = app.view.camera();
        const set = fitCellOnPhone(app, ed, p, a);
        if (set) {
          saved ??= { ...before };
          last = set;
        }
      }
      const res = await pending;
      if (!res) return;
      if (res.textChanged || res.text !== original) commitTable(app, p, setText(p.data, a.r, a.c, res.text), label, group);
      if (all) {
        const q = readPicked(app, handle, null);
        if (!q) return;
        const out = await editCellsDialog('테이블 셀 편집', q.data, a);
        if (out) commitTable(app, q, out, label, group);
        return;
      }
      if (!next) return;
      cur = next;
    }
  } finally {
    // 휴대폰 확대를 되돌린다(그 사이 사용자가 보기를 옮기거나 확대했으면 그대로)
    if (saved && last && sameCamera(app.view.camera(), last)) app.view.setViewCamera(saved);
  }
}

/** 휴대폰 배치(폭 480px 이하 — 셸의 휴대폰 단계와 같다) */
function phoneLayout(): boolean {
  return typeof window !== 'undefined' && (window.innerWidth || 0) > 0 && window.innerWidth <= PHONE_WIDTH;
}

const sameCamera = (a: Camera, b: Camera): boolean => Math.abs(a.cx - b.cx) <= 1e-9 * Math.max(1, Math.abs(b.cx)) && Math.abs(a.cy - b.cy) <= 1e-9 * Math.max(1, Math.abs(b.cy)) && Math.abs(a.scale - b.scale) <= 1e-12 * b.scale;

/**
 * 휴대폰에서 셀 편집기가 이웃 셀을 가리지 않게 보기를 맞춘다(28차). 셀 문자가 편집기 최소 글자(EDITOR_MIN_PX)보다 작게 보이면
 * 그 크기까지 확대하고(그러면 편집 상자가 셀과 같은 크기 — 그보다 작으면 상자만 커져 옆 셀을 덮었다), 편집 셀과 바로 위 행이
 * 도면 영역 위 끝의 도구 모음 아래 위쪽(소프트 키보드가 덮지 않을 자리)에, 양옆 셀도 화면 폭에 들면 함께 보이도록 옮긴다
 * (이미 들어 있으면 옮기지 않는다). 바꾼 카메라, 바꾸지 않았으면 null
 */
export function fitCellOnPhone(app: App, ed: TextEditor, p: PickedTable, a: { r: number; c: number }): Camera | null {
  const view = app.view;
  const cam = view.camera();
  const place = cellTextPlace(p.entity, p.data, p.style, a.r, a.c);
  if (!(place.height > 0)) return null;
  const need = (EDITOR_MIN_PX * 0.7) / place.height;
  const zoom = cam.scale < need * (1 - 1e-9);
  if (zoom && !view.setViewCamera({ ...cam, scale: need })) return null;
  // 편집 셀과 바로 위 행(같은 열)의 화면 상자(보기 기준). 양옆 셀까지 화면 폭에 들면 그것도 보이게
  const t = p.data;
  const corners = (pts: Pt[], r: number, c: number) => {
    const q = cellRect(t, r, c, p.style.flow);
    for (const [x, y] of [
      [q.x0, q.y0],
      [q.x1, q.y0],
      [q.x1, q.y1],
      [q.x0, q.y1],
    ] as const)
      pts.push(view.worldToScreen(...xy(fromTableLocal(p.entity, { x, y }))));
  };
  const must: Pt[] = [];
  corners(must, a.r, a.c);
  const m = mergeAt(t, a.r, a.c) ?? { row: a.r, col: a.c, rows: 1, cols: 1 };
  const above = p.style.flow === 1 ? m.row + m.rows : m.row - 1;
  if (above >= 0 && above < t.rows) {
    const b = anchorOf(t, above, a.c);
    corners(must, b.r, b.c);
  }
  const wide = [...must];
  if (m.col > 0) corners(wide, ...rc(anchorOf(t, a.r, m.col - 1)));
  if (m.col + m.cols < t.cols) corners(wide, ...rc(anchorOf(t, a.r, m.col + m.cols)));
  const box = (pts: Pt[]) => ({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) });
  const nb = box(must);
  const wb = box(wide);
  const vr = view.el.getBoundingClientRect();
  const br = ed.bar.getBoundingClientRect();
  const W = vr.width || window.innerWidth;
  const H = vr.height || window.innerHeight;
  const left = 8;
  const right = W - 8;
  const top = Math.max(8, br.bottom - vr.top + 8);
  // 아래쪽은 소프트 키보드·명령행이 덮을 수 있어 도구 모음 아래 위쪽 절반쯤에 둔다
  const bottom = Math.min(H - 8, top + Math.max(80, 0.45 * (H - top)));
  let dx = 0;
  let dy = 0;
  // 가로: 양옆 셀까지 들면 그만큼, 아니면 편집 셀(과 위 셀)만 — 넘치면 가운데로(셀이 화면보다 넓으면 왼쪽 끝을 맞춘다)
  const hb = wb.x1 - wb.x0 <= right - left ? wb : nb;
  if (hb.x0 < left || hb.x1 > right) dx = hb.x1 - hb.x0 <= right - left ? (left + right) / 2 - (hb.x0 + hb.x1) / 2 : left - hb.x0;
  if (nb.y0 < top || nb.y1 > bottom) dy = top - nb.y0;
  const c = view.camera();
  if (!zoom && !dx && !dy) return null;
  const next = { cx: c.cx - dx / c.scale, cy: c.cy + dy / c.scale, scale: c.scale };
  if ((dx || dy) && !view.setViewCamera(next)) return null;
  ed.place();
  return view.camera();
}

const xy = (p: Pt): [number, number] => [p.x, p.y];
const rc = (q: { r: number; c: number }): [number, number] => [q.r, q.c];

// ---------------------------------------------------------------------------
// TABLE
// ---------------------------------------------------------------------------

interface InsertSettings {
  style: string;
  mode: 'point' | 'window';
  cols: number;
  colWidth: number;
  dataRows: number;
  rowLines: number;
  first: CellKind;
  second: CellKind;
}

const lastInsert = new WeakMap<CadDocument, InsertSettings>();

function kindOptions(): { value: string; label: string }[] {
  return (['title', 'header', 'data'] as CellKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));
}

async function tableInsertDialog(app: App): Promise<InsertSettings | null> {
  const doc = app.active!.doc;
  const styles = listTableStyles(doc);
  const cur = currentTableStyle(doc);
  const metric = isMetric(doc);
  const prev = lastInsert.get(doc);
  const v = await form(
    '테이블 삽입',
    [
      { key: 'style', label: '테이블 스타일', type: 'select', value: prev?.style ?? cur?.handle ?? '', options: styles.length ? styles.map((s) => ({ value: s.handle, label: s.name })) : [{ value: '', label: 'Standard' }] },
      {
        key: 'mode',
        label: '삽입 동작',
        type: 'select',
        value: prev?.mode ?? 'point',
        options: [
          { value: 'point', label: '삽입점 지정' },
          { value: 'window', label: '윈도우 지정' },
        ],
      },
      { key: 'cols', label: '열', type: 'number', value: prev?.cols ?? 5 },
      { key: 'colWidth', label: '열 폭', type: 'number', value: prev?.colWidth ?? (metric ? 63.5 : 2.5) },
      { key: 'dataRows', label: '데이터 행', type: 'number', value: prev?.dataRows ?? 1 },
      { key: 'rowLines', label: '행 높이(줄)', type: 'number', value: prev?.rowLines ?? 1 },
      { key: 'first', label: '첫 번째 행 셀 스타일', type: 'select', value: prev?.first ?? 'title', options: kindOptions() },
      { key: 'second', label: '두 번째 행 셀 스타일', type: 'select', value: prev?.second ?? 'header', options: kindOptions() },
    ],
    {
      ok: '확인',
      note: '다른 모든 행은 데이터 셀 스타일입니다. 윈도우 지정에서는 열 폭과 행 높이를 창 크기에서 정합니다.',
      validate: (x) => {
        const int = (k: string, lo: number, hi: number) => Number.isInteger(Number(x[k])) && Number(x[k]) >= lo && Number(x[k]) <= hi;
        if (!int('cols', 1, 200)) return '열은 1~200 사이의 정수입니다.';
        if (!int('dataRows', 1, 1000)) return '데이터 행은 1~1000 사이의 정수입니다.';
        if (!int('rowLines', 1, 100)) return '행 높이(줄)는 1 이상의 정수입니다.';
        if (!(Number(x.colWidth) > 0)) return '열 폭은 0보다 커야 합니다.';
        return null;
      },
    },
  );
  if (!v) return null;
  const s: InsertSettings = {
    style: String(v.style),
    mode: v.mode === 'window' ? 'window' : 'point',
    cols: Number(v.cols),
    colWidth: Number(v.colWidth),
    dataRows: Number(v.dataRows),
    rowLines: Number(v.rowLines),
    first: v.first as CellKind,
    second: v.second as CellKind,
  };
  lastInsert.set(doc, s);
  return s;
}

function styleFor(doc: CadDocument, handle: string): { entry: TableStyleEntry | null; style: TableStyle } {
  const entry = listTableStyles(doc).find((s) => s.handle === handle) ?? currentTableStyle(doc);
  return { entry, style: entry?.style ?? defaultTableStyle(isMetric(doc)) };
}

/** 표 좌표 선분을 삽입점 기준 월드 선분으로 */
function ghostSegs(segs: number[][], at: Pt): number[] {
  const out: number[] = [];
  for (const s of segs) out.push(s[0]! + at.x, s[1]! + at.y, s[2]! + at.x, s[3]! + at.y);
  return out;
}

// ---------------------------------------------------------------------------
// TABLESTYLE 편집기
// ---------------------------------------------------------------------------

const FIELD_CSS = 'width:100%;box-sizing:border-box;height:26px;padding:0 6px;border:1px solid var(--border-soft);border-radius:3px;background:var(--bg-input);color:var(--text);font:inherit';

function aciText(c: { aci: number } | null): string {
  if (!c) return '';
  if (c.aci === 0) return 'ByBlock';
  if (c.aci === 256) return 'ByLayer';
  return String(c.aci);
}

function parseAci(s: string, allowEmpty: boolean): { aci: number } | null | undefined {
  const t = s.trim().toUpperCase();
  if (!t) return allowEmpty ? null : undefined;
  if (t === 'BYBLOCK') return { aci: 0 };
  if (t === 'BYLAYER') return { aci: 256 };
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 256 ? { aci: n } : undefined;
}

/** 테이블 스타일 편집 대화상자(확인하면 새 스타일 값) */
function tableStyleEditor(doc: CadDocument, title: string, start: TableStyle): Promise<TableStyle | null> {
  return new Promise((resolve) => {
    let done = false;
    const s = cloneTableStyle(start);
    const textStyles = [...doc.textStyles.values()].filter((x) => x.name && !(x.flags & 1)).map((x) => x.name);
    if (!textStyles.length) textStyles.push('Standard');
    const err = h('div', { class: 'form-error', role: 'alert' });
    const inp = (value: string, label: string) => {
      const el = h('input', { type: 'text', 'aria-label': label, style: FIELD_CSS });
      el.value = value;
      el.addEventListener('keydown', (ev) => ev.stopPropagation());
      return el;
    };
    const sel = (value: string, opts: { value: string; label: string }[], label: string) => {
      const el = h('select', { 'aria-label': label, style: FIELD_CSS }, ...opts.map((o) => h('option', { value: o.value }, o.label)));
      el.value = value;
      return el;
    };
    const desc = inp(s.description, '설명');
    const flow = sel(String(s.flow), [
      { value: '0', label: '아래로' },
      { value: '1', label: '위로' },
    ], '표 방향');
    const hm = inp(String(s.hMargin), '여백 수평');
    const vm = inp(String(s.vMargin), '여백 수직');
    const kinds: CellKind[] = ['data', 'header', 'title'];
    type Row = { label: string; make: (k: CellKind) => HTMLElement; read: (k: CellKind, el: HTMLElement) => string | null };
    const els = new Map<string, HTMLElement>();
    const rows: Row[] = [
      {
        label: '문자 스타일',
        make: (k) => sel(textStyles.find((n) => tableKey(n) === tableKey(s.cells[k].textStyle)) ?? textStyles[0]!, textStyles.map((n) => ({ value: n, label: n })), `${KIND_LABEL[k]} 문자 스타일`),
        read: (k, el) => ((s.cells[k].textStyle = (el as HTMLSelectElement).value), null),
      },
      {
        label: '문자 높이',
        make: (k) => inp(String(s.cells[k].height), `${KIND_LABEL[k]} 문자 높이`),
        read: (k, el) => {
          const v = Number((el as HTMLInputElement).value);
          if (!(v > 0)) return `${KIND_LABEL[k]} 문자 높이는 0보다 커야 합니다.`;
          s.cells[k].height = v;
          return null;
        },
      },
      {
        label: '정렬',
        make: (k) => sel(String(s.cells[k].align), Object.entries(ALIGN_LABEL).map(([v, l]) => ({ value: v, label: l })), `${KIND_LABEL[k]} 정렬`),
        read: (k, el) => ((s.cells[k].align = Number((el as HTMLSelectElement).value)), null),
      },
      {
        label: '문자 색상',
        make: (k) => inp(aciText(s.cells[k].color), `${KIND_LABEL[k]} 문자 색상`),
        read: (k, el) => {
          const c = parseAci((el as HTMLInputElement).value, false);
          if (!c) return `${KIND_LABEL[k]} 문자 색상: ByBlock·ByLayer 또는 1~255`;
          s.cells[k].color = c;
          return null;
        },
      },
      {
        label: '채우기 색상',
        make: (k) => inp(aciText(s.cells[k].fill), `${KIND_LABEL[k]} 채우기 색상`),
        read: (k, el) => {
          const c = parseAci((el as HTMLInputElement).value, true);
          if (c === undefined) return `${KIND_LABEL[k]} 채우기 색상: 비우면 없음, 또는 1~255`;
          s.cells[k].fill = c;
          return null;
        },
      },
      {
        label: '테두리 색상',
        make: (k) => inp(aciText(s.cells[k].borderColor), `${KIND_LABEL[k]} 테두리 색상`),
        read: (k, el) => {
          const c = parseAci((el as HTMLInputElement).value, false);
          if (!c) return `${KIND_LABEL[k]} 테두리 색상: ByBlock·ByLayer 또는 1~255`;
          s.cells[k].borderColor = c;
          return null;
        },
      },
    ];
    const grid = h('table', { style: 'width:100%;border-collapse:collapse;margin-top:8px' }, h('tr', {}, h('th', { style: 'text-align:left;color:var(--text-dim);font-weight:500' }, '셀 스타일'), ...kinds.map((k) => h('th', { style: 'text-align:left;padding:2px 4px' }, KIND_LABEL[k]))));
    for (const row of rows) {
      const tr = h('tr', {}, h('td', { style: 'color:var(--text-dim);padding-right:6px;white-space:nowrap' }, row.label));
      for (const k of kinds) {
        const el = row.make(k);
        els.set(`${row.label}:${k}`, el);
        tr.append(h('td', { style: 'padding:2px 4px' }, el));
      }
      grid.append(tr);
    }
    const line = (label: string, el: HTMLElement) => h('label', { class: 'form-row' }, h('span', {}, label), el);
    const body = h(
      'div',
      {},
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 12px' }, line('설명', desc), line('표 방향', flow), line('여백 수평', hm), line('여백 수직', vm)),
      grid,
      h('div', { class: 'form-note' }, '색상: ByBlock, ByLayer 또는 색상 번호(1~255). 채우기를 비우면 채우지 않습니다.'),
      err,
    );
    const submit = (): boolean => {
      s.description = desc.value;
      s.flow = flow.value === '1' ? 1 : 0;
      const a = Number(hm.value);
      const b = Number(vm.value);
      if (!(a >= 0) || !(b >= 0)) {
        err.textContent = '여백은 0 이상이어야 합니다.';
        return false;
      }
      s.hMargin = a;
      s.vMargin = b;
      for (const row of rows)
        for (const k of kinds) {
          const m = row.read(k, els.get(`${row.label}:${k}`)!);
          if (m) {
            err.textContent = m;
            return false;
          }
        }
      return true;
    };
    const back = dialog(title, body, [
      { label: '취소', run: () => ((done = true), resolve(null)) },
      {
        label: '확인',
        primary: true,
        run: () => {
          if (!submit()) return true;
          done = true;
          resolve(s);
        },
      },
    ]);
    const box = back.querySelector('.dialog') as HTMLElement | null;
    if (box) box.style.width = 'min(640px, 100%)';
    new MutationObserver((_, obs) => {
      if (!back.isConnected) {
        obs.disconnect();
        if (!done) resolve(null);
      }
    }).observe(document.body, { childList: true });
  });
}

/** 색 → CSS(ByLayer·ByBlock·7은 글자색) */
function cssColor(c: CadColor): string {
  if (c.rgb !== undefined) return `#${c.rgb.toString(16).padStart(6, '0')}`;
  if (c.aci <= 0 || c.aci >= 256 || c.aci === 7) return 'currentColor';
  return `#${(ACI_RGB[c.aci] ?? 0xffffff).toString(16).padStart(6, '0')}`;
}

/** 스타일 미리보기: 제목·머리글·데이터 행이 있는 작은 표(SVG, 글꼴은 화면 글꼴로 흉내) */
function tableStylePreview(style: TableStyle): SVGSVGElement {
  const hMax = Math.max(style.cells.data.height, style.cells.header.height, style.cells.title.height);
  let t = createTable({ cols: 3, colWidth: hMax * 9, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, style);
  t = setText(t, 0, 0, '제목');
  for (let c = 0; c < 3; c++) t = setText(t, 1, c, '머리글');
  for (let r = 2; r < t.rows; r++) for (let c = 0; c < 3; c++) t = setText(t, r, c, '데이터');
  const ents = tableBlockEntities(t, style);
  const W = tableWidth(t);
  const H = tableHeight(t);
  const pad = hMax;
  // 표 좌표: 아래로 쌓으면 y는 0 → -H, 위로 쌓으면 0 → H
  const top = style.flow === 1 ? H : 0;
  const X = (x: number) => (x + pad).toFixed(3);
  const Y = (y: number) => (top - y + pad).toFixed(3);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${(W + 2 * pad).toFixed(3)} ${(H + 2 * pad).toFixed(3)}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '미리보기');
  svg.style.cssText = 'width:100%;height:150px;background:var(--bg-input);border:1px solid var(--border-soft);border-radius:4px;color:var(--text)';
  const el = (name: string, attrs: Record<string, string>, text?: string) => {
    const x = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v);
    if (text) x.textContent = text;
    svg.append(x);
  };
  for (const e of ents) {
    if (e.type === 'SOLID') {
      const q = e.points;
      el('polygon', { points: [q[0]!, q[1]!, q[3]!, q[2]!].map((p) => `${X(p.x)},${Y(p.y)}`).join(' '), fill: cssColor(e.color) });
    } else if (e.type === 'LINE') {
      el('line', { x1: X(e.start.x), y1: Y(e.start.y), x2: X(e.end.x), y2: Y(e.end.y), stroke: cssColor(e.color), 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' });
    } else if (e.type === 'MTEXT') {
      const a = e.attachment - 1;
      const anchor = ['start', 'middle', 'end'][a % 3]!;
      const base = ['text-before-edge', 'central', 'text-after-edge'][Math.floor(a / 3)]!;
      el('text', { x: X(e.insert.x), y: Y(e.insert.y), 'font-size': e.height.toFixed(3), 'text-anchor': anchor, 'dominant-baseline': base, fill: cssColor(e.color), style: 'font-family:var(--font)' }, e.text);
    }
  }
  return svg;
}

/** 스타일 요약(목록 옆 설명) */
function styleSummary(s: TableStyle): string {
  const c = (k: CellKind) => `${KIND_LABEL[k]} ${s.cells[k].textStyle} ${+s.cells[k].height.toFixed(4)} · ${ALIGN_LABEL[s.cells[k].align] ?? ''}${s.cells[k].fill ? ` · 채우기 ${aciText(s.cells[k].fill)}` : ''}`;
  return [`표 방향: ${s.flow === 1 ? '위로' : '아래로'}, 여백 ${+s.hMargin.toFixed(4)} / ${+s.vMargin.toFixed(4)}`, c('title'), c('header'), c('data')].join('\n');
}

// ---------------------------------------------------------------------------
// 등록
// ---------------------------------------------------------------------------

const ALIGN_KEYS: Keyword[] = [
  { key: 'TL', label: '맨 위 왼쪽' },
  { key: 'TC', label: '맨 위 중심' },
  { key: 'TR', label: '맨 위 오른쪽' },
  { key: 'ML', label: '중간 왼쪽' },
  { key: 'MC', label: '중간 중심' },
  { key: 'MR', label: '중간 오른쪽' },
  { key: 'BL', label: '맨 아래 왼쪽' },
  { key: 'BC', label: '맨 아래 중심' },
  { key: 'BR', label: '맨 아래 오른쪽' },
  { key: 'S', label: '스타일 따름' },
];

export function registerTableEditCommands(app: App): void {
  // ------------------------------------------------------------- TABLE
  app.register({
    name: 'TABLE',
    aliases: ['TB'],
    title: '테이블',
    async run(ctx) {
      const st = app.active!;
      const doc = st.doc;
      const set = await tableInsertDialog(app);
      if (!set) return;
      const { entry, style } = styleFor(doc, set.style);
      let data = createTable({ cols: set.cols, colWidth: set.colWidth, dataRows: set.dataRows, rowLines: set.rowLines, first: set.first, second: set.second }, style);
      let insert: Pt;
      if (set.mode === 'point') {
        const segs = previewSegments(data, style);
        const r = await ctx.getPoint('삽입점 지정:', { ghost: (q) => [{ segs: ghostSegs(segs, q) }] });
        if (!('point' in r)) return;
        insert = r.point;
      } else {
        const a = await ctx.getPoint('첫 번째 구석 지정:');
        if (!('point' in a)) return;
        const p0 = a.point;
        const b = await ctx.getPoint('두 번째 구석 지정:', {
          base: p0,
          rubber: (q) => [{ pts: [p0.x, p0.y, q.x, p0.y, q.x, q.y, p0.x, q.y], closed: true, dashed: true }],
        });
        if (!('point' in b)) return;
        const p1 = b.point;
        const w = Math.abs(p1.x - p0.x);
        const hgt = Math.abs(p1.y - p0.y);
        if (!(w > 0 && hgt > 0)) {
          ctx.print('창의 크기가 0입니다.', 'err');
          return;
        }
        // 열 폭은 창 폭을 나누고, 행 높이는 창 높이에 맞춰 늘린다(한 줄 높이보다 낮아지지 않는다)
        const total = tableHeight(data);
        const k = Math.max(1, hgt / total);
        data = { ...data, colWidths: data.colWidths.map(() => w / data.cols), rowHeights: data.rowHeights.map((x) => x * k), baseRowHeights: data.baseRowHeights.map((x) => x * k) };
        const left = Math.min(p0.x, p1.x);
        insert = { x: left, y: style.flow === 1 ? Math.min(p0.y, p1.y) : Math.max(p0.y, p1.y) };
      }
      const r = addTableOps(doc, () => st.session.newHandle(), { space: st.space, data, style, styleHandle: entry?.handle, insert: { x: insert.x, y: insert.y, z: 0 }, props: currentProps(app) });
      st.session.commit({ label: 'TABLE', ops: r.ops, group: ctx.group });
      app.lastCreated = [r.table.handle];
      ctx.print(`${data.rows}행 ${data.cols}열 표를 만들었습니다(폭 ${+tableWidth(data).toFixed(4)}, 높이 ${+tableHeight(data).toFixed(4)}).`);
      // 첫 셀부터 그 자리에서 문자 입력(28차 — 도움말 "About Adding Text and Blocks to Tables": 표를 만들면 첫 셀이 강조되고 바로 입력한다).
      // Tab으로 다음 셀, Esc는 지금 셀만 버린다. 표 넣기와 입력은 명령 취소 한 단계(이 명령의 묶음)
      await editTableInPlace(app, r.table.handle, { r: 0, c: 0 }, ctx.group, { label: 'TABLE' });
    },
  });

  // ------------------------------------------------------------- TABLEDIT
  app.register({
    name: 'TABLEDIT',
    title: '테이블 셀 편집',
    async run(ctx) {
      const p = await pickCell(app, ctx, '테이블 셀 선택:');
      if (!p || 'keyword' in p) return;
      if (lockedLayer(app, p.entity)) return;
      // 27차: 고른 셀 자리의 제자리 편집기(도움말 TABLEDIT — 셀을 골라 그 자리에서 입력). 이 명령의 편집은 명령 취소 한 단계
      await editTableInPlace(app, p.entity.handle, p.cell!, ctx.group);
    },
  });

  // ------------------------------------------------------------- TABLECELL(테이블 셀 탭의 동작)
  app.register({
    name: 'TABLECELL',
    aliases: ['TCELL'],
    title: '테이블 셀(행·열·병합)',
    async run(ctx) {
      let first = true;
      for (;;) {
        const p = await pickCell(app, ctx, first ? '테이블 셀 선택:' : '테이블 셀 선택 또는 <끝>:');
        first = false;
        if (!p || 'keyword' in p) return;
        if (lockedLayer(app, p.entity)) continue;
        const cell = p.cell!;
        const kw: Keyword[] = [
          { key: 'RA', label: '위에 행 삽입' },
          { key: 'RB', label: '아래에 행 삽입' },
          { key: 'DR', label: '행 삭제' },
          { key: 'CL', label: '왼쪽에 열 삽입' },
          { key: 'CR', label: '오른쪽에 열 삽입' },
          { key: 'DC', label: '열 삭제' },
          { key: 'M', label: '셀 병합' },
          { key: 'U', label: '셀 병합 해제' },
          { key: 'A', label: '정렬' },
          { key: 'S', label: '셀 스타일' },
          { key: 'H', label: '행 높이' },
          { key: 'W', label: '열 폭' },
          { key: 'E', label: '문자 편집' },
        ];
        const r = await ctx.getPoint(`셀 ${cellName(cell.r, cell.c)} 옵션 입력 [${kw.map((k) => `${k.label}(${k.key})`).join('/')}] <문자 편집>:`, { keywords: kw });
        const key = 'keyword' in r ? r.keyword : 'enter' in r ? 'E' : null;
        if (!key) continue;
        const t = p.data;
        const m = mergeAt(t, cell.r, cell.c);
        const r1 = cell.r + (m?.rows ?? 1) - 1;
        const c1 = cell.c + (m?.cols ?? 1) - 1;
        let next: TableData | null = null;
        let label = 'TABLECELL';
        const g = { r0: cell.r, c0: cell.c, r1, c1 };
        switch (key) {
          case 'RA':
            next = cellOp(t, g, 'rowBefore');
            label = '위에 행 삽입';
            break;
          case 'RB':
            next = cellOp(t, g, 'rowAfter');
            label = '아래에 행 삽입';
            break;
          case 'DR':
            next = cellOp(t, g, 'deleteRows');
            if (!next) ctx.print('표의 모든 행을 삭제할 수는 없습니다.', 'err');
            label = '행 삭제';
            break;
          case 'CL':
            next = cellOp(t, g, 'colLeft');
            label = '왼쪽에 열 삽입';
            break;
          case 'CR':
            next = cellOp(t, g, 'colRight');
            label = '오른쪽에 열 삽입';
            break;
          case 'DC':
            next = cellOp(t, g, 'deleteCols');
            if (!next) ctx.print('표의 모든 열을 삭제할 수는 없습니다.', 'err');
            label = '열 삭제';
            break;
          case 'M': {
            const q = await pickCell(app, ctx, '병합할 범위의 반대쪽 셀 선택:');
            if (!q || 'keyword' in q) continue;
            if (q.entity.handle !== p.entity.handle) {
              ctx.print('같은 표의 셀을 고르십시오.', 'err');
              continue;
            }
            const how = await ctx.getPoint('셀 병합 [모두(A)/행별(R)/열별(C)] <모두>:', {
              keywords: [
                { key: 'A', label: '모두' },
                { key: 'R', label: '행별' },
                { key: 'C', label: '열별' },
              ],
            });
            const mode: MergeMode = 'keyword' in how && how.keyword === 'R' ? 'rows' : 'keyword' in how && how.keyword === 'C' ? 'cols' : 'all';
            next = cellOp(t, { r0: cell.r, c0: cell.c, r1: q.cell!.r, c1: q.cell!.c }, mode === 'rows' ? 'mergeRows' : mode === 'cols' ? 'mergeCols' : 'mergeAll');
            if (!next) ctx.print('셀을 두 개 이상 고르십시오.', 'err');
            label = '셀 병합';
            break;
          }
          case 'U':
            next = cellOp(t, g, 'unmerge');
            if (!next) ctx.print('병합된 셀이 아닙니다.', 'err');
            label = '셀 병합 해제';
            break;
          case 'A': {
            const a = await ctx.getPoint('정렬 입력 [' + ALIGN_KEYS.map((k) => `${k.label}(${k.key})`).join('/') + ']:', { keywords: ALIGN_KEYS });
            if (!('keyword' in a)) continue;
            const idx = ALIGN_KEYS.findIndex((k) => k.key === a.keyword);
            next = setAlign(t, cell.r, cell.c, r1, c1, a.keyword === 'S' ? 0 : idx + 1);
            label = '셀 정렬';
            break;
          }
          case 'S': {
            const a = await ctx.getPoint('행의 셀 스타일 입력 [제목(T)/머리글(H)/데이터(D)]:', {
              keywords: [
                { key: 'T', label: '제목' },
                { key: 'H', label: '머리글' },
                { key: 'D', label: '데이터' },
              ],
            });
            if (!('keyword' in a)) continue;
            next = setRowKind(t, cell.r, r1, a.keyword === 'T' ? 'title' : a.keyword === 'H' ? 'header' : 'data');
            label = '셀 스타일';
            break;
          }
          case 'H':
          case 'W': {
            const cur = key === 'H' ? t.baseRowHeights[r1]! : t.colWidths[c1]!;
            const a = await ctx.getPoint(`${key === 'H' ? '행 높이' : '열 폭'} 입력 <${+cur.toFixed(4)}>:`, { preferNumber: true });
            const v = 'text' in a ? Number(a.text) : 'enter' in a ? cur : NaN;
            if (!(v > 0)) {
              ctx.print('0보다 큰 값을 입력하십시오.', 'err');
              continue;
            }
            next = structuredClone(t);
            if (key === 'H') {
              next.baseRowHeights[r1] = v;
              next.rowHeights[r1] = v;
            } else next.colWidths[c1] = v;
            label = key === 'H' ? '행 높이' : '열 폭';
            break;
          }
          case 'E': {
            next = await editCellsDialog(`테이블 셀 편집 — ${cellName(cell.r, cell.c)}`, t, cell);
            label = 'TABLEDIT';
            break;
          }
        }
        if (!next) continue;
        commitTable(app, p, next, label);
        ctx.print(`${label}: 표 ${next.rows}행 ${next.cols}열`);
      }
    },
  });

  // ------------------------------------------------------------- TABLESTYLE
  app.register({
    name: 'TABLESTYLE',
    aliases: ['TS'],
    title: '테이블 스타일',
    async run(ctx) {
      await new Promise<void>((resolve) => {
        const st = app.active!;
        const list = h('select', { size: 9, 'aria-label': '스타일', style: 'width:100%;min-width:180px;background:var(--bg-input);color:var(--text);border:1px solid var(--border-soft);border-radius:4px' });
        const info = h('pre', { style: 'margin:0;white-space:pre-wrap;font:12px var(--font);color:var(--text-dim)' });
        const preview = h('div', { style: 'margin-top:8px' });
        const curLine = h('div', { style: 'margin-bottom:6px' });
        let entries: TableStyleEntry[] = [];
        const refresh = (keep?: string) => {
          entries = listTableStyles(st.doc);
          // Standard가 없는 도면(다른 프로그램이 만든 파일): 기본값으로 보이고, 수정하면 만든다
          if (!entries.some((e) => tableKey(e.name) === 'STANDARD')) entries.unshift({ name: 'Standard', handle: '', obj: { type: 'TABLESTYLE', handle: '' }, style: defaultTableStyle(isMetric(st.doc)) });
          const cur = currentTableStyle(st.doc);
          curLine.textContent = `현재 테이블 스타일: ${cur?.name ?? 'Standard'}`;
          list.innerHTML = '';
          for (const e of entries) list.append(h('option', { value: e.handle }, e.name + (tablesUsingStyle(st.doc, e.handle).length ? ' (사용 중)' : '')));
          list.value = keep && entries.some((e) => e.handle === keep) ? keep : (cur?.handle ?? entries[0]?.handle ?? '');
          show();
        };
        const selected = () => entries.find((e) => e.handle === list.value) ?? null;
        const show = () => {
          const s = selected();
          info.textContent = s ? styleSummary(s.style) : '';
          preview.innerHTML = '';
          if (s) preview.append(tableStylePreview(s.style));
        };
        list.addEventListener('change', show);
        const body = h('div', {}, curLine, h('div', { style: 'display:grid;grid-template-columns:200px 1fr;gap:12px' }, list, h('div', {}, info, preview)));
        const act = async (what: 'current' | 'new' | 'modify' | 'delete') => {
          const s = selected();
          const nh = () => st.session.newHandle();
          if (what === 'current') {
            if (!s) return;
            const before = st.doc.header.get('$CTABLESTYLE');
            st.session.commit({ label: 'TABLESTYLE', ops: [{ kind: 'header', name: '$CTABLESTYLE', before, after: s.name }] });
            refresh(s.handle);
            return;
          }
          if (what === 'new') {
            const v = await form(
              '새 테이블 스타일 작성',
              [
                { key: 'name', label: '새 스타일 이름', type: 'text', value: `${s?.name ?? 'Standard'}의 복사` },
                { key: 'from', label: '시작', type: 'select', value: s?.handle ?? '', options: entries.map((e) => ({ value: e.handle, label: e.name })) },
              ],
              {
                ok: '계속',
                validate: (x) => {
                  const n = String(x.name).trim();
                  if (!n || /[<>/\\":;?*|,=`]/.test(n)) return '이름이 올바르지 않습니다.';
                  if (entries.some((e) => tableKey(e.name) === tableKey(n))) return '같은 이름의 스타일이 있습니다.';
                  return null;
                },
              },
            );
            if (!v) return;
            const from = entries.find((e) => e.handle === v.from)?.style ?? defaultTableStyle(isMetric(st.doc));
            const start = { ...cloneTableStyle(from), name: String(v.name).trim(), description: '' };
            const edited = await tableStyleEditor(st.doc, `새 테이블 스타일: ${start.name}`, start);
            if (!edited) return;
            const r = saveTableStyleOps(st.doc, nh, edited);
            st.session.commit({ label: 'TABLESTYLE', ops: r.ops });
            refresh(r.handle);
            return;
          }
          if (!s) return;
          if (what === 'modify') {
            const edited = await tableStyleEditor(st.doc, `테이블 스타일 수정: ${s.name}`, s.style);
            if (!edited) return;
            const r = saveTableStyleOps(st.doc, nh, edited, s.handle || undefined);
            // 스타일을 쓰는 표를 새 값으로 다시 그린다(같은 명령 취소 한 단계). 새로 만든 Standard는 스타일 없는 표가 쓴다
            const re = restyleTablesOps(st.doc, nh, r.handle, edited, !s.handle);
            const ops: EditOp[] = [...r.ops, ...re];
            st.session.commit({ label: 'TABLESTYLE', ops });
            const n = re.filter((o) => o.kind === 'modify').length;
            if (n) ctx.print(`스타일을 쓰는 표 ${n}개를 다시 그렸습니다.`);
            refresh(r.handle);
            return;
          }
          if (what === 'delete') {
            const cur = currentTableStyle(st.doc);
            if (tableKey(s.name) === 'STANDARD') return void ctx.print('Standard 스타일은 삭제할 수 없습니다.', 'err');
            if (cur?.handle === s.handle) return void ctx.print('현재 스타일은 삭제할 수 없습니다.', 'err');
            if (tablesUsingStyle(st.doc, s.handle).length) return void ctx.print('사용 중인 스타일은 삭제할 수 없습니다.', 'err');
            st.session.commit({ label: 'TABLESTYLE', ops: deleteTableStyleOps(st.doc, s.handle) });
            refresh();
          }
        };
        const back = dialog('테이블 스타일', body, [
          { label: '현재로 설정', run: () => (void act('current'), true) },
          { label: '새로 만들기...', run: () => (void act('new'), true) },
          { label: '수정...', run: () => (void act('modify'), true) },
          { label: '삭제', run: () => (void act('delete'), true) },
          { label: '닫기', primary: true },
        ]);
        const box = back.querySelector('.dialog') as HTMLElement | null;
        if (box) box.style.width = 'min(640px, 100%)';
        refresh();
        new MutationObserver((_, obs) => {
          if (!back.isConnected) {
            obs.disconnect();
            resolve();
          }
        }).observe(document.body, { childList: true });
      });
    },
  });

  // ------------------------------------------------------------- CTABLESTYLE
  app.register({
    name: 'CTABLESTYLE',
    title: '현재 테이블 스타일',
    async run(ctx, arg) {
      const st = app.active!;
      const cur = currentTableStyle(st.doc);
      let name = arg?.trim();
      if (!name) {
        const r = await ctx.getPoint(`CTABLESTYLE에 대한 새 값 입력 <${cur?.name ?? 'Standard'}>:`, { allowText: true });
        if (!('text' in r)) return;
        name = r.text.trim();
      }
      const f = listTableStyles(st.doc).find((s) => tableKey(s.name) === tableKey(name));
      if (!f) {
        ctx.print(`테이블 스타일 "${name}"을(를) 찾을 수 없습니다.`, 'err');
        return;
      }
      st.session.commit({ label: 'CTABLESTYLE', ops: [{ kind: 'header', name: '$CTABLESTYLE', before: st.doc.header.get('$CTABLESTYLE'), after: f.name }] });
    },
  });
}

