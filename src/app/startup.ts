import { currentLanguage } from '../../site/i18n-core.mjs';
import { applyColorTheme, colorTheme } from './theme';

// The editor bundle and full catalogs are lazy; keep the first loading/error paint native.
const startupMessages = {
  "ko": {
    "loading": "편집기를 준비하고 있습니다…",
    "failed": "편집기를 준비하지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.",
    "retry": "새로고침"
  },
  "en": {
    "loading": "Preparing the editor…",
    "failed": "The editor could not be loaded. Check your internet connection and reload.",
    "retry": "Reload"
  },
  "ja": {
    "loading": "エディターを準備しています…",
    "failed": "エディターを読み込めませんでした。インターネット接続を確認して再読み込みしてください。",
    "retry": "再読み込み"
  },
  "zh-CN": {
    "loading": "正在准备编辑器…",
    "failed": "无法加载编辑器。请检查网络连接后重新加载。",
    "retry": "重新加载"
  },
  "de": {
    "loading": "Editor wird vorbereitet…",
    "failed": "Der Editor konnte nicht geladen werden. Prüfen Sie die Internetverbindung und laden Sie die Seite erneut.",
    "retry": "Neu laden"
  }
} as const;


export interface EditorActions {
  openFiles(files: File[]): Promise<void>;
  openSample(): Promise<void>;
  newDrawing(): Promise<void>;
  openRecent(name: string, bytes: ArrayBuffer): Promise<void>;
}

/** Enter the CAD workspace on every visit; keep the static guide as a loading fallback. */
export function mountEditor(root: HTMLElement, load: () => Promise<EditorActions>): () => void {
  const messages = startupMessages[currentLanguage(root.ownerDocument.URL) as keyof typeof startupMessages] ?? startupMessages.ko;
  applyColorTheme(colorTheme());
  const intro = root.querySelector<HTMLElement>('.site-intro');
  if (!intro) throw new Error('Missing startup fallback');
  const status = intro.querySelector<HTMLElement>('.boot-status')!;
  let disposed = false;
  intro.classList.add('boot-loading');
  root.setAttribute('aria-busy', 'true');
  status.textContent = messages.loading;
  void Promise.resolve().then(() => disposed ? undefined : load()).then(() => {
    if (!disposed) root.removeAttribute('aria-busy');
  }).catch(() => {
    if (disposed) return;
    root.removeAttribute('aria-busy');
    // startEditor supplies its own actionable WebGL fallback after replacing the guide.
    if (!root.contains(intro)) return;
    intro.classList.remove('boot-loading');
    status.setAttribute('role', 'alert');
    status.textContent = messages.failed;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn';
    retry.textContent = messages.retry;
    retry.addEventListener('click', () => location.reload());
    status.append(retry);
  });
  return () => { disposed = true; };
}
