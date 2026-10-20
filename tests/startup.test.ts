// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEditor, type EditorActions } from '../src/app/startup';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let dispose: (() => void) | undefined;
let root: HTMLElement;
let ready: EditorActions;
beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
  document.body.innerHTML = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)![1];
  root = document.getElementById('app')!;
  ready = { openFiles: vi.fn(), openSample: vi.fn(), newDrawing: vi.fn(), openRecent: vi.fn() };
});
afterEach(() => { dispose?.(); dispose = undefined; });
describe('direct CAD workspace startup', () => {
  it.each(['/', '/en/?sample#view', '/de/?open=/samples/test.dxf#view'])('enters CAD automatically at %s without opening an extra file', async (url) => {
    history.replaceState(null, '', url);
    const load = vi.fn().mockResolvedValue(ready);
    dispose = mountEditor(root, load);
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('.boot-status')!.textContent).toContain('편집기를 준비');
    await flush();
    expect(load).toHaveBeenCalledOnce();
    expect(location.pathname + location.search + location.hash).toBe(url);
    expect(root.hasAttribute('aria-busy')).toBe(false);
    for (const action of Object.values(ready)) expect(action).not.toHaveBeenCalled();
  });
  it('applies the saved theme before loading CAD', async () => {
    localStorage.setItem('opencad.colortheme', '1');
    dispose = mountEditor(root, vi.fn().mockResolvedValue(ready));
    expect(document.documentElement.dataset.theme).toBe('light');
    await flush();
  });
  it('shows the static guide and a reload action if the editor download fails', async () => {
    dispose = mountEditor(root, vi.fn().mockRejectedValue(new Error('offline')));
    await flush();
    expect(root.querySelector('.boot-loading')).toBeNull();
    expect(root.querySelector('#viewer-guide')!.textContent).toContain('DWG·DXF');
    expect(root.querySelector('[role="alert"] button')!.textContent).toBe('새로고침');
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });
  it('preserves the editor WebGL fallback when initialization fails', async () => {
    const fallback = document.createElement('p');
    fallback.textContent = 'WebGL2';
    dispose = mountEditor(root, async () => { root.replaceChildren(fallback); throw new Error('WebGL2'); });
    await flush();
    expect(root.firstChild).toBe(fallback);
    expect(root.querySelector('.site-intro')).toBeNull();
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });
  it('does not start CAD after the startup was disposed', async () => {
    const load = vi.fn().mockResolvedValue(ready);
    dispose = mountEditor(root, load);
    dispose(); await flush();
    expect(load).not.toHaveBeenCalled();
  });
});
