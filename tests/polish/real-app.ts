/**
 * 진짜 App으로 시험한다(명령 실행·입력 요청·확장 지점). 화면·명령행·엔진·글꼴은 시험 파일의 vi.mock이 fakes.ts로 바꿔 끼운다.
 * 문서는 새 도면 하나(DocState + EditSession), App.addDocument처럼 편집 세션을 확정 고리에 잇는다.
 */
import { App, type UiHooks } from '../../src/app/app';
import { DocState } from '../../src/app/docstate';
import { bindCommitHooks } from '../../src/app/hooks';
import { prefSet } from '../../src/app/mgr-ui';
import { createNewDocument } from '../../src/core/newdoc';
import type { CadDocument } from '../../src/core/model';
import { EditSession } from '../../src/edit/session';
import type { FakeCommandLine, FakeEngine, FakeView } from './fakes';

export interface RealApp {
  app: App;
  st: DocState;
  doc: CadDocument;
  view: FakeView;
  cmd: FakeCommandLine;
  engine: FakeEngine;
  /** UI 고리가 불린 횟수(refreshTabs 등) */
  ui: Record<string, number>;
  /** 명령행 출력 */
  out(): string[];
}

export function makeApp(setup?: (doc: CadDocument) => void): RealApp {
  // F10·F11(극좌표·객체 스냅 추적)은 이 브라우저에 저장되는 AUTOSNAP 8·16이다. 앞 시험이 바꾼 값이 남지 않게 기본값(63, 둘 다 켜짐)에서 시작한다.
  // 극좌표 추적 방식(POLARMODE)·증분 각도(POLARANG)·추가 각도(POLARADDANG)·상태 막대 좌표(COORDS)도 이 브라우저 값이라 초기값(0, 90도, 없음, 1)으로
  for (const n of ['AUTOSNAP', 'POLARMODE', 'POLARANG', 'POLARADDANG', 'COORDS']) prefSet(`opencad.sysvar.${n}`, null);
  const app = new App({} as HTMLElement);
  const ui: Record<string, number> = {};
  const count = (k: string) => () => {
    ui[k] = (ui[k] ?? 0) + 1;
  };
  app.ui = {
    refreshTabs: count('refreshTabs'),
    refreshLayouts: count('refreshLayouts'),
    refreshStatus: count('refreshStatus'),
    refreshPalette: count('refreshPalette'),
    showStart: count('showStart'),
    setBusy: count('setBusy'),
    setCoords: count('setCoords'),
    openPalette: count('openPalette'),
  } satisfies UiHooks;
  const doc = createNewDocument('metric');
  setup?.(doc);
  const st = new DocState(1, doc, 't.dwg', 0, 0);
  st.session = new EditSession(doc, () => {});
  bindCommitHooks(app, st);
  app.docs.push(st);
  app.active = st;
  const cmd = app.cmd as unknown as FakeCommandLine;
  return { app, st, doc, view: app.view as unknown as FakeView, cmd, engine: app.engine as unknown as FakeEngine, ui, out: () => cmd.lines.map((l) => l.text) };
}

/**
 * 마이크로태스크를 여러 번 돌리고 타이머 한 바퀴(명령의 catch·finally가 끝나게).
 * 333차: 두 마이크로태스크 20번은 공용 규칙 13번(횟수 대신 시간·조건)으로 바꾸지 않는다 — 마이크로태스크 차례는 부하와 무관하게 늘 같고,
 * 이 함수는 「앱 타이머가 정확히 한 바퀴 돈 상태」를 보는 시험의 틀이다(viewlink242 — 그리기 틀 두 번 뒤 적용하는 링크를 첫 틀 뒤에 본다).
 * 줄 비우기를 setImmediate로 바꾼 판은 이벤트 고리를 한 번 더 돌려, 시험 조각에 무엇이 함께 도느냐에 따라 둘째 틀이 이 안에서 돌았다(끝 묶음 실패·따로는 통과).
 * 부하에 따라 늦는 일(동적 가져오기·사전 받기)을 기다릴 때는 이 함수 대신 그 조건을 마감 안에서 기다린다(vi.waitFor 등)
 */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
