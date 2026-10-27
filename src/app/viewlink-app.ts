/**
 * 보기 링크를 앱에 잇는다: VIEWLINK(지금 화면을 담은 주소 복사), 주소의 #view=를 처음 연 도면에 한 번 적용, 연 뒤 해시가 바뀌면 바로 적용.
 * 파일 내용은 주소에 넣지 않는다(연 파일은 이 기기를 떠나지 않는다).
 */
import { MODEL_SPACE, tableKey } from '../core/model';
import type { App } from './app';
import type { DocState } from './docstate';
import { toast } from './ui/dom';
import { decodeViewLink, rectOf, viewFromRect, viewUrl, type ViewLink } from './viewlink';

/** 지금 화면의 보기(블록 편집기 중이면 그 뒤의 공간, 배치의 뷰포트 안이면 배치 화면) */
export function currentViewLink(app: App, st: DocState): ViewLink | null {
  const v = app.view;
  let space = st.space;
  let rect: [number, number, number, number] | null = null;
  // 뷰포트 안(MSPACE)이나 블록 편집기에서는 그 배치·공간의 카메라로
  const back = st.msVp?.layout ?? st.blockEdit?.back ?? null;
  if (back) {
    space = back;
    const c = st.cameras.get(back);
    if (c) {
      const hw = v.width / 2 / c.scale;
      const hh = v.height / 2 / c.scale;
      rect = [c.cx - hw, c.cy - hh, c.cx + hw, c.cy + hh];
    }
  } else rect = v.visibleWorld();
  if (!rect) return null;
  const key = tableKey(space);
  const layout = key === MODEL_SPACE ? undefined : st.layoutFor(key)?.name;
  if (key !== MODEL_SPACE && !layout) return null;
  return viewFromRect(rect, layout);
}

/** 보기 적용: 배치 탭으로 바꾸고 그 범위가 화면에 꼭 들어오게 맞춘다. 배치가 없으면 false */
export async function applyViewLink(app: App, st: DocState, link: ViewLink): Promise<boolean> {
  let space = MODEL_SPACE;
  if (link.layout) {
    const name = link.layout.toUpperCase();
    const lay = st.doc.layouts.find((l) => tableKey(l.blockName) !== MODEL_SPACE && l.name.toUpperCase() === name);
    if (!lay) {
      toast(`주소의 보기에 있는 배치 탭 "${link.layout}"이(가) 이 도면에 없습니다.`, 'warn');
      return false;
    }
    space = lay.blockName;
  }
  if (app.active !== st) return false;
  await app.setSpace(space);
  if (app.active !== st) return false;
  // 뷰포트 안에 있었으면 배치 화면으로 나와서 맞춘다
  if (st.msVp) app.exitViewport(st);
  const [x0, y0, x1, y1] = rectOf(link);
  app.view.zoomRect(x0, y0, x1, y1, true, 0);
  return true;
}

/** 지금 화면의 보기 링크를 복사한다(클립보드를 못 쓰면 주소 막대에) */
export async function copyViewLink(app: App): Promise<void> {
  const st = app.active;
  if (!st) {
    toast('열린 도면이 없습니다.', 'warn');
    return;
  }
  const link = currentViewLink(app, st);
  if (!link) return;
  const url = viewUrl(location.href, link);
  try {
    await navigator.clipboard.writeText(url);
    toast('보기 링크를 복사했습니다(가운데·배율·배치 탭 — 파일은 담지 않으니 받는 사람도 같은 파일을 여십시오).');
  } catch {
    history.replaceState(history.state, '', url);
    toast('클립보드를 쓸 수 없어 주소 막대에 보기 링크를 넣었습니다.', 'warn');
  }
}

export interface ViewLinks {
  /** 도면을 연 뒤(app.onOpened): 주소의 보기가 남아 있으면 이 도면에 한 번 적용 */
  opened(st: DocState): void;
}

/**
 * VIEWLINK 명령을 등록하고 주소의 #view=를 기다린다.
 * keepView: 휴대폰 보기 모드가 처음 볼 때 전체 보기로 맞추지 않게(링크의 화면을 지키게) 알린다.
 */
export function installViewLinks(app: App, keepView: (st: DocState) => void): ViewLinks {
  let pending: ViewLink | null = typeof location !== 'undefined' ? decodeViewLink(location.hash) : null;
  app.register({
    name: 'VIEWLINK',
    title: '보기 링크 복사',
    transparent: true,
    run: () => copyViewLink(app),
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      const link = decodeViewLink(location.hash);
      if (!link) return;
      const st = app.active;
      if (st) void applyViewLink(app, st, link);
      else pending = link;
    });
  }
  return {
    opened(st) {
      const link = pending;
      if (!link) return;
      pending = null;
      keepView(st);
      // 화면 크기가 정해진 뒤(시작 화면·진행 막대가 닫힌 뒤) 맞춘다
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (app.active !== st) return;
          void applyViewLink(app, st, link).then((ok) => {
            if (ok) toast('주소의 보기(가운데·배율·배치 탭)를 적용했습니다.');
          });
        }),
      );
    },
  };
}
