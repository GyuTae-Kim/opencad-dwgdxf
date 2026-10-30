// @vitest-environment jsdom
/**
 * 30차: 끌어서 여러 셀 고르기.
 * 근거(AutoCAD 도움말 "About Modifying Tables", 우리말 요약): 셀 안을 눌러 셀을 고르고, 여러 셀은 셀 위를 누르고 끌어 고른다.
 * Shift를 누른 채 다른 셀 안을 누르면 두 셀과 그 사이의 셀을 모두 고른다(28차). 표 자체는 격자선을 눌러 고른다.
 * 정한 것: 셀 안(누르면 셀을 고를 자리)에서 마우스·펜으로 누른 채 끌면 창·올가미 선택 대신 지나간 사각 범위(병합 셀을 덮게, 표 밖으로 나가면 그쪽 끝 행·열).
 * 격자선·표 밖·표 위에 그린 객체에서 시작한 끌기는 예전처럼 창·올가미. 손가락 한 개 끌기는 예전처럼 화면 이동(CadView가 끌기를 보내지 않는다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeEditor } from '../../src/app/textedit/editor';
import { registerModifyCommands } from '../../src/app/modify';
import { settle } from '../polish/real-app';
import { setup } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

type H = ReturnType<typeof setup>;
type Pt = { x: number; y: number };

const pev = (o: Partial<PointerEvent> = {}) => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, button: 0, clientX: 0, clientY: 0, ...o }) as PointerEvent;

/** 마우스로 a를 누르고 지나는 점들을 거쳐 마지막 점에서 뗀다(CadView처럼 끌기는 5px를 넘은 뒤부터 — 여기서는 지나는 점마다) */
function dragThrough(h: H, a: Pt, path: Pt[], o: Partial<PointerEvent> = {}, after?: (i: number) => void): void {
  const ev = pev(o);
  h.view.events.down!(a, a, ev);
  path.forEach((b, i) => {
    h.view.events.drag!(a, b, i === path.length - 1, ev);
    after?.(i);
  });
}

const overlay = (h: H) => h.view.overlay as unknown as { windowRect: unknown; lasso?: unknown; cells: unknown[] };

/** 표 시험 준비 + 창 선택(가짜 고르기의 select — 끝난 창 선택의 사각형을 모은다) */
function setupW() {
  const h = setup();
  const windows: unknown[] = [];
  const pk = (h.app as unknown as { picker: () => Record<string, unknown> }).picker();
  pk.select = (rect: unknown) => (windows.push(rect), []);
  return { ...h, windows };
}

describe('끌어서 여러 셀 고르기', () => {
  it('셀 안을 누른 채 끌면 지나간 사각 범위의 셀(기준은 누른 셀), 끄는 동안 범위가 따라가고 창·올가미는 없다', () => {
    const h = setupW();
    const seen: (number[] | null)[] = [];
    dragThrough(h, h.center(2, 0), [h.center(2, 1), h.center(2, 2), h.center(1, 2)], {}, () => {
      seen.push(h.cur());
      expect(overlay(h).windowRect).toBeNull();
      expect(overlay(h).lasso ?? null).toBeNull();
    });
    expect(seen).toEqual([
      [2, 0, 2, 1],
      [2, 0, 2, 2],
      [1, 0, 2, 2],
    ]);
    expect(h.cells.current()?.anchor).toEqual({ r: 2, c: 0 });
    // 강조가 그려지고 객체는 고르지 않았다
    expect(overlay(h).cells.length).toBe(1);
    expect(h.st.selection.size).toBe(0);
    // 끝난 뒤 바로 가기 메뉴의 제목은 그 범위
    h.view.events.context!(h.center(2, 0), h.center(2, 0), { clientX: 5, clientY: 5, button: 2, shiftKey: false, ctrlKey: false, metaKey: false } as MouseEvent);
    expect(document.querySelector('.menu')?.textContent).toContain('셀 A2:C3');
  });

  it('병합 셀을 지나면 그 병합 셀을 덮게 넓히고, 표 밖으로 끌면 그쪽 끝 행·열까지', () => {
    const h = setup();
    // A3 → B4(B4:C5 병합): A3:C5
    dragThrough(h, h.center(2, 0), [h.center(3, 1)]);
    expect(h.cur()).toEqual([2, 0, 4, 2]);
    // A4에서 표 오른쪽 아래 바깥: 마지막 행·열
    dragThrough(h, h.center(3, 0), [{ x: 400, y: -300 }]);
    expect(h.cur()).toEqual([3, 0, 4, 2]);
    // B3에서 표 왼쪽 위 바깥: A1(제목 — 모든 열 병합)까지 넓어져 A1:C3
    dragThrough(h, h.center(2, 1), [{ x: -300, y: 300 }]);
    expect(h.cur()).toEqual([0, 0, 2, 2]);
    // 같은 셀 안에서만 움직이면 그 셀 하나(누르기와 같다). 고른 A1:C3의 아래 그립이 B3 가운데 가까이라 먼저 푼다
    h.press('Escape');
    dragThrough(h, h.center(2, 1), [{ x: h.center(2, 1).x + 6, y: h.center(2, 1).y + 1 }]);
    expect(h.cur()).toEqual([2, 1, 2, 1]);
  });

  it('끌지 않고 떼면 예전처럼 누르기(그 셀 하나), Shift를 누른 채 끌면 지금 기준 셀에서 넓힌다', () => {
    const h = setup();
    const a = h.center(2, 0);
    h.view.events.down!(a, a, pev());
    h.click(a);
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    // 기준 A3, Shift를 누른 채 C3에서 B2까지 끌기: A2:B3(기준 A3)
    dragThrough(h, h.center(2, 2), [h.center(1, 1)], { shiftKey: true });
    expect(h.cur()).toEqual([1, 0, 2, 1]);
    expect(h.cells.current()?.anchor).toEqual({ r: 2, c: 0 });
  });

  it('격자선·표 밖·표 위에 그린 객체에서 시작한 끌기는 예전처럼 올가미·창(셀을 고르지 않는다)', () => {
    const h = setupW();
    h.line({ x: 20, y: 72 }, { x: 120, y: 72 });
    const c = h.center(2, 0);
    // A3·B3 사이 격자선(x = 50)에서 0.5 — 표 객체를 고르는 자리, 표 밖 빈 곳, 표 위에 그린 선(y = 72)에서 0.2
    const starts = [{ x: 50.5, y: c.y }, { x: 300, y: 200 }, { x: 70, y: 72.2 }];
    starts.forEach((start, i) => {
      dragThrough(h, start, [h.center(2, 2)]);
      expect(h.cur(), JSON.stringify(start)).toBeNull();
      // 한 점만 지난 올가미는 창 선택으로 끝난다
      expect(h.windows.length).toBe(i + 1);
      h.app.cancel();
    });
    // 끄는 동안 올가미가 보인다(격자선에서 시작)
    h.view.events.down!({ x: 50.5, y: c.y }, { x: 50.5, y: c.y }, pev());
    h.view.events.drag!({ x: 50.5, y: c.y }, h.center(3, 0), false, pev());
    expect(overlay(h).lasso).not.toBeNull();
    expect(h.cur()).toBeNull();
    h.view.events.drag!({ x: 50.5, y: c.y }, h.center(3, 0), true, pev());
    expect(h.cur()).toBeNull();
  });

  it('객체를 고른 채 셀 안에서 끌면 객체는 풀리고 셀 범위, 보기 모드·명령 중에는 셀을 고르지 않는다', async () => {
    const h = setupW();
    const line = h.line({ x: 200, y: 50 }, { x: 260, y: 50 });
    h.app.setSelection([line]);
    dragThrough(h, h.center(2, 0), [h.center(2, 1)]);
    expect(h.st.selection.size).toBe(0);
    expect(h.cur()).toEqual([2, 0, 2, 1]);
    h.app.clearSubSelections();
    h.app.setViewOnly(true);
    dragThrough(h, h.center(2, 0), [h.center(2, 1)]);
    expect(h.cur()).toBeNull();
    h.app.setViewOnly(false);
    // 명령이 점을 기다리는 동안(TABLECELL의 셀 고르기 — 객체 요청): 누르기·끌기는 명령으로 간다
    void h.app.run('TABLECELL');
    await settle();
    expect((h.app as unknown as { request: { kind: string } | null }).request?.kind).toBe('entity');
    dragThrough(h, h.center(2, 0), [h.center(2, 1)]);
    expect(h.cur()).toBeNull();
    h.app.cancel();
    await settle();
  });

  it('Esc로 끌기를 그만두면 고른 셀이 풀리고 남은 끌기는 무시(창 선택으로 넘어가지 않는다)', () => {
    const h = setup();
    const a = h.center(2, 0);
    const ev = pev();
    h.view.events.down!(a, a, ev);
    h.view.events.drag!(a, h.center(2, 1), false, ev);
    expect(h.cur()).toEqual([2, 0, 2, 1]);
    h.app.cancel();
    expect(h.cur()).toBeNull();
    h.view.events.drag!(a, h.center(2, 2), false, ev);
    expect(h.cur()).toBeNull();
    expect(overlay(h).lasso ?? null).toBeNull();
    expect(overlay(h).windowRect).toBeNull();
    h.view.events.drag!(a, h.center(2, 2), true, ev);
    expect(h.cur()).toBeNull();
    expect(h.st.selection.size).toBe(0);
    // 다음 누르기는 예전처럼
    dragThrough(h, h.center(3, 0), [h.center(2, 0)]);
    expect(h.cur()).toEqual([2, 0, 3, 0]);
  });

  it('고른 셀의 그립에서 누른 채 끌면 예전처럼 그립 편집(셀 범위가 아니다)', async () => {
    const h = setup();
    registerModifyCommands(h.app);
    h.app.osnapOn = false;
    h.click(h.center(2, 2));
    // C3 오른쪽 그립(130, 79.75)에서 1 안쪽
    const g = { x: 129, y: h.center(2, 2).y };
    const ev = pev();
    h.view.events.down!(g, g, ev);
    h.view.events.drag!(g, { x: g.x + 3, y: g.y }, false, ev);
    await settle();
    expect(h.cmd.prompt).toBe('신축점 지정 또는 [종료(X)]:');
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    h.app.cancel();
    await settle();
  });
});
