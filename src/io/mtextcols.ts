/**
 * 쓰기 버전에 맞춘 여러 단 MTEXT(90차). DXF·DWG 쓰기가 블록마다 부른다.
 *
 * AutoCAD 2010+의 여러 단 문자는 객체 하나다. R2018 DXF·DWG는 한 MTEXT 안에 단 자료를 두고(model의 `columns`),
 * R2000~R2013은 단마다 MTEXT를 따로 두고 첫 단의 ACAD 확장 자료로 잇는다(edit/util/mtextcols.ts).
 * 근거: AutoCAD가 같은 도면을 R2018과 R2007로 쓴 DXF 짝(여러 단 문자 11개 — 정적·자동 높이 동적·수동 높이 동적, 단 나누기 \N),
 * AutoCAD가 쓴 R2013 DXF(긴 문단 하나의 3단, 단 나누기로 나눈 3단), DXF 참조서의 MTEXT 단 자료(R2018 101 Embedded Object).
 * - R2013 이하 → R2018: 첫 단과 다른 단의 글을 차례로 이어 붙인 것이 R2018 글이다(짝 11개 모두). 단 종류·단 수·폭·간격·자동 높이·
 *   흐름 거꾸로·높이 목록은 단 정보 그대로, 정한 높이는 46, 41(폭)은 첫 단의 41. 다른 단은 쓰지 않는다.
 * - R2018 → R2013 이하: 글은 문단 끝(\P)·단 나누기(\N) 바로 뒤에서만 나뉘고 그 기호는 앞 단 끝에 남는다. 단 사이로 넘어가는 문단은
 *   그 문단이 시작한 단에 다 둔다(AutoCAD R2013 실물: 긴 한 문단의 3단은 첫 단에 글이 다 있고 다른 두 단은 빈 글). 단 객체 수(47)는
 *   줄이 든 단 수(정적 3단에 두 단만 차면 둘), 다른 단의 삽입점은 첫 단에서 단 폭 + 간격씩, 41은 전체 폭, 46은 첫 단과 같다.
 *   정한 높이(46)가 0이 아니면 첫 단과 다른 단의 확장 자료에 정한 높이를 쓰고(수동 높이 단도), 높이 목록은 수동 높이 동적 단에만 쓴다.
 *   묶음 { } 안이나 묶음 밖 서식(\f·\H·\C …)·문단 서식(\p) 뒤에서는 나누지 않는다(뒤 단이 앞 서식을 잃지 않게 — AutoCAD가 어떻게 나누는지 근거가 없다).
 *   흐름 거꾸로·왼쪽 위가 아닌 부착점은 단 배치 근거가 없어 나누지 않는다(단 정보를 빼고 한 MTEXT로 쓰고 저장 경고).
 */
import type { Entity, MTextColumns, MTextEntity, TextStyle } from '../core/model';
import { normalizeHandle } from '../core/model';
import { TextEngine } from '../text/layout';
import { type ColumnXData, hasDefinedHeight, manualHeights, mergeColumnGroup, readColumnXData, withColumnXData } from '../edit/util/mtextcols';

export { mergeColumnGroup };

/** 단 객체로 나눌 근거가 없어 단 정보를 빼고 쓴 경고(저장 전 확인에 나온다) */
export const COLUMNS_DROPPED = 'R2018 이전 버전에는 흐름이 거꾸로이거나 부착점이 왼쪽 위가 아닌 여러 단 문자의 단 정보를 쓰지 않았습니다(문자는 그대로).';

let fallback: TextEngine | null = null;

/** 글꼴 없이 재는 엔진(단선 글꼴 — 워커는 도면 글꼴을 받은 엔진을 넘긴다) */
function engine(): TextEngine {
  fallback ??= new TextEngine(null);
  return fallback;
}

// ---------------------------------------------------------------------------
// R2013 이하 → R2018: 단 묶음을 한 객체로
// ---------------------------------------------------------------------------

/**
 * R2018+ 쓰기: 블록 안의 단 묶음 → 첫 단 자리에 합친 MTEXT, 다른 단 → null(쓰지 않는다). 단 정보만 있는 MTEXT(한 단)도 단 자료로.
 * 바꿀 것이 없으면 null
 */
export function columnsForR2018(entities: readonly Entity[]): Map<Entity, MTextEntity | null> | null {
  let out: Map<Entity, MTextEntity | null> | null = null;
  let byHandle: Map<string, Entity> | null = null;
  for (const e of entities) {
    if (e.type !== 'MTEXT' || !e.xdata || e.columns || out?.has(e)) continue;
    const c = readColumnXData(e);
    if (!c?.info || c.info.type <= 0) continue;
    const members: MTextEntity[] = [];
    if (c.links?.handles.length) {
      byHandle ??= new Map(entities.map((x) => [normalizeHandle(x.handle), x]));
      for (const h of c.links.handles) {
        const m = byHandle.get(h);
        if (m?.type === 'MTEXT' && m !== e && !m.columns && !out?.has(m) && !members.includes(m)) members.push(m);
      }
    }
    out ??= new Map();
    out.set(e, mergeColumnGroup(e, c, members));
    for (const m of members) out.set(m, null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// R2018 → R2013 이하: 한 객체를 단 객체로
// ---------------------------------------------------------------------------

/**
 * 문단 시작 자리(parseMText와 같은 문단 나누기 — \P·\N·\X·줄바꿈 글자). 첫 문단은 0.
 * cut: 그 자리에서 나눠도 뒤 단이 앞 서식을 잃지 않는다(묶음 { } 밖이고, 앞에 묶음 밖 글자 서식·문단 서식이 없다 — \A는 쌓기 정렬만이라 본다)
 */
export function paragraphStarts(s: string): { start: number; cut: boolean }[] {
  const out = [{ start: 0, cut: true }];
  let depth = 0;
  let styled = false;
  const brk = (at: number) => out.push({ start: at, cut: depth === 0 && !styled });
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth--;
      continue;
    }
    if (ch === '\n') {
      brk(i + 1);
      continue;
    }
    if (ch === '%' && s[i + 1] === '%') {
      const c = s[i + 2]?.toLowerCase();
      if (depth === 0 && (c === 'u' || c === 'o' || c === 'k')) styled = true;
      i += /^%%\d{3}/.test(s.slice(i, i + 5)) ? 4 : 2;
      continue;
    }
    if (ch !== '\\') {
      if (s.codePointAt(i)! > 0xffff) i++;
      continue;
    }
    const c = s[i + 1];
    if (c === undefined) break;
    i++;
    switch (c) {
      case 'P':
      case 'N':
      case 'X':
        brk(i + 1);
        break;
      case 'f':
      case 'F':
      case 'H':
      case 'W':
      case 'Q':
      case 'T':
      case 'A':
      case 'C':
      case 'c':
      case 'p':
      case 'S': {
        if (c === 'p' || (depth === 0 && c !== 'S' && c !== 'A')) styled = true;
        const j = s.indexOf(';', i + 1);
        i = j < 0 ? s.length : j;
        break;
      }
      case 'L':
      case 'l':
      case 'O':
      case 'o':
      case 'K':
      case 'k':
        if (depth === 0) styled = true;
        break;
      case 'U':
        if (s[i + 1] === '+' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) i += 5;
        break;
      case 'M':
        if (s[i + 1] === '+') i += 6;
        break;
    }
  }
  return out;
}

/** 단마다의 글(이어 붙이면 원래 글). 줄이 든 단 수만큼. 문단 수가 글 배치와 다르면 null */
export function splitColumnText(e: MTextEntity, style: TextStyle | undefined, text: TextEngine = engine()): string[] | null {
  const cols = e.columns;
  if (!cols || cols.count < 2) return [e.text];
  const lay = text.layoutMText({
    text: e.text,
    height: e.height,
    width: e.width,
    attachment: e.attachment,
    lineSpacingStyle: e.lineSpacingStyle,
    lineSpacingFactor: e.lineSpacingFactor,
    style,
    columns: cols,
    rectHeight: e.rectHeight,
  });
  const pc = lay.paraColumns;
  const starts = paragraphStarts(e.text);
  if (!pc || pc.length !== starts.length) return null;
  const pieces = new Array<string>(Math.max(1, lay.columnsUsed ?? 1)).fill('');
  let cur = 0;
  let from = 0;
  for (let i = 1; i < starts.length; i++) {
    const want = pc[i]!;
    if (want > cur && starts[i]!.cut && want < pieces.length) {
      pieces[cur] = e.text.slice(from, starts[i]!.start);
      from = starts[i]!.start;
      cur = want;
    }
  }
  pieces[cur] = e.text.slice(from);
  return pieces;
}

export interface ColumnSplit {
  /** 첫 단(단 목록은 linkColumnHead가 채운다) */
  head: MTextEntity;
  /** 다른 단(핸들 없음 — 쓰는 쪽이 정한다) */
  members: MTextEntity[];
  /** 첫 단에 쓸 여러 단 자료(단 목록 핸들 없이) */
  xdata: ColumnXData;
}

/** MTEXT의 X축(WCS, 단위 벡터). 방향이 없으면 회전각(OCS 법선이 +Z일 때만) */
function textAxis(e: MTextEntity): { x: number; y: number; z: number } | null {
  const d = e.direction;
  if (d && Math.hypot(d.x, d.y, d.z ?? 0) > 0) {
    const l = Math.hypot(d.x, d.y, d.z ?? 0);
    return { x: d.x / l, y: d.y / l, z: (d.z ?? 0) / l };
  }
  const n = e.extrusion;
  if (n && (Math.abs(n.x) > 1e-12 || Math.abs(n.y) > 1e-12 || n.z <= 0)) return null;
  return { x: Math.cos(e.rotation), y: Math.sin(e.rotation), z: 0 };
}

/**
 * R2018 전 쓰기: 단 자료가 있는 MTEXT → 단 정보를 확장 자료로 옮긴 첫 단과 다른 단(단이 둘 이상이고 줄이 둘 이상의 단에 들 때).
 * 근거가 없는 꼴(흐름 거꾸로, 왼쪽 위가 아닌 부착점, 방향을 알 수 없는 문자 평면)이나 글을 나눌 수 없으면 null
 */
export function splitColumnsForLegacy(e: MTextEntity, style: TextStyle | undefined, text?: TextEngine): ColumnSplit | null {
  const cols = e.columns;
  if (!cols || cols.type <= 0) return null;
  if (cols.flowReversed || (e.attachment || 1) !== 1) return null;
  const info: MTextColumns = { ...cols, count: cols.count > 0 ? cols.count : 1, heights: manualHeights(cols) ? [...cols.heights] : [] };
  const defined = hasDefinedHeight(e.rectHeight) ? e.rectHeight : undefined;
  const cx: ColumnXData = { info, ...(defined !== undefined ? { definedHeight: defined } : {}) };
  const base: MTextEntity = { ...e };
  delete base.columns;
  delete base.dwgRaw;
  const pieces = info.count > 1 ? splitColumnText(e, style, text) : [e.text];
  if (!pieces) return null;
  const axis = pieces.length > 1 ? textAxis(e) : null;
  if (pieces.length > 1 && !axis) return null;
  const head: MTextEntity = { ...base, text: pieces[0]! };
  const xd = withColumnXData(e.xdata, cx);
  if (xd) head.xdata = xd;
  if (pieces.length < 2) return { head, members: [], xdata: cx };
  const step = info.width + info.gutter;
  const total = info.count * info.width + (info.count - 1) * info.gutter;
  // 다른 단: 정한 높이만(수동 높이면 확장 자료 없음), 첫 단의 다른 앱 확장 자료(주석 등)는 그대로
  const others = (e.xdata ?? []).filter((d) => d.app.toUpperCase() !== 'ACAD');
  const memberX = withColumnXData(others, defined !== undefined ? { definedHeight: defined } : null);
  const members = pieces.slice(1).map((t, i) => {
    const m: MTextEntity = { ...base, handle: '', text: t, width: total, insert: { x: e.insert.x + axis!.x * step * (i + 1), y: e.insert.y + axis!.y * step * (i + 1), z: (e.insert.z ?? 0) + axis!.z * step * (i + 1) } };
    delete m.xdict;
    delete m.reactors;
    if (memberX) m.xdata = structuredClone(memberX);
    else delete m.xdata;
    return m;
  });
  return { head, members, xdata: cx };
}

/** 나눈 첫 단에 다른 단 핸들(쓰는 쪽이 정한 것)을 이은 첫 단 */
export function linkColumnHead(s: ColumnSplit, handles: readonly string[]): MTextEntity {
  const xd = withColumnXData(s.head.xdata, { ...s.xdata, links: { count: handles.length + 1, handles: [...handles] } });
  return { ...s.head, ...(xd ? { xdata: xd } : {}) };
}
