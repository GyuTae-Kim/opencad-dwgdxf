// @vitest-environment jsdom
/**
 * 키보드로 누른 단추가 그 누름 때문에 막히거나(disabled) 숨거나(hidden) 문서에서 빠질 때의 초점(289차 — NC 120차와 같은 꼴, WCAG 2.4.3 초점 순서).
 * 초점이 있던 단추가 막히거나 숨으면 브라우저의 focus fixup이 초점을 문서(body)로 옮기고, 떼어 낸 단추도 초점을 잃어 키보드 사용자가 제자리를 잃었다.
 * jsdom은 막힘·숨김에는 fixup을 하지 않아(초점이 막힌·숨은 단추에 남음) 고치기 전 시험은 그 단추에 남은 초점으로, 떼어 낸 단추는 문서(body)로 실패를 본다.
 * 이제 누른 단추가 그렇게 되면 옮길 자리로: 도면 축척 편집 「위로·아래로 이동」(반대쪽 단추)·「삭제」(목록), 주석 객체 축척 「삭제」(목록),
 * 배치 마법사 「< 뒤로」(「다음 >」), 도면층 상태 관리자 「삭제」(「새로 만들기」), 시작 화면 최근 문서 「모두 지우기」·마지막 줄 ✕(「아직 연 문서가 없습니다」 줄).
 * 막히지 않으면(지울 수 있는 다음 축척, 첫 쪽이 아닌 「< 뒤로」, 남은 줄이 있는 ✕) 지금처럼 그 단추·남은 줄에 둔다.
 * 진짜 App·대화 상자, 화면·명령행·엔진·글꼴은 가짜(inputmode288 꼴), 셸은 시작 화면만 그린다(tabkeys259 꼴).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { objectScaleDialog, scaleListDialog } from '../../src/app/annoscale-ui';
import { registerFileLayoutCommands } from '../../src/app/filecmds-layout';
import { registerLayerStateCommands } from '../../src/app/layerstate';
import { saveLayerState, visibleStates } from '../../src/app/layerstate-core';
import { h as el } from '../../src/app/ui/dom';
import { makeApp, settle } from '../polish/real-app';
import { addModel, text } from '../annoscale/helpers';
import { annotate } from '../annoscale/ctxfix';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

// jsdom에는 캔버스 그리기가 없다(미리보기는 그리지 않고 넘어간다)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

afterEach(async () => {
  document.body.replaceChildren();
  await settle();
});

/** 지금 초점: 문서면 'body', 목록이면 'listbox', 최근 문서 열기 단추는 'button:<파일 이름>', 그 밖은 '<태그>:<글>' */
const where = () => {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body) return 'body';
  if (a.getAttribute('role') === 'listbox') return 'listbox';
  const name = a.querySelector('.recent-name');
  return `${a.tagName.toLowerCase()}:${((name ?? a).textContent ?? '').trim()}`;
};
const dlgOf = (title: string) => [...document.querySelectorAll<HTMLElement>('.dialog')].find((d) => d.getAttribute('aria-label') === title);
const btnOf = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;
/** 키보드로 누른 것처럼: 그 단추에 초점을 두고 누른다(Enter·Space가 보내는 click) */
const press = (b: HTMLElement) => {
  b.focus();
  b.click();
};

describe('누른 단추가 막히거나 숨거나 빠지면 초점을 옮긴다(289차)', () => {
  it('도면 축척 편집: 끝에 닿아 막힌 「위로·아래로 이동」은 반대쪽 단추로, 지운 뒤 막힌 「삭제」는 목록으로 — 막히지 않으면 그 단추에 남는다', async () => {
    const h = makeApp();
    const done = scaleListDialog(h.app, h.st);
    const d = dlgOf('도면 축척 편집')!;
    const items = () => [...d.querySelectorAll<HTMLElement>('.as-item')];
    const names = () => items().map((i) => (i.textContent ?? '').trim());
    expect([names().length, names()[0], names()[16]]).toEqual([17, '▶ 1:1', '100:1']);
    // 1:2를 맨 위로: 「위로 이동」이 막힌다 → 「아래로 이동」
    items()[1]!.click();
    press(btnOf(d, '위로 이동(U)'));
    expect([names().slice(0, 2), btnOf(d, '위로 이동(U)').disabled, where()]).toEqual([['1:2', '▶ 1:1'], true, 'button:아래로 이동(O)']);
    // 10:1을 맨 아래로: 「아래로 이동」이 막힌다 → 「위로 이동」
    items()[15]!.click();
    press(btnOf(d, '아래로 이동(O)'));
    expect([names().slice(15), btnOf(d, '아래로 이동(O)').disabled, where()]).toEqual([['100:1', '10:1'], true, 'button:위로 이동(U)']);
    // 맨 아래(10:1)를 지우면 새로 고른 100:1도 지울 수 있다 — 막히지 않아 「삭제」에 남는다(전후 같음)
    items()[16]!.click();
    press(btnOf(d, '삭제(D)'));
    expect([names().length, names()[15], btnOf(d, '삭제(D)').disabled, where()]).toEqual([16, '100:1', false, 'button:삭제(D)']);
    // 맨 위(1:2)를 지우면 새로 고른 1:1은 현재 축척이라 지울 수 없다 — 막힌 「삭제」 대신 목록
    items()[0]!.click();
    press(btnOf(d, '삭제(D)'));
    expect([names()[0], btnOf(d, '삭제(D)').disabled, where()]).toEqual(['▶ 1:1', true, 'listbox']);
    btnOf(d, '취소').click();
    await done;
  });

  it('주석 객체 축척: 고른 축척을 지우면 고른 것이 없어 막힌 「삭제」 대신 목록으로', async () => {
    const h = makeApp();
    const t = addModel(h.doc, h.st.session, text(0, 0, 2.5));
    annotate(h.doc, h.st.session, t, ['1:10', '1:20']);
    const done = objectScaleDialog(h.app, h.st, [t.handle]);
    const d = dlgOf('주석 객체 축척')!;
    const names = () => [...d.querySelectorAll<HTMLElement>('.as-item')].map((i) => (i.textContent ?? '').trim());
    expect([names(), btnOf(d, '삭제(D)').disabled]).toEqual([['1:10', '1:20'], true]);
    d.querySelector<HTMLElement>('.as-item')!.click();
    press(btnOf(d, '삭제(D)'));
    expect([names(), btnOf(d, '삭제(D)').disabled, where()]).toEqual([['1:20'], true, 'listbox']);
    btnOf(d, '취소').click();
    await done;
  });

  it('배치 마법사: 첫 쪽에 닿아 막힌 「< 뒤로」 대신 「다음 >」으로 — 첫 쪽이 아니면 「< 뒤로」에 남는다', async () => {
    const h = makeApp();
    registerFileLayoutCommands(h.app, (c) => h.app.register(c));
    const run = h.app.run('LAYOUTWIZARD');
    await vi.waitFor(() => expect(dlgOf('배치 작성 - 시작')).toBeTruthy());
    const d = dlgOf('배치 작성 - 시작')!;
    const title = () => d.querySelector('header h2')!.textContent;
    const back = btnOf(d, '< 뒤로');
    expect(back.disabled).toBe(true);
    btnOf(d, '다음 >').click();
    btnOf(d, '다음 >').click();
    expect(title()).toBe('배치 작성 - 용지 크기');
    press(back);
    expect([title(), back.disabled, where()]).toEqual(['배치 작성 - 프린터', false, 'button:< 뒤로']);
    press(back);
    expect([title(), back.disabled, where()]).toEqual(['배치 작성 - 시작', true, 'button:다음 >']);
    btnOf(d, '취소').click();
    await run;
  });

  it('도면층 상태 관리자: 지운 뒤 고른 상태가 없어 막힌 「삭제」 대신 「새로 만들기」로(묻는 상자가 닫히며 돌려주려던 초점)', async () => {
    const h = makeApp();
    registerLayerStateCommands(h.app);
    saveLayerState(h.app, 'S1');
    saveLayerState(h.app, 'S2');
    const run = h.app.run('LAYERSTATE');
    await vi.waitFor(() => expect(dlgOf('도면층 상태 관리자')).toBeTruthy());
    const d = dlgOf('도면층 상태 관리자')!;
    const row = [...d.querySelectorAll('tr')].find((tr) => tr.querySelector('td')?.textContent === 'S1')!;
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const del = btnOf(d, '삭제(D)');
    expect(del.disabled).toBe(false);
    press(del);
    await vi.waitFor(() => expect(dlgOf('도면층 상태')).toBeTruthy());
    btnOf(dlgOf('도면층 상태')!, '예(Y)').click();
    await settle();
    expect([visibleStates(h.doc).map((s) => s.key), del.disabled, where()]).toEqual([['S2'], true, 'button:새로 만들기(N)...']);
    btnOf(d, '닫기(C)').click();
    await run;
  });

  it('시작 화면 최근 문서: 다 지워 숨은 「모두 지우기」·빠진 마지막 줄 ✕ 대신 「아직 연 문서가 없습니다」 줄로 — 남은 줄이 있으면 지금처럼 그 줄로', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = makeApp();
    const now = Date.now();
    const two = () => [
      { id: 'a', name: 'a.dxf', size: 10, time: now },
      { id: 'b', name: 'b.dxf', size: 20, time: now },
    ];
    let rows = two();
    const recent = {
      list: async () => rows,
      clear: async () => void (rows = []),
      remove: async (id: string) => void (rows = rows.filter((r) => r.id !== id)),
    };
    const start = el('div', {}) as HTMLDivElement;
    const clear = el('button', { type: 'button', class: 'recent-clear', hidden: true }, '모두 지우기') as HTMLButtonElement;
    document.body.append(start);
    // 셸 전체를 만들지 않고 시작 화면만 그린다(최근 문서 저장소는 가짜)
    const sh = Object.assign(Object.create(Shell.prototype) as object, {
      app: h.app,
      root: el('div', {}),
      start,
      guide: null,
      recent,
      recentList: el('ul', { class: 'recent' }),
      recentClear: clear,
      recentSeq: 0,
      startError: el('div', { class: 'start-error', hidden: true }),
    }) as unknown as { buildStart(): void; refreshRecent(): Promise<void> };
    sh.buildStart();
    await sh.refreshRecent();
    const opens = () => [...start.querySelectorAll<HTMLElement>('.recent-open')];
    const dels = () => [...start.querySelectorAll<HTMLButtonElement>('.recent-del')];
    expect([opens().length, clear.hidden]).toEqual([2, false]);
    // 둘째 줄 ✕: 남은 첫 줄의 열기 단추로(지금 꼴 그대로)
    press(dels()[1]!);
    await settle();
    expect([opens().length, where()]).toEqual([1, 'button:a.dxf']);
    // 남은 줄 ✕: 목록이 비어 그 단추가 빠진다 — 「아직 연 문서가 없습니다」 줄로
    press(dels()[0]!);
    await settle();
    expect([opens().length, clear.hidden, where()]).toEqual([0, true, 'li:아직 연 문서가 없습니다.']);
    // 다시 둘 → 「모두 지우기」: 숨은 그 단추 대신 같은 줄로
    rows = two();
    await sh.refreshRecent();
    expect([opens().length, clear.hidden]).toEqual([2, false]);
    press(clear);
    await settle();
    expect([opens().length, clear.hidden, where()]).toEqual([0, true, 'li:아직 연 문서가 없습니다.']);
  });
});
