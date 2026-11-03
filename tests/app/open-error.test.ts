// @vitest-environment jsdom
/** 도면을 열지 못했을 때(진짜 App): 엔진 오류 코드에 맞는 문제·할 일을 명령행에 남기고, 시작 화면이면 그 위 안내 상자로, 도면을 보는 중이면 바로 읽히는 알림으로 */
import { describe, expect, it, vi } from 'vitest';
import { EngineError } from '../../src/app/engine';
import { makeApp, settle } from '../polish/real-app';
import { type OpeningMark, markOpening, takeInterruptedOpens } from '../../src/app/openmarker';
import { openErrorInfo } from '../../src/app/openerror';
import { catalogs } from '../../site/i18n.mjs';

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

describe('여는 동안 탭이 꺼졌을 때(openmarker)', () => {
  it('열기 동안만 sessionStorage에 이름·크기가 남고, 끝나면(실패도) 지운다', async () => {
    sessionStorage.clear();
    const h = failingApp('dxf.invalid', '깨진 DXF');
    let during: OpeningMark[] = [];
    (h.engine as unknown as { open: () => Promise<never> }).open = () => {
      during = Object.values(JSON.parse(sessionStorage.getItem('opencad.opening') ?? '{}'));
      return Promise.reject(new EngineError('dxf.invalid', '깨진 DXF'));
    };
    await h.app.openFile('지도.dwg', new ArrayBuffer(16));
    expect(during).toEqual([{ name: '지도.dwg', size: 16 }]);
    expect(sessionStorage.getItem('opencad.opening')).toBeNull();
    expect(takeInterruptedOpens()).toEqual([]);
  });

  it('끝나지 못한 열기는 다음 시작 때 한 번만 돌려주고, 동시에 연 것은 따로 지운다', () => {
    sessionStorage.clear();
    const a = markOpening('a.dwg', 569007616);
    const b = markOpening('b.dxf', 10);
    a();
    expect(takeInterruptedOpens()).toEqual([{ name: 'b.dxf', size: 10 }]);
    expect(takeInterruptedOpens()).toEqual([]);
    b();
    // 망가진 값은 무시한다
    sessionStorage.setItem('opencad.opening', '{"x":{"name":1}}');
    expect(takeInterruptedOpens()).toEqual([]);
    sessionStorage.setItem('opencad.opening', 'not json');
    expect(takeInterruptedOpens()).toEqual([]);
  });

  it('안내 문구는 번역 사전에 있다', () => {
    const info = openErrorInfo('interrupted');
    expect(info.message).toBe('지난번에 이 도면을 여는 동안 페이지가 닫혔습니다.');
    expect(info.hint).toContain('메모리');
    for (const code of ['en', 'ja', 'zh-CN', 'de']) {
      expect(catalogs[code]![info.message]).toBeTruthy();
      expect(catalogs[code]![info.hint]).toBeTruthy();
    }
  });
});
