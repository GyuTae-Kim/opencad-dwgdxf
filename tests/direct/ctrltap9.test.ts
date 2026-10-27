/**
 * 9차: Ctrl 한 번 누르기(CtrlTap) — 점 요청이 받겠다고 한 키워드(ctrlTap)로 끝낸다(다기능 그립의 Ctrl 순환).
 * 사이에 다른 키·클릭이 있거나 오래 누르면 아니다. GRIPMULTIFUNCTIONAL 비트(1 Ctrl 순환, 2 커서를 올리면 뜨는 메뉴)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PointResult } from '../../src/app/app';
import { CtrlTap } from '../../src/app/keys';
import { gripCtrlCycle, gripHoverMenu } from '../../src/app/settings';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

describe('Ctrl 한 번 누르기', () => {
  it('Ctrl을 눌렀다 떼면 한 번, 사이에 다른 키·클릭이 있거나 오래 누르면 아니다', () => {
    const t = new CtrlTap(1000);
    t.keyDown({ key: 'Control' }, 0);
    expect(t.keyUp({ key: 'Control' }, 100)).toBe(true);
    t.keyDown({ key: 'Meta' }, 0);
    expect(t.keyUp({ key: 'Meta' }, 100)).toBe(true);
    t.keyDown({ key: 'Control' }, 0);
    t.keyDown({ key: 'c' }, 50);
    expect(t.keyUp({ key: 'Control' }, 100)).toBe(false);
    t.keyDown({ key: 'Control' }, 0);
    t.cancel();
    expect(t.keyUp({ key: 'Control' }, 100)).toBe(false);
    t.keyDown({ key: 'Control' }, 0);
    expect(t.keyUp({ key: 'Control' }, 2000)).toBe(false);
    // 길게 누를 때의 반복 keydown은 처음 누른 때를 바꾸지 않는다
    t.keyDown({ key: 'Control' }, 0);
    t.keyDown({ key: 'Control', repeat: true }, 900);
    expect(t.keyUp({ key: 'Control' }, 1500)).toBe(false);
    expect(t.keyUp({ key: 'Shift' }, 0)).toBe(false);
  });

  it('GRIPMULTIFUNCTIONAL 비트: 1 Ctrl 순환, 2 커서를 올리면 뜨는 메뉴', () => {
    expect([0, 1, 2, 3].map(gripCtrlCycle)).toEqual([false, true, false, true]);
    expect([0, 1, 2, 3].map(gripHoverMenu)).toEqual([false, false, true, true]);
  });
});


describe('점 요청의 Ctrl 한 번 누르기', () => {
  const key = (h: RealApp, k: string, down: boolean) => (h.app as unknown as { ctrlTapKey(ev: KeyboardEvent, down: boolean): void }).ctrlTapKey({ key: k } as KeyboardEvent, down);

  it('ctrlTap을 받은 요청만 그 키워드로 끝낸다', async () => {
    const h = makeApp();
    const got: PointResult[] = [];
    h.app.register({
      name: 'TAPT',
      title: 't',
      async run(ctx) {
        got.push(await ctx.getPoint('점:', { ctrlTap: 'CY' }));
        got.push(await ctx.getPoint('점:'));
      },
    });
    void h.app.run('TAPT');
    await settle();
    // 사이에 다른 키
    key(h, 'Control', true);
    key(h, 'a', true);
    key(h, 'Control', false);
    await settle();
    expect(got).toEqual([]);
    key(h, 'Control', true);
    key(h, 'Control', false);
    await settle();
    expect(got).toEqual([{ keyword: 'CY' }]);
    // ctrlTap이 없는 요청은 그대로 기다린다
    key(h, 'Control', true);
    key(h, 'Control', false);
    await settle();
    expect(got.length).toBe(1);
    h.app.cancel();
    await settle();
  });
});
