/**
 * 휴대폰 보기 모드의 측정 결과 카드: 진짜 App과 측정 명령(DIST·MEASURERADIUS·AREA), 화면·명령행은 가짜(viewonly.test.ts와 같은 틀),
 * MobileView는 jsdom 문서에 그린다. 결과는 명령이 넘긴 값으로 큰 값·보조 줄을 보이고, 명령행 글은 그대로다.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { MobileView } from '../../src/app/ui/mobileview';
import { type RealApp, makeApp, settle } from '../polish/real-app';
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

const P = (x: number, y: number) => ({ x, y });
const ev = { pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent;

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const add = (e: Entity) => {
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  mv.apply(true);
  return { ...h, mv, add, click: (p: { x: number; y: number }) => h.view.events.click!(p, p, ev) };
}
const text = (h: RealApp & { mv: MobileView }, sel: string) => h.mv.card.querySelector(sel)?.textContent ?? null;

describe('휴대폰 보기 모드의 측정 결과 카드', () => {
  it('거리: 큰 거리 값과 각도·ΔX·ΔY 보조 줄, 명령행 원문은 펼침에, 편집 화면 명령행 글은 그대로', async () => {
    const h = setup();
    void h.app.run('DIST');
    await settle();
    expect(text(h, '.mv-prompt')).toBe('첫 번째 점 지정:');
    h.click(P(10, 10));
    await settle();
    h.click(P(40, 50));
    await settle();
    expect(h.app.busyCommand).toBeNull();
    const out = h.out().filter((t) => /^(거리|X 증분) =/.test(t));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^거리 = 50(\.0+)? mm, {2}XY 평면에서의 각도 = 53/);
    expect(out[1]).toMatch(/^X 증분 = 30(\.0+)?, {2}Y 증분 = 40(\.0+)?, {2}Z 증분 = 0/);
    expect(h.mv.card.hidden).toBe(false);
    expect(h.mv.card.classList.contains('is-result')).toBe(true);
    expect(text(h, '.mv-kind')).toBe('거리');
    expect(text(h, '.mv-big')).toMatch(/^50(\.0+)? mm$/);
    expect(text(h, '.mv-sub')).toMatch(/^각도 53\S* · ΔX 30(\.0+)? · ΔY 40(\.0+)?$/);
    expect(text(h, '.mv-sub')).not.toContain('ΔZ');
    expect([...h.mv.card.querySelectorAll('.mv-raw > div')].map((d) => d.textContent)).toEqual(out);
    expect(h.mv.card.querySelectorAll('.mv-res')).toHaveLength(0);
    // 펼친 원문은 다시 그려도 펼친 채
    const details = h.mv.card.querySelector('details')!;
    details.open = true;
    details.dispatchEvent(new dom.window.Event('toggle'));
    h.mv.refresh();
    await settle();
    expect(h.mv.card.querySelector('details')!.open).toBe(true);
    expect(h.mv.card.querySelector('details')).not.toBe(details);
  });

  it('반지름: 이어서 재는 동안(MEASUREGEOM) 프롬프트 위에 마지막 값, 그만두면 그 값이 결과', async () => {
    const h = setup();
    const c: CircleEntity = { ...entityDefaults(), type: 'CIRCLE', handle: h.st.session.newHandle(), center: { x: 0, y: 0, z: 0 }, radius: 12.5 };
    h.add(c);
    void h.app.run('MEASURERADIUS');
    await settle();
    expect(text(h, '.mv-prompt')).toMatch(/^호 또는 원 선택/);
    h.click(P(12.5, 0));
    await settle();
    expect(h.app.busyCommand).toBe('MEASUREGEOM');
    expect(h.mv.card.classList.contains('is-prompt')).toBe(true);
    expect(text(h, '.mv-kind')).toBe('반지름');
    expect(text(h, '.mv-big')).toMatch(/^12\.50* mm$/);
    expect(text(h, '.mv-sub')).toMatch(/^지름 25(\.0+)? mm$/);
    expect(text(h, '.mv-prompt')).toMatch(/^호 또는 원 선택/);
    // 명령행 글은 그대로(반지름·지름 두 줄을 한 번에)
    expect(h.out()).toContainEqual(expect.stringMatching(/^반지름 = 12\.50* mm\n지름 = 25(\.0+)? mm$/));
    // 취소 단추(Esc)로 그만두면 마지막 값이 결과 카드에 남는다
    h.app.cmd.escape();
    await settle();
    expect(h.mv.card.classList.contains('is-result')).toBe(true);
    expect(text(h, '.mv-big')).toMatch(/^12\.50* mm$/);
  });

  it('면적: 점으로 둘러 재면 큰 면적(제곱 단위)과 둘레 보조 줄', async () => {
    const h = setup();
    void h.app.run('AREA');
    await settle();
    for (const p of [P(0, 0), P(40, 0), P(40, 30), P(0, 30)]) {
      h.click(p);
      await settle();
    }
    expect(text(h, '.mv-prompt')).toBe('다음 점 지정 <합계>:');
    (h.cmd as unknown as { type(t: string): void }).type('');
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(h.out()).toContainEqual(expect.stringMatching(/^면적 = 1200(\.0+)?, {2}둘레 = 140(\.0+)?$/));
    expect(text(h, '.mv-kind')).toBe('면적');
    expect(text(h, '.mv-big')).toMatch(/^1200(\.0+)? mm²$/);
    expect(text(h, '.mv-sub')).toMatch(/^둘레 140(\.0+)? mm$/);
  });
});
