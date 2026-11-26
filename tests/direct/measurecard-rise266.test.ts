/**
 * 266차: 휴대폰 보기 거리 카드에 빠진 「XY 평면으로부터의 각도」(239차 보고 (1)). 239차 원칙 — 결과 카드는 데스크톱 명령행과 같은 값을 보인다
 * (보기 모드는 명령행을 숨겨 카드가 아니면 볼 수 없다). 명령행 DIST·MEASUREGEOM 거리 첫 줄은 늘 이 각도를 적는데 카드는 ΔZ만 보였다.
 * 이제 두 점의 Z가 다르면 XY 평면 각도 바로 뒤(명령행 차례)에 명령행과 같은 글(같은 셈 — 측량 단위는 방위가 아니라 도/분/초)로 보이고,
 * 같은 높이면 ΔZ처럼 줄을 빼 2D 도면 카드는 그대로다. 틀은 measurecard.test.ts(진짜 App과 명령, 화면·명령행은 가짜, MobileView는 jsdom 문서)와
 * dist3d18.test.ts(좌표를 쳐서 3D 점 — 극좌표·객체 스냅 추적·동적 입력을 끔)와 같다.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { MobileView } from '../../src/app/ui/mobileview';
import { catalogs } from '../../site/i18n.mjs';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from './fakes';
import { FakePicker } from './fakes';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;

/** 각도 단위를 정한 새 도면(AUNITS·AUPREC — 길이는 십진 넷째 자리 mm)과 보기 모드 카드. 친 좌표가 그대로 점이 되게 극좌표·객체 스냅 추적·동적 입력(상대 좌표 기본)을 끈다 */
function setup(aunits = 0, auprec = 0) {
  const h = makeApp((doc) => {
    doc.header.set('$AUNITS', aunits);
    doc.header.set('$AUPREC', auprec);
  });
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  mv.apply(true);
  const cl = h.cmd as unknown as DirectCommandLine;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  return { ...h, mv, type };
}
type H = RealApp & { mv: MobileView };
const text = (h: H, sel: string) => h.mv.card.querySelector(sel)?.textContent ?? null;
/** DIST·MEASUREGEOM 거리의 결과 두 줄(앞에서 잰 것까지 차례로) */
const result = (h: H) => h.out().filter((t) => /^(거리|X 증분) =/.test(t));
/** 명령행 첫 줄의 XY 평면으로부터의 각도 글 */
const riseOf = (line: string) => line.match(/XY 평면으로부터의 각도 = (.+)$/)?.[1] ?? null;

async function dist(h: ReturnType<typeof setup>, a: string, b: string) {
  void h.app.run('DIST');
  await settle();
  await h.type(a, b);
  expect(h.app.busyCommand).toBeNull();
  return result(h);
}

describe('휴대폰 보기 거리 카드의 XY 평면으로부터의 각도(266차)', () => {
  it('위로 기운 두 점: 명령행은 그대로, 카드는 XY 평면 각도 바로 뒤에 명령행과 같은 기운 각도(ΔZ와 함께)', async () => {
    const h = setup();
    const out = await dist(h, '0,0,0', '3,4,12');
    expect(out).toEqual(['거리 = 13.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 67°', 'X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 12.0000']);
    expect(text(h, '.mv-kind')).toBe('거리');
    expect(text(h, '.mv-big')).toBe('13.0000 mm');
    expect(text(h, '.mv-sub')).toBe('각도 53° · XY 평면으로부터의 각도 67° · ΔX 3.0000 · ΔY 4.0000 · ΔZ 12.0000');
    expect(text(h, '.mv-sub')).toContain(`XY 평면으로부터의 각도 ${riseOf(out[0]!)} ·`);
    // 펼친 원문은 명령행 두 줄 그대로
    expect([...h.mv.card.querySelectorAll('.mv-raw > div')].map((d) => d.textContent)).toEqual(out);
  });

  it('아래로 기운 두 점: 기운 각도는 명령행과 같은 0~360 꼴(-45° → 315°)', async () => {
    const h = setup();
    const out = await dist(h, '0,0,10', '10,0,0');
    expect(out).toEqual(['거리 = 14.1421 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 315°', 'X 증분 = 10.0000,  Y 증분 = 0.0000,  Z 증분 = -10.0000']);
    expect(text(h, '.mv-big')).toBe('14.1421 mm');
    expect(text(h, '.mv-sub')).toBe('각도 0° · XY 평면으로부터의 각도 315° · ΔX 10.0000 · ΔY 0.0000 · ΔZ -10.0000');
  });

  it('측량 단위(AUNITS 4·AUPREC 4): XY 평면 각도는 방위 그대로, 기운 각도는 명령행처럼 방위가 아니라 도/분/초', async () => {
    const h = setup(4, 4);
    const out = await dist(h, '0,0,0', '3,4,12');
    expect(out[0]).toBe(`거리 = 13.0000 mm,  XY 평면에서의 각도 = N 36d52'12" E,  XY 평면으로부터의 각도 = 67d22'48"`);
    expect(text(h, '.mv-sub')).toBe(`각도 N 36d52'12" E · XY 평면으로부터의 각도 67d22'48" · ΔX 3.0000 · ΔY 4.0000 · ΔZ 12.0000`);
    expect(text(h, '.mv-sub')).toContain(`XY 평면으로부터의 각도 ${riseOf(out[0]!)} ·`);
  });

  it('MEASUREGEOM 거리도 같은 카드: 이어서 재는 동안 프롬프트 위에, 그만두면 결과로', async () => {
    const h = setup();
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.type('0,0,0', '3,4,12');
    expect(h.app.busyCommand).toBe('MEASUREGEOM');
    expect(result(h)[0]).toBe('거리 = 13.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 67°');
    expect(h.mv.card.classList.contains('is-prompt')).toBe(true);
    const sub = '각도 53° · XY 평면으로부터의 각도 67° · ΔX 3.0000 · ΔY 4.0000 · ΔZ 12.0000';
    expect(text(h, '.mv-sub')).toBe(sub);
    h.app.cmd.escape();
    await settle();
    expect(h.mv.card.classList.contains('is-result')).toBe(true);
    expect(text(h, '.mv-sub')).toBe(sub);
  });

  it('같은 높이의 두 점(Z 없음·둘 다 Z 5): 명령행은 0을 적고, 카드는 ΔZ처럼 줄을 빼 전과 같은 각도·ΔX·ΔY', async () => {
    const h = setup();
    const flat = ['거리 = 5.0000 mm,  XY 평면에서의 각도 = 53°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 3.0000,  Y 증분 = 4.0000,  Z 증분 = 0.0000'];
    expect(await dist(h, '0,0', '3,4')).toEqual(flat);
    expect(text(h, '.mv-big')).toBe('5.0000 mm');
    expect(text(h, '.mv-sub')).toBe('각도 53° · ΔX 3.0000 · ΔY 4.0000');
    expect((await dist(h, '0,0,5', '3,4,5')).slice(2)).toEqual(flat);
    expect(text(h, '.mv-big')).toBe('5.0000 mm');
    expect(text(h, '.mv-sub')).toBe('각도 53° · ΔX 3.0000 · ΔY 4.0000');
  });

  it('카드 이름 글은 네 언어 사전에 — 명령행 문장 번역과 같은 낱말', () => {
    expect(LANGS.map((l) => catalogs[l][`XY 평면으로부터의 각도`])).toEqual(['Angle from XY Plane', 'Winkel von XY-Ebene', 'XY平面からの角度', '与 XY 平面的夹角']);
  });
});
