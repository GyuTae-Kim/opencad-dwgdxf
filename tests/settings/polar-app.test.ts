/**
 * 진짜 App에서 POLARMODE·POLARANG·POLARADDANG(AutoCAD 도움말의 레지스트리 변수, 이 앱은 이 브라우저)이 추적에 쓰이는지
 * (화면·명령행·엔진·글꼴은 가짜, 고르기는 tests/direct의 FakePicker):
 *  - 한 값: 변수 이름 입력·SETVAR(promptSysvar)·SYSVDLG(setSysvarText)·AutoLISP getvar·setvar가 같은 값을 보고 새 App도 같다.
 *    POLARMODE는 극좌표 추적을 켜고 끄지 않는다(그것은 AUTOSNAP 8 = F10)
 *  - 1 마지막으로 그린 선분 기준(LINE·PLINE), 2 객체 스냅 추적에 극좌표 각도, 4 추가 각도, 8 Shift로 추적점 획득
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { App, type PointResult } from '../../src/app/app';
import type { OverlayState } from '../../src/app/view';
import { BROWSER_TEXT_VARS, BROWSER_VARS, browserSysvar, browserSysvarText, promptSysvar, setSysvarText, sysvarInfo } from '../../src/app/sysvars';
import { getSysVar, setSysVar } from '../../src/app/lisp-host';
import { registerDrawCommands } from '../../src/app/draw';
import { prefSet } from '../../src/app/mgr-ui';
import { Real } from '../../src/edit/lisp/types';
import { lwVertices } from '../../src/core/lwpoly';
import { unitSettings } from '../../src/core/units';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  for (const v of [...BROWSER_VARS, ...BROWSER_TEXT_VARS]) prefSet(`opencad.sysvar.${v.name}`, null);
});

type Pt = { x: number; y: number };
const P = (x: number, y: number) => ({ x, y });
const ev = (o: Partial<PointerEvent> = {}) => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...o }) as PointerEvent;

interface H extends RealApp {
  ov: OverlayState;
  line(x0: number, y0: number, x1: number, y1: number): void;
  move(p: Pt, o?: Partial<PointerEvent>): void;
  click(p: Pt): void;
  /** 변수 이름을 친 것처럼 바꾼다(실패하면 시험 실패) */
  set(name: string, value: number | string): void;
  /** 명령을 시작하고 점들을 친다 */
  draw(name: string, ...inputs: string[]): Promise<void>;
  lines(): LineEntity[];
}

function setup(): H {
  const h = makeApp();
  registerDrawCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  return {
    ...h,
    get ov() {
      return h.view.overlay as unknown as OverlayState;
    },
    line: (x0, y0, x1, y1) => {
      const e: LineEntity = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } };
      e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
      h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    },
    move: (p, o) => h.view.events.move!(p, p, ev(o)),
    click: (p) => h.view.events.click!(p, p, ev()),
    set: (name, value) => expect(setSysvarText(h.app, name, String(value))).toBeNull(),
    async draw(name, ...inputs) {
      void h.app.run(name);
      await settle();
      for (const t of inputs) {
        h.app.submitInput(t);
        await settle();
      }
    },
    lines: () => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'LINE') as LineEntity[],
  };
}

/** 점 하나를 묻는 명령(결과를 모은다). base를 주면 그 기준점에서 */
function pointCmd(h: H, name: string, base?: Pt) {
  const got: PointResult[] = [];
  h.app.register({ name, title: name, run: async (ctx) => void got.push(await ctx.getPoint(`${name} 점:`, base ? { base } : {})) });
  return got;
}

describe('POLARMODE·POLARANG·POLARADDANG 한 값', () => {
  it('변수 입력·SYSVDLG·AutoLISP가 같은 값을 보고 이 브라우저에 남으며, POLARMODE는 극좌표 추적을 켜고 끄지 않는다', async () => {
    const h = setup();
    // AutoCAD 초기값: POLARMODE 0, POLARANG 90, POLARADDANG ""
    expect([getSysVar(h.app, 'POLARMODE'), sysvarInfo(h.app, 'POLARANG')?.value, getSysVar(h.app, 'POLARADDANG')]).toEqual([0, 90, '']);
    expect(sysvarInfo(h.app, 'POLARMODE')).toMatchObject({ source: 'browser', kind: 'int' });
    expect(sysvarInfo(h.app, 'POLARANG')).toMatchObject({ source: 'browser', kind: 'angle' });
    expect(sysvarInfo(h.app, 'POLARADDANG')).toMatchObject({ source: 'browser', kind: 'string' });
    expect(h.app.polarOn).toBe(true);
    // 예전처럼 POLARMODE 0·1을 쳐도 극좌표 추적(AUTOSNAP 8)은 그대로 — 처음 한 번 알린다
    const ctx = { print: (t: string) => h.app.cmd.print(t), getPoint: async () => ({ text: '0' }) } as never;
    await promptSysvar(h.app, ctx, 'POLARMODE', '0');
    expect([h.app.polarOn, browserSysvar('AUTOSNAP'), browserSysvar('POLARMODE')]).toEqual([true, 63, 0]);
    expect(h.out().at(-1)).toBe('POLARMODE는 극좌표 각도 측정과 객체 스냅 추적 방식(비트)입니다. 극좌표 추적 켜기·끄기는 F10(AUTOSNAP 8)입니다.');
    await promptSysvar(h.app, ctx, 'POLARMODE', '1');
    expect([h.app.polarOn, browserSysvar('POLARMODE'), h.app.settings.polarMode]).toEqual([true, 1, 1]);
    expect(h.out().filter((l) => l.startsWith('POLARMODE는'))).toHaveLength(1);
    expect(setSysVar(h.app, 'POLARMODE', 13)).toBeNull();
    expect([getSysVar(h.app, 'POLARMODE'), h.app.settings.polarMode, h.app.polarOn]).toEqual([13, 13, true]);
    expect(setSysVar(h.app, 'POLARMODE', 16)).toBe('0과(와) 15 사이의 정수가 필요합니다');
    // POLARANG: 명령행·SYSVDLG는 도, AutoLISP는 라디안
    h.set('POLARANG', '22.5');
    expect(h.app.settings.polarAng).toBe(22.5);
    expect(h.app.polarInc).toBeCloseTo((22.5 * Math.PI) / 180, 12);
    expect((getSysVar(h.app, 'POLARANG') as Real).v).toBeCloseTo(0.392699082, 9);
    expect(setSysVar(h.app, 'POLARANG', new Real(Math.PI / 4))).toBeNull();
    expect(browserSysvar('POLARANG')).toBe(45);
    expect(setSysvarText(h.app, 'POLARANG', '0')).toBe('0.1과(와) 360 사이의 값이 필요합니다.');
    expect(setSysvarText(h.app, 'POLARANG', 'abc')).toBe('0.1과(와) 360 사이의 값이 필요합니다.');
    h.app.polarInc = (7.5 * Math.PI) / 180;
    expect([browserSysvar('POLARANG'), sysvarInfo(h.app, 'POLARANG')?.value]).toEqual([7.5, 7.5]);
    // POLARADDANG: 글. "."은 없음, 고른 꼴로 저장
    h.set('POLARADDANG', ' 75; 10 ');
    expect([getSysVar(h.app, 'POLARADDANG'), browserSysvarText('POLARADDANG')]).toEqual(['75;10', '75;10']);
    expect(setSysvarText(h.app, 'POLARADDANG', '1,2')).toContain('각도로 읽을 수 없습니다');
    expect(setSysVar(h.app, 'POLARADDANG', '30')).toBeNull();
    expect(getSysVar(h.app, 'POLARADDANG')).toBe('30');
    h.set('POLARADDANG', '.');
    expect(getSysVar(h.app, 'POLARADDANG')).toBe('');
    expect(setSysVar(h.app, 'POLARADDANG', '15;20')).toBeNull();
    expect(setSysVar(h.app, 'POLARADDANG', '')).toBeNull();
    expect(getSysVar(h.app, 'POLARADDANG')).toBe('');
    h.set('POLARADDANG', '15;20');
    // 다음에 연 앱(새 App)도 같은 값으로 시작한다(AutoCAD는 레지스트리)
    const next = new App({} as HTMLElement);
    expect([next.settings.polarMode, next.settings.polarAng, next.polar.add]).toEqual([13, 7.5, [15, 20]]);
    // 도면 머리말에는 없다
    expect(['$POLARMODE', '$POLARANG', '$POLARADDANG'].some((k) => h.doc.header.has(k))).toBe(false);
  });
});

describe('POLARMODE 1: 마지막으로 그린 선분 기준(상대)', () => {
  it('LINE: 45도로 그린 다음 90도 증분이 135도로 잡히고 툴팁은 상대 극좌표, 0이면 절대(수평·수직)', async () => {
    const h = setup();
    h.set('POLARMODE', 1);
    await h.draw('LINE', '0,0', '100,100');
    // 기준점 (100,100)에서 135도 근처(선분에 수직)
    h.move(P(66, 136));
    expect(h.ov.tip).toMatch(/^상대 극좌표: .+ < 90°$/);
    expect(h.ov.tracks).toHaveLength(1);
    expect(h.ov.tracks[0]!.dir.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(h.ov.tracks[0]!.dir.y).toBeCloseTo(Math.SQRT1_2, 9);
    // 선분 방향 그대로(0도)도
    h.move(P(130, 131));
    expect(h.ov.tip).toMatch(/^상대 극좌표: .+ < 0°$/);
    h.move(P(66, 136));
    h.click(P(66, 136));
    await settle();
    const l2 = h.lines().at(-1)!;
    expect(l2.start).toMatchObject({ x: 100, y: 100 });
    expect(l2.end.x - 100).toBeCloseTo(-(l2.end.y - 100), 9);
    // 절대(0): 같은 자리에서 수평·수직에서 멀어 추적하지 않는다
    h.set('POLARMODE', 0);
    h.move(P(l2.end.x - 34, l2.end.y + 36));
    expect(h.ov.tracks).toEqual([]);
    expect(h.ov.tip).not.toMatch(/극좌표/);
    h.move(P(l2.end.x + 0.5, l2.end.y + 40));
    expect(h.ov.tip).toMatch(/^극좌표: .+ < 90°$/);
    h.app.submitInput('');
    await settle();
  });

  it('그린 선분이 없으면 상대로 정해 두어도 절대, PLINE도 마지막 구간 방향, 문서마다 따로', async () => {
    const h = setup();
    h.set('POLARMODE', 1);
    pointCmd(h, 'PB', P(0, 0));
    // 처음 연 도면: 그린 선분이 없다 → UCS 기준
    expect(h.app.lastSegmentDir()).toBeNull();
    void h.app.run('PB');
    await settle();
    h.move(P(0.5, 40));
    expect(h.ov.tip).toMatch(/^극좌표: .+ < 90°$/);
    h.app.submitInput('');
    await settle();
    // PLINE: (0,0) → (100,0) → (100,100): 마지막 구간은 90도
    await h.draw('PLINE', '0,0', '100,0', '100,100');
    expect(h.app.lastSegmentDir()).toBeCloseTo(Math.PI / 2, 12);
    // 기준점 (100,100)에서 마지막 구간에 수직(상대 90도 = 180도)
    h.move(P(60, 100.5));
    expect(h.ov.tip).toMatch(/^상대 극좌표: .+ < 90°$/);
    h.app.submitInput('');
    await settle();
    const pl = h.doc.blocks.get(MODEL_SPACE)!.entities.find((e) => e.type === 'LWPOLYLINE') as LwPolylineEntity;
    expect(lwVertices(pl).length).toBe(3);
    // 명령 취소(U): LINE을 되돌리면 남은 마지막 선분으로
    await h.draw('LINE', '0,0', '50,0', '50,50');
    expect(h.app.lastSegmentDir()).toBeCloseTo(Math.PI / 2, 12);
    h.app.submitInput('U');
    await settle();
    expect(h.app.lastSegmentDir()).toBeCloseTo(0, 12);
    // 되돌린 뒤 다음 선분은 남은 선분의 끝(50,0)에서
    h.app.submitInput('50,-30');
    await settle();
    expect(h.lines().at(-1)).toMatchObject({ start: { x: 50, y: 0 }, end: { x: 50, y: -30 } });
    expect(h.app.lastSegmentDir()).toBeCloseTo(-Math.PI / 2, 12);
    h.app.submitInput('');
    await settle();
  });
});

describe('POLARMODE 2·4: 객체 스냅 추적에 극좌표 각도, 추가 각도', () => {
  it('2가 0이면 획득점에서 수평·수직만, 2면 증분 각도(45도)도', async () => {
    vi.useFakeTimers();
    try {
      const h = setup();
      h.set('OSMODE', 1);
      h.set('POLARANG', 45);
      h.line(0, 0, 10, 0);
      const got = pointCmd(h, 'PT');
      void h.app.run('PT');
      await vi.advanceTimersByTimeAsync(0);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(450);
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      // 획득점 (10,0)에서 45도 근처
      h.move(P(40, 33));
      expect(h.ov.tracks).toEqual([]);
      h.move(P(10.4, 30));
      expect(h.ov.tip).toMatch(/^끝점: .+ < 90°$/);
      h.set('POLARMODE', 2);
      h.move(P(40, 33));
      expect(h.ov.tip).toMatch(/^끝점: .+ < 45°$/);
      h.click(P(40, 33));
      await vi.advanceTimersByTimeAsync(0);
      const p = (got.at(-1) as { point: Pt }).point;
      expect(p.x - 10).toBeCloseTo(p.y, 9);
      // 극좌표 추적이 꺼져 있으면(F10) 2여도 수평·수직만
      h.app.polarOn = false;
      void h.app.run('PT');
      await vi.advanceTimersByTimeAsync(0);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(450);
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      h.move(P(40, 33));
      expect(h.ov.tracks).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('추가 각도(POLARADDANG)는 4일 때만, 그 각도만(배수·반대쪽 없이)', async () => {
    const h = setup();
    h.set('POLARADDANG', '10;75');
    const got = pointCmd(h, 'PB', P(0, 0));
    const at10 = P(Math.cos((10 * Math.PI) / 180) * 50, Math.sin((10 * Math.PI) / 180) * 50 + 1);
    void h.app.run('PB');
    await settle();
    h.move(at10);
    expect(h.ov.tracks).toEqual([]);
    h.set('POLARMODE', 4);
    h.move(at10);
    expect(h.ov.tip).toMatch(/^극좌표: .+ < 10°$/);
    // 반대쪽(190도)이나 배수(20도)는 아니다(수평·수직에서도 멀리)
    const at = (deg: number, r: number) => P(Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r);
    h.move(at(190, 100));
    expect(h.ov.tracks).toEqual([]);
    h.move(at(20, 100));
    expect(h.ov.tracks).toEqual([]);
    h.move(at10);
    h.click(at10);
    await settle();
    const p = (got.at(-1) as { point: Pt }).point;
    expect((Math.atan2(p.y, p.x) * 180) / Math.PI).toBeCloseTo(10, 9);
  });
});

describe('POLARANG·POLARADDANG 단위 표시 입력(15차)', () => {
  it('변수 입력·SETVAR은 저장값 그대로 도 — 단위 표시(25g·7d30\')·방위(N 80d E)를 붙이면 도로 바꿔 받고 추적에 쓴다', async () => {
    const h = setup();
    h.set('POLARANG', '25g');
    expect([browserSysvar('POLARANG'), h.app.settings.polarAng, sysvarInfo(h.app, 'POLARANG')?.value]).toEqual([22.5, 22.5, 22.5]);
    h.set('POLARANG', "7d30'");
    expect(browserSysvar('POLARANG')).toBe(7.5);
    // 증분 각도는 크기라 방위를 받지 않는다. 단위 표시 없는 수는 도(도면의 AUNITS와 상관없이)
    expect(setSysvarText(h.app, 'POLARANG', 'N 80d E')).toBe('0.1과(와) 360 사이의 값이 필요합니다.');
    // 그라드 도면(AUNITS 2)이어도
    h.doc.header.set('$AUNITS', 2);
    h.st.units = unitSettings(h.doc);
    h.set('POLARANG', '90');
    expect(browserSysvar('POLARANG')).toBe(90);
    h.set('POLARADDANG', 'N 80d E;50g;-10');
    expect([browserSysvarText('POLARADDANG'), getSysVar(h.app, 'POLARADDANG'), h.app.polar.add]).toEqual(['10;45;350', '10;45;350', [10, 45, 350]]);
    expect(setSysVar(h.app, 'POLARADDANG', "N 10d W;1,2")).toBe('추가 각도 "1,2"을(를) 각도로 읽을 수 없습니다. 각도를 ;로 나눠 입력하십시오');
    // 방위로 넣은 10도 방향으로 추적한다(POLARMODE 4)
    h.set('POLARMODE', 4);
    const got = pointCmd(h, 'PU', P(0, 0));
    const at10 = P(Math.cos((10 * Math.PI) / 180) * 50, Math.sin((10 * Math.PI) / 180) * 50 + 1);
    void h.app.run('PU');
    await settle();
    h.move(at10);
    expect(h.ov.tip).toMatch(/^극좌표: .+ < 10°$/);
    h.click(at10);
    await settle();
    const p = (got.at(-1) as { point: Pt }).point;
    expect((Math.atan2(p.y, p.x) * 180) / Math.PI).toBeCloseTo(10, 9);
  });
});

describe('POLARMODE 8: Shift를 눌러 추적점 획득', () => {
  type KeyApp = { onKey(ev: KeyboardEvent): void; setShift(on: boolean): void };
  it('머물러도 얻지 않고, Shift를 누른 채 지나거나 스냅점 위에서 Shift를 누르면 바로 얻는다(다시 누르면 놓는다)', async () => {
    vi.useFakeTimers();
    try {
      const h = setup();
      h.set('OSMODE', 1);
      h.set('POLARMODE', 8);
      h.line(0, 0, 10, 0);
      h.line(0, 50, 10, 50);
      pointCmd(h, 'PT');
      void h.app.run('PT');
      await vi.advanceTimersByTimeAsync(0);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(2000);
      expect(h.ov.acquired).toEqual([]);
      // Shift를 누른 채 지나간다
      h.move(P(10.4, 0.4), { shiftKey: true });
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      // 같은 점 위에서 계속 움직여도 다시 뒤집지 않는다
      h.move(P(10.3, 0.2), { shiftKey: true });
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      h.move(P(10.3, 0.2));
      vi.advanceTimersByTime(2000);
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      // 다른 스냅점 위에서 Shift 키(키보드)를 누른다
      const k = h.app as unknown as KeyApp;
      h.move(P(10.4, 50.4));
      k.onKey({ key: 'Shift', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false, target: null, preventDefault() {} } as unknown as KeyboardEvent);
      expect(h.ov.acquired).toEqual([P(10, 0), P(10, 50)]);
      k.setShift(false);
      // 얻은 점 위에서 다시 Shift를 누르면 놓는다
      h.move(P(10.2, 50.2), { shiftKey: true });
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      // 0(자동)으로 돌리면 예전처럼 머물러 얻는다
      h.set('POLARMODE', 0);
      h.move(P(10.4, 50.4));
      vi.advanceTimersByTime(450);
      expect(h.ov.acquired).toEqual([P(10, 0), P(10, 50)]);
    } finally {
      vi.useRealTimers();
    }
  });
});
