import { applyColorTheme, colorTheme } from './theme';

export interface EditorActions {
  openFiles(files: File[]): Promise<void>;
  openSample(): Promise<void>;
  newDrawing(): Promise<void>;
  openRecent(name: string, bytes: ArrayBuffer): Promise<void>;
}

/** Enter the CAD workspace on every visit; keep the static guide as a loading fallback. */
export function mountEditor(root: HTMLElement, load: () => Promise<EditorActions>): () => void {
  applyColorTheme(colorTheme());
  const intro = root.querySelector<HTMLElement>('.site-intro');
  if (!intro) throw new Error('Missing startup fallback');
  const status = intro.querySelector<HTMLElement>('.boot-status')!;
  let disposed = false;
  intro.classList.add('boot-loading');
  root.setAttribute('aria-busy', 'true');
  status.textContent = '편집기를 준비하고 있습니다…';
  void Promise.resolve().then(() => disposed ? undefined : load()).then(() => {
    if (!disposed) root.removeAttribute('aria-busy');
  }).catch(() => {
    if (disposed) return;
    root.removeAttribute('aria-busy');
    // startEditor supplies its own actionable WebGL fallback after replacing the guide.
    if (!root.contains(intro)) return;
    intro.classList.remove('boot-loading');
    status.setAttribute('role', 'alert');
    status.textContent = '편집기를 준비하지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn';
    retry.textContent = '새로고침';
    retry.addEventListener('click', () => location.reload());
    status.append(retry);
  });
  return () => { disposed = true; };
}
