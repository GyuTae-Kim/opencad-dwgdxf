/**
 * 198차: LAYOUT 복사(C)의 기본 이름 — 괄호 속 증가 번호.
 * Autodesk LAYOUT 도움말(2026) 복사 절은 이름을 주지 않으면 새 배치가 복사한 배치 이름에 괄호 속 증가 번호를 붙인 이름을 쓴다고 적는다.
 * 고치기 전에는 기본 이름이 늘 「이름 (2)」라 같은 배치를 두 번 복사하면 Enter에 「이미 있습니다」로 끝났다(아무것도 만들지 않음).
 * 이제 탭 메뉴 「이동 또는 복사」의 사본(LAYOUTMOVE)처럼 (2)부터 비어 있는 첫 번호를 기본 이름으로 묻는다.
 * 첫 복사의 기본 이름 「(2)」, 이름을 친 복사, 이미 있는 이름을 친 알림, LAYOUTMOVE 사본 이름, 새 탭 자리(맨 뒤)는 전과 같다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { registerLayoutCommands } from '../../src/app/layoutcmds';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';

const answer = vi.hoisted(() => ({ v: null as Record<string, unknown> | null }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), form: vi.fn(async () => answer.v) }));
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
  registerLayoutCommands(h.app);
  const cl = h.cmd as unknown as DirectCommandLine;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  /** LAYOUT → 복사(C) → 복사할 배치 → (프롬프트를 본 뒤) 이름 */
  const copy = async (src: string, name: string) => {
    void h.app.run('LAYOUT');
    await settle();
    await type('C', src);
    const prompt = h.cmd.prompt;
    await type(name);
    return prompt;
  };
  /** 탭 순서대로 배치 이름 */
  const tabs = () =>
    h.doc.layouts
      .filter((l) => tableKey(l.blockName) !== MODEL_SPACE)
      .sort((a, b) => a.tabOrder - b.tabOrder)
      .map((l) => l.name);
  const errs = () => h.out().filter((t) => t.endsWith('이미 있습니다.'));
  return { ...h, cl, type, copy, tabs, errs };
}

describe('LAYOUT 복사(C): 이름을 주지 않으면 괄호 속 증가 번호', () => {
  it('같은 배치를 두 번 복사(Enter) → 「Layout1 (2)」 다음 「Layout1 (3)」(프롬프트 기본값도), 알림 없음', async () => {
    const h = setup();
    expect(await h.copy('Layout1', '')).toBe('복사된 배치의 이름 입력 <Layout1 (2)>:');
    expect(await h.copy('Layout1', '')).toBe('복사된 배치의 이름 입력 <Layout1 (3)>:');
    expect(h.tabs()).toEqual(['Layout1', 'Layout1 (2)', 'Layout1 (3)']);
    expect(h.out()).toContain('배치 "Layout1"을(를) "Layout1 (3)"(으)로 복사했습니다.');
    expect(h.errs()).toEqual([]);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('비어 있는 첫 번호: (2)·(4)가 있으면 기본 이름은 (3), 이름은 대소문자를 가리지 않고 견준다', async () => {
    const h = setup();
    await h.copy('Layout1', 'Layout1 (2)');
    await h.copy('Layout1', 'LAYOUT1 (4)');
    expect(await h.copy('Layout1', '')).toBe('복사된 배치의 이름 입력 <Layout1 (3)>:');
    expect(h.tabs()).toEqual(['Layout1', 'Layout1 (2)', 'LAYOUT1 (4)', 'Layout1 (3)']);
    expect(h.errs()).toEqual([]);
  });
});

describe('전과 같은 꼴', () => {
  it('첫 복사의 기본 이름 (2)·이름을 친 복사·이미 있는 이름(대소문자 무관)은 알림 뒤 그대로, LAYOUTMOVE 사본은 비어 있는 첫 번호·맨 뒤 탭', async () => {
    const h = setup();
    expect(await h.copy('Layout1', '표제')).toBe('복사된 배치의 이름 입력 <Layout1 (2)>:');
    expect(h.tabs()).toEqual(['Layout1', '표제']);
    // 이미 있는 이름을 치면 알리고 아무것도 만들지 않는다
    await h.copy('Layout1', 'layout1');
    expect(h.errs()).toEqual(['배치 "layout1"이(가) 이미 있습니다.']);
    expect(h.tabs()).toEqual(['Layout1', '표제']);
    // 다른 배치의 첫 복사는 그 이름 + (2)
    expect(await h.copy('표제', '')).toBe('복사된 배치의 이름 입력 <표제 (2)>:');
    expect(h.tabs()).toEqual(['Layout1', '표제', '표제 (2)']);
    // 탭 메뉴 「이동 또는 복사」의 사본(끝으로 이동): Layout1 (2)가 비어 있어 (2)
    answer.v = { before: '', copy: true };
    void h.app.run('LAYOUTMOVE', 'Layout1');
    await settle();
    expect(h.tabs()).toEqual(['Layout1', '표제', '표제 (2)', 'Layout1 (2)']);
    void h.app.run('LAYOUTMOVE', 'Layout1');
    await settle();
    expect(h.tabs()).toEqual(['Layout1', '표제', '표제 (2)', 'Layout1 (2)', 'Layout1 (3)']);
    answer.v = null;
    expect(h.app.busyCommand).toBeFalsy();
  });
});
