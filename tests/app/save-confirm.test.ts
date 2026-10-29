// @vitest-environment jsdom
/**
 * 저장 전 확인: 쓰기 결과에 빠지는 객체가 있으면 파일을 내기 전에 목록을 보이고 묻는다.
 * 취소하면 파일을 내지 않고(도면은 고친 상태 그대로), 확인하면 저장한다. 손실이 없으면 묻지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSaveCommands } from '../../src/app/save';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

function setup(warnings: { code: string; message: string; count?: number; detail?: Record<string, unknown> }[]) {
  const h = makeApp();
  h.doc.format = 'dwg';
  h.doc.version = 'AC1021';
  registerSaveCommands(h.app);
  const saves: string[] = [];
  (h.app.engine as unknown as { save: unknown }).save = async (_id: number, format: string, version: string) => {
    saves.push(`${format}-${version}`);
    return { data: new Uint8Array([1, 2, 3]), warnings, ms: 1 };
  };
  const downloads: string[] = [];
  URL.createObjectURL = (() => 'blob:x') as never;
  URL.revokeObjectURL = (() => undefined) as never;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  };
  return { ...h, saves, downloads };
}

/**
 * 명령이 동적 가져오기(fieldcmds)를 기다리므로 조건이 될 때까지 돈다. 횟수가 아니라 시간(15초)으로 기다린다 —
 * 기계가 바쁠 때 가져오기가 2초를 넘겨 대화상자가 늦게 뜨면 횟수로 세던 기다림이 먼저 끝나 시험이 실패했다
 */
async function until(cond: () => boolean): Promise<void> {
  const end = Date.now() + 15000;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  await settle();
}

const LOSS = { code: 'dwg.write_entity_dropped', message: '이 버전으로 쓸 수 없는 도형 3개를 뺐습니다(원본 자료가 없거나 다른 버전).', count: 1, detail: { types: { '3DSOLID': 2, REGION: 1 } } };

describe('저장 전 확인', () => {
  it('빠지는 것이 있으면 목록을 보이고, 취소하면 파일을 내지 않는다', async () => {
    const h = setup([LOSS]);
    void h.app.run('QSAVE');
    await until(() => !!document.querySelector('.dialog'));
    // R2007은 R2004로 쓴다
    expect(h.saves).toEqual(['dwg-AC1018']);
    const dlg = document.querySelector('.dialog')!;
    expect(dlg.getAttribute('aria-label')).toBe('저장 전 확인');
    expect(dlg.textContent).toContain('3DSOLID, REGION');
    expect(dlg.textContent).toContain('AutoCAD 2004/LT2004 도면');
    const cancel = [...dlg.querySelectorAll('footer button')].find((b) => b.textContent === '취소') as HTMLButtonElement;
    cancel.click();
    await settle();
    expect(h.downloads).toEqual([]);
    expect(h.out()).toContain('저장을 취소했습니다.');
  });
  it('그래도 저장을 누르면 저장한다', async () => {
    const h = setup([LOSS]);
    void h.app.run('QSAVE');
    await until(() => !!document.querySelector('.dialog'));
    const ok = [...document.querySelectorAll('.dialog footer button')].find((b) => b.textContent === '그래도 저장') as HTMLButtonElement;
    ok.click();
    await settle();
    expect(h.downloads).toEqual(['t.dwg']);
  });
  it('보이지 않는 객체(재질 등)만 빠지면 묻지 않는다', async () => {
    const h = setup([{ code: 'dwg.write_object_dropped', message: 'x', count: 1, detail: { types: { MATERIAL: 3 } } }]);
    void h.app.run('QSAVE');
    await until(() => h.downloads.length > 0);
    expect(document.querySelector('.dialog')).toBeNull();
    expect(h.downloads).toEqual(['t.dwg']);
  });
});
