/**
 * 197차: GRID 종횡비(A)의 가로·세로 값 뒤에 붙인 x — 스냅 간격의 배수.
 * Autodesk GRID 도움말(2026) 종횡비 절은 두 값 가운데 어느 쪽이든 뒤에 x를 붙이면 그림 단위가 아니라 스냅 간격의 배수로 정한다고 적는다
 * (격자 간격(X) 절도 같은 규칙 — 이 앱은 전부터 받았다).
 * 고치기 전에는 종횡비의 두 값을 숫자로만 읽어 「2x」는 값이 아니게 되고 격자 간격이 그대로였다(격자 켜기만).
 * 이제 격자 간격(X)의 x 접미사와 같은 읽기로 가로는 스냅 X 간격, 세로는 스냅 Y 간격의 배수다.
 * 숫자·Enter·0·글, 격자 간격(X)의 nX, 프롬프트 글은 전과 같다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerDraftingCommands } from '../../src/app/drafting';
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

function setup() {
  const h = makeApp();
  registerDraftingCommands(h.app);
  const cl = h.cmd as unknown as DirectCommandLine;
  // 스냅 간격 가로 5·세로 2.5(SNAP 종횡비로 정한 꼴), 격자는 10·10에서 시작
  h.st.snap.x = 5;
  h.st.snap.y = 2.5;
  h.st.grid.x = 10;
  h.st.grid.y = 10;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const grid = async (...ts: string[]) => {
    void h.app.run('GRID');
    await settle();
    await type(...ts);
  };
  return { ...h, cl, type, grid };
}
type H = ReturnType<typeof setup>;
const spacing = (h: H) => ({ x: h.st.grid.x, y: h.st.grid.y });

describe('GRID 종횡비(A): 값 뒤의 x는 스냅 간격의 배수', () => {
  it('가로 3x·세로 2X → 가로 15(스냅 X 5의 3배)·세로 5(스냅 Y 2.5의 2배), 격자 켜기, 프롬프트 글 그대로', async () => {
    const h = setup();
    void h.app.run('GRID');
    await settle();
    await h.type('A');
    expect(h.cmd.prompt).toMatch(/^수평 간격두기\(X\) 지정 <.+>:$/);
    await h.type('3x');
    expect(h.cmd.prompt).toMatch(/^수직 간격두기\(Y\) 지정 <.+>:$/);
    await h.type('2X');
    expect(spacing(h)).toEqual({ x: 15, y: 5 });
    expect(h.app.gridOn).toBe(true);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('한쪽만 x: 가로 12·세로 3x → 12·7.5, 소수 배수 0.5x·1.5x → 2.5·3.75', async () => {
    const h = setup();
    await h.grid('A', '12', '3x');
    expect(spacing(h)).toEqual({ x: 12, y: 7.5 });
    await h.grid('A', '0.5x', '1.5x');
    expect(spacing(h)).toEqual({ x: 2.5, y: 3.75 });
    expect(h.app.busyCommand).toBeFalsy();
  });
});

describe('전과 같은 꼴', () => {
  it('종횡비의 숫자 둘·Enter 둘·0x와 글, 한쪽만 맞는 값은 전과 같고, 격자 간격(X)의 nX는 스냅 X 간격의 배수로 가로·세로가 같다', async () => {
    const h = setup();
    await h.grid('A', '8', '6');
    expect(spacing(h)).toEqual({ x: 8, y: 6 });
    // Enter 둘 → 그대로
    await h.grid('A', '', '');
    expect(spacing(h)).toEqual({ x: 8, y: 6 });
    // 0보다 큰 값만 받는다(0x·글은 그대로)
    await h.grid('A', '0x', 'abc');
    expect(spacing(h)).toEqual({ x: 8, y: 6 });
    // 두 값이 모두 맞아야 바꾼다(한쪽이 글이면 그대로)
    await h.grid('A', '7', 'abc');
    expect(spacing(h)).toEqual({ x: 8, y: 6 });
    // 격자 간격(X) 프롬프트의 nX(전부터 있던 꼴)
    await h.grid('3x');
    expect(spacing(h)).toEqual({ x: 15, y: 15 });
    expect(h.app.gridOn).toBe(true);
    expect(h.app.busyCommand).toBeFalsy();
  });
});
