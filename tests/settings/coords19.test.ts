/**
 * 19차: 상태 막대 좌표 표시(COORDS). 도움말 COORDS(0 점을 지정할 때만 갱신, 1 계속 갱신, 2 명령이 점·거리·각도를 물을 때 상대 극좌표 —
 * Z는 늘 절대 값, 레지스트리 자리·초기값 1)와 "상태 막대의 좌표 표시 바꾸기"(점을 물을 때 좌표 표시를 누르거나 Ctrl+I를 거듭 누른다)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { ctrlAction } from '../../src/app/keys';
import { browserSysvar, setBrowserSysvar, sysvarInfo } from '../../src/app/sysvars';
import { coordsMode, nextCoordsMode } from '../../src/app/coords';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';

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

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;

function setup(coords?: number, init?: Parameters<typeof makeApp>[0]) {
  const h = makeApp(init);
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  h.app.osnapOn = false;
  if (coords !== undefined) expect(setBrowserSysvar('COORDS', coords)).toBeNull();
  const cl = h.cmd as unknown as DirectCommandLine;
  const coordsOut: string[] = [];
  h.app.ui.setCoords = (t: string) => void coordsOut.push(t);
  const move = (p: Pt) => {
    h.view.events.move!(p, p, ev());
    return coordsOut.at(-1);
  };
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  return { ...h, cl, coordsOut, move, type };
}

describe('COORDS 변수', () => {
  it('이 브라우저 변수(초기값 1), 0~2만(지리 좌표 3은 받지 않는다)', () => {
    const h = setup();
    expect(sysvarInfo(h.app, 'COORDS')).toMatchObject({ source: 'browser', value: 1, readOnly: false });
    expect(setBrowserSysvar('COORDS', 3)).toMatch(/0과\(와\) 2 사이/);
    expect(coordsMode()).toBe(1);
    expect([0, 1, 2].map((v) => nextCoordsMode(v as 0 | 1 | 2))).toEqual([1, 2, 0]);
  });

  it('Ctrl+I와 cycleCoords: 0 → 1 → 2 → 0, 명령행에 알린다', () => {
    expect(ctrlAction({ key: 'i', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toEqual({ toggle: 'coords' });
    expect(ctrlAction({ key: 'ㅑ', code: 'KeyI', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toEqual({ toggle: 'coords' });
    const h = setup();
    h.app.cycleCoords();
    expect(browserSysvar('COORDS')).toBe(2);
    h.app.cycleCoords();
    expect(browserSysvar('COORDS')).toBe(0);
    h.app.cycleCoords();
    expect(browserSysvar('COORDS')).toBe(1);
    expect(h.out().slice(-3)).toEqual(['<좌표: 상대 극좌표>', '<좌표: 점을 지정할 때만>', '<좌표: 계속 갱신>']);
  });
});

describe('상태 막대 좌표(진짜 App)', () => {
  it('COORDS 2: 기준점이 있는 점 요청에서는 거리<각도, Z(절대), 그 밖에는 절대 좌표', async () => {
    const h = setup(2);
    h.doc.header.set('$ELEVATION', 2);
    expect(h.move(P(3, 4))).toBe('3.0000, 4.0000, 2.0000');
    void h.app.run('DIST');
    await settle();
    // 첫 점(기준점 없음)은 절대 좌표
    expect(h.move(P(1, 1))).toBe('1.0000, 1.0000, 2.0000');
    await h.type('1,1');
    expect(h.move(P(4, 5))).toBe('5.0000<53°, 2.0000');
    await h.type('4,5');
    expect(h.app.busyCommand).toBeFalsy();
    expect(h.move(P(4, 5))).toBe('4.0000, 5.0000, 2.0000');
  });

  it('COORDS 2의 각도는 지금 UCS와 도면 단위의 방향(ANGDIR)', async () => {
    const cw = setup(2, (d) => d.header.set('$ANGDIR', 1));
    void cw.app.run('DIST');
    await settle();
    await cw.type('0,0');
    // 시계 방향 도면: WCS −90°는 90°
    expect(cw.move(P(0, -5))).toBe('5.0000<90°, 0.0000');
    cw.cl.escape();
    await settle();
    const h = setup(2);
    h.doc.header.set('$UCSXDIR', { x: 0, y: 1, z: 0 });
    h.doc.header.set('$UCSYDIR', { x: -1, y: 0, z: 0 });
    void h.app.run('DIST');
    await settle();
    await h.type('*0,0');
    // UCS X축 = WCS Y축
    expect(h.move(P(0, 5))).toBe('5.0000<0°, 0.0000');
    h.cl.escape();
    await settle();
    // 원점을 옮기고 −90° 돌린 UCS(X축 = WCS −Y): 계산 끝자리(−3e-15·−3e-16)가 "-0.0000"이나 360°로 보이지 않는다
    h.doc.header.set('$UCSORG', { x: 50, y: 0, z: 0 });
    h.doc.header.set('$UCSXDIR', { x: 0, y: -1, z: 0 });
    h.doc.header.set('$UCSYDIR', { x: 1, y: 0, z: 0 });
    expect(h.move(P(0, 0))).toBe('0.0000, -50.0000, 0.0000');
    void h.app.run('DIST');
    await settle();
    await h.type('*50,0');
    expect(h.move(P(50, -5))).toBe('5.0000<0°, 0.0000');
    expect(h.move(P(55, 0))).toBe('5.0000<90°, 0.0000');
    h.cl.escape();
    await settle();
  });

  it('도면 밖으로 나가면 지우되, 점을 묻는 동안과 COORDS 0은 남긴다(좌표 표시를 눌러 바꿀 수 있게)', async () => {
    const h = setup();
    h.move(P(3, 4));
    h.view.events.leave!();
    expect(h.coordsOut.at(-1)).toBe('');
    void h.app.run('DIST');
    await settle();
    h.move(P(3, 4));
    h.view.events.leave!();
    expect(h.coordsOut.at(-1)).toBe('3.0000, 4.0000, 0.0000');
    h.cl.escape();
    await settle();
    const z = setup(0);
    void z.app.run('DIST');
    await settle();
    await z.type('1,2');
    z.view.events.leave!();
    expect(z.coordsOut).toEqual(['1.0000, 2.0000, 0.0000']);
    z.cl.escape();
    await settle();
  });

  it('COORDS 0: 커서를 움직여도 그대로, 점을 지정하면 그 점(준 Z, 아니면 고도)', async () => {
    const h = setup(0);
    h.doc.header.set('$ELEVATION', 1.5);
    h.move(P(3, 4));
    expect(h.coordsOut).toEqual([]);
    void h.app.run('DIST');
    await settle();
    await h.type('7,8,3');
    expect(h.coordsOut.at(-1)).toBe('7.0000, 8.0000, 3.0000');
    h.move(P(20, 20));
    expect(h.coordsOut.at(-1)).toBe('7.0000, 8.0000, 3.0000');
    // 커서로 찍은 점
    h.view.events.click!(P(20, 20), P(20, 20), ev());
    await settle();
    expect(h.coordsOut.at(-1)).toBe('20.0000, 20.0000, 1.5000');
    expect(h.app.busyCommand).toBeFalsy();
  });
});
