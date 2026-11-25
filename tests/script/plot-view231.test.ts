/**
 * 231차: -PLOT 배치의 플롯 영역 뷰(V). Autodesk -PLOT 도움말은 플롯 영역의 뷰를 모형·배치 모두 VIEW 명령으로 저장한 뷰를 플롯하는 것으로 적는다.
 * 전에는 배치에서 뷰(V)를 고르면 「뷰 이름 입력:」으로 이름을 받고도 「배치의 이름 있는 뷰는 쓰지 않고 배치 전체를 플롯합니다.」를 알리고 배치 전체를
 * 플롯했다(230차 보고 (2)). 이제 받은 이름을 PLOT 대화 상자의 플롯 영역 뷰(74 = 3, 230차 plotViewRect — 종이 공간 뷰만, 중심 + 대상)와 같은 규칙으로
 * 풀어 그 범위를 창으로 플롯하고, 다음 PLOT 처음 칸도 그 뷰다. 없는 이름·모형 뷰 이름·Enter는 전처럼 한 번만 묻고 배치 전체(이름을 쳤으면 모형 뷰(V)와 같은
 * 「뷰 "…"을(를) 찾을 수 없습니다.」). 모형 뷰(V)(중심만 — 230차 보고 (1))·배치의 다른 영역·간단 구성은 그대로다.
 * 출력은 plotPages를 흉내 내 빈 쪽을 돌려(「출력할 내용이 없습니다.」) 그 앞에 남긴 출력 설정(lastSettings)을 본다.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CadDocument, Layout, ViewRecord } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { registerDashCommands } from '../../src/app/dashcmds';
import { pageFormOf } from '../../src/app/pagesetup-ui';
import { initialPlotForm, lastSettings } from '../../src/app/plot';
import { catalogs, translate } from '../../site/i18n.mjs';
import { makeScriptApp } from './app';

vi.mock('../../src/app/plot', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/app/plot')>();
  return { ...m, plotPages: async () => [] };
});

const OLD = '배치의 이름 있는 뷰는 쓰지 않고 배치 전체를 플롯합니다.';
const EMPTY = '출력할 내용이 없습니다.';

function viewRec(handle: string, name: string, flags: number, center: [number, number], width: number, height: number, target: [number, number]): ViewRecord {
  return { name, handle, flags, center: { x: center[0], y: center[1] }, width, height, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: target[0], y: target[1], z: 0 }, twist: 0 };
}

/** 모형 뷰 Front·Side(대상 점 10, 5), 종이 공간 뷰 Sheet(대상 점 10, 5 — 범위 0,0~200,100) */
function withViews(doc: CadDocument): void {
  for (const v of [
    viewRec('F0A1', 'Front', 0, [50, 25], 100, 50, [0, 0]),
    viewRec('F0A2', 'Side', 0, [0, 0], 40, 20, [10, 5]),
    viewRec('F0A3', 'Sheet', 1, [90, 45], 200, 100, [10, 5]),
  ])
    doc.views.set(tableKey(v.name), v);
}

function setup() {
  const h = makeScriptApp(withViews);
  registerDashCommands(h.app);
  // 시험 앱에는 공간 바꾸기가 없다 — -PLOT이 배치를 보이려고 부르는 것만 흉내 낸다
  (h.app as unknown as { setSpace: (b: string) => Promise<void> }).setSpace = async (b) => {
    h.st.space = tableKey(b);
  };
  return h;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** -PLOT을 명령행에 한 줄씩(오류 알림에서 스크립트가 멈추므로) — 프롬프트 앞머리로 답을 고르고 나머지는 Enter. 장치는 SVG(새 도면 배치의 장치는 없음) */
async function dashPlot(h: ReturnType<typeof setup>, answers: [prefix: string, answer: string][]) {
  const all: [string, string][] = [...answers, ['출력 장치', 'SVG']];
  void h.app.run('-PLOT');
  await flush();
  for (let i = 0; i < 40 && h.app.busyCommand; i++) {
    const p = h.prompts[h.prompts.length - 1]!;
    h.app.submitInput(all.find(([pre]) => p.startsWith(pre))?.[1] ?? '');
    await flush();
  }
  expect(h.app.busyCommand).toBeNull();
  return lastSettings.get(h.st);
}

const layoutV = (name: string): [string, string][] => [
  ['상세한', 'Y'],
  ['배치 이름', 'Layout1'],
  ['플롯 영역', 'V'],
  ['뷰 이름 입력', name],
];
const asked = (h: ReturnType<typeof setup>, prefix: string) => h.prompts.filter((p) => p.startsWith(prefix)).length;
const paperLayout = (doc: CadDocument): Layout => doc.layouts.find((l) => tableKey(l.blockName) !== MODEL_SPACE)!;

describe('-PLOT 배치 뷰(V)가 받은 이름(231차)', () => {
  it('받은 이름(대소문자 무관)의 종이 공간 뷰 범위(중심 + 대상)를 창으로 플롯하고, 다음 PLOT 처음 칸도 그 뷰다', async () => {
    const h = setup();
    const s = await dashPlot(h, layoutV('sheet'));
    // 전에는 { what: 'layout', area: 'layout' }(window·view 없음)와 OLD 알림
    expect(s).toMatchObject({ what: 'layout', area: 'window', window: [0, 0, 200, 100], view: 'Sheet', format: 'svg' });
    expect(h.st.space).toBe(tableKey(paperLayout(h.doc).blockName));
    expect(asked(h, '뷰 이름 입력:')).toBe(1);
    expect(h.errors()).toEqual([EMPTY]);
    expect(h.out()).not.toContain(OLD);
    const lay = paperLayout(h.doc);
    expect(initialPlotForm(lay, false, s, pageFormOf(lay.plot, false)).form).toMatchObject({ area: 'view', view: 'Sheet' });
  });

  it('없는 이름·모형 뷰 이름·Enter는 전처럼 한 번만 묻고 배치 전체(이름을 쳤으면 찾을 수 없다고 알림)', async () => {
    for (const [name, errs] of [
      ['Gone', ['뷰 "Gone"을(를) 찾을 수 없습니다.', EMPTY]],
      ['Front', ['뷰 "Front"을(를) 찾을 수 없습니다.', EMPTY]],
      ['', [EMPTY]],
    ] as [string, string[]][]) {
      const h = setup();
      const s = await dashPlot(h, layoutV(name));
      expect(s, name).toMatchObject({ what: 'layout', area: 'layout' });
      expect([s?.window, s?.view], name).toEqual([undefined, undefined]);
      expect(asked(h, '뷰 이름 입력:'), name).toBe(1);
      // 다음 프롬프트는 축척(다시 묻지 않는다 — 스크립트 흐름 그대로)
      expect(h.prompts[h.prompts.indexOf('뷰 이름 입력:') + 1], name).toMatch(/^플롯 축척 입력/);
      expect(h.errors(), name).toEqual(errs);
      expect(h.out(), name).not.toContain(OLD);
    }
  });

  it('그대로인 갈래: 모형 뷰(V)는 중심만 쓴 창, 배치의 범위·배치 영역과 간단 구성은 전과 같다', async () => {
    const m = setup();
    // 모형 뷰(V)는 대상 점을 더하지 않는다(230차 보고 (1) — 고치면 기존 결과가 바뀌어 따로)
    expect(await dashPlot(m, [['상세한', 'Y'], ['배치 이름', '모형'], ['플롯 영역', 'V'], ['뷰 이름 입력', 'Side']])).toMatchObject({ what: 'window', window: [-20, -10, 20, 10] });
    expect(lastSettings.get(m.st)?.view).toBeUndefined();
    for (const [key, area] of [
      ['E', 'extents'],
      ['L', 'layout'],
    ]) {
      const h = setup();
      const s = await dashPlot(h, [['상세한', 'Y'], ['배치 이름', 'Layout1'], ['플롯 영역', key]]);
      expect(s, key).toMatchObject({ what: 'layout', area });
      expect([s?.view, asked(h, '뷰 이름 입력:')], key).toEqual([undefined, 0]);
    }
    const k = setup();
    const s = await dashPlot(k, [['상세한', 'N'], ['배치 이름', 'Layout1']]);
    expect(s).toMatchObject({ what: 'layout' });
    expect([s?.area, s?.view]).toEqual([undefined, undefined]);
    expect(k.errors()).toEqual([EMPTY]);
  });

  it('알림은 사전에 있는 열쇠(모형 뷰(V)와 같은 글)이고, 쓰지 않게 된 옛 알림 열쇠는 네 언어 사전에서 뺐다', () => {
    expect(translate('뷰 "Gone"을(를) 찾을 수 없습니다.', 'en')).toBe('View "Gone" not found.');
    for (const l of ['de', 'ja', 'zh-CN']) expect(translate('뷰 "Gone"을(를) 찾을 수 없습니다.', l), l).not.toMatch(/[가-힣]/);
    for (const l of ['en', 'de', 'ja', 'zh-CN'] as const) expect(OLD in catalogs[l], l).toBe(false);
  });
});
