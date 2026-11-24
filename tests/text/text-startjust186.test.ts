// @vitest-environment jsdom
/**
 * 186차: TEXT 시작점 프롬프트에서 자리맞추기 옵션을 바로 받는다.
 * Autodesk TEXT 도움말(2026) 자리맞추기 절: 이 옵션들은 시작점 지정 프롬프트에서도 입력할 수 있다 —
 * 왼쪽·중심·오른쪽·정렬·중간·맞춤·TL~BR 열다섯 옵션을 「문자의 시작점 지정 또는 [자리맞추기(J)/스타일(S)]:」에서 쳐도 된다.
 * 전에는 자리맞추기(J)·스타일(S)만 받아 MC 같은 입력은 「점이 올바르지 않습니다」였다(R은 따옴표 없는 투명 REDRAW로 갔다).
 * 프롬프트 글은 그대로(AutoCAD도 [자리맞추기/스타일]만 보인다)이고, 고른 뒤 흐름은 자리맞추기(J) 다음과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextEntity } from '../../src/core/model';
import { JUSTIFY_PROMPT, TEXT_JUSTIFY, registerTextCommands } from '../../src/app/textedit/commands';
import { registerUtil2MiscCommands } from '../../src/app/util2-misc';
import { activeEditor } from '../../src/app/textedit/editor';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

const START = '문자의 시작점 지정 또는 [자리맞추기(J)/스타일(S)]:';
const BAD_POINT = '점이 올바르지 않습니다. 예: 100,50  @20,0  @30<45';

function setup() {
  const h = makeApp();
  registerTextCommands(h.app);
  // REDRAW(별칭 R, 투명 명령)가 있는 앱에서 R이 무엇이 되는지 본다
  registerUtil2MiscCommands(h.app);
  h.app.text.layoutMText = ((p: { height: number; text: string }) => ({ glyphs: [], lines: [], minX: 0, minY: -p.height, maxX: p.text.length * p.height, maxY: 0 })) as never;
  return h;
}

/** TEXT를 시작하고 입력을 차례로 넣는다. 입력마다 그 뒤의 프롬프트를 모은다 */
async function textBy(inputs: string[]) {
  const h = setup();
  void h.app.run('TEXT');
  await settle();
  const prompts = [h.cmd.prompt];
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
    prompts.push(h.cmd.prompt);
  }
  const texts = [...h.doc.entityIndex.values()].filter((x): x is TextEntity => x.type === 'TEXT');
  const errors = h.cmd.lines.filter((l) => l.cls === 'err').map((l) => l.text);
  return { h, texts, prompts, errors };
}

const pick = (t: TextEntity | undefined) =>
  t && { text: t.text, halign: t.halign, valign: t.valign, insert: t.insert, alignPoint: t.alignPoint, rotation: t.rotation, height: t.height };

/** 자리맞추기 뒤의 입력: 정렬(A)은 두 끝점(높이를 묻지 않음), 맞춤(F)은 두 끝점과 높이, 나머지는 점·높이·회전 */
const after = (k: string): string[] => (k === 'A' ? ['0,0', '20,0', '글', ''] : k === 'F' ? ['0,0', '20,0', '3', '글', ''] : ['10,10', '3', '0', '글', '']);

describe('TEXT 시작점 프롬프트의 자리맞추기 옵션(186차)', () => {
  it('열다섯 옵션 모두: 시작점에서 친 것 = 자리맞추기(J) 뒤에 친 것(같은 문자, 알림 없음)', async () => {
    expect(TEXT_JUSTIFY.map(([k]) => k)).toEqual(['L', 'C', 'R', 'A', 'M', 'F', 'TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR']);
    for (const [k, , h, v] of TEXT_JUSTIFY) {
      const viaJ = await textBy(['J', k, ...after(k)]);
      const direct = await textBy([k, ...after(k)]);
      expect(viaJ.texts, k).toHaveLength(1);
      expect(viaJ.texts[0], k).toMatchObject({ text: '글', halign: h, valign: v });
      expect(direct.errors, k).toEqual([]);
      expect(direct.texts, k).toHaveLength(1);
      expect(pick(direct.texts[0]), k).toEqual(pick(viaJ.texts[0]));
    }
  });

  it('MC: 프롬프트 글은 그대로, 자리맞추기 목록을 묻지 않고 그 점을 묻는다(소문자도) — 정렬점 (10, 10)', async () => {
    const r = await textBy(['mc', '10,10', '3', '0', '가운데', '']);
    expect(r.prompts[0]).toBe(START);
    expect(r.prompts[1]).toBe('문자의 중간 중심점 지정:');
    expect(r.prompts).not.toContain(JUSTIFY_PROMPT);
    expect(r.errors).toEqual([]);
    expect(r.texts[0]).toMatchObject({ text: '가운데', halign: 1, valign: 2, height: 3 });
    expect(r.texts[0]!.alignPoint).toMatchObject({ x: 10, y: 10 });
  });

  it('정렬(A)·맞춤(F): 기준선 두 끝점, 회전은 두 점 방향(정렬은 높이를 묻지 않음)', async () => {
    const a = await textBy(['A', '0,0', '0,20', '세로', '']);
    expect(a.prompts[1]).toBe('문자 기준선의 첫 번째 끝점 지정:');
    expect(a.prompts[2]).toBe('문자 기준선의 두 번째 끝점 지정:');
    expect(a.texts[0]).toMatchObject({ text: '세로', halign: 3, valign: 0, insert: { x: 0, y: 0 }, alignPoint: { x: 0, y: 20 } });
    expect(a.texts[0]!.rotation).toBeCloseTo(Math.PI / 2);
    const f = await textBy(['F', '0,0', '20,0', '4', '맞춤', '']);
    expect(f.texts[0]).toMatchObject({ text: '맞춤', halign: 5, valign: 0, height: 4, alignPoint: { x: 20, y: 0 } });
  });

  it('R은 오른쪽(도움말 옵션)이고, 따옴표를 붙인 \'R은 전처럼 투명 REDRAW 뒤 같은 프롬프트', async () => {
    const r = await textBy(['R', '10,10', '3', '0', '오른쪽', '']);
    expect(r.prompts[1]).toBe('문자 기준선의 오른쪽 끝점 지정:');
    expect(r.texts[0]).toMatchObject({ text: '오른쪽', halign: 2, valign: 0, alignPoint: { x: 10, y: 10 } });
    const q = await textBy(["'R", '10,10', '3', '0', '왼쪽', '']);
    expect(q.prompts[1]).toBe(START);
    expect(q.errors).toEqual([]);
    expect(q.texts[0]).toMatchObject({ text: '왼쪽', halign: 0, valign: 0, insert: { x: 10, y: 10 } });
    expect(q.texts[0]!.alignPoint).toBeUndefined();
  });

  it('전과 같음: 옵션이 아닌 글은 알리고 같은 프롬프트, 시작점을 찍으면 왼쪽', async () => {
    const r = await textBy(['ZZ', '10,10', '3', '0', '왼쪽', '']);
    expect(r.errors).toEqual([BAD_POINT]);
    expect(r.prompts[1]).toBe(START);
    expect(r.texts).toHaveLength(1);
    expect(r.texts[0]).toMatchObject({ text: '왼쪽', halign: 0, valign: 0, insert: { x: 10, y: 10 }, height: 3 });
    const d = await textBy(['5,5', '2', '0', '기본', '']);
    expect(d.texts[0]).toMatchObject({ text: '기본', halign: 0, valign: 0, insert: { x: 5, y: 5 }, height: 2 });
  });
});
