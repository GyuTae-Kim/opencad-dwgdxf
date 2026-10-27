// @vitest-environment jsdom
/** 도면을 열지 못했을 때(진짜 App): 엔진 오류 코드에 맞는 문제·할 일을 명령행에 남기고, 시작 화면이면 그 위 안내 상자로, 도면을 보는 중이면 바로 읽히는 알림으로 */
import { describe, expect, it, vi } from 'vitest';
import { EngineError } from '../../src/app/engine';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/loadpreview', () => ({ LoadPreview: class { empty = true; add() {} dispose() {} } }));

function failingApp(code: string, message: string) {
  const h = makeApp();
  (h.engine as unknown as { open: () => Promise<never> }).open = () => Promise.reject(new EngineError(code, message));
  (h.view as unknown as { setLoadPreview: () => void }).setLoadPreview = () => {};
  const shown: { name: string; message: string; hint: string }[] = [];
  h.app.ui.showOpenError = (name, info) => void shown.push({ name, message: info.message, hint: info.hint });
  return { ...h, shown };
}

describe('도면 열기 실패 안내(App.openFile)', () => {
  it('시작 화면(열린 도면 없음)이면 안내 상자에 이름·문제·할 일을 남기고 명령행에도 적는다', async () => {
    const h = failingApp('dwg.unsupported_version', '아직 지원하지 않는 DWG 버전입니다.');
    h.app.docs.length = 0;
    h.app.active = null;
    expect(await h.app.openFile('옛 도면.dwg', new ArrayBuffer(8))).toBeNull();
    await settle();
    expect(h.shown).toEqual([{ name: '옛 도면.dwg', message: '아직 지원하지 않는 DWG 버전입니다.', hint: expect.stringContaining('R2018 이하') }]);
    expect(h.out().join('\n')).toContain('옛 도면.dwg — 아직 지원하지 않는 DWG 버전입니다.');
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('도면을 보는 중이면 알림(role="alert")으로, 워커가 멈춘 오류도 알아듣게', async () => {
    const h = failingApp('worker', 'Uncaught RangeError');
    expect(await h.app.openFile('큰 도면.dxf', new ArrayBuffer(8))).toBeNull();
    await settle();
    expect(h.shown).toEqual([]);
    const t = document.querySelector('.toast[role="alert"]')!;
    expect(t.textContent).toContain('큰 도면.dxf — 도면을 읽던 작업이 멈췄습니다.');
    expect(t.textContent).toContain('메모리');
  });
});
