// @vitest-environment jsdom
/**
 * 음수를 받는 칸의 휴대폰 소수 자판(288차 — STEP 123차·NC 119차와 같은 꼴).
 * inputmode="decimal" 소수 자판은 음수 기호를 약속하지 않는다(HTML inputmode — 기기에 따라 음수 기호가 있을 수도 없을 수도 있음).
 * 그래서 휴대폰·태블릿에서 음수를 쳐야 하는 칸 — 좌표(삽입점·기준점·플롯 간격띄우기), 회전·기울기 각도, 축척(음수 = 거울), 배열 간격·채울 각도,
 * 해치 각도, 플롯 스탬프 간격띄우기, 선가중치(−1 도면층별·−2 블록별·−3 기본값), 치수 중심 표식(음수 = 중심선)·측정 축척 비율(음수 = 도면 공간)·
 * 공차 위·아래 값, 원호 정렬 문자의 문자 간격·호에서 간격띄우기 — 에 음수를 넣지 못할 수 있었다.
 * 이제 그 칸은 inputmode를 두지 않고(칸은 type="text" 그대로 — 브라우저가 일반 글 자판을 띄움), 0보다 큰 값·0 이상만 받는 칸(높이·폭 비율·
 * 크기·간격·배율)은 소수 자판 그대로다. 값·검사는 그대로(음수 칸에 친 −값이 그대로 들어감).
 * 진짜 App, 화면·명령행·엔진·글꼴은 가짜(tabkeys260·insert-attdef-elev207·annotedit/styles 꼴).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArcEntity, Entity } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { numIn } from '../../src/app/mgr-ui';
import { form } from '../../src/app/ui/dom';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerDimStyleCommands } from '../../src/app/dimstyle';
import { registerPlotStampCommand } from '../../src/app/filecmds-stamp';
import { registerArcTextCommands } from '../../src/app/arctext';
import { textStyleDialog } from '../../src/app/textedit/styledlg';
import { TextEditor, activeEditor } from '../../src/app/textedit/editor';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

// jsdom에는 캔버스 그리기가 없다(미리보기는 그리지 않고 넘어간다)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

afterEach(async () => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
  await settle();
});

const NONE = '없음';
/** 칸의 inputmode(속성이 없으면 '없음', 칸이 없으면 '칸 없음') */
const mode = (el: Element | null | undefined) => (el ? (el.getAttribute('inputmode') ?? NONE) : '칸 없음');
/** 이름(aria-label)마다 그 입력 칸의 inputmode */
const modes = (box: ParentNode, names: string[]) => Object.fromEntries(names.map((n) => [n, mode(box.querySelector(`input[aria-label="${n}"]`))]));
const dlgOf = (title: string) => [...document.querySelectorAll<HTMLElement>('.dialog')].find((d) => d.getAttribute('aria-label') === title);
/** 상자 아래 단추 누르기(머리의 닫기 아이콘은 빼고) */
const press = (d: HTMLElement, label: string) => ([...d.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent === label) as HTMLButtonElement).click();

describe('음수를 받는 칸은 소수 자판을 두지 않는다(288차)', () => {
  it('공용 칸: 관리 대화 상자 numIn·양식 form의 숫자 칸 — signed면 inputmode 없음, 아니면 소수 자판. 음수 칸에 친 값은 그대로', async () => {
    const a = numIn(2.5, '높이');
    const b = numIn(-3, 'X', true);
    expect([a.type, mode(a), b.type, mode(b), b.value]).toEqual(['text', 'decimal', 'text', NONE, '-3']);
    const p = form('시험', [
      { key: 'h', label: '높이', type: 'number', value: 1 },
      { key: 'a', label: '각도(도)', type: 'number', value: 0, signed: true },
      { key: 't', label: '이름', type: 'text', value: 'x' },
    ]);
    const d = dlgOf('시험')!;
    expect(modes(d, ['높이', '각도(도)', '이름'])).toEqual({ 높이: 'decimal', '각도(도)': NONE, 이름: NONE });
    (d.querySelector('input[aria-label="각도(도)"]') as HTMLInputElement).value = '-30';
    press(d, '확인');
    expect(await p).toEqual({ h: 1, a: -30, t: 'x' });
  });

  it('ATTDEF·INSERT 대화 상자: 삽입점 X·Y·Z·축척 X·Y·Z(음수 = 거울)·회전 각도는 inputmode 없음, 문자 높이는 소수 자판', async () => {
    const h = makeApp();
    registerBlockCommands(h.app);
    const s = h.st.session;
    const line = { ...entityDefaults(), type: 'LINE', handle: s.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } } as Entity;
    h.doc.blocks.set('B1', { name: 'B1', handle: s.newHandle(), recordHandle: s.newHandle(), basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [line] });
    const att = h.app.run('ATTDEF');
    await vi.waitFor(() => expect(dlgOf('속성 정의')).toBeTruthy());
    expect(modes(dlgOf('속성 정의')!, ['X', 'Y', 'Z', '문자 높이', '회전'])).toEqual({ X: NONE, Y: NONE, Z: NONE, '문자 높이': 'decimal', 회전: NONE });
    press(dlgOf('속성 정의')!, '취소');
    await att;
    await settle();
    const ins = h.app.run('INSERT');
    await vi.waitFor(() => expect(dlgOf('삽입')).toBeTruthy());
    const names = ['삽입점 X', '삽입점 Y', '삽입점 Z', '축척 X', '축척 Y', '축척 Z', '각도'];
    expect(modes(dlgOf('삽입')!, names)).toEqual(Object.fromEntries(names.map((n) => [n, NONE])));
    press(dlgOf('삽입')!, '취소');
    await ins;
  });

  it('PLOTSTAMP(양식 form): X·Y 간격띄우기(음수 = 모서리 바깥쪽)는 inputmode 없음, 문자 높이는 소수 자판', async () => {
    const h = makeApp();
    registerPlotStampCommand(h.app, (c) => h.app.register(c));
    const run = h.app.run('PLOTSTAMP');
    await vi.waitFor(() => expect(dlgOf('플롯 스탬프')).toBeTruthy());
    expect(modes(dlgOf('플롯 스탬프')!, ['X 간격띄우기(mm)', 'Y 간격띄우기(mm)', '문자 높이(mm)'])).toEqual({ 'X 간격띄우기(mm)': NONE, 'Y 간격띄우기(mm)': NONE, '문자 높이(mm)': 'decimal' });
    press(dlgOf('플롯 스탬프')!, '취소');
    await run;
  });

  it('STYLE 대화 상자: 기울기 각도(−85~85)는 inputmode 없음, 높이·폭 비율은 소수 자판', async () => {
    const h = makeApp();
    const done = textStyleDialog(h.app);
    const d = dlgOf('문자 스타일')!;
    expect(modes(d, ['높이', '폭 비율', '기울기 각도'])).toEqual({ 높이: 'decimal', '폭 비율': 'decimal', '기울기 각도': NONE });
    press(d, '닫기');
    await done;
  });

  it('DIMSTYLE 수정 대화 상자: 선가중치(−1 도면층별·−2 블록별)·중심 표식(음수 = 중심선)·측정 축척 비율·공차 위·아래 값은 inputmode 없음, 크기·간격·높이·정밀도는 소수 자판', async () => {
    const h = makeApp();
    registerDimStyleCommands(h.app);
    void h.app.run('DIMSTYLE');
    await settle();
    ([...document.querySelectorAll<HTMLButtonElement>('.dialog button')].find((b) => b.textContent === '수정...') as HTMLButtonElement).click();
    await settle();
    const dlg = [...document.querySelectorAll<HTMLElement>('.dialog')].find((d) => d.getAttribute('aria-label')?.startsWith('치수 스타일 수정'))!;
    /** 탭을 고르고(쪽을 다시 그림) 그 쪽 칸들의 inputmode */
    const tab = (t: string, names: string[]) => {
      ([...dlg.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => b.textContent === t) as HTMLButtonElement).click();
      return modes(dlg, names);
    };
    expect(tab('선', ['치수선 선가중치(mm, -1 도면층별·-2 블록별)', '치수보조선 선가중치(mm)', '눈금 너머로 연장', '원점에서 간격띄우기'])).toEqual({
      '치수선 선가중치(mm, -1 도면층별·-2 블록별)': NONE,
      '치수보조선 선가중치(mm)': NONE,
      '눈금 너머로 연장': 'decimal',
      '원점에서 간격띄우기': 'decimal',
    });
    expect(tab('기호 및 화살표', ['중심 표식(양수 표식, 음수 선, 0 없음)', '화살표 크기', '꺾기 각도(도)'])).toEqual({
      '중심 표식(양수 표식, 음수 선, 0 없음)': NONE,
      '화살표 크기': 'decimal',
      '꺾기 각도(도)': 'decimal',
    });
    expect(tab('문자', ['치수선에서 간격띄우기', '문자 높이'])).toEqual({ '치수선에서 간격띄우기': 'decimal', '문자 높이': 'decimal' });
    expect(tab('1차 단위', ['측정 축척 비율', '반올림', '정밀도(소수 자릿수)'])).toEqual({ '측정 축척 비율': NONE, 반올림: 'decimal', '정밀도(소수 자릿수)': 'decimal' });
    expect(tab('공차', ['위 값', '아래 값', '높이 축척'])).toEqual({ '위 값': NONE, '아래 값': NONE, '높이 축척': 'decimal' });
  });

  it('여러 줄 문자 편집기 도구 모음: 기울기 각도(−85~85)는 inputmode 없음, 자간·폭 비율·문자 높이는 소수 자판', async () => {
    const ed = new TextEditor(null, { mode: 'mtext', label: '시험', text: 'abc', height: 2.5, style: 'Standard' });
    const p = ed.open();
    expect(modes(document, ['기울기 각도(−85~85)', '자간(0.75~4)', '폭 비율(0.1~10)', '문자 높이'])).toEqual({
      '기울기 각도(−85~85)': NONE,
      '자간(0.75~4)': 'decimal',
      '폭 비율(0.1~10)': 'decimal',
      '문자 높이': 'decimal',
    });
    ed.cancel();
    expect(await p).toBeNull();
  });

  it('ARCTEXT 작업장: 문자 간격·호에서 간격띄우기는 inputmode 없음, 문자 높이·폭 비율·왼쪽·오른쪽 간격띄우기(0 이상)는 소수 자판', async () => {
    const h = makeApp();
    registerArcTextCommands(h.app);
    const arc = { ...entityDefaults(), type: 'ARC', handle: h.st.session.newHandle(), center: { x: 0, y: 0, z: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI } as ArcEntity;
    h.st.session.commit({ label: 'ADD', ops: [{ kind: 'add', block: h.st.space, entity: arc }] });
    h.st.selection.add(arc.handle);
    const run = h.app.run('ARCTEXT');
    const title = '원호 정렬 문자 작업장 - 작성';
    await vi.waitFor(() => expect(dlgOf(title)).toBeTruthy());
    expect(modes(dlgOf(title)!, ['문자 높이', '폭 비율', '문자 간격', '호에서 간격띄우기', '왼쪽에서 간격띄우기', '오른쪽에서 간격띄우기'])).toEqual({
      '문자 높이': 'decimal',
      '폭 비율': 'decimal',
      '문자 간격': NONE,
      '호에서 간격띄우기': NONE,
      '왼쪽에서 간격띄우기': 'decimal',
      '오른쪽에서 간격띄우기': 'decimal',
    });
    press(dlgOf(title)!, '취소');
    await run;
  });
});
