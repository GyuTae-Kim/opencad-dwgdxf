/**
 * 22차: ZOOM·PAN 명령이 화면에 넘기는 값(진짜 App, 화면은 호출을 받아 적는 가짜). 카메라 셈은 vpzoom.test.ts.
 * 도움말 ZOOM: 중심(C)은 중심점과 배율 또는 높이, 축척은 nX(현재 뷰에 대해)·nXP(도면 공간 단위에 대해).
 * "To Lock the Scale of a Layout Viewport": 화면표시가 잠긴 뷰포트는 뷰포트 축척이 그대로다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

/** 화면 줌 메서드를 받아 적는 가짜로 바꾼 App. msvp: 뷰포트 안(MSPACE)인 척 — 뷰포트 종이 높이 70, 잠금 */
function setup(msvp: { locked: boolean } | null = null) {
  const h = makeApp();
  registerCommands(h.app);
  h.app.osnapOn = false;
  h.app.dynOn = false;
  const calls: [string, ...unknown[]][] = [];
  const rec =
    (name: string, ret?: unknown) =>
    (...a: unknown[]) => {
      calls.push([name, ...a]);
      return ret;
    };
  const xp = msvp ? (msvp.locked ? 'locked' : 'done') : 'none';
  Object.assign(h.view, {
    zoomCenter: rec('zoomCenter'),
    zoomPaperScale: rec('zoomPaperScale', xp),
    zoomCenterAt: rec('zoomCenterAt'),
    zoomPrevious: rec('zoomPrevious', false),
    zoomExtents: rec('zoomExtents'),
    zoomRect: rec('zoomRect'),
    panWorld: rec('panWorld'),
    viewHeight: () => 600,
    msViewport: () => (msvp ? { height: 70, locked: msvp.locked } : null),
  });
  const cl = h.cmd as unknown as DirectCommandLine;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const zoom = async (...ts: string[]) => {
    void h.app.run('ZOOM');
    await settle();
    await type(...ts);
  };
  return { ...h, calls, type, zoom };
}

describe('ZOOM·PAN 명령(진짜 App)', () => {
  it('프롬프트에 중심(C), 축척 입력 nX·nXP·숫자만', async () => {
    const h = setup({ locked: false });
    void h.app.run('ZOOM');
    await settle();
    expect(h.cmd.prompt).toContain('[전체(A)/중심(C)/범위(E)/이전(P)/윈도우(W)/객체(O)/축척(S)]');
    await h.type('2X');
    await h.zoom('.5xp');
    await h.zoom('3');
    await h.zoom('S', '0.05XP');
    await h.zoom('S', '4x');
    expect(h.calls).toEqual([['zoomCenter', 2], ['zoomPaperScale', 0.5], ['zoomCenter', 3], ['zoomPaperScale', 0.05], ['zoomCenter', 4]]);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('nXP: 뷰포트 밖이면 이전처럼 nX, 화면표시가 잠긴 뷰포트면 바꾸지 않고 알린다', async () => {
    const out = setup(null);
    await out.zoom('0.1xp');
    expect(out.calls).toEqual([['zoomPaperScale', 0.1], ['zoomCenter', 0.1]]);
    const locked = setup({ locked: true });
    await locked.zoom('0.1xp');
    expect(locked.calls).toEqual([['zoomPaperScale', 0.1]]);
    expect(locked.out().at(-1)).toBe('화면표시가 잠긴 뷰포트는 축척을 바꾸지 않습니다.');
  });

  it('중심(C): 중심점과 높이·nX(지금 높이 ÷ n)·nXP(뷰포트 높이 ÷ n)·Enter(지금 높이)', async () => {
    const h = setup({ locked: false });
    await h.zoom('C', '200,100');
    expect(h.cmd.prompt).toBe('배율 또는 높이 입력 <600.0000>:');
    await h.type('300');
    await h.zoom('C', '200,100', '2x');
    await h.zoom('C', '200,100', '0.1XP');
    await h.zoom('C', '-5,7', '');
    expect(h.calls).toEqual([
      ['zoomCenterAt', 200, 100, 300],
      ['zoomCenterAt', 200, 100, 300],
      ['zoomCenterAt', 200, 100, 700],
      ['zoomCenterAt', -5, 7],
    ]);
    // 0 이하·글자는 다시 묻는다
    await h.zoom('C', '1,1', '0', 'abc', '50');
    expect(h.calls.at(-1)).toEqual(['zoomCenterAt', 1, 1, 50]);
    expect(h.out().filter((t) => t === '0보다 큰 값을 입력하십시오.')).toHaveLength(2);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('중심(C) nXP: 잠긴 뷰포트는 알리고 끝, 뷰포트 밖은 nX처럼', async () => {
    const locked = setup({ locked: true });
    await locked.zoom('C', '0,0', '0.5xp');
    expect(locked.calls).toEqual([]);
    expect(locked.out().at(-1)).toBe('화면표시가 잠긴 뷰포트는 축척을 바꾸지 않습니다.');
    const model = setup(null);
    await model.zoom('C', '0,0', '0.5xp');
    expect(model.calls).toEqual([['zoomCenterAt', 0, 0, 1200]]);
  });

  it('윈도우·범위·이전, PAN 두 점은 배율 그대로 옮기기(panWorld)', async () => {
    const h = setup({ locked: false });
    await h.zoom('W', '-100,-300', '1100,800');
    await h.zoom('E');
    await h.zoom('A');
    await h.zoom('P');
    expect(h.out().at(-1)).toBe('이전 화면이 없습니다.');
    void h.app.run('PAN');
    await settle();
    await h.type('0,0', '100,50');
    expect(h.calls).toEqual([['zoomRect', -100, -300, 1100, 800], ['zoomExtents'], ['zoomExtents'], ['zoomPrevious'], ['panWorld', 100, 50]]);
  });
});
