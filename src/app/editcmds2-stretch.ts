/**
 * STRETCH의 객체 선택: `신축할 객체를 걸침 윈도우 또는 걸침 폴리곤으로 선택...` 다음 `객체 선택:`을 Enter까지 되풀이한다.
 * - 빈 곳을 찍으면 걸침 윈도우(두 구석, 방향과 관계없이 걸침), 객체를 찍으면 그 객체를 더한다.
 * - 걸침(C)·걸침 폴리곤(CP)·윈도우(W)·윈도우 폴리곤(WP)·상자(BOX)는 선택 방식(src/app/selmethod.ts)을 그대로 쓴다.
 * - 신축 영역은 마지막 윈도우·폴리곤이다(AutoCAD처럼 그 안의 정점만 옮긴다).
 * - 하나씩 찍어 고른 객체(`picked`)는 늘이지 않고 통째로 옮긴다(165차 — Autodesk STRETCH 도움말: 창 안에 다 든 객체나 하나씩 고른 객체는
 *   늘이지 않고 옮긴다). 영역 없이 찍기만 해도 된다. 이미 고른 객체를 다시 고르면 중복으로 버려 처음 고른 방식을 따른다.
 */
import type { App, CommandContext, Keyword } from './app';
import { unlockedOnly } from './layers';
import { SELECT_METHODS, type SelectMethodPicker, runSelectMethod, selectMethodOf } from './selmethod';
import type { Pt } from './view';

/** 신축 선택 프롬프트의 방식 키워드(울타리는 영역이 없어 뺀다) */
const STRETCH_METHODS: Keyword[] = SELECT_METHODS.filter((k) => k.key !== 'F');

/** 직사각형 [x0 y0 x1 y1] → 반시계 네 꼭짓점 */
export function rectPolygon(r: readonly [number, number, number, number]): Pt[] {
  return [
    { x: r[0], y: r[1] },
    { x: r[2], y: r[1] },
    { x: r[2], y: r[3] },
    { x: r[0], y: r[3] },
  ];
}

/**
 * 신축할 객체와 신축 영역을 고른다. Esc·Enter로 아무것도 고르지 않으면 null.
 * 고른 객체는 잠긴 도면층을 뺀 것이고, 선택 표시에 올린다. `picked`는 그 가운데 하나씩 찍어 고른 객체(옮긴다),
 * `poly`는 마지막 윈도우·폴리곤(찍기만 했으면 빈 배열)이다.
 */
export async function stretchSelection(app: App, ctx: CommandContext): Promise<{ handles: string[]; poly: Pt[]; picked: string[] } | null> {
  ctx.print('신축할 객체를 걸침 윈도우 또는 걸침 폴리곤으로 선택...');
  const pk = app.picker();
  if (!pk) return null;
  const chosen: string[] = [];
  const picked: string[] = [];
  let region: Pt[] | null = null;
  const add = (hs: string[], byPick = false) => {
    let n = 0;
    for (const h of unlockedOnly(app, hs))
      if (!chosen.includes(h)) {
        chosen.push(h);
        if (byPick) picked.push(h);
        n++;
      }
    app.setSelection(chosen);
    ctx.print(`${hs.length}개를 찾음${n < hs.length ? ` (${hs.length - n}개 중복)` : ''}`);
  };
  // 선택 방식이 넘기는 영역을 기억하는 고르기(윈도우·폴리곤 모두 걸침 영역으로 쓴다)
  const proxy: SelectMethodPicker = {
    select(r, crossing) {
      region = rectPolygon(r);
      return pk.select(r, crossing);
    },
    selectPolygon(poly, crossing) {
      region = poly.map((p) => ({ x: p.x, y: p.y }));
      return pk.selectPolygon(poly, crossing);
    },
    selectFence: (pts) => pk.selectFence(pts),
  };
  const io = { getPoint: ctx.getPoint.bind(ctx), print: ctx.print.bind(ctx) };
  for (;;) {
    const r = await ctx.getPoint('객체 선택:', { keywords: STRETCH_METHODS, allowText: true });
    if ('enter' in r) break;
    if ('point' in r) {
      const p = r.point;
      const tol = app.view.overlay.pickbox * app.view.pixelSize();
      const hit = pk.pick(p.x, p.y, tol);
      if (hit) {
        add([hit], true);
        continue;
      }
      // 빈 곳: 걸침 윈도우(방향과 관계없이 걸침)
      const b = await ctx.getPoint('반대 구석 지정:', { base: p, rubber: (q) => [{ pts: [p.x, p.y, q.x, p.y, q.x, q.y, p.x, q.y], closed: true, dashed: true, fill: true }] });
      if (!('point' in b)) continue;
      const q = b.point;
      if (Math.abs(q.x - p.x) < 1e-12 || Math.abs(q.y - p.y) < 1e-12) continue;
      const rect: [number, number, number, number] = [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
      region = rectPolygon(rect);
      add(pk.select(rect, true));
      continue;
    }
    const k = 'keyword' in r ? r.keyword : r.text;
    const m = selectMethodOf(k);
    if (!m || m === 'F') {
      ctx.print('걸침 윈도우(C) 또는 걸침 폴리곤(CP)으로 선택하십시오.', 'err');
      continue;
    }
    const hs = await runSelectMethod(m, io, proxy);
    if (hs) add(hs);
  }
  const poly: Pt[] | null = region;
  if (!chosen.length) {
    ctx.print('선택된 객체가 없습니다.');
    return null;
  }
  // 영역 없이 찍기만 했으면 고른 객체는 모두 옮긴다(윈도우·폴리곤 방식은 고르는 수가 0이어도 영역을 남긴다)
  return { handles: chosen, poly: poly ?? [], picked };
}
