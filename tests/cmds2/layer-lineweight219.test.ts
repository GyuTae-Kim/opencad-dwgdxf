/**
 * 219차: -LAYER 선가중치(LW)가 2.11 mm 넘는 값을 가장 가까운 고정 값(2.11 mm)으로 받는다.
 * 근거 — Autodesk AutoCAD LT 2026 -LAYER 도움말 「선가중치」: 맞지 않는 선가중치를 넣으면 가장 가까운 고정 선가중치 값이 된다
 * (범위·거절·다시 묻기 말은 없다). 계산은 203차 CHPROP·204차 CELWEIGHT와 같은 `nearestLineweight`(2.11 넘으면 2.11).
 * 전에는 「0.0mm에서 2.11mm 사이의 선가중치를 입력하십시오.」를 알리고 다시 물었다.
 * 표 안 값(가장 가까운 표준 값)·2.11·기본값·Enter, 숫자가 아닌 글·음수의 알림, -LAYERSTATE가 쓰는 해석기 기본값은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { parseLineweight } from '../../src/edit/layercmd';
import { registerDashLayerCommand } from '../../src/app/layercmd';
import { makeHarness } from './harness';

const ERR = '0.0mm에서 2.11mm 사이의 선가중치를 입력하십시오.';

function harness() {
  const h = makeHarness((doc: CadDocument) => {
    const l0 = doc.layers.get('0')!;
    doc.layers.set('A1', { ...l0, name: 'A1', handle: 'B1' });
    doc.layers.set('A2', { ...l0, name: 'A2', handle: 'B2' });
    doc.layers.set('B', { ...l0, name: 'B', handle: 'B3', lineweight: 50 });
  });
  registerDashLayerCommand(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const lw = (h: H, n: string) => h.doc.layers.get(tableKey(n))!.lineweight;

describe('-LAYER 선가중치의 2.11 mm 넘는 값(219차)', () => {
  it('2.11 mm 넘는 값은 2.11 mm — 알림 없이 도면층 이름을 묻고, 명령 취소 한 단계', async () => {
    for (const input of ['3', '2.2', '2.5mm', '10']) {
      const h = harness();
      const depth = h.st.session.depth;
      await h.run('-LAYER', ['LW', input, 'A1', '']);
      expect([input, lw(h, 'A1')]).toEqual([input, 211]);
      expect(h.printed).not.toContain(ERR);
      expect(h.prompts.some((p) => p.startsWith('선가중치 2.11mm에 대한 도면층의 이름 리스트 입력'))).toBe(true);
      expect(h.st.session.depth).toBe(depth + 1);
      h.st.session.undo();
      expect(lw(h, 'A1')).toBe(-3);
    }
  });

  it('DWG(AC1018·AC1032)·DXF에 쓰고 읽어도 2.11 mm', async () => {
    const h = harness();
    await h.run('-LAYER', ['LW', '2.5mm', 'A1', '']);
    const doc = createNewDocument('metric');
    doc.layers.set('A1', { ...doc.layers.get('0')!, name: 'A1', handle: '', lineweight: lw(h, 'A1') });
    for (const version of ['AC1018', 'AC1032'] as const) {
      expect([version, readDwg(writeDwg(doc, { version }).data).layers.get('A1')!.lineweight]).toEqual([version, 211]);
    }
    expect(readDxf(writeDxf(doc).data).layers.get('A1')!.lineweight).toBe(211);
  });

  it('전과 같은 값: 표 안 값은 가장 가까운 표준 값, 2.11·기본값, 숫자가 아닌 글·음수는 알림 뒤 다시 묻고, Enter는 바꾸지 않음', async () => {
    const h = harness();
    await h.run('-LAYER', ['LW', 'abc', '-0.5', '0.29', 'A1', 'LW', '2.11', 'A2', 'LW', '기본값', 'B', '']);
    expect([lw(h, 'A1'), lw(h, 'A2'), lw(h, 'B')]).toEqual([30, 211, -3]);
    expect(h.printed.filter((t) => t === ERR)).toHaveLength(2);
    const depth = h.st.session.depth;
    await h.run('-LAYER', ['LW', '', '']);
    expect(h.st.session.depth).toBe(depth);
    expect([lw(h, 'A1'), lw(h, 'A2'), lw(h, 'B')]).toEqual([30, 211, -3]);
  });

  it('해석기: 기본값(-LAYERSTATE 갈래)은 전처럼 2.11 넘는 값을 받지 않고, -LAYER 갈래만 2.11로 맞춘다', () => {
    expect(parseLineweight('3')).toBeNull();
    expect(parseLineweight('2.2')).toBeNull();
    expect([parseLineweight('3', true), parseLineweight('2.5mm', true), parseLineweight('2.11', true), parseLineweight('0.29', true)]).toEqual([211, 211, 211, 30]);
    expect([parseLineweight('-0.5', true), parseLineweight('abc', true), parseLineweight('기본값', true)]).toEqual([null, null, -3]);
  });
});
