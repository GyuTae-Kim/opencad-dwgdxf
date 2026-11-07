/**
 * 여러 단 MTEXT의 묶음 그립(90차, UI 없음): 위치·단 폭·단 간격·단 높이.
 *
 * AutoCAD 도움말(여러 줄 문자의 단 — "To Adjust Columns Using Grips", "About Columns in Multiline Text"): 고른 여러 단 문자의 그립으로
 * 문자의 위치, 단 사이 간격, 단의 가로·세로 크기를 바꾸고 마우스를 놓을 때 바뀐다. 모든 단은 폭과 간격이 같고, 단 높이는 넘치는 글이
 * 들어오거나 그립을 옮길 때만 바뀐다. 동적 단은 글을 따라 단이 늘고 준다. 그립 자리는 도움말 그림처럼 첫 단 위 오른쪽(단 폭),
 * 둘째 단 위 왼쪽(간격), 단 아래(높이 — 수동 높이 단은 단마다)다.
 *
 * 그립을 끌면 R2018 꼴 한 객체의 단 자료를 바꾸고, R2000~R2013 꼴 묶음은 첫 단 자리의 한 객체로 합친다(AutoCAD에서는 여러 단 문자가
 * 객체 하나다 — 저장할 때 쓰기 버전에 맞게 다시 나눈다, io/mtextcols.ts). 그래서 글이 단 사이로 흐르는 모양을 그대로 그린다.
 * 위치 그립은 묶음째 옮긴다. 부착점이 왼쪽 위가 아니거나 흐름 거꾸로, 문자 평면이 평면도가 아니면 그립을 두지 않는다(보통 MTEXT 그립).
 */
import type { CadDocument, Entity, MTextColumns, MTextEntity, TextStyle, Vec2 } from '../../core/model';
import { tableKey } from '../../core/model';
import type { TextEngine } from '../../text/layout';
import { affTranslate } from '../geom/math';
import { transformEntity } from '../geom/transform';
import { type EditResult, type GripPoint, MSG } from '../geom/types';
import { metrics } from '../geom/xtext';
import { linkedColumnGroup } from './mtextcols';

/** 그립으로 바꿀 여러 단 MTEXT */
export interface ColumnTarget {
  /** R2018 꼴 객체 또는 묶음의 첫 단 */
  head: MTextEntity;
  /** 묶음의 다른 단(R2018 꼴이면 빈 배열) */
  members: MTextEntity[];
  /** 한 객체로 본 모양(단 자료 columns가 있다) */
  merged: MTextEntity;
}

/** 평면도 위 문자 방향(단위 벡터). +Z 평면이 아니면 null */
function planAxis(e: MTextEntity): Vec2 | null {
  const n = e.extrusion;
  if (n && (Math.abs(n.x) > 1e-12 || Math.abs(n.y) > 1e-12 || n.z <= 0)) return null;
  const d = e.direction;
  if (d && Math.abs(d.z ?? 0) > 1e-12) return null;
  const x = d && Math.hypot(d.x, d.y) > 0 ? d.x : Math.cos(e.rotation);
  const y = d && Math.hypot(d.x, d.y) > 0 ? d.y : Math.sin(e.rotation);
  const l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : null;
}

/** 단 그립을 둘 여러 단 MTEXT(묶음의 다른 단을 고르면 그 첫 단). 단이 하나뿐이거나 근거가 없는 꼴이면 null */
export function columnTarget(doc: CadDocument, e: Entity, sets?: Map<string, string[]>): ColumnTarget | null {
  if (e.type !== 'MTEXT') return null;
  let head: MTextEntity = e;
  let members: MTextEntity[] = [];
  let merged: MTextEntity = e;
  if (!e.columns) {
    const g = linkedColumnGroup(doc, e, sets);
    if (!g) return null;
    ({ head, members, merged } = g);
  }
  const cols = merged.columns;
  if (!cols || cols.type <= 0 || cols.count < 2 || cols.flowReversed || (merged.attachment || 1) !== 1 || !(cols.width > 0) || !planAxis(merged)) return null;
  return { head, members, merged };
}

const at = (o: Vec2, u: Vec2, a: number, b: number): Vec2 => ({ x: o.x + u.x * a - u.y * b, y: o.y + u.y * a + u.x * b });

/** 묶음 그립: 위치(col:ins), 단 폭(col:w), 간격(col:g), 높이(정적·자동 높이 col:h, 수동 높이는 단마다 col:h0 …) */
export function columnGripPoints(t: ColumnTarget): GripPoint[] {
  const e = t.merged;
  const c = e.columns!;
  const u = planAxis(e)!;
  const o = { x: e.insert.x, y: e.insert.y };
  const out: GripPoint[] = [{ id: 'col:ins', point: o, kind: 'text' }, { id: 'col:w', point: at(o, u, c.width, 0), kind: 'ctrl' }];
  out.push({ id: 'col:g', point: at(o, u, c.width + c.gutter, 0), kind: 'ctrl' });
  if (c.type === 2 && !c.autoHeight) {
    c.heights.forEach((h, i) => {
      if (h > 0) out.push({ id: `col:h${i}`, point: at(o, u, i * (c.width + c.gutter) + c.width / 2, -h), kind: 'ctrl' });
    });
  } else if ((e.rectHeight ?? 0) > 0) out.push({ id: 'col:h', point: at(o, u, c.width / 2, -(e.rectHeight ?? 0)), kind: 'ctrl' });
  return out;
}

/** 자동 높이 동적 단의 단 수: 글이 드는 단 수(글을 따라 단이 늘고 준다) */
function dynamicCount(e: MTextEntity, style: TextStyle | undefined, text: TextEngine): number {
  const c = e.columns!;
  const lay = text.layoutMText({
    text: e.text,
    height: e.height,
    width: e.width,
    attachment: e.attachment,
    lineSpacingStyle: e.lineSpacingStyle,
    lineSpacingFactor: e.lineSpacingFactor,
    style,
    columns: { ...c, count: 256 },
    rectHeight: e.rectHeight,
  });
  return Math.max(1, lay.columnsUsed ?? c.count);
}

/**
 * 그립 id를 to로 옮긴 결과: 첫 단 자리의 한 객체(단 자료를 바꾼 것)로 바꾸고 묶음의 다른 단은 지운다. 위치 그립은 묶음째 옮긴다.
 * 너무 좁은 폭·높이, 음수 간격이면 안내만
 */
export function columnGripMove(doc: CadDocument, t: ColumnTarget, id: string, to: Vec2, text: TextEngine = metrics()): EditResult {
  if (id === 'col:ins') {
    const d = affTranslate(to.x - t.merged.insert.x, to.y - t.merged.insert.y);
    const replace = [t.head, ...t.members].flatMap((x) => transformEntity(x, d, doc).replace ?? []);
    return { replace };
  }
  const e = t.merged;
  const c: MTextColumns = { ...e.columns!, heights: [...e.columns!.heights] };
  const u = planAxis(e)!;
  const dx = to.x - e.insert.x;
  const dy = to.y - e.insert.y;
  const along = dx * u.x + dy * u.y;
  const down = -(dx * -u.y + dy * u.x);
  const tiny = Math.max(1e-9, e.height * 1e-3);
  let rectHeight = e.rectHeight ?? 0;
  if (id === 'col:w') {
    if (!(along > tiny)) return { message: MSG.tooShort };
    c.width = along;
  } else if (id === 'col:g') {
    const g = along - c.width;
    if (!(g >= 0)) return { message: '간격은 0 이상이어야 합니다.' };
    c.gutter = g;
  } else if (id === 'col:h' || /^col:h\d+$/.test(id)) {
    if (!(down > tiny)) return { message: MSG.tooShort };
    if (id === 'col:h') rectHeight = down;
    else {
      const i = Number(id.slice(5));
      if (!(i >= 0 && i < c.heights.length)) return { message: '그립이 없습니다.' };
      c.heights[i] = down;
    }
  } else return { message: '그립이 없습니다.' };
  const out: MTextEntity = { ...e, columns: c, rectHeight };
  delete out.dwgRaw;
  if (c.type === 2 && c.autoHeight) c.count = dynamicCount(out, doc.textStyles.get(tableKey(out.style)), text);
  return { replace: [out], ...(t.members.length ? { remove: t.members.map((m) => m.handle) } : {}) };
}
