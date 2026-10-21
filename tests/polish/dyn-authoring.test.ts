/**
 * 동적 블록 작성 명령(BPARAMETER·BACTION·BVSTATE …): 이 웹 버전은 아직 만들지 않고 이유와 대신 쓸 길을 알린다.
 * BEDIT로 동적 블록 정의를 열면 매개변수·동작·가시성 상태는 그대로 둔다고 알린다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CadDocument } from '../../src/core/model';
import { registerBlockCommands } from '../../src/app/blocks';
import { form } from '../../src/app/ui/dom';
import { dynFixture, loadDyn } from '../dynblock/fixture';
import { browserGlobals } from './fakes';
import { makeApp, settle } from './real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('./fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('./fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('./fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), form: vi.fn() }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

function setup(prep?: (doc: CadDocument) => void) {
  const h = makeApp(prep);
  registerBlockCommands(h.app);
  // 블록 편집기 열기(장면 만들기)는 가짜 엔진이 못 하므로 연 이름만 남긴다
  const opened: string[] = [];
  h.app.openBlockEditor = async (name: string) => {
    opened.push(name);
    return true;
  };
  return { ...h, opened };
}

describe('동적 블록 작성 명령', () => {
  it('매개변수·동작·가시성 명령과 별칭은 등록되고, 왜 아직 안 되는지와 대신 쓸 길을 알린다', async () => {
    const h = setup();
    for (const name of ['BPARAMETER', 'PARAM', 'BACTION', 'AC', 'BACTIONTOOL', 'BVSTATE', 'BVHIDE', 'BVSHOW', 'BLOOKUPTABLE', 'BCPARAMETER', 'BTESTBLOCK']) {
      const n0 = h.out().length;
      await h.app.run(name);
      await settle();
      const said = h.out().slice(n0).join('\n');
      expect(said, name).toContain('동적 블록의 매개변수·동작·가시성 상태 작성은 이 웹 버전에서 아직 할 수 없습니다');
      expect(said, name).toContain('-DYNPROPS');
    }
  });

  it('BEDIT로 동적 블록 정의를 열면 매개변수·동작·가시성 상태는 그대로 둔다고 알린다', async () => {
    const dyn = loadDyn(dynFixture().text);
    const h = setup((doc) => Object.assign(doc, dyn));
    vi.mocked(form).mockResolvedValueOnce({ name: 'DYN-TEST' });
    await h.app.run('BEDIT');
    await settle();
    expect(h.opened).toEqual(['DYN-TEST']);
    expect(h.out().join('\n')).toContain('동적 블록 정의입니다');
  });

  it('보통 블록은 그 알림이 없다', async () => {
    const dyn = loadDyn(dynFixture().text);
    // 동적 블록 자료(확장 사전)가 없는 같은 모양 블록
    const b = dyn.blocks.get('XY-TEST')!;
    const r = dyn.blockRecords.get('XY-TEST')!;
    dyn.blocks.set('PLAIN', { ...b, name: 'PLAIN' });
    dyn.blockRecords.set('PLAIN', { ...r, name: 'PLAIN', xdict: undefined });
    const h = setup((doc) => Object.assign(doc, dyn));
    vi.mocked(form).mockResolvedValueOnce({ name: 'PLAIN' });
    await h.app.run('BEDIT');
    await settle();
    expect(h.opened).toEqual(['PLAIN']);
    const said = h.out().join('\n');
    expect(said).toContain('블록 편집기: PLAIN');
    expect(said).not.toContain('동적 블록 정의입니다');
  });
});
