/**
 * 28차 표 셀 시험의 공용 준비(진짜 App + 3열 표). 시험 파일이 화면·명령행·엔진·글꼴을 vi.mock으로 가짜로 바꾼 뒤 쓴다(jsdom).
 * 표: 제목·머리글·자료 3행, B4:C5 병합, C3 오른쪽 아래 정렬, 삽입점 (10, 100). 고르기는 격자선 가까이면 표, 표 위에 그린 선은 선.
 */
import type { LineEntity, TableEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerTableEditCommands } from '../../src/app/tablecmds';
import { registerTableCellSelection } from '../../src/app/tablecell';
import { registerTextCommands } from '../../src/app/textedit/commands';
import { cellRect, colOffset, createTable, mergeCells, rowOffset, setAlign, setText } from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { tableFromEntity } from '../../src/edit/table/entity';
import { makeApp } from '../polish/real-app';

export type Pt = { x: number; y: number };
export const X0 = 10;
export const Y0 = 100;

export function setup() {
  const h = makeApp();
  registerTableEditCommands(h.app);
  registerTextCommands(h.app);
  const cells = registerTableCellSelection(h.app);
  // 시험의 가짜 글꼴로는 배치하지 못한다: 줄 수만 대략(행 높이 맞춤)
  h.app.text.layoutMText = ((p: { height: number; text: string }) => {
    const lines = p.text.split('\\P').length;
    return { glyphs: [], lines: [], minX: 0, minY: -p.height - (lines - 1) * p.height * (5 / 3), maxX: p.text.length * p.height, maxY: 0 };
  }) as never;
  const nh = () => h.st.session.newHandle();
  const ts = defaultTableStyle(true, '공정표');
  ts.hMargin = 1;
  const saved = saveTableStyleOps(h.doc, nh, ts);
  h.st.session.commit({ label: 'TABLESTYLE', ops: saved.ops });
  let t = createTable({ cols: 3, colWidth: 40, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, ts);
  t = setText(t, 0, 0, '공정 일정');
  t = setText(t, 2, 0, '가');
  t = mergeCells(t, 3, 1, 4, 2)!;
  t = setAlign(t, 2, 2, 2, 2, 9);
  const added = addTableOps(h.doc, nh, { space: MODEL_SPACE, data: t, style: ts, styleHandle: saved.handle, insert: { x: X0, y: Y0, z: 0 }, props: { ...entityDefaults() } });
  h.st.session.commit({ label: 'TABLE', ops: added.ops });
  const handle = added.table.handle;
  const table = () => h.doc.entityIndex.get(handle) as TableEntity;
  const data = () => tableFromEntity(table(), h.doc)!.data;
  const lines: LineEntity[] = [];
  const near = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
  };
  const picker = {
    pick(x: number, y: number, tol: number): string | null {
      for (const l of lines) if (h.doc.entityIndex.has(l.handle) && near({ x, y }, l.start, l.end) <= tol) return l.handle;
      if (!h.doc.entityIndex.has(handle)) return null;
      const d = data();
      const w = colOffset(d, d.cols);
      const ht = rowOffset(d, d.rows);
      if (x < X0 - tol || x > X0 + w + tol || y > Y0 + tol || y < Y0 - ht - tol) return null;
      for (let c = 0; c <= d.cols; c++) if (Math.abs(x - X0 - colOffset(d, c)) <= tol) return handle;
      for (let r = 0; r <= d.rows; r++) if (Math.abs(y - Y0 + rowOffset(d, r)) <= tol) return handle;
      return null;
    },
    pickAll(x: number, y: number, tol: number): string[] {
      const p = this.pick(x, y, tol);
      return p ? [p] : [];
    },
    geometry: () => ({ segs: [] }),
  };
  (h.app as unknown as { picker: () => unknown }).picker = () => picker;
  const ev = (o: Partial<PointerEvent> = {}) => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...o }) as PointerEvent;
  const click = (p: Pt, o: Partial<PointerEvent> = {}) => h.view.events.click!(p, p, ev(o));
  /** 도면(명령행 밖)에서 누른 키 */
  const press = (key: string, o: KeyboardEventInit = {}) => (h.app as unknown as { onKey(e: KeyboardEvent): void }).onKey(new KeyboardEvent('keydown', { key, cancelable: true, ...o }));
  const line = (a: Pt, b: Pt) => {
    const e: LineEntity = { ...entityDefaults(), type: 'LINE', handle: nh(), start: { ...a, z: 0 }, end: { ...b, z: 0 } };
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'LINE', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    lines.push(e);
    return e.handle;
  };
  /** 셀 (r, c) 가운데 */
  const center = (r: number, c: number): Pt => {
    const q = cellRect(data(), r, c, ts.flow);
    return { x: X0 + (q.x0 + q.x1) / 2, y: Y0 + (q.y0 + q.y1) / 2 };
  };
  const cur = () => {
    const s = cells.current();
    return s ? [s.r0, s.c0, s.r1, s.c1] : null;
  };
  return { ...h, handle, table, data, ts, cells, click, press, line, center, cur };
}

export const box = () => document.querySelector('.te-box') as HTMLElement | null;

/** 열린 편집기의 글을 바꾸고 입력 이벤트 */
export function typeInto(t: string): void {
  const b = box()!;
  const span = b.querySelector('.te-r');
  if (span) span.firstChild!.nodeValue = t;
  else b.firstElementChild!.replaceChildren(document.createTextNode(t));
  b.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

export function key(k: string, opt: KeyboardEventInit = {}): void {
  box()!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opt }));
}
