// @vitest-environment jsdom
/**
 * 휴대폰 보기 모드에서 도면을 고치는 나머지 길(250차 — 247차 보고 (3)·(4)·(5)): 보기 모드는 보기·치수 확인 화면이라
 * 도면을 고치지 않는데(README 휴대폰 보기 절, 245~249차), 다음 길은 보기 모드에서도 도면을 고칠 수 있었다.
 * - (3) 키보드 Ctrl+Shift+L(도면층 상태 관리자)·Ctrl+2(디자인센터 — 다른 도면의 블록·스타일 넣기)·Ctrl+K(하이퍼링크 넣기):
 *   보기 모드는 아무것도 하지 않고 기본 동작도 막지 않는다(247차 Ctrl+X·V 꼴). Ctrl 표의 다른 키(계산기 등)는 그대로.
 * - (4) .scr·.lsp·.mnl 끌어 놓기·열기(파일 고르기·홈 화면 공유도 같은 길): 보기 모드는 스크립트·AutoLISP를 돌리지 않고 알린다. 도면 파일은 그대로 연다.
 * - (5) 응용프로그램 메뉴 「도면 특성…」은 읽기 전용(닫기만), 플롯 대화 상자는 「배치에 적용(U)」(페이지 설정 저장)을 두지 않는다 — 플롯(출력)은 그대로.
 * 편집 화면은 그대로다. 진짜 App, 화면·명령행·엔진·글꼴은 가짜(ctrlshift249.test.ts와 같은 틀).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerDwgProps } from '../../src/app/dwgprops';
import { registerPlotCommands } from '../../src/app/plot';
import { runScriptFile } from '../../src/app/dashcmds';
import { loadLispFile } from '../../src/app/lisp';
import { toast } from '../../src/app/ui/dom';
import { drawingProps } from '../../src/io/dwgprops';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/dashcmds', async (orig) => ({ ...(await orig<object>()), runScriptFile: vi.fn(async () => undefined) }));
vi.mock('../../src/app/lisp', async (orig) => ({ ...(await orig<object>()), loadLispFile: vi.fn(async () => undefined) }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

/** 보기 모드에서 스크립트·AutoLISP 파일을 받았을 때의 알림 */
const SCRIPT_NOTE = '휴대폰 보기 모드에서는 스크립트·AutoLISP 파일을 실행하지 않습니다. 편집 화면(제목 막대의 연필 단추)에서 여십시오.';

beforeEach(() => vi.clearAllMocks());
afterEach(() => document.body.replaceChildren());

/** 선 하나(도면층 0)를 둔 진짜 App */
function setup() {
  const h = makeApp();
  const e = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
  e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  h.st.session.commit({ label: 'LINE', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
  return { ...h, line: e.handle };
}

const dlg = () => document.querySelector('.dialog') as HTMLElement | null;
const dialogReady = (label: RegExp) => vi.waitFor(() => expect(dlg()?.getAttribute('aria-label')).toMatch(label));
const field = <T extends HTMLElement = HTMLInputElement>(aria: string) => dlg()!.querySelector(`[aria-label="${aria}"]`) as T;
const footer = () => [...dlg()!.querySelectorAll<HTMLButtonElement>('footer button')];
const footerLabels = () => footer().map((b) => b.textContent);
const press = (label: string) => footer().find((b) => b.textContent === label)!.click();
const bodyButton = (label: string) => [...dlg()!.querySelectorAll<HTMLButtonElement>('.body button')].find((b) => b.textContent === label)!;

describe('키보드 Ctrl+Shift+L·Ctrl+2·Ctrl+K(250차 — 247차 보고 (3))', () => {
  function keys() {
    const h = setup();
    const ran: string[] = [];
    for (const n of ['LAYERSTATE', 'ADCENTER', 'HYPERLINK', 'QUICKCALC', 'COPYCLIP']) h.app.register({ name: n, title: n, run: () => void ran.push(n) });
    const onKey = (h.app as unknown as { onKey(ev: KeyboardEvent): void }).onKey.bind(h.app);
    /** Ctrl+키를 누른다. 기본 동작을 막았는지 돌려준다 */
    const key = async (k: string, shift = false) => {
      let prevented = false;
      onKey({
        key: k,
        code: /^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`,
        ctrlKey: true,
        metaKey: false,
        shiftKey: shift,
        altKey: false,
        target: null,
        defaultPrevented: false,
        preventDefault() {
          prevented = true;
        },
      } as unknown as KeyboardEvent);
      await settle();
      return prevented;
    };
    h.app.setSelection([h.line], 'replace');
    return { ...h, ran, key };
  }

  it('편집 화면은 그대로: 도면층 상태 관리자·디자인센터·하이퍼링크 넣기·계산기', async () => {
    const h = keys();
    const prevented = [await h.key('L', true), await h.key('2'), await h.key('k'), await h.key('8')];
    expect(h.ran).toEqual(['LAYERSTATE', 'ADCENTER', 'HYPERLINK', 'QUICKCALC']);
    expect(prevented).toEqual([true, true, true, true]);
  });

  it('보기 모드: 셋은 아무것도 하지 않고 기본 동작도 막지 않는다(계산기·Ctrl+C 복사는 그대로), 편집 화면으로 돌아오면 다시 된다', async () => {
    const h = keys();
    h.app.setViewOnly(true);
    const prevented = [await h.key('L', true), await h.key('2'), await h.key('k'), await h.key('8'), await h.key('c')];
    expect(h.ran).toEqual(['QUICKCALC', 'COPYCLIP']);
    expect(prevented).toEqual([false, false, false, true, true]);
    h.app.setViewOnly(false);
    expect(await h.key('k')).toBe(true);
    expect(h.ran).toEqual(['QUICKCALC', 'COPYCLIP', 'HYPERLINK']);
  });
});

describe('스크립트·AutoLISP 파일(250차 — 247차 보고 (4))', () => {
  /** 셸 전체를 만들지 않고 파일 열기만(openFiles는 앱만 쓴다 — 끌어 놓기·파일 고르기·홈 화면 공유가 모두 이 길) */
  async function files() {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = setup();
    const opened: string[] = [];
    h.app.openFile = (async (name: string) => void opened.push(name)) as unknown as typeof h.app.openFile;
    const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app }) as unknown as { openFiles(files: File[]): Promise<void> };
    const file = (name: string) => ({ name, size: 4, arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as File;
    return { ...h, opened, open: (...names: string[]) => sh.openFiles(names.map(file)) };
  }

  it('보기 모드: .scr·.lsp·.mnl은 돌리지 않고 알리며 도면 파일은 그대로 연다, 편집 화면은 그대로 돌린다', async () => {
    const h = await files();
    h.app.setViewOnly(true);
    await h.open('a.scr', 'b.LSP', 'c.mnl', 'd.dxf');
    expect(runScriptFile).not.toHaveBeenCalled();
    expect(loadLispFile).not.toHaveBeenCalled();
    expect(vi.mocked(toast).mock.calls).toEqual([
      [SCRIPT_NOTE, 'warn'],
      [SCRIPT_NOTE, 'warn'],
      [SCRIPT_NOTE, 'warn'],
    ]);
    expect(h.opened).toEqual(['d.dxf']);
    h.app.setViewOnly(false);
    await h.open('a.scr', 'b.lsp');
    expect(runScriptFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runScriptFile).mock.calls[0]![1].name).toBe('a.scr');
    expect(loadLispFile).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(3);
  });

  it('알림 글은 네 언어 사전에 있다', () => {
    for (const lang of ['en', 'de', 'ja', 'zh-CN']) {
      const t = translate(SCRIPT_NOTE, lang);
      expect(t, lang).not.toBe(SCRIPT_NOTE);
      expect(t, lang).not.toMatch(/[가-힣]/);
    }
  });
});

describe('응용프로그램 메뉴의 도면 특성·플롯(250차 — 247차 보고 (5))', () => {
  it('도면 특성: 보기 모드는 읽기 전용(값은 보이고 글 칸 읽기 전용, 사용자 정의 추가·삭제 막힘, 닫기만 — 도면에 쓰지 않음), 편집 화면은 그대로', async () => {
    const h = setup();
    registerDwgProps(h.app);
    const top = h.st.session.undoTop()?.label;
    h.app.setViewOnly(true);
    let run = h.app.run('DWGPROPS');
    await dialogReady(/ 특성$/);
    for (const a of ['제목', '주제', '작성자', '키워드', '주석', '하이퍼링크 기준', '수정 번호', '이름', '값']) expect(field(a).readOnly, a).toBe(true);
    expect(bodyButton('추가·고치기(A)').disabled).toBe(true);
    expect(bodyButton('삭제(D)').disabled).toBe(true);
    // 탭은 그대로 바꿀 수 있다(값 보기)
    expect([...dlg()!.querySelectorAll<HTMLButtonElement>('[role=tab]')].map((b) => b.disabled)).toEqual([false, false, false, false]);
    expect(footerLabels()).toEqual(['닫기']);
    field('제목').value = 'X';
    press('닫기');
    await run;
    expect(drawingProps(h.doc).title).toBe('');
    expect(h.st.session.undoTop()?.label).toBe(top);
    // 편집 화면
    h.app.setViewOnly(false);
    run = h.app.run('DWGPROPS');
    await dialogReady(/ 특성$/);
    expect(field('제목').readOnly).toBe(false);
    expect(bodyButton('삭제(D)').disabled).toBe(false);
    expect(footerLabels()).toEqual(['취소', '확인']);
    field('제목').value = 'X';
    press('확인');
    await run;
    expect(drawingProps(h.doc).title).toBe('X');
    expect(h.st.session.undoTop()?.label).toBe('DWGPROPS');
  });

  it('플롯: 보기 모드는 「배치에 적용(U)」(페이지 설정 저장)을 두지 않고 나머지 단추는 그대로, 편집 화면은 그대로', async () => {
    const h = setup();
    registerPlotCommands(h.app);
    h.app.setViewOnly(true);
    let run = h.app.run('PLOT');
    await dialogReady(/^플롯$/);
    expect(footerLabels()).toEqual(['플롯 스타일 불러오기…', '취소', '확인']);
    press('취소');
    await run;
    h.app.setViewOnly(false);
    run = h.app.run('PLOT');
    await dialogReady(/^플롯$/);
    expect(footerLabels()).toEqual(['플롯 스타일 불러오기…', '배치에 적용(U)', '취소', '확인']);
    press('취소');
    await run;
  });
});
