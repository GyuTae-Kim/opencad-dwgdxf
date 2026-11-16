/**
 * 치수 화살표 반전(131차, AutoCAD 도움말 "To Flip the Direction of an Arrowhead" — 뒤집을 화살표 가까이에서 치수 하나를 고르고
 * 오른쪽 클릭 → 화살표 반전, 명령 AIDIMFLIPARROW). 고른 점에 가까운 화살표의 반전 깃발(DXF 74·75)을 뒤집고 치수 그림 블록을 다시 만든다
 * (확정 한 번 — 명령 취소 한 단계, 같은 화살표에 다시 부르면 되돌아간다). 깃발은 R2007 이상 DWG·DXF에 저장된다(130차).
 * 이 앱이 반전해 그리는 화살표(회전 선형 치수의 닫고 채운 화살촉 — edit/dim/linear.ts)만 받는다. 다른 종류·화살촉은 알리고 그대로 둔다.
 *  - 명령: 고른 치수가 하나이고 인자로 오른쪽 클릭 자리("x,y" — 바로 가기 메뉴가 넘긴다)가 있으면 그것으로, 아니면 "치수 선택:"에서 고른 점으로
 *  - 바로 가기 메뉴(편집 모드, 치수 하나, 누른 자리에 가까운 화살표를 반전해 그릴 수 있을 때): 화살표 반전
 *  - 다기능 그립 메뉴(치수선 끝 그립 = 둘째 화살표): gripmenu.ts
 */
import type { DimensionEntity } from '../core/model';
import { drawsFlippedArrow } from '../edit/dim';
import { dimFlipArrow, nearerArrow } from '../edit/annot/dimedit';
import type { App } from './app';
import { commitChanged } from './annot2-common';
import { type ContextMenuItem, type ContextMenuProvider, addHook } from './hooks';
import { unlockedOnly } from './layers';
import type { Pt } from './view';

/** 명령 인자 "x,y"(바로 가기 메뉴가 넘기는 누른 자리) */
function argPoint(arg: string | undefined): Pt | null {
  const m = /^\s*(-?[\d.eE+-]+)\s*,\s*(-?[\d.eE+-]+)\s*$/.exec(arg ?? '');
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function registerDimFlip(app: App): void {
  app.register({
    name: 'AIDIMFLIPARROW',
    title: '화살표 반전',
    async run(ctx, arg) {
      const st = app.active!;
      const doc = st.doc;
      let dim: DimensionEntity | null = null;
      let pick: Pt | null = null;
      const at = argPoint(arg);
      if (at && st.selection.size === 1) {
        const e = doc.entityIndex.get([...st.selection][0]!);
        if (e?.type === 'DIMENSION') {
          dim = e;
          pick = at;
        }
      }
      while (!dim || !pick) {
        const r = await ctx.getEntity('치수 선택:');
        if (!('handle' in r)) return;
        const e = doc.entityIndex.get(r.handle);
        if (e?.type === 'DIMENSION') {
          dim = e;
          pick = r.point;
        } else ctx.print('치수가 아닙니다.', 'err');
      }
      app.clearSelection();
      if (!unlockedOnly(app, [dim.handle]).length) return;
      const which = nearerArrow(dim, pick);
      if (!which || !drawsFlippedArrow(doc, dim, which)) {
        ctx.print('회전 선형 치수의 닫고 채운 화살촉만 반전할 수 있습니다.', 'err');
        return;
      }
      commitChanged(app, ctx, [dimFlipArrow(dim, which)], '화살표 반전');
    },
  });

  // 도면 영역 오른쪽 클릭(편집 모드, 치수 하나) — App.contextMenuProviders가 있을 때
  const providers = (app as unknown as { contextMenuProviders?: ContextMenuProvider[] }).contextMenuProviders;
  if (providers)
    addHook(providers, {
      name: 'dim-flip-arrow',
      items: (c): ContextMenuItem[] | null => {
        if (c.mode !== 'edit' || c.selection.length !== 1 || !c.st) return null;
        const e = c.st.doc.entityIndex.get(c.selection[0]!);
        if (e?.type !== 'DIMENSION') return null;
        const which = nearerArrow(e, c.point);
        if (!which || !drawsFlippedArrow(c.st.doc, e, which)) return null;
        const p = c.point;
        return [{ label: '화살표 반전', run: () => void app.run('AIDIMFLIPARROW', `${p.x},${p.y}`) }];
      },
    });
}
