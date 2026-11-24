/**
 * TXT2MTXT(문자를 여러 줄 문자로): 고른 한 줄 문자(TEXT)와 여러 줄 문자(MTEXT)를 여러 줄 문자로 바꾼다.
 *
 * - 결합(기본): 줄 순서는 위치(첫 문자의 방향으로 위 → 아래, 같은 줄이면 왼쪽 → 오른쪽) 또는 선택 순서.
 *   첫 줄의 문자 스타일·높이·회전·도면층·색을 쓰고, 첫 줄 글자 틀의 왼쪽 위(모두 가운데·오른쪽 맞춤이면 가운데 위·오른쪽 위)를
 *   삽입점으로 한다. 줄 간격은 줄 기준선 사이의 평균 거리(정확하게, 1.667 × 높이 × 계수).
 *   높이·폭 비율·기울기가 첫 줄과 다른 줄은 \H·\W·\Q 서식으로 그 값을 지닌다.
 * - 자동 줄바꿈: 켜면 줄을 빈칸으로 이어 한 문단으로 만들고 가장 긴 줄의 폭을 여러 줄 문자 폭으로 한다.
 *   끄면 줄마다 문단(\P)이고 폭 0(줄바꿈 없음).
 * - 결합하지 않으면 한 줄 문자마다 여러 줄 문자 하나(같은 자리, 같은 특성).
 * TEXT의 %%d·%%p·%%c는 글자로, %%u·%%o는 \L·\O 서식으로 바꾼다.
 *
 * 줄은 WCS 평면도에서 잰다(169차): TEXT의 글자 틀은 OCS, MTEXT 삽입점은 WCS라서, 돌출 방향이 ±Z인 TEXT는 평면 사상으로 옮기고
 * −Z 평면(TEXT·MTEXT)의 위 방향은 글줄 방향의 거울상(돌출 방향 × 글줄 방향)으로 둔다. 결과는 첫 줄의 돌출 방향·OCS 회전 각도를 잇는다.
 * 전에는 −Z TEXT의 글자 틀 원점(OCS)을 그대로 삽입점(WCS)에 넣어 결과가 X 거울상 자리로 갔고, 첫 줄이 −Z MTEXT면 위 방향을 +Z로 보아
 * 돌출 방향을 버린 +Z MTEXT(180° 돈 글자)를 만들었다(Autodesk TXT2MTXT 도움말 — 고른 문자를 여러 줄 문자로 바꾼다). +Z 문자는 전과 같은 값이다.
 * 기운(돌출 방향이 Z축과 평행하지 않은) TEXT는 전처럼 OCS 좌표 그대로 쓴다.
 */
import type { CadDocument, Entity, MTextEntity, TextEntity, Vec3 } from '../../core/model';
import { maxOf, minOf } from '../../core/arrays';
import { tableKey } from '../../core/model';
import { TOGGLE_OVERLINE, TOGGLE_STRIKE, TOGGLE_UNDERLINE, parseTextString } from '../../text/mtext';
import { type Affine, affApply, affLin, dot3 } from '../geom/math';
import { frameOf, isNaturalExt, isPlanarExt, planProj, planZ } from '../geom/ocs';
import { textFrame } from '../geom/textjust';
import { mtextDir, mtextLocalBox } from '../geom/xtext';

export interface Txt2MtxtOptions {
  /** 하나의 여러 줄 문자로 결합 */
  combine: boolean;
  /** 줄 순서: 위치(위 → 아래) 또는 선택 순서 */
  order: 'position' | 'selection';
  /** 자동 줄바꿈 */
  wordWrap: boolean;
}

export const TXT2MTXT_DEFAULTS: Txt2MtxtOptions = { combine: true, order: 'position', wordWrap: false };

interface Line {
  e: TextEntity | MTextEntity;
  /** 왼쪽 기준선 원점(WCS 평면도) */
  ox: number;
  oy: number;
  /** 글줄 방향(WCS 평면도 단위 벡터) */
  ux: number;
  uy: number;
  /** 글자 위 방향(WCS 평면도 단위 벡터 — −Z 평면이면 글줄 방향에서 시계 방향 90°) */
  vx: number;
  vy: number;
  /** 결과 여러 줄 문자의 회전 각도(첫 줄일 때): 원본 평면(OCS)의 각도 */
  rot: number;
  /** 결과 여러 줄 문자에 이을 돌출 방향 */
  ext?: Vec3;
  /** 결과 여러 줄 문자 삽입점의 WCS Z */
  z: number;
  h: number;
  wf: number;
  ob: number;
  /** 문자 폭(도면 단위) */
  width: number;
  /** MTEXT면 첫 줄 높이 위의 삽입점 차이를 쓰지 않는다 */
  mtext: boolean;
  /** 서식 문자열(여러 줄 문자) */
  body: string;
  /** 가로 맞춤: 0 왼쪽, 1 가운데, 2 오른쪽 */
  hj: number;
}

/** TEXT 문자열 → 여러 줄 문자 서식 문자열 */
export function textToMTextString(s: string): string {
  let out = '';
  let u = false;
  let o = false;
  let k = false;
  for (const c of parseTextString(s)) {
    if (c === TOGGLE_UNDERLINE) {
      u = !u;
      out += u ? '\\L' : '\\l';
    } else if (c === TOGGLE_OVERLINE) {
      o = !o;
      out += o ? '\\O' : '\\o';
    } else if (c === TOGGLE_STRIKE) {
      k = !k;
      out += k ? '\\K' : '\\k';
    } else if (c === 92) out += '\\\\';
    else if (c === 123) out += '\\{';
    else if (c === 125) out += '\\}';
    else if (c === 10 || c === 13) out += ' ';
    else out += String.fromCodePoint(c);
  }
  if (u) out += '\\l';
  if (o) out += '\\o';
  if (k) out += '\\k';
  return out;
}

const num = (v: number) => String(Math.round(v * 1e6) / 1e6);

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function lineOf(e: Entity, doc: CadDocument): Line | null {
  if (e.type === 'TEXT') {
    const f = textFrame(e, doc);
    const hj = e.halign === 1 || e.halign === 4 ? 1 : e.halign === 2 ? 2 : 0;
    // 글자 틀(OCS) → WCS 평면도. ±Z 평면만 옮기고 기운 평면은 전처럼 OCS 좌표 그대로(+Z는 항등이라 전과 같은 값)
    const planar = isPlanarExt(e.extrusion);
    const P = planar ? planProj(e.extrusion, e.insert.z) : IDENTITY;
    const o = affApply(P, f.o);
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    const u = affLin(P, { x: c, y: s });
    const v = affLin(P, { x: -s, y: c });
    const z = planar ? planZ(e.extrusion, e.insert.z) : e.insert.z;
    return { e, ox: o.x, oy: o.y, ux: u.x, uy: u.y, vx: v.x, vy: v.y, rot: f.rot, ext: e.extrusion, z, h: f.h, wf: f.wf, ob: e.oblique || 0, width: f.W * f.h * f.wf, mtext: false, body: textToMTextString(e.text), hj };
  }
  if (e.type === 'MTEXT') {
    const d = mtextDir(e);
    const rot = Math.atan2(d.y, d.x);
    const box = mtextLocalBox(e, doc);
    const h = e.height > 0 ? e.height : 2.5;
    // 첫 줄 기준선(왼쪽)을 원점으로: 상자 왼쪽 위에서 높이만큼 아래
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    // −Z 평면이면 위 방향(돌출 방향 × 글줄 방향)이 거울상이고, 결과는 돌출 방향과 OCS 회전 각도를 잇는다
    const flip = isPlanarExt(e.extrusion) && !isNaturalExt(e.extrusion);
    const vx = flip ? s : -s;
    const vy = flip ? -c : c;
    let ocsRot = rot;
    if (flip) {
      const f = frameOf(e.extrusion);
      ocsRot = Math.atan2(dot3(d, f.ay), dot3(d, f.ax));
    }
    const lx = box.minX;
    const ly = box.maxY - h;
    const col = (e.attachment - 1) % 3;
    return {
      e,
      ox: e.insert.x + c * lx + vx * ly,
      oy: e.insert.y + s * lx + vy * ly,
      ux: c,
      uy: s,
      vx,
      vy,
      rot: ocsRot,
      ext: flip ? { ...e.extrusion! } : undefined,
      z: e.insert.z,
      h,
      wf: 1,
      ob: 0,
      width: box.maxX - box.minX,
      mtext: true,
      body: e.text,
      hj: col,
    };
  }
  return null;
}

/** 줄 순서(위치): 기준 줄 base의 방향에서 위 → 아래, 같은 높이면 왼쪽 → 오른쪽 */
function sortByPosition(lines: Line[], base: Line): Line[] {
  const { ux, uy, vx, vy } = base;
  const tol = minOf(lines.map((l) => l.h)) * 0.25;
  return [...lines].sort((a, b) => {
    const da = a.ox * vx + a.oy * vy;
    const db = b.ox * vx + b.oy * vy;
    if (Math.abs(da - db) > tol) return db - da;
    return a.ox * ux + a.oy * uy - (b.ox * ux + b.oy * uy);
  });
}

/** 한 줄 문자들 → 여러 줄 문자 하나(삽입점·서식·줄 간격) */
function combineLines(lines: Line[], opt: Txt2MtxtOptions): MTextEntity {
  const first = lines[0]!;
  const h = first.h;
  const { ux, uy, vx, vy } = first;
  // 같은 줄(기준선 높이가 같은) 문자는 빈칸으로 이어 한 줄로
  const rows: Line[][] = [];
  for (const l of lines) {
    const prev = rows[rows.length - 1];
    const p = prev?.[0];
    const same = !!p && opt.order === 'position' && !l.mtext && !p.mtext && Math.abs((l.ox - p.ox) * vx + (l.oy - p.oy) * vy) <= h * 0.25;
    if (prev && same) prev.push(l);
    else rows.push([l]);
  }
  const fmtLine = (l: Line): string => {
    let b = l.body;
    if (l.mtext) return b;
    const codes: string[] = [];
    if (Math.abs(l.h - h) > 1e-9 * Math.max(1, h)) codes.push(`\\H${num(l.h)};`);
    if (Math.abs(l.wf - first.wf) > 1e-9) codes.push(`\\W${num(l.wf)};`);
    if (Math.abs(l.ob - first.ob) > 1e-9) codes.push(`\\Q${num((l.ob * 180) / Math.PI)};`);
    if (codes.length) b = `{${codes.join('')}${b}}`;
    return b;
  };
  const rowText = rows.map((r) => r.map(fmtLine).join(' '));
  // 첫 줄 기준 서식(폭 비율·기울기)
  let prefix = '';
  if (Math.abs(first.wf - 1) > 1e-9 && !first.mtext) prefix += `\\W${num(first.wf)};`;
  if (Math.abs(first.ob) > 1e-9 && !first.mtext) prefix += `\\Q${num((first.ob * 180) / Math.PI)};`;
  const body = opt.wordWrap ? rowText.join(' ') : rowText.join('\\P');
  const text = prefix ? `{${prefix}${body}}` : body;
  // 줄 간격: 줄 기준선 사이 평균 거리
  let factor = 1;
  if (rows.length > 1) {
    const ds: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]![0]!;
      const b = rows[i]![0]!;
      ds.push(Math.abs((a.ox - b.ox) * vx + (a.oy - b.oy) * vy));
    }
    const d = ds.reduce((x, y) => x + y, 0) / ds.length;
    if (d > 1e-9) factor = Math.min(4, Math.max(0.25, d / (1.667 * h)));
  }
  // 맞춤: 모두 가운데면 가운데 위, 모두 오른쪽이면 오른쪽 위, 아니면 왼쪽 위
  const hj = lines.every((l) => l.hj === 1) ? 1 : lines.every((l) => l.hj === 2) ? 2 : 0;
  const widths = rows.map((r) => r.reduce((a, l) => a + l.width, 0) + (r.length - 1) * h * 0.4);
  const maxW = maxOf(widths);
  // 첫 줄의 왼쪽(가운데·오른쪽) 위
  const along = hj === 0 ? 0 : hj === 1 ? first.width / 2 : first.width;
  const ix = first.ox + ux * along + vx * h;
  const iy = first.oy + uy * along + vy * h;
  const src = first.e;
  const m: MTextEntity = {
    type: 'MTEXT',
    handle: '',
    layer: src.layer,
    linetype: src.linetype,
    color: { ...src.color },
    lineweight: src.lineweight,
    ltscale: src.ltscale,
    transparency: src.transparency,
    insert: { x: ix, y: iy, z: first.z },
    height: h,
    width: opt.wordWrap ? maxW * 1.05 : 0,
    attachment: 1 + hj,
    drawingDirection: 1,
    text,
    style: src.style,
    rotation: first.rot,
    lineSpacingStyle: rows.length > 1 ? 2 : 1,
    lineSpacingFactor: rows.length > 1 ? factor : 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
  };
  if (src.paperSpace) m.paperSpace = true;
  if (first.ext) m.extrusion = { ...first.ext };
  return m;
}

/**
 * 문자들 → 여러 줄 문자(들). 결과의 remove는 바꾼 원래 객체 핸들, add는 새 여러 줄 문자(핸들 '').
 * 바꿀 문자가 없으면 null.
 */
export function textsToMText(list: readonly Entity[], doc: CadDocument, opt: Txt2MtxtOptions = TXT2MTXT_DEFAULTS): { remove: string[]; add: MTextEntity[] } | null {
  const lines = list.map((e) => lineOf(e, doc)).filter((l): l is Line => !!l);
  if (!lines.length) return null;
  if (!opt.combine) {
    const add: MTextEntity[] = [];
    const remove: string[] = [];
    for (const l of lines) {
      if (l.mtext) continue;
      add.push(combineLines([l], { ...opt, order: 'selection' }));
      remove.push(l.e.handle);
    }
    return add.length ? { remove, add } : null;
  }
  const ordered = opt.order === 'position' ? sortByPosition(lines, lines[0]!) : lines;
  // 같은 스타일 이름이 문서에 없으면 첫 줄 스타일을 그대로 둔다(쓰기가 자리 표시 스타일을 만든다)
  void doc.textStyles.get(tableKey(ordered[0]!.e.style));
  return { remove: ordered.map((l) => l.e.handle), add: [combineLines(ordered, opt)] };
}
