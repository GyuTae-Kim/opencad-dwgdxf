/**
 * 여러 단 MTEXT 묶음 그립의 화면 쪽(90차): 고른 여러 단 문자에 위치·단 폭·단 간격·단 높이 그립을 두고(R2000~R2013 꼴 묶음의 다른 단은
 * 그립이 없다 — 첫 단이 묶음 전체의 그립을 갖는다), GRIPEDIT가 'col:' 그립을 누르면 columnGripEdit로 넘긴다(src/app/modify.ts).
 * 끄는 동안 단 사이로 흐르는 글을 미리 보이고, 점을 찍으면 적용한다. 계산은 src/edit/util/mtextcolgrip.ts.
 */
import type { Entity } from '../core/model';
import { cachedMTextColumnSets } from '../edit/util/mtextcols';
import { columnGripMove, columnGripPoints, columnTarget } from '../edit/util/mtextcolgrip';
import type { GripPoint } from '../edit/geom/types';
import type { App, CommandContext } from './app';
import { unlockedOnly } from './layers';
import { commitResults } from './modify';

const LABEL: Record<string, string> = { 'col:ins': '이동', 'col:w': '단 폭', 'col:g': '단 간격', 'col:h': '단 높이' };
const PROMPT: Record<string, string> = {
  'col:ins': '이동점 지정 또는 [종료(X)]:',
  'col:w': '단 폭 지정 또는 [종료(X)]:',
  'col:g': '단 간격 지정 또는 [종료(X)]:',
  'col:h': '단 높이 지정 또는 [종료(X)]:',
};
const keyOf = (id: string) => (/^col:h\d+$/.test(id) ? 'col:h' : id);

/**
 * 객체의 그립을 묶음 그립으로: 여러 단 문자(R2018 꼴 또는 묶음의 첫 단)면 묶음 그립, 묶음의 다른 단이면 빈 목록(그립 없음),
 * 그 밖은 null(보통 그립)
 */
export function columnGripsFor(app: App, e: Entity): GripPoint[] | null {
  const st = app.active;
  if (!st || e.type !== 'MTEXT') return null;
  if (!e.columns && !e.xdata) {
    // 확장 자료가 없는 MTEXT는 수동 높이 묶음의 다른 단일 수만 있다
    const list = cachedMTextColumnSets(st.doc, st.gen).get(e.handle);
    return list && list[0] !== e.handle ? [] : null;
  }
  const sets = cachedMTextColumnSets(st.doc, st.gen);
  const list = sets.get(e.handle);
  if (list && list[0] !== e.handle) return [];
  const t = columnTarget(st.doc, e, sets);
  return t ? columnGripPoints(t) : null;
}

/** 묶음 그립 편집: 새 점을 받아 단 자료를 바꾼다(R2000~R2013 꼴 묶음은 첫 단 자리의 한 객체로 합친다) */
export async function columnGripEdit(app: App, ctx: CommandContext, handle: string, id: string): Promise<void> {
  const st = app.active!;
  const e = st.doc.entityIndex.get(handle);
  const t = e ? columnTarget(st.doc, e, cachedMTextColumnSets(st.doc, st.gen)) : null;
  if (!t) return;
  const all = [t.head.handle, ...t.members.map((m) => m.handle)];
  if (unlockedOnly(app, all).length !== all.length) return;
  const grip = columnGripPoints(t).find((g) => g.id === id);
  if (!grip) return;
  const key = keyOf(id);
  ctx.print(`** ${LABEL[key] ?? LABEL['col:ins']} **`);
  const pk = app.picker();
  const r = await ctx.getPoint(PROMPT[key] ?? PROMPT['col:ins']!, {
    base: grip.point,
    keywords: [{ key: 'X', label: '종료' }],
    ghost: (q) => {
      const res = columnGripMove(st.doc, t, id, q);
      return pk && res.replace?.length ? [pk.geometryOf(res.replace)] : [];
    },
  });
  if (!('point' in r)) return;
  const res = columnGripMove(st.doc, t, id, r.point);
  if (!res.replace?.length) {
    if (res.message) ctx.print(res.message, 'err');
    return;
  }
  commitResults(app, ctx, [res], 'GRIP');
  app.setSelection([t.head.handle, ...(id === 'col:ins' ? t.members.map((m) => m.handle) : [])]);
}
