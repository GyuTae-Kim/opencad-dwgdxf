/**
 * 선택한 객체 끌어 옮기기(명령이 없을 때): 이미 선택한 객체를 그립이 아닌 곳에서 눌러 끌면 미리보기가 따라오고,
 * 놓으면 옮긴다. 놓을 때 Ctrl(⌘)을 누르고 있으면 복사한다. 한 번의 편집(명령 취소 한 단계, 이름 MOVE·COPY — AutoCAD와 같다).
 * 누른 곳 판정(pressKind): 그립 위면 그립(그립 편집은 클릭으로), 선택한 객체 위면 끌어 옮기기, 그 밖은 창·올가미 선택.
 * 오른쪽 버튼으로 끌면 놓은 자리에 바로 가기 메뉴(여기로 이동·여기로 복사·블록으로 붙여넣기·취소)를 띄운다(AutoCAD 도움말
 * "About Copying Objects": 왼쪽 대신 오른쪽 버튼으로 끌면 끈 뒤 바로 가기 메뉴가 뜬다). 끌기 판정은 rightdrag.ts RightDragGesture(화면이 몬다),
 * 메뉴 항목은 dropMenuItems.
 * 편집 적용은 수정 명령과 같은 commitResults(구속·연관 치수 따라가기 포함)를 쓰되, app.ts와 순환하지 않게 놓을 때 불러온다.
 */
import { copyEntity, transformEntity } from '../edit/geom';
import { cloneEntity } from '../edit/session';
import type { App, CommandContext } from './app';
import { unlockedOnly } from './layers';
import type { MenuItem } from './ui/dom';
import type { OverlayGeom, Pt } from './view';

export type PressKind = 'grip' | 'move' | 'window';

/** 왼쪽 버튼을 누른 곳의 뜻(명령이 없을 때) */
export function pressKind(o: { onGrip: boolean; hit: string | null; selected: ReadonlySet<string>; busy: boolean }): PressKind {
  if (o.busy) return 'window';
  if (o.onGrip) return 'grip';
  if (o.hit && o.selected.has(o.hit)) return 'move';
  return 'window';
}

/** 끄는 동안의 미리보기: 고른 객체의 형상을 한 번 모아 두고 옮기기만 한다 */
export class DragGhost {
  private segs: number[] = [];
  private tris: number[] = [];

  constructor(geoms: Iterable<OverlayGeom>, limit = 400_000) {
    for (const g of geoms) {
      if (this.segs.length + g.segs.length > limit) break;
      for (const v of g.segs) this.segs.push(v);
      if (g.tris && this.tris.length < limit) for (const v of g.tris) this.tris.push(v);
    }
  }

  get empty(): boolean {
    return !this.segs.length && !this.tris.length;
  }

  at(dx: number, dy: number): OverlayGeom[] {
    const map = (src: number[]) => {
      const out = new Array<number>(src.length);
      for (let i = 0; i + 1 < src.length; i += 2) {
        out[i] = src[i]! + dx;
        out[i + 1] = src[i + 1]! + dy;
      }
      return out;
    };
    return [{ segs: map(this.segs), tris: map(this.tris) }];
  }
}

/** 놓았을 때: 고른 객체(잠긴 도면층 제외)를 d만큼 옮기거나 복사한다. 바꾼 객체 수 */
export async function commitDrag(app: App, handles: readonly string[], d: Pt, copy: boolean): Promise<number> {
  const st = app.active;
  if (!st || (!d.x && !d.y)) return 0;
  const hs = unlockedOnly(app, [...handles]).filter((h) => st.doc.entityIndex.has(h));
  if (!hs.length) return 0;
  const { commitResults, translate } = await import('./modify');
  if (app.active !== st) return 0;
  const m = translate(d.x, d.y);
  const doc = st.doc;
  const results = hs.map((h) => {
    const e = doc.entityIndex.get(h)!;
    return copy ? copyEntity(e, m, doc) : transformEntity(e, m, doc);
  });
  const fail = () => Promise.reject(new Error('끌어 옮기기에는 입력이 없습니다.'));
  const ctx: CommandContext = {
    app,
    print: (t, c) => app.cmd.print(t, c),
    getPoint: fail,
    getEntity: fail,
    getSelection: fail,
    group: app.nextGroup(),
  };
  const label = copy ? 'COPY' : 'MOVE';
  const a = commitResults(app, ctx, results, label, copy ? {} : { transform: m });
  app.refreshSelectionOverlay();
  return a.changed.length + a.added.length;
}

// ---------------------------------------------------------------------------
// 오른쪽 버튼 끌어 놓기(끌기 판정은 rightdrag.ts — 화면이 몬다)
// ---------------------------------------------------------------------------

/** 끌어 놓기 메뉴에서 고른 것 */
export type DropAction = 'move' | 'copy' | 'block';

/**
 * 오른쪽 버튼 끌어 놓기 메뉴(AutoCAD 도움말 "About Copying Objects"의 항목: Move Here, Copy Here, Paste as Block, Cancel).
 * 취소는 아무것도 하지 않는다(메뉴가 닫히면 미리보기를 치운다 — app.ts)
 */
export function dropMenuItems(act: (a: DropAction) => void): MenuItem[] {
  return [
    { label: '여기로 이동', icon: 'move', run: () => act('move') },
    { label: '여기로 복사', icon: 'copy', run: () => act('copy') },
    { label: '블록으로 붙여넣기', run: () => act('block') },
    { separator: true },
    { label: '취소', kbd: 'Esc' },
  ];
}

/**
 * 끌어 놓기의 [블록으로 붙여넣기]: 고른 객체의 사본을 새 블록(기준점 = 오른쪽 버튼을 누른 자리)으로 정의하고 놓은 자리에 넣는다.
 * 원본은 그대로 두고(붙여넣기), 새 블록 참조를 고른다(PASTEBLOCK과 같다). 한 편집 단계. 블록 이름(넣지 못했으면 null)
 */
export async function pasteDragAsBlock(app: App, handles: readonly string[], base: Pt, at: Pt): Promise<string | null> {
  const st = app.active;
  if (!st) return null;
  const list = handles.map((h) => st.doc.entityIndex.get(h)).filter((e) => !!e).map((e) => cloneEntity(e!));
  if (!list.length) return null;
  const { pasteAsBlock } = await import('./modify');
  if (app.active !== st) return null;
  const name = pasteAsBlock(app, st, list, base, at, { group: app.nextGroup() });
  app.cmd.print(`블록 "${name}"(객체 ${list.length}개)으로 붙여 넣었습니다.`);
  return name;
}
