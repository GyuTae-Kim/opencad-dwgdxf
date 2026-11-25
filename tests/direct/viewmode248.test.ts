// @vitest-environment jsdom
/**
 * 휴대폰 보기 모드 남은 둘(248차 — 247차 보고 (6)·(2)):
 * - 247차가 보기 모드 특성 탭의 칸·단추를 모두 막으면서 표의 「셀」 고르기(어느 셀 글을 볼지 — 도면을 고치지 않음)도 막혀 기억한(처음) 셀만 보였다.
 *   보이는 값만 바꾸는 칸(표지 data-display-only)은 막지 않는다. 셀 내용 칸·셀 편집 단추 등 도면을 고치는 칸은 그대로 막힌다.
 * - 보기 모드에서 Enter·Space(명령 없음)가 편집 화면에서 쓴 명령(선 그리기·지우기 등)까지 다시 돌렸다.
 *   보기 모드는 보기 모드가 여는 명령(전체 보기·거리·반지름·각도·면적·점 좌표)만 반복하고, 밖이면 아무것도 하지 않는다.
 * 편집 화면은 그대로다. 진짜 App·Palette와 table2/fixture28의 표, 화면·명령행·엔진·글꼴은 가짜(cellpalette31.test.ts와 같은 틀).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeEditor } from '../../src/app/textedit/editor';
import { Palette } from '../../src/app/ui/palettes';
import { getText } from '../../src/edit/table/model';
import { settle } from '../polish/real-app';
import { setup } from '../table2/fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
  sessionStorage.clear();
});

/** 표(fixture28 — A1 제목 「공정 일정」, A3 「가」)를 고르고 진짜 특성 팔레트를 앱의 refreshPalette에 잇는다(셸처럼) */
function withTable(view: boolean) {
  const h = setup();
  const host = document.createElement('div');
  document.body.append(host);
  const pal = new Palette(h.app, host);
  h.app.ui.refreshPalette = () => pal.refresh();
  h.app.setSelection([h.handle], 'replace');
  h.app.setViewOnly(view);
  pal.open('props');
  /** 칸(팔레트가 다시 그리면 새 요소라 그때마다 찾는다) */
  const field = <T extends HTMLElement>(name: string) => pal.el.querySelector<T>(`[data-field="${name}"]`)!;
  const cell = () => field<HTMLSelectElement>('pf-셀');
  const content = () => field<HTMLTextAreaElement>('pf-셀 문자');
  const change = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string) => {
    el.value = v;
    el.dispatchEvent(new Event('change'));
  };
  const button = (text: string) => [...pal.el.querySelectorAll<HTMLButtonElement>('.palette-body button')].find((b) => b.textContent === text)!;
  return { ...h, pal, field, cell, content, change, button };
}

describe('보기 모드 특성 탭의 표 「셀」 고르기(248차 — 247차 보고 (6))', () => {
  it('보기 모드: 셀 고르기는 열려 있어 고른 셀의 글을 보이고(기억함), 내용 칸·셀 편집 단추·다른 칸은 막힌 채 도면 그대로', async () => {
    const h = withTable(true);
    expect(h.cell().disabled).toBe(false);
    expect(h.cell().value).toBe('0,0');
    expect(h.content().value).toBe('공정 일정');
    expect(h.content().readOnly).toBe(true);
    expect(h.button('셀 편집...').disabled).toBe(true);
    // 보기 전용 표지가 없는 칸은 모두 막힌다(247차 그대로)
    const others = [...h.pal.el.querySelectorAll<HTMLElement>('.palette-body :is(input, textarea, select, button):not([data-display-only])')];
    expect(others.some((c) => c.tagName === 'SELECT')).toBe(true);
    for (const c of others) {
      if (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA') expect((c as HTMLInputElement).readOnly, c.dataset.field ?? c.tagName).toBe(true);
      else expect((c as HTMLButtonElement).disabled, c.dataset.field ?? c.textContent ?? c.tagName).toBe(true);
    }
    // 셀을 고르면 그 셀 글이 보이고 기억한다
    h.change(h.cell(), '2,0');
    expect(h.content().value).toBe('가');
    expect(h.content().readOnly).toBe(true);
    expect(sessionStorage.getItem(`opencad.tablecell.${h.handle}`)).toBe('2,0');
    // 내용 칸으로 온 고치기는 처리기에 닿지 않는다
    h.change(h.content(), 'X');
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('가');
    expect(h.st.session.undoTop()?.label).toBe('TABLE');
    // 다시 그려도 기억한 셀
    h.pal.refresh();
    expect(h.cell().value).toBe('2,0');
    expect(h.content().value).toBe('가');
    expect(h.cell().disabled).toBe(false);
  });

  it('그대로인 갈래: 편집 화면은 셀 고르기·내용 칸이 열려 있고 내용을 고치면 표가 바뀐다', async () => {
    const h = withTable(false);
    expect(h.cell().disabled).toBe(false);
    expect(h.content().readOnly).toBe(false);
    expect(h.button('셀 편집...').disabled).toBe(false);
    h.change(h.cell(), '2,0');
    expect(h.content().value).toBe('가');
    h.change(h.content(), '나');
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('나');
    expect(h.st.session.undoTop()?.label).toBe('TABLEDIT');
  });
});

describe('보기 모드 Enter·Space 직전 명령 반복(248차 — 247차 보고 (2))', () => {
  it('보기 모드는 보기 모드가 여는 명령(재기·점 좌표·전체 보기)만 반복하고 편집 명령은 돌리지 않는다, 편집 화면은 그대로', async () => {
    const h = setup();
    const ran: string[] = [];
    for (const n of ['LINE', 'ERASE', 'DIST', 'ID', 'ZOOMEXTENTS']) h.app.register({ name: n, title: n, run: () => void ran.push(n) });
    const run = async (n: string) => {
      await h.app.run(n);
      await settle();
    };
    const enter = async (key = 'Enter', o: KeyboardEventInit = {}) => {
      h.press(key, o);
      await settle();
    };
    // 편집 화면: Enter는 직전 명령 반복
    await run('LINE');
    await enter();
    expect(ran).toEqual(['LINE', 'LINE']);
    // 보기 모드: 편집 화면에서 쓴 선 그리기는 Enter·Space·Ctrl+J·명령행 빈 Enter 모두 다시 돌지 않는다
    h.app.setViewOnly(true);
    await enter();
    await enter(' ');
    await enter('j', { ctrlKey: true, code: 'KeyJ' });
    (h.cmd.host as unknown as { repeat(): void }).repeat();
    await settle();
    expect(ran).toEqual(['LINE', 'LINE']);
    // 보기 모드가 여는 명령은 반복한다
    await run('DIST');
    await enter();
    await enter(' ');
    await run('ID');
    await enter();
    await run('ZOOMEXTENTS');
    await enter();
    expect(ran.slice(2)).toEqual(['DIST', 'DIST', 'DIST', 'ID', 'ID', 'ZOOMEXTENTS', 'ZOOMEXTENTS']);
    // 편집 화면으로 돌아오면 그대로
    h.app.setViewOnly(false);
    await run('ERASE');
    await enter();
    expect(ran.slice(9)).toEqual(['ERASE', 'ERASE']);
  });
});
