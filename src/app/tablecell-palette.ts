/**
 * 고른 표 셀의 특성(31차 — 특성 팔레트의 특성 탭). 명령 없이 셀을 고르면(표 셀 고르기, tablecell.ts) 객체 대신 고른 셀의 셀 특성을 보이고 바꾼다.
 *
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - "To Change the Properties of Cells in a Table": 셀 안을 눌러 고르고(Shift를 누른 채 다른 셀을 누르면 그 사이 셀 모두) 특성 팔레트에서
 *   바꿀 값을 눌러 새 값을 넣는다.
 * - "About Table Styles"(Mac): 셀을 고르면 특성 창에 셀(Cell)·내용(Contents) 묶음이 보이고 테두리·문자 서식·셀 크기를 바꾼다.
 *   "Cell Border Properties Dialog Box": 표 셀을 고르고 특성의 셀 묶음 → 테두리 색·선가중치·선종류.
 * - "Table Cell Ribbon Contextual Tab": 셀의 정렬(위·가운데·아래 × 왼쪽·가운데·오른쪽), 배경색(없음·색·색 선택).
 * 정한 것: 앱이 이미 바꿀 수 있는 셀 특성만 — 행 높이·열 폭(TABLECELL 행 높이·열 폭, 셀 그립과 같은 값 — 표 좌표), 정렬(셀 메뉴의 정렬과 같은 setAlign),
 * 배경 채우기(셀 메뉴의 배경 채우기와 같은 setFill). 여러 셀이면 고른 범위의 모든 행·열·셀에 적용하고, 값이 셀마다 다르면 "*여러 개*".
 * 바꿀 때마다 확정 한 번(명령 취소 한 단계), 끝나도 같은 셀을 고른 채. 셀 스타일·테두리는 셀마다 재지정할 자료가 아직 없어 넣지 않았다
 *
 * 32차 내용 묶음(문자 높이·문자 색상). 근거(우리말 요약):
 * - "About Table Styles"(Mac): 셀 스타일의 문자 특성은 문자 스타일·높이·색이고, 셀마다 스타일을 재지정할 수 있으며, 셀을 고르면 특성 창의 셀·내용 묶음에서
 *   문자 서식을 바꾼다. "To Change the Properties of Cells in a Table": 고른 셀의 값을 특성 팔레트에서 바꾼다.
 * - ActiveX 참조 Table 객체: 셀마다 SetCellTextHeight·SetCellContentColor(셀 문자 높이·내용 색)가 있다.
 * - DXF 참조 TABLE: 140 셀 수준 문자 높이 재지정, 64 셀 내용 색 재지정.
 * 정한 것: 셀 묶음 아래 "내용" 묶음에 문자 높이(표 좌표 — 행 높이와 같은 단위)와 문자 색상(ByBlock·ByLayer·일곱 색·지금 색·색 선택...).
 * 바꾸면 고른 범위의 셀마다 재지정하고 행 높이는 문자에 맞춘다(문자가 더 필요하면 늘어나고 준 높이 밑으로는 줄지 않는다). 이미 모두 그 값이면 바꾸지 않는다
 */
import type { CadColor } from '../core/model';
import { formatLength, parseLength } from '../core/units';
import { tableFromEntity } from '../edit/table/entity';
import { cellName, mergeAt, sameFill, setAlign, setFill, setTextColor, setTextHeight } from '../edit/table/model';
import { ALIGN_LABEL } from '../edit/table/style';
import type { App } from './app';
import { colorText } from './inquiry';
import {
  FILL_COLORS,
  rangeAlign,
  rangeColWidth,
  rangeFill,
  rangeRowHeight,
  rangeTextColor,
  rangeTextHeight,
  setRangeColWidth,
  setRangeRowHeight,
  tableCellSelection,
} from './tablecell';
import { pickColor } from './ui/colorpick';
import { h } from './ui/dom';

const VARIES = '*여러 개*';

/** 고른 표 셀이 있으면 특성 탭에 넣을 묶음(제목과 셀 묶음), 없으면 null */
export function cellSelectionGroup(app: App): HTMLElement[] | null {
  const st = app.active;
  const sel = tableCellSelection(app);
  const cur = sel?.current();
  if (!st || !sel || !cur || st.selection.size) return null;
  const e = st.doc.entityIndex.get(cur.handle);
  if (!e || (e.type !== 'ACAD_TABLE' && e.type !== 'INSERT')) return null;
  const rt = tableFromEntity(e, st.doc);
  if (!rt) return null;
  const t = rt.data;
  const style = rt.style;
  const g = { r0: cur.r0, c0: cur.c0, r1: cur.r1, c1: cur.c1 };
  const m = mergeAt(t, g.r0, g.c0) ?? { row: g.r0, col: g.c0, rows: 1, cols: 1 };
  const one = m.row === g.r0 && m.col === g.c0 && m.row + m.rows - 1 === g.r1 && m.col + m.cols - 1 === g.c1;
  const name = one ? cellName(g.r0, g.c0) : `${cellName(g.r0, g.c0)}:${cellName(g.r1, g.c1)}`;
  const row = (label: string, ctl: HTMLElement) => h('label', { class: 'prop-row edit' }, h('span', { class: 'k' }, label), ctl);

  /** 길이 칸(행 높이·열 폭): 값이 다르면 비우고 "*여러 개*" */
  const lengthRow = (label: string, value: number | null, apply: (v: number) => void) => {
    const el = h('input', { 'data-field': `pf-cell-${label}`, 'aria-label': label, placeholder: value === null ? VARIES : '' }) as HTMLInputElement;
    el.value = value === null ? '' : formatLength(value, st.units);
    const orig = el.value;
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') el.blur();
      if (ev.key === 'Escape') {
        el.value = orig;
        el.blur();
      }
    });
    el.addEventListener('change', () => {
      if (el.value === orig || (value === null && !el.value.trim())) return;
      const v = parseLength(el.value);
      if (v === null || !Number.isFinite(v) || !(v > 0)) {
        // TABLECELL 행 높이·열 폭과 같은 알림(칸은 원래 값으로 돌아간다)
        app.cmd.print('0보다 큰 값을 입력하십시오.', 'err');
        el.value = orig;
        return;
      }
      apply(v);
    });
    return row(label, el);
  };

  const rows: HTMLElement[] = [];
  rows.push(lengthRow('행 높이', rangeRowHeight(t, g), (v) => void sel.edit('행 높이', (d, r) => setRangeRowHeight(d, r, v))));
  rows.push(lengthRow('열 폭', rangeColWidth(t, g), (v) => void sel.edit('열 폭', (d, r) => setRangeColWidth(d, r, v))));

  // 정렬
  const a = rangeAlign(t, style, g);
  const align = h(
    'select',
    { 'data-field': 'pf-cell-정렬', 'aria-label': '정렬' },
    ...(a ? [] : [h('option', { value: '' }, VARIES)]),
    ...Object.entries(ALIGN_LABEL).map(([v, l]) => h('option', { value: v }, l)),
  ) as HTMLSelectElement;
  align.value = a ? String(a) : '';
  align.addEventListener('change', () => {
    const n = Number(align.value);
    if (!(n >= 1 && n <= 9)) return;
    sel.edit('셀 정렬', (d, r, s) => (rangeAlign(d, s, r) === n ? null : setAlign(d, r.r0, r.c0, r.r1, r.c1, n)));
  });
  rows.push(row('정렬', align));

  // 배경 채우기: 없음, 기본 색 일곱, (지금 색이 그 밖이면 그 색), 색 선택…
  const f = rangeFill(t, style, g);
  const fillSel = h('select', { 'data-field': 'pf-cell-배경 채우기', 'aria-label': '배경 채우기' }) as HTMLSelectElement;
  const opts: { value: string; label: string; color?: CadColor | null }[] = [{ value: 'none', label: '없음', color: null }, ...FILL_COLORS.map((x) => ({ value: `aci:${x.aci}`, label: x.label, color: { aci: x.aci } }))];
  let now = '';
  if (f !== 'mixed') {
    const hit = opts.find((o) => sameFill(o.color, f));
    if (hit) now = hit.value;
    else if (f) {
      opts.push({ value: 'cur', label: colorText(f), color: f });
      now = 'cur';
    }
  }
  if (!now) fillSel.append(h('option', { value: '' }, VARIES));
  for (const o of opts) fillSel.append(h('option', { value: o.value }, o.label));
  fillSel.append(h('option', { value: 'pick' }, '색 선택...'));
  fillSel.value = now;
  const applyFill = (c: CadColor | null) => sel.edit('셀 배경 채우기', (d, r, s) => {
    const was = rangeFill(d, s, r);
    return was !== 'mixed' && sameFill(was, c) ? null : setFill(d, r.r0, r.c0, r.r1, r.c1, c);
  });
  fillSel.addEventListener('change', async () => {
    const v = fillSel.value;
    if (v === 'pick') {
      fillSel.value = now;
      const c = await pickColor(f !== 'mixed' && f ? f : { aci: 7 }, { allowBy: false });
      if (c) applyFill(c);
      return;
    }
    const o = opts.find((x) => x.value === v);
    if (o && o.color !== undefined) applyFill(o.color);
  });
  rows.push(row('배경 채우기', fillSel));

  // 32차 내용 묶음: 문자 높이·문자 색상(셀 재지정 140·64 — 바꾸면 고른 범위의 셀마다 재지정, 행 높이는 문자에 맞춘다)
  const content: HTMLElement[] = [];
  content.push(
    lengthRow('문자 높이', rangeTextHeight(t, style, g), (v) =>
      void sel.edit('셀 문자 높이', (d, r, s) => (rangeTextHeight(d, s, r) === v ? null : setTextHeight(d, r.r0, r.c0, r.r1, r.c1, v))),
    ),
  );
  const tc = rangeTextColor(t, style, g);
  const colorSel = h('select', { 'data-field': 'pf-cell-문자 색상', 'aria-label': '문자 색상' }) as HTMLSelectElement;
  const copts: { value: string; label: string; color: CadColor }[] = [
    { value: 'aci:0', label: 'ByBlock', color: { aci: 0 } },
    { value: 'aci:256', label: 'ByLayer', color: { aci: 256 } },
    ...FILL_COLORS.map((x) => ({ value: `aci:${x.aci}`, label: x.label, color: { aci: x.aci } })),
  ];
  let cnow = '';
  if (tc !== 'mixed') {
    const hit = copts.find((o) => sameFill(o.color, tc));
    if (hit) cnow = hit.value;
    else {
      copts.push({ value: 'cur', label: colorText(tc), color: tc });
      cnow = 'cur';
    }
  }
  if (!cnow) colorSel.append(h('option', { value: '' }, VARIES));
  for (const o of copts) colorSel.append(h('option', { value: o.value }, o.label));
  colorSel.append(h('option', { value: 'pick' }, '색 선택...'));
  colorSel.value = cnow;
  const applyColor = (c: CadColor) => sel.edit('셀 문자 색상', (d, r, s) => {
    const was = rangeTextColor(d, s, r);
    return was !== 'mixed' && sameFill(was, c) ? null : setTextColor(d, r.r0, r.c0, r.r1, r.c1, c);
  });
  colorSel.addEventListener('change', async () => {
    const v = colorSel.value;
    if (v === 'pick') {
      colorSel.value = cnow;
      const c = await pickColor(tc !== 'mixed' ? tc : { aci: 7 }, { allowBy: true });
      if (c) applyColor(c);
      return;
    }
    const o = copts.find((x) => x.value === v);
    if (o) applyColor(o.color);
  });
  content.push(row('문자 색상', colorSel));

  return [
    h('div', { class: 'prop-title' }, '표 셀'),
    h('div', { class: 'prop-group' }, h('h4', {}, `셀 ${name}`), ...rows),
    h('div', { class: 'prop-group' }, h('h4', {}, '내용'), ...content),
  ];
}
