/**
 * 표 내보내기(TABLEEXPORT)와 셀 특성 일치(MATCHCELL)의 순수 계산(화면·DOM 없음).
 * - CSV: 쉼표로 나누고, 쉼표·큰따옴표·줄바꿈·앞뒤 공백이 있는 칸은 큰따옴표로 감싸며 안의 큰따옴표는 두 번 쓴다(RFC 4180).
 *   셀 문자는 여러 줄 문자 서식을 걷어 내고 문단(\P)은 칸 안의 줄바꿈으로 둔다. 병합된 셀은 기준 셀에만 문자가 있다.
 * - MATCHCELL: 원본 셀의 정렬과 배경 채우기(31차)·문자 높이·문자 색(32차)·문자 스타일(33차 — 셀 재지정이 없으면 그 행 셀 스타일의 값)을 대상 셀에 옮긴다.
 *   대상 행 스타일의 값과 같으면 재지정을 지운다(이 표 모델의 셀 특성은 정렬·배경 채우기·문자 높이·문자 색·문자 스타일 재지정이다 — 도움말 "To Change the Properties of Table Cells":
 *   셀 일치는 셀 종류(문자·블록)를 빼고 모든 특성을 옮긴다).
 */
import type { CadColor } from '../../core/model';
import { tableKey } from '../../core/model';
import { mtextPlainLines } from '../../io/dxf/wconvert';
import {
  type TableData,
  anchorOf,
  cellFill,
  cellIndex,
  cellTextColor,
  cellTextHeight,
  cellTextStyle,
  getText,
  sameFill,
  setAlign,
  setFill,
  setTextColor,
  setTextHeight,
  setTextStyle,
} from '../table/model';
import type { TableStyle } from '../table/style';

/** CSV 칸 하나 */
export function csvField(s: string): string {
  if (s === '') return '';
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 셀 문자 → 평문(여러 줄 문자 서식 제거, 문단은 줄바꿈) */
export function cellPlainText(raw: string): string {
  if (!raw) return '';
  return mtextPlainLines(raw).join('\n');
}

/** 표 → CSV 글(줄 끝 CRLF, 마지막 줄 뒤에도 CRLF) */
export function tableToCsv(t: TableData, plain: (raw: string) => string = cellPlainText): string {
  const lines: string[] = [];
  for (let r = 0; r < t.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < t.cols; c++) {
      const a = anchorOf(t, r, c);
      row.push(a.r === r && a.c === c ? csvField(plain(getText(t, r, c))) : '');
    }
    lines.push(row.join(','));
  }
  return lines.map((l) => `${l}\r\n`).join('');
}

/** CSV 파일 내용(엑셀이 한글을 바로 읽게 UTF-8 BOM을 붙인다) */
export function csvFileText(t: TableData): string {
  return `﻿${tableToCsv(t)}`;
}

/** 셀의 실제 정렬(재지정 또는 행 셀 스타일) */
export function effectiveAlign(t: TableData, style: TableStyle, r: number, c: number): number {
  const a = anchorOf(t, r, c);
  const own = t.cells[cellIndex(t, a.r, a.c)]?.align;
  if (own && own >= 1 && own <= 9) return own;
  return style.cells[t.rowKinds[a.r] ?? 'data'].align;
}

/**
 * 원본 셀의 특성(정렬)을 대상 셀에 옮긴 표. 바뀐 것이 없으면 null.
 * 원본·대상은 같은 표 스타일의 같은 표이거나, 원본 표의 정렬 값을 받아 대상 표에 적용한다(srcAlign).
 */
export function matchCellAlign(t: TableData, style: TableStyle, dst: { r: number; c: number }, srcAlign: number): TableData | null {
  const a = anchorOf(t, dst.r, dst.c);
  const idx = cellIndex(t, a.r, a.c);
  const cur = t.cells[idx]?.align;
  const rowDefault = style.cells[t.rowKinds[a.r] ?? 'data'].align;
  const want = srcAlign === rowDefault ? undefined : srcAlign;
  if (cur === want || (!cur && want === undefined)) return null;
  return setAlign(t, a.r, a.c, a.r, a.c, want ?? 0);
}

/** 셀(병합 셀은 기준 셀)의 실제 배경 채우기(재지정 또는 행 셀 스타일, 채우지 않으면 null) */
export function effectiveFill(t: TableData, style: TableStyle, r: number, c: number): CadColor | null {
  const a = anchorOf(t, r, c);
  return cellFill(t, style, a.r, a.c);
}

/** 원본 셀의 배경 채우기(31차)를 대상 셀에 옮긴 표: 대상 행 셀 스타일과 같으면 재지정을 지운다. 바뀐 것이 없으면 null */
export function matchCellFill(t: TableData, style: TableStyle, dst: { r: number; c: number }, srcFill: CadColor | null): TableData | null {
  const a = anchorOf(t, dst.r, dst.c);
  const cur = t.cells[cellIndex(t, a.r, a.c)]?.fill;
  const rowDefault = style.cells[t.rowKinds[a.r] ?? 'data'].fill;
  const want = sameFill(srcFill, rowDefault) ? undefined : srcFill;
  if (want === undefined ? cur === undefined : cur !== undefined && sameFill(cur, want)) return null;
  return setFill(t, a.r, a.c, a.r, a.c, want);
}

/** 셀(병합 셀은 기준 셀)의 실제 문자 높이·문자 색(32차)·문자 스타일(33차 — 재지정 또는 행 셀 스타일) */
export function effectiveText(t: TableData, style: TableStyle, r: number, c: number): { height: number; color: CadColor; textStyle: string } {
  const a = anchorOf(t, r, c);
  return { height: cellTextHeight(t, style, a.r, a.c), color: { ...cellTextColor(t, style, a.r, a.c) }, textStyle: cellTextStyle(t, style, a.r, a.c) };
}

/**
 * 원본 셀의 문자 높이·문자 색(32차)·문자 스타일(33차)을 대상 셀에 옮긴 표: 대상 행 셀 스타일과 같은 값은 재지정을 지운다. 바뀐 것이 없으면 null
 */
export function matchCellText(t: TableData, style: TableStyle, dst: { r: number; c: number }, src: { height: number; color: CadColor; textStyle?: string }): TableData | null {
  const a = anchorOf(t, dst.r, dst.c);
  const cell = t.cells[cellIndex(t, a.r, a.c)];
  if (!cell) return null;
  const cs = style.cells[t.rowKinds[a.r] ?? 'data'];
  const wantH = src.height === cs.height ? undefined : src.height;
  const wantC = sameFill(src.color, cs.color) ? undefined : src.color;
  let out: TableData | null = null;
  if (cell.height !== wantH) out = setTextHeight(t, a.r, a.c, a.r, a.c, wantH);
  const curC = cell.color;
  if (wantC === undefined ? curC !== undefined : !curC || !sameFill(curC, wantC)) out = setTextColor(out ?? t, a.r, a.c, a.r, a.c, wantC);
  if (src.textStyle) {
    const wantS = tableKey(src.textStyle) === tableKey(cs.textStyle || 'Standard') ? undefined : src.textStyle;
    const curS = cell.textStyle;
    if (wantS === undefined ? curS !== undefined : !curS || tableKey(curS) !== tableKey(wantS)) out = setTextStyle(out ?? t, a.r, a.c, a.r, a.c, wantS);
  }
  return out;
}
