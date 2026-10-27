/**
 * 홈 화면 앱(PWA)을 편집기에 잇는다: 오프라인 서비스 워커와 새 판 알림, 공유 받은 도면(?recent=) 열기, 데스크톱 "연결 프로그램"으로 연 파일.
 * 순수한 부분(등록·알림 판정·주소 인자)은 pwa.ts(공용 사이트 도구), 서비스 워커 원본은 tools/sw-template.js.
 */
import type { App } from './app';
import type { Shell } from './ui/shell';
import { autosaveNow } from './autosave';
import { ask, toast } from './ui/dom';
import { canUseServiceWorker, consumeLaunchFiles, parseLaunchQuery, registerServiceWorker, shareErrorMessage, usedResourceUrls, whenVisible, withoutLaunchQuery } from './pwa';

/** 시작 주소의 공유 받기 인자: ?recent=<id>면 그 최근 문서를 열고, ?share-error=면 까닭을 알린다. 한 번만 쓰도록 주소에서 지운다 */
export async function handleLaunchQuery(shell: Pick<Shell, 'openRecent'>, href = location.href): Promise<void> {
  const q = parseLaunchQuery(new URL(href).search);
  if (!q.recent && !q.shareError) return;
  if (href === location.href) history.replaceState(history.state, '', withoutLaunchQuery(href));
  if (q.shareError) toast(shareErrorMessage(q.shareError), 'warn', 9000);
  if (q.recent) await shell.openRecent(q.recent, true);
}

/** 새 판으로 바꾸기: 저장하지 않은 도면이 있으면 묻고, 바꾸기 전에 이 브라우저에 자동 저장해 둔다(다시 읽은 뒤 도면 복구 관리자로 되살린다) */
export async function applyUpdate(app: Pick<App, 'docs'>, apply: () => void, save: () => Promise<number> = () => autosaveNow(app as App)): Promise<boolean> {
  const dirty = app.docs.filter((d) => d.session?.dirty).length;
  if (dirty) {
    const a = await ask('새 버전으로 바꾸기', `저장하지 않은 도면이 ${dirty}개 있습니다. 새로 고치기 전에 이 브라우저에 자동 저장해 두며, 다시 열린 뒤 도면 복구 관리자(DRAWINGRECOVERY)로 되살릴 수 있습니다.`, [
      { label: '자동 저장하고 새로 고침', value: 'go', primary: true },
      { label: '나중에', value: 'later' },
    ]);
    if (a !== 'go') return false;
    await save();
  }
  apply();
  return true;
}

function offerUpdate(app: App, apply: () => void): void {
  toast('새 버전이 있습니다.', 'info', 0, {
    label: '새로 고침',
    run: () =>
      void applyUpdate(app, apply).then((done) => {
        if (!done) offerUpdate(app, apply);
      }),
  });
}

function whenIdle(fn: () => void): void {
  const go = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 5000 });
    else setTimeout(fn, 1500);
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

/**
 * 편집기가 준비된 뒤 한 번 부른다. 서비스 워커는 페이지가 다 뜨고 한가할 때 등록한다(첫 화면을 늦추지 않게).
 * 개발 서버와 서비스 워커를 못 쓰는 곳(파일 주소·http 원격)에서는 파일 열기 연결만 한다
 */
export function installPwa(app: App, shell: Shell): void {
  consumeLaunchFiles(
    (files) => void shell.openFiles(files),
    (url) => void handleLaunchQuery(shell, url),
  );
  if (import.meta.env.DEV || !canUseServiceWorker(location, navigator)) return;
  whenIdle(() => {
    const sw = navigator.serviceWorker;
    // 홈 화면 앱은 오래 열려 있다: 앱으로 돌아올 때(whenVisible) 새 판이 있는지 본다
    void registerServiceWorker(sw, new URL('sw.js', document.baseURI), (apply) => offerUpdate(app, apply), undefined, { onVisible: whenVisible }).then((reg) => {
      if (!reg) return;
      // 서비스 워커가 맡기 전에 받은 파일(이 언어의 사전·글꼴 등)도 담아 두게 알린다
      void sw.ready.then((r) => r.active?.postMessage({ type: 'CACHE_URLS', urls: usedResourceUrls(performance.getEntriesByType('resource'), r.scope) }));
    });
  });
}
