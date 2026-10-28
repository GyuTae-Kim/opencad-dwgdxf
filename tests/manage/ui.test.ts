// @vitest-environment jsdom
/**
 * 대화상자 흐름 연기 시험(jsdom): 열리고, 칸을 고치고, 확인하면 도면이 바뀌는지.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, DictionaryObject } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerSysvarCommands } from '../../src/app/sysvars';
import { registerDwgProps } from '../../src/app/dwgprops';
import { registerOptions } from '../../src/app/options';
import { registerAliasEdit } from '../../src/app/aliasedit';
import { drawingProps } from '../../src/io/dwgprops';
import { browserSysvar, browserSysvarText, setBrowserSysvar, setBrowserSysvarText } from '../../src/app/sysvars';
import { registerDraftingCommands } from '../../src/app/drafting';
import { prefSet } from '../../src/app/mgr-ui';
import { makeHarness } from '../cmds2/harness';
import { line } from '../edit/make';

// jsdom에는 캔버스가 없다(블록 미리보기는 그리지 않고 넘어간다)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

const tick = () => new Promise((r) => setTimeout(r, 0));
const dlg = () => document.querySelector('.dialog') as HTMLElement;
// Commands can await dynamically imported modules before opening their dialog.
const dialogReady = (label: string) => vi.waitFor(() => expect(dlg()?.getAttribute('aria-label')).toBe(label));
const input = (aria: string) => dlg().querySelector(`[aria-label="${aria}"]`) as HTMLInputElement;
const ok = () => (dlg().querySelector('footer .btn.primary') as HTMLButtonElement).click();
const button = (label: string) => [...dlg().querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

afterEach(() => document.body.replaceChildren());

describe('대화상자 연기 시험', () => {
  it('BLOCK: 미리 고른 객체로 이름만 바꿔 확인하면 블록이 생긴다', async () => {
    const h = makeHarness();
    registerBlockCommands(h.app);
    const l = h.add(line(0, 0, 5, 0));
    h.st.selection.add(l.handle);
    const run = h.run('BLOCK', []);
    await tick();
    expect(dlg().getAttribute('aria-label')).toBe('블록 정의');
    input('이름').value = '문';
    ok();
    await run;
    expect(h.doc.blocks.get('문')?.entities.length).toBe(1);
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities.some((e) => e.type === 'INSERT')).toBe(true);
  });

  it('DWGPROPS: 요약 탭 제목을 고치면 도면 특성에 들어간다', async () => {
    const h = makeHarness((d) => {
      const root: DictionaryObject = { type: 'DICTIONARY', handle: 'C', entries: new Map(), hardOwner: false, cloning: 1 };
      d.objects.set('C', root);
      d.rootDictionary = 'C';
    });
    registerDwgProps(h.app);
    const run = h.run('DWGPROPS', []);
    await tick();
    input('제목').value = '연기 시험';
    input('키워드').value = 'a, b';
    ok();
    await run;
    expect(drawingProps(h.doc)).toMatchObject({ title: '연기 시험', keywords: 'a, b' });
  });

  it('SYSVDLG: 목록에서 고르고 값 설정', async () => {
    const h = makeHarness((d) => d.header.set('$PDMODE', 0));
    registerSysvarCommands(h.app);
    const run = h.run('SYSVDLG', []);
    await tick();
    const search = input('검색');
    search.value = 'PDMODE';
    search.dispatchEvent(new Event('input'));
    const row = [...dlg().querySelectorAll('tbody tr')].find((tr) => tr.firstElementChild?.textContent === 'PDMODE') as HTMLElement;
    row.click();
    input('값').value = '3';
    button('값 설정').click();
    expect(h.doc.header.get('$PDMODE')).toBe(3);
    ok();
    await run;
  });

  it('OPTIONS: 그립 크기를 바꿔 확인', async () => {
    const h = makeHarness();
    registerOptions(h.app);
    const run = h.run('OPTIONS', []);
    await tick();
    input('그립 크기').value = '9';
    ok();
    await run;
    expect(browserSysvar('GRIPSIZE')).toBe(9);
  });

  it('ALIASEDIT: 별칭을 더하면 별칭 표에 들어간다', async () => {
    const h = makeHarness();
    const aliases = new Map<string, string>([['L', 'LINE']]);
    Object.assign(h.app, {
      aliasEntries: () => [...aliases],
      setAlias: (a: string, n: string | null) => (n ? aliases.set(a, n) : aliases.delete(a)),
      findCommand: (n: string) => h.app.commands.get(n.toUpperCase()),
    });
    h.app.register({ name: 'LINE', title: '선', run: () => {} });
    registerAliasEdit(h.app);
    const run = h.run('ALIASEDIT', []);
    await tick();
    input('별칭').value = 'LL';
    input('명령').value = 'line';
    button('추가·편집').click();
    ok();
    await run;
    expect(aliases.get('LL')).toBe('LINE');
  });
});

describe('극좌표 추적 설정 연기 시험(POLARMODE·POLARANG·POLARADDANG — 이 브라우저)', () => {
  afterEach(() => {
    for (const n of ['POLARMODE', 'POLARANG', 'POLARADDANG']) prefSet(`opencad.sysvar.${n}`, null);
  });

  /** 극좌표·객체 스냅 추적 켜기·끄기만 흉내 낸 앱 */
  function draftingHarness(setup?: (d: CadDocument) => void) {
    const h = makeHarness(setup);
    const on = { polar: true, otrack: true };
    Object.assign(h.app, {
      get polarOn() {
        return on.polar;
      },
      get otrackOn() {
        return on.otrack;
      },
      togglePolar: () => void (on.polar = !on.polar),
      toggleOtrack: () => void (on.otrack = !on.otrack),
      ui: { setBusy() {}, refreshStatus() {} },
    });
    registerDraftingCommands(h.app);
    return { h, on };
  }
  const listbox = () => input('추가 각도 목록') as unknown as HTMLElement;
  /** 추가 각도 목록에 보이는 칸과 고른 칸 */
  const items = () => [...listbox().querySelectorAll('[role=option]')].map((o) => (o.getAttribute('aria-selected') === 'true' ? `[${o.textContent}]` : o.textContent));
  const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const status = () => dlg().querySelector('.polar-add-msg')?.textContent ?? '';

  it('DSETTINGS 극좌표 추적 탭: 증분 각도는 목록에서 고르거나 치고, 추가 각도는 목록과 새로 만들기·삭제, 추적 방식·각도 측정을 고르면 이 브라우저에(8은 그대로)', async () => {
    setBrowserSysvar('POLARMODE', 8);
    const { h, on } = draftingHarness();
    const run = h.run('DSETTINGS', [], 'P');
    await dialogReady('제도 설정 - 극좌표 추적');
    const inc = input('증분 각도');
    expect(inc.value).toBe('90');
    const list = document.getElementById(inc.getAttribute('list') ?? '');
    expect([...(list?.querySelectorAll('option') ?? [])].map((o) => (o as HTMLOptionElement).value)).toEqual(['90', '45', '30', '22.5', '18', '15', '10', '5']);
    expect([input('추가 각도').checked, items(), listbox().getAttribute('role')]).toEqual([false, [], 'listbox']);
    expect([button('새로 만들기').getAttribute('aria-label'), button('삭제').getAttribute('aria-label'), button('삭제').disabled]).toEqual(['추가 각도 새로 만들기', '추가 각도 삭제', true]);
    expect([(input('객체 스냅 추적 설정') as unknown as HTMLSelectElement).value, (input('극좌표 각도 측정') as unknown as HTMLSelectElement).value]).toEqual(['0', '0']);
    // 잘못된 값은 알리고 상자를 닫지 않는다
    inc.value = '0';
    ok();
    expect(dlg().querySelector('.form-error')?.textContent).toBe('증분 각도는 0.1과(와) 360 사이의 각도여야 합니다.');
    inc.value = '7.5';
    // 새로 만들기 → 새 각도 칸에 치고 Enter로 넣는다(넣은 칸을 고르고 목록에 초점)
    const edit = input('새 추가 각도');
    expect(edit.hidden).toBe(true);
    button('새로 만들기').click();
    expect([edit.hidden, document.activeElement === edit]).toEqual([false, true]);
    edit.value = '75';
    key(edit, 'Enter');
    expect([items(), edit.hidden, document.activeElement === listbox(), listbox().getAttribute('aria-activedescendant')]).toEqual([['[75]'], true, true, listbox().querySelector('[role=option]')!.id]);
    // 못 읽는 글·같은 방향(435 = 75)은 알리고 칸에 남긴다
    button('새로 만들기').click();
    edit.value = '1,5';
    key(edit, 'Enter');
    expect([status(), edit.hidden, items()]).toEqual(['"1,5"을(를) 각도로 읽을 수 없습니다.', false, ['[75]']]);
    edit.value = '435';
    key(edit, 'Enter');
    expect([status(), items()]).toEqual(['추가 각도 75은(는) 이미 목록에 있습니다.', ['[75]']]);
    edit.value = ' 10 ';
    key(edit, 'Enter');
    expect([items(), status()]).toEqual([['75', '[10]'], '']);
    // Esc는 새 각도만 그만둔다(상자는 그대로)
    button('새로 만들기').click();
    edit.value = '20';
    key(edit, 'Escape');
    expect([edit.hidden, items(), !!dlg()]).toEqual([true, ['75', '[10]'], true]);
    // 글을 남긴 채 확인: 못 읽으면 상자를 닫지 않는다
    button('새로 만들기').click();
    edit.value = 'x';
    ok();
    expect([dlg().querySelector('.form-error')?.textContent, !!dlg()]).toEqual(['"x"을(를) 각도로 읽을 수 없습니다.', true]);
    edit.value = '';
    input('추가 각도').checked = true;
    (input('객체 스냅 추적 설정') as unknown as HTMLSelectElement).value = '1';
    (input('극좌표 각도 측정') as unknown as HTMLSelectElement).value = '1';
    input('극좌표 추적 켜기 (F10)').checked = false;
    ok();
    await run;
    expect([browserSysvar('POLARANG'), browserSysvarText('POLARADDANG'), browserSysvar('POLARMODE'), on.polar, on.otrack]).toEqual([7.5, '75;10', 15, false, true]);
    // 다시 열면 저장한 값. 목록에서 Delete로 지운다(다음 칸을 고른다), 마지막을 지우면 새로 만들기에 초점
    const again = h.run('DSETTINGS', [], 'P');
    await dialogReady('제도 설정 - 극좌표 추적');
    expect([input('증분 각도').value, input('추가 각도').checked, items(), (input('극좌표 각도 측정') as unknown as HTMLSelectElement).value]).toEqual(['7.5', true, ['[75]', '10'], '1']);
    listbox().focus();
    key(listbox(), 'ArrowDown');
    expect(items()).toEqual(['75', '[10]']);
    key(listbox(), 'Home');
    key(listbox(), 'Delete');
    expect(items()).toEqual(['[10]']);
    button('삭제').click();
    expect([items(), button('삭제').disabled, document.activeElement === button('새로 만들기')]).toEqual([[], true, true]);
    (input('극좌표 각도 측정') as unknown as HTMLSelectElement).value = '0';
    input('추가 각도').checked = false;
    ok();
    await again;
    expect([browserSysvar('POLARMODE'), browserSysvarText('POLARADDANG')]).toEqual([10, '']);
  });

  it('추가 각도는 10개까지: 열째를 넣으면 새로 만들기를 막고 알린다, 지우면 다시 된다(Insert로도 새로 만들기, 치던 각도는 새로 만들기에 먼저 넣는다)', async () => {
    setBrowserSysvarText('POLARADDANG', '1;2;3;4;5;6;7;8;9');
    const { h } = draftingHarness();
    const run = h.run('DSETTINGS', [], 'P');
    await dialogReady('제도 설정 - 극좌표 추적');
    expect(items()).toHaveLength(9);
    listbox().focus();
    key(listbox(), 'Insert');
    const edit = input('새 추가 각도');
    expect(document.activeElement).toBe(edit);
    edit.value = '10';
    // 치던 각도가 있는 채 새로 만들기를 누르면 먼저 넣는다(10개가 차서 새 칸은 열지 않는다)
    button('새로 만들기').click();
    expect([items().length, button('새로 만들기').disabled, edit.hidden, status(), document.activeElement === listbox()]).toEqual([10, true, true, '추가 각도는 10개까지입니다.', true]);
    key(listbox(), 'Insert');
    expect([edit.hidden, status()]).toEqual([true, '추가 각도는 10개까지입니다.']);
    key(listbox(), 'Backspace');
    expect([items().length, button('새로 만들기').disabled]).toEqual([9, false]);
    ok();
    await run;
    expect(browserSysvarText('POLARADDANG')).toBe('1;2;3;4;5;6;7;8;9');
  });

  it('도면의 각도 단위(AUNITS·AUPREC)로 보이고 그 단위로 받는다 — 저장은 도, 고치지 않은 증분 각도는 저장값 그대로', async () => {
    // 도/분/초(AUNITS 1, AUPREC 0)
    setBrowserSysvar('POLARANG', 22.5);
    setBrowserSysvarText('POLARADDANG', '10;100.25');
    const dms = draftingHarness((d) => {
      d.header.set('$AUNITS', 1);
      d.header.set('$AUPREC', 0);
    });
    let run = dms.h.run('DSETTINGS', [], 'P');
    await dialogReady('제도 설정 - 극좌표 추적');
    const inc = input('증분 각도');
    expect(inc.value).toBe("22d30'");
    expect([...document.getElementById(inc.getAttribute('list')!)!.querySelectorAll('option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['90d', '45d', '30d', "22d30'", '18d', '15d', '10d', '5d']);
    expect(items()).toEqual(['[10d]', "100d15'"]);
    button('새로 만들기').click();
    const edit = input('새 추가 각도');
    edit.value = '-30';
    key(edit, 'Enter');
    expect([items(), status()]).toEqual([['10d', "100d15'", '[330d]'], '-30을(를) 같은 방향인 330d(으)로 넣었습니다(추가 각도는 0 이상 360 미만).']);
    button('새로 만들기').click();
    edit.value = 'N 45d W';
    key(edit, 'Enter');
    expect(items().at(-1)).toBe('[135d]');
    inc.value = '400';
    ok();
    expect(dlg().querySelector('.form-error')?.textContent).toBe("증분 각도는 0d6'과(와) 360d 사이의 각도여야 합니다.");
    inc.value = "7d30'";
    ok();
    await run;
    expect([browserSysvar('POLARANG'), browserSysvarText('POLARADDANG')]).toEqual([7.5, '10;100.25;330;135']);
    // 라디안(AUNITS 3, AUPREC 2): 단위 표시 없는 수는 라디안. 고치지 않은 증분 각도는 보이는 자릿수로 바뀌지 않는다
    setBrowserSysvar('POLARANG', 33.3333333);
    const rad = draftingHarness((d) => {
      d.header.set('$AUNITS', 3);
      d.header.set('$AUPREC', 2);
    });
    run = rad.h.run('DSETTINGS', [], 'P');
    await dialogReady('제도 설정 - 극좌표 추적');
    expect([input('증분 각도').value, items()[0]]).toEqual(['0.5817764r', '[0.17453293r]']);
    ok();
    await run;
    expect(browserSysvar('POLARANG')).toBe(33.3333333);
    run = rad.h.run('DSETTINGS', [], 'P');
    await dialogReady('제도 설정 - 극좌표 추적');
    input('증분 각도').value = '0.5';
    ok();
    await run;
    expect(browserSysvar('POLARANG')).toBeCloseTo(28.64788976, 7);
  });

  it('OPTIONS 제도 탭의 정렬점 획득: Shift 키를 눌러 획득은 POLARMODE 8만 바꾼다', async () => {
    setBrowserSysvar('POLARMODE', 5);
    const h = makeHarness();
    registerOptions(h.app);
    const run = h.run('OPTIONS', []);
    await tick();
    const acq = input('정렬점 획득') as unknown as HTMLSelectElement;
    expect(acq.value).toBe('auto');
    acq.value = 'shift';
    ok();
    await run;
    expect(browserSysvar('POLARMODE')).toBe(13);
    const again = h.run('OPTIONS', []);
    await tick();
    expect((input('정렬점 획득') as unknown as HTMLSelectElement).value).toBe('shift');
    (input('정렬점 획득') as unknown as HTMLSelectElement).value = 'auto';
    ok();
    await again;
    expect(browserSysvar('POLARMODE')).toBe(5);
  });
});

describe('페이지 설정 관리자 연기 시험', () => {
  it('새로 만들기 → 페이지 설정 → 닫기: 모형용 명명된 페이지 설정이 생기고 현재로 설정할 수 있다', async () => {
    const { createNewDocument } = await import('../../src/core/newdoc');
    const { registerLayoutCommands } = await import('../../src/app/layoutcmds');
    const { namedPageSetups } = await import('../../src/edit/script/pagesetup');
    const h = makeHarness((d) => Object.assign(d, createNewDocument('metric')));
    registerLayoutCommands(h.app);
    const run = h.run('PAGESETUP', []);
    await tick();
    expect(dlg().getAttribute('aria-label')).toBe('페이지 설정 관리자');
    button('새로 만들기(N)...').click();
    await tick();
    expect(dlg().getAttribute('aria-label')).toBe('새 페이지 설정');
    input('새 페이지 설정 이름(N)').value = 'A1 출력';
    ok();
    await tick();
    expect(dlg().getAttribute('aria-label')).toBe('페이지 설정 - A1 출력');
    (input('용지 크기') as unknown as HTMLSelectElement).value = 'A1';
    ok();
    await tick();
    await tick();
    expect(dlg().getAttribute('aria-label')).toBe('페이지 설정 관리자');
    const items = namedPageSetups(h.doc).items;
    expect(items.map((x) => [x.name, x.model])).toEqual([['A1 출력', true]]);
    // 목록에서 골라 현재로 설정
    const rowEl = [...dlg().querySelectorAll('tbody tr')].find((tr) => tr.textContent === 'A1 출력') as HTMLElement;
    rowEl.click();
    button('현재로 설정(S)').click();
    await tick();
    await tick();
    ok();
    await run;
    const model = h.doc.layouts.find((l) => l.blockName.toUpperCase() === MODEL_SPACE)!;
    expect(model.plot.pageSetupName).toBe('A1 출력');
    expect(Math.max(model.plot.paperWidth, model.plot.paperHeight)).toBe(841);
  });
});

describe('PLOT 대화상자 연기 시험', () => {
  it('배치에 적용(U)은 모형 탭의 페이지 설정으로 저장하고 대화상자를 다시 연다', async () => {
    const { createNewDocument } = await import('../../src/core/newdoc');
    const { registerPlotCommands } = await import('../../src/app/plot');
    const h = makeHarness((d) => Object.assign(d, createNewDocument('metric')));
    registerPlotCommands(h.app);
    const run = h.run('PLOT', []);
    await dialogReady('플롯');
    expect(dlg().getAttribute('aria-label')).toBe('플롯');
    (input('용지 크기') as unknown as HTMLSelectElement).value = 'A2';
    input('매수').value = '2';
    const previousDialog = dlg();
    button('배치에 적용(U)').click();
    await vi.waitFor(() => expect(dlg()).not.toBe(previousDialog));
    await dialogReady('플롯');
    expect(dlg().getAttribute('aria-label')).toBe('플롯');
    const model = h.doc.layouts.find((l) => l.blockName.toUpperCase() === MODEL_SPACE)!;
    expect(Math.max(model.plot.paperWidth, model.plot.paperHeight)).toBe(594);
    expect(input('매수').value).toBe('2');
    button('취소').click();
    await run;
    h.st.session.undo();
    expect(Math.max(h.doc.layouts.find((l) => l.blockName.toUpperCase() === MODEL_SPACE)!.plot.paperWidth, 0)).not.toBe(594);
  });
});

describe('INSERT·ATTDEF·EATTEDIT 연기 시험', () => {
  it('ATTDEF → BLOCK → INSERT(대화상자, 속성 대화상자) → EATTEDIT 값·높이 바꾸기', async () => {
    const h = makeHarness();
    registerBlockCommands(h.app);
    // ATTDEF: 태그·기본값, 화면에서 시작점
    let run = h.run('ATTDEF', [{ click: [0, 0] }]);
    await dialogReady('속성 정의');
    expect(dlg().getAttribute('aria-label')).toBe('속성 정의');
    input('태그').value = 'no';
    input('기본값').value = '1';
    ok();
    await run;
    const att = h.doc.blocks.get(MODEL_SPACE)!.entities.find((e) => e.type === 'ATTDEF')!;
    expect((att as { tag: string }).tag).toBe('NO');
    // 두 번째 ATTDEF는 이전 속성 정의 아래(점을 묻지 않는다)
    run = h.run('ATTDEF', []);
    await dialogReady('속성 정의');
    expect(input('이전 속성 정의 아래에 정렬').checked).toBe(true);
    input('태그').value = 'name';
    ok();
    await run;
    const atts = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'ATTDEF') as { insert: { y: number }; tag: string }[];
    expect(atts[1]!.insert.y).toBeLessThan(atts[0]!.insert.y);
    // BLOCK
    for (const a of h.doc.blocks.get(MODEL_SPACE)!.entities) h.st.selection.add(a.handle);
    run = h.run('BLOCK', []);
    await dialogReady('블록 정의');
    input('이름').value = 'TAG';
    ok();
    await run;
    // INSERT: 대화상자 확인 → 삽입점 → 속성 대화상자
    run = h.run('INSERT', [{ click: [50, 50] }]);
    await dialogReady('삽입');
    expect(dlg().getAttribute('aria-label')).toBe('삽입');
    ok();
    await dialogReady('속성 편집');
    expect(dlg().getAttribute('aria-label')).toBe('속성 편집');
    input('NO').value = '7';
    ok();
    await run;
    const ins = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'INSERT').at(-1) as { handle: string; attribs: { text: string; height: number }[] };
    expect(ins.attribs.map((a) => a.text)).toEqual(['7', '']);
    // EATTEDIT
    run = h.run('EATTEDIT', [{ pick: ins.handle, at: [50, 50] }]);
    await tick();
    input('값').value = '8';
    input('높이').value = '5';
    ok();
    await run;
    const after = h.doc.entityIndex.get(ins.handle) as unknown as { attribs: { text: string; height: number }[] };
    expect(after.attribs[0]).toMatchObject({ text: '8', height: 5 });
  });
});
