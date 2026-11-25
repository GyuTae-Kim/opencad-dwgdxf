/**
 * 휴대폰 보기 모드의 정보 카드(누른 객체 하나의 치수 정보)와 데스크톱 특성 팔레트의 화면 언어(241차): 같은 객체·같은 언어에서
 * 앱이 쓴 낱말 값(치수 종류 "선형(수평)"·"정렬")은 화면 언어로 옮기고, 도면에서 온 글(표시 문자 — 사전 낱말과 같은 "정렬"이어도)은 그대로 둔다.
 * 팔레트는 104차부터 도면 글 줄(PropRow.file)만 지키는데, 카드는 값 칸을 모두 번역층에서 빼 네 언어 화면에서도 한국어로 남았다.
 * 진짜 App·MobileView·Palette·번역층(installLocalization), 화면·명령행·엔진·글꼴은 가짜(i18n-mobileview.test.ts와 같은 틀).
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, Entity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { installFileGuard } from '../../src/app/fileguard';
import { installLocalization } from '../../src/app/i18n';
import { MobileView } from '../../src/app/ui/mobileview';
import { Palette } from '../../src/app/ui/palettes';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dispose: (() => void) | undefined;
/** 시험이 끝난 뒤 카드가 다시 그리지 않게 지켜보기를 뗀다 */
const unwatch: (() => void)[] = [];
afterEach(async () => {
  for (const f of unwatch.splice(0)) f();
  await settle();
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

const stubDom = (url: string) => {
  const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header></div></body></html>', { url });
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  return dom;
};

const V = (x: number, y: number) => ({ x, y, z: 0 });
/** 길이 5의 치수(블록 없음 — 표시 문자는 측정값이나 문자 재지정). dimType 하위 3비트 0 선형(회전 0 → 수평), 1 정렬 */
const dim = (handle: string, kind: number, text: string): DimensionEntity => ({
  type: 'DIMENSION',
  ...entityDefaults(),
  handle,
  block: `*D${handle}`,
  dimStyle: 'ISO-25',
  dimType: 32 | kind,
  defPoint: V(5, 3),
  textMid: V(2.5, 3.5),
  defPoint2: V(0, 0),
  defPoint3: V(5, 0),
  defPoint4: V(0, 0),
  defPoint5: V(0, 0),
  text,
  measurement: 5,
  rotation: 0,
  obliqueAngle: 0,
  textRotation: 0,
  horizontalDirection: 0,
  attachment: 5,
  leaderLength: 0,
  lineSpacingStyle: 1,
  lineSpacingFactor: 1,
});

const tick = () => new Promise((r) => setTimeout(r, 0));

async function setup(lang: string) {
  stubDom(`https://gyutae-kim.github.io/opencad-dwgdxf/${lang}/`);
  const h = makeApp();
  registerCommands(h.app);
  const root = document.getElementById('app')!;
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  unwatch.push(() => {
    h.app.cmd.watchers.clear();
    h.app.cancel(true);
  });
  root.append(mv.bar, mv.card);
  // 데스크톱의 특성 팔레트(같은 문서·같은 고른 객체)
  const pal = new Palette(h.app, root);
  installFileGuard({ docs: [{ doc: h.doc }] });
  dispose = await installLocalization(root);
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 둔다(그 확인이 시험 안에서 끝나게)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
  mv.apply(true);
  await settle();
  const add = (e: Entity) => {
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  /** 보기 모드에서 객체 하나를 누른 뒤처럼: 고르고 카드·팔레트를 다시 그린 뒤 번역층이 돌게 */
  const show = async (handle: string) => {
    h.app.setSelection([handle], 'replace');
    mv.refresh();
    pal.open('props');
    await settle();
    await tick();
  };
  /** 정보 카드의 이름 → 값(화면에 보이는 글) */
  const card = () => new Map([...mv.card.querySelectorAll('.mv-rows dt')].map((dt) => [dt.textContent ?? '', dt.nextElementSibling?.textContent ?? '']));
  /** 팔레트의 읽기 줄(편집 칸 아님) 이름 → 값 */
  const palette = () => new Map([...pal.el.querySelectorAll('.prop-row:not(.edit)')].map((r) => [r.querySelector('.k')?.textContent ?? '', r.querySelector('.v')?.textContent ?? '']));
  return { ...h, mv, pal, add, show, card, palette };
}

describe('휴대폰 정보 카드 값의 화면 언어 = 데스크톱 특성 팔레트(241차)', () => {
  it.each(['en', 'ja'])('%s: 치수 종류(앱 낱말)는 옮기고, 측정값(수)은 그대로 — 팔레트와 같은 글', async (lang) => {
    const tr = (s: string) => translate(s, lang);
    // 사전에 있는 낱말이다(옮겨야 하는 글)
    expect(tr('선형(수평)')).not.toBe('선형(수평)');
    expect(tr('치수 종류')).not.toBe('치수 종류');
    const h = await setup(lang);
    const d = h.add(dim(h.st.session.newHandle(), 0, ''));
    await h.show(d);
    expect(h.mv.card.classList.contains('is-info')).toBe(true);
    // 데스크톱 팔레트(기준): 치수 종류 값이 화면 언어
    expect(h.palette().get(tr('치수 종류'))).toBe(tr('선형(수평)'));
    // 휴대폰 카드도 같은 글(전에는 "선형(수평)" 그대로)
    expect(h.card().get(tr('치수 종류'))).toBe(tr('선형(수평)'));
    expect(h.card().get(tr('치수 종류'))).toBe(h.palette().get(tr('치수 종류')));
    // 수 값은 번역층을 지나도 그대로
    expect(h.card().get(tr('측정값'))).toMatch(/^5(\.0+)?$/);
    // 표시 문자(도면 글)는 둘이 같다
    expect(h.card().get(tr('표시 문자'))).toBe(h.palette().get(tr('표시 문자')));
  });

  it('en: 도면 글 값은 사전 낱말과 같아도 그대로 — 정렬 치수의 문자 재지정 "정렬"', async () => {
    const tr = (s: string) => translate(s, 'en');
    expect(tr('정렬')).toBe('Align');
    const h = await setup('en');
    const d = h.add(dim(h.st.session.newHandle(), 1, '정렬'));
    await h.show(d);
    const card = h.card();
    // 앱 낱말(치수 종류 정렬)은 옮기고, 같은 낱말의 도면 글(표시 문자)은 그대로
    expect(card.get(tr('치수 종류'))).toBe('Align');
    expect(card.get(tr('표시 문자'))).toBe('정렬');
    // 팔레트와 같다
    const pal = h.palette();
    expect(pal.get(tr('치수 종류'))).toBe('Align');
    expect(pal.get(tr('표시 문자'))).toBe('정렬');
    // 카드 제목의 도면층 이름도 그대로(번역층 밖)
    expect(h.mv.card.querySelector('.mv-layer')?.textContent).toBe('0');
  });
});
