/**
 * 109차: 대화 상자 몸체를 DOM으로 짓는 목록·표·고르기 항목의 도면 이름도 화면 번역층이 옮기지 않는다(104·108차 꼴 — translate="no"·ft).
 * 도면 이름이 앱 글과 같을 때(배치·축척·다중 지시선 스타일 이름 "표준"·"표") 네 언어 화면에서 그대로 남고, 같은 대화 상자의 앱 글은 옮긴다.
 * - LAYOUTMOVE(배치 이동 또는 복사)의 앞 배치 고르기 — 값이 블록 키라 고르기 항목 지킴(값 = 글)이 못 알아보던 곳
 * - PUBLISH의 시트 줄(배치 이름)과 확인란 이름표
 * - SCALELISTEDIT(도면 축척 편집)의 축척 목록
 * - 특성 팔레트의 다중 지시선 스타일 고르기(값이 핸들)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import type { CadDocument, MLeaderStyleObject } from '../src/core/model';
import { createNewDocument } from '../src/core/newdoc';
import { h as el } from '../src/app/ui/dom';
import { registerLayoutCommands } from '../src/app/layoutcmds';
import { registerPlotCommands } from '../src/app/plot';
import { scaleListDialog } from '../src/app/annoscale-ui';
import { MLEADER_FIELDS } from '../src/app/propedit';
import { translate } from '../site/i18n.mjs';
import { makeHarness } from './cmds2/harness';
import { runWith } from './drawmod/ctx';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

type Opt = { value: string; label: string };
const forms: { title: string; fields: { key: string; options?: Opt[] }[] }[] = [];
const bodies: HTMLElement[] = [];
vi.mock('../src/app/ui/dom', async (orig) => ({
  ...(await orig<object>()),
  form: vi.fn(async (title: string, fields: { key: string; options?: Opt[] }[]) => {
    forms.push({ title, fields });
    return null;
  }),
}));
vi.mock('../src/app/mgr-ui', async (orig) => ({
  ...(await orig<object>()),
  resultDialog: vi.fn(async (_title: string, body: HTMLElement) => {
    bodies.push(body);
    return null;
  }),
}));
vi.mock('../src/app/util2-ui', async (orig) => ({
  ...(await orig<object>()),
  modal: vi.fn((_title: string, body: HTMLElement) => {
    bodies.push(body);
    return { done: Promise.resolve(null), close: () => {}, back: body };
  }),
}));
// 도면 축척 리스트: 앱 글과 같은 이름
vi.mock('../src/edit/annoscale', async (orig) => ({
  ...(await orig<object>()),
  readScaleList: () => [
    { name: '표준', paper: 1, drawing: 1, unit: false },
    { name: '표', paper: 1, drawing: 2, unit: false },
  ],
}));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  forms.length = 0;
  bodies.length = 0;
  vi.unstubAllGlobals();
});

const NAMES = ['표준', '표'];

/** 배치 둘(표준·표)과 다중 지시선 스타일 둘(표준·표)을 둔 문서 */
function fill(doc: CadDocument): void {
  Object.assign(doc, createNewDocument('metric'));
  const p0 = doc.layouts.find((l) => !/^\*model_space$/i.test(l.blockName))!;
  p0.name = NAMES[0]!;
  // 둘째 배치(새 문서에는 하나뿐)
  const blk = doc.blocks.get(p0.blockName.toUpperCase())!;
  doc.blocks.set('*PAPER_SPACE0', { ...blk, name: '*Paper_Space0', handle: 'FD0', recordHandle: 'FD1', entities: [] });
  doc.layouts.push({ ...structuredClone(p0), name: NAMES[1]!, blockName: '*Paper_Space0', handle: 'FD2', tabOrder: p0.tabOrder + 1 });
  const base = [...doc.objects.values()].find((o): o is MLeaderStyleObject => o.type === 'MLEADERSTYLE')!;
  NAMES.forEach((name, i) => doc.objects.set(`FE${i}`, { ...structuredClone(base), handle: `FE${i}`, name }));
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function setup(lang: string) {
  const dom = new JSDOM(`<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header></div></body></html>`, { url: `https://gyutae-kim.github.io/opencad-dwgdxf/${lang}/` });
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  const h = makeHarness(fill);
  registerLayoutCommands(h.app);
  registerPlotCommands(h.app);
  installFileGuard({ docs: [{ doc: h.doc }] });
  dispose = await installLocalization(document.getElementById('app')!);
  return h;
}

/** 대화 상자 몸체를 화면에 붙이고 번역층이 돈 뒤 */
async function shown(node: HTMLElement): Promise<HTMLElement> {
  document.getElementById('app')!.append(node);
  await tick();
  return node;
}

/** form()이 고르기 칸을 짓는 꼴(ui/dom.ts form과 같다) */
const selectOf = (options: Opt[]) => el('select', {}, ...options.map((o) => el('option', { value: o.value }, o.label)));
const texts = (root: Element, sel: string) => [...root.querySelectorAll(sel)].map((x) => x.textContent!.trim());

describe('대화 상자 목록·표·고르기 항목의 도면 이름(109차)', () => {
  for (const lang of ['en', 'ja', 'zh-CN', 'de'])
    it(`${lang}: 배치·축척·다중 지시선 스타일 이름 "표준"·"표"는 그대로, 앱 글은 옮긴다`, async () => {
      const h = await setup(lang);
      // 이 시험이 실제 결함을 보는지: 표시 없는 같은 이름(값이 열쇠)은 옮겨진다
      const bare = await shown(selectOf(NAMES.map((n, i) => ({ value: `K${i}`, label: n }))));
      expect(texts(bare, 'option')).toEqual(NAMES.map((n) => translate(n, lang)));
      expect(texts(bare, 'option')).not.toEqual(NAMES);

      // LAYOUTMOVE: 앞 배치 고르기(지금 배치 = 첫 배치라 둘째 배치와 끝으로 이동)
      await runWith(h, 'LAYOUTMOVE', []);
      const before = forms.at(-1)!.fields.find((f) => f.key === 'before')!.options!;
      const sel = await shown(selectOf(before));
      expect(texts(sel, 'option')).toEqual([NAMES[1], translate('(끝으로 이동)', lang)]);

      // PUBLISH: 시트 줄은 배치 이름, 모형 줄·묶음 제목은 앱 글
      await runWith(h, 'PUBLISH', []);
      const pub = await shown(bodies.at(-1)!);
      const rows = texts(pub, '.mgr-row span');
      expect(rows).toEqual(expect.arrayContaining(NAMES));
      expect(rows).toContain(translate('모형(범위, 용지에 맞춤)', lang));
      expect(texts(pub, 'legend')).toEqual([translate('게시할 시트', lang)]);
      const labels = [...pub.querySelectorAll('input[type=checkbox]')].map((x) => x.getAttribute('aria-label')!);
      for (const n of NAMES) expect(labels.some((l) => l.endsWith(` - ${n}`) && !/[⁨⁩]/.test(l))).toBe(true);

      // SCALELISTEDIT: 축척 목록(▶ 현재 표시는 기호)
      await scaleListDialog(h.app, h.st);
      const scales = await shown(bodies.at(-1)!);
      expect(texts(scales, '.as-item').map((t) => t.replace(/^▶\s*/, ''))).toEqual(NAMES);
      expect(texts(scales, '.u2-note')[0]).toBe(translate('축척 리스트', lang));

      // 특성 팔레트: 다중 지시선 스타일(값이 핸들)
      const ml = await shown(selectOf(MLEADER_FIELDS[0]!.options!(h.doc).filter((o) => o.value.startsWith('FE'))));
      expect(texts(ml, 'option')).toEqual(NAMES);
    });

  it('보이는 글·값은 그대로(표시는 번역층이 지운다)', () => {
    const doc = createNewDocument('metric');
    fill(doc);
    const opts = MLEADER_FIELDS[0]!.options!(doc).filter((o) => o.value.startsWith('FE'));
    expect(opts).toEqual(NAMES.map((n, i) => ({ value: `FE${i}`, label: ft(n) })));
  });
});
