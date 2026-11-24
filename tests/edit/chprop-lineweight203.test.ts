/**
 * 203차: CHPROP·CHANGE 특성(P)의 선가중치(LW)가 표준 선가중치 표에 없는 값을 가장 가까운 표준 값으로 맞춘다.
 * 근거 — Autodesk CHPROP 도움말(2026) 「선가중치」: 선가중치 값은 정해진 값이고, 정해진 값이 아닌 값을 넣으면 가장 가까운
 * 정해진 값을 고른 객체에 준다(-LWEIGHT 도움말도 그 밖의 값은 가장 가까운 유효 값 — 둘 다 범위 말은 없다).
 * 계산은 이 앱의 -LAYER 선가중치(`parseLineweight`)와 같은 `nearestLineweight`(한가운데면 작은 쪽).
 * 전에는 입력 × 100을 그대로 두어(0.29 → 29, 3 → 300) 객체에 표 밖 값이 남았고, 저장할 때 DWG 쓰기는 표의 아래 값(0.29 → 0.25),
 * DXF 쓰기는 가장 가까운 값(0.29 → 0.30)과 알림으로 바꿔 같은 객체가 저장 형식마다 다른 선가중치가 됐다.
 * 음수는 도움말에 말이 없어 받지 않는다(알림 뒤 특성 프롬프트로 — 객체 값은 그대로).
 * 표준 값·BYLAYER·BYBLOCK·DEFAULT·Enter는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { registerPropCommands } from '../../src/app/propcmds';
import { makeHarness } from '../cmds2/harness';
import { line } from './make';

const ERR = '선가중치는 mm 값(예: 0.25)이나 BYLAYER로 입력하십시오.';

function harness() {
  const h = makeHarness();
  registerPropCommands(h.app);
  const a = h.add(line(0, 0, 10, 0)).handle;
  const b = h.add(line(0, 5, 10, 5)).handle;
  return { h, a, b };
}
type H = ReturnType<typeof harness>['h'];
const lwOf = (h: H, handle: string) => h.doc.entityIndex.get(handle)!.lineweight;

/** 선가중치 값들을 선으로 담은 새 문서(DWG·DXF 쓰기·읽기용) */
function lineDoc(lws: number[]): CadDocument {
  const doc = createNewDocument('metric');
  lws.forEach((lineweight, i) => {
    const handle = `A${i + 1}`;
    const e = { ...entityDefaults(), type: 'LINE', handle, lineweight, start: { x: 0, y: i, z: 0 }, end: { x: 1, y: i, z: 0 } } as LineEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
    doc.entityIndex.set(handle, e as Entity);
  });
  return doc;
}
const lwsOf = (doc: CadDocument, n: number) => Array.from({ length: n }, (_, i) => doc.entityIndex.get(`A${i + 1}`)!.lineweight);

describe('CHPROP·CHANGE 특성의 선가중치 — 표준 표에 없는 값(203차)', () => {
  it('표에 없는 값은 가장 가까운 표준 값: 0.29 → 0.30, 0.27 → 0.25, 0.52 → 0.53, 3 → 2.11 — 명령 취소 한 단계', async () => {
    const cases: [string, number][] = [
      ['0.29', 30],
      ['0.27', 25],
      ['0.52', 53],
      ['1.1', 106],
      ['3', 211],
    ];
    for (const [input, want] of cases) {
      const { h, a, b } = harness();
      const depth = h.st.session.depth;
      await h.run('CHPROP', [{ sel: [a, b] }, 'LW', input, '']);
      expect(h.printed).not.toContain(ERR);
      expect([input, lwOf(h, a), lwOf(h, b)]).toEqual([input, want, want]);
      expect(h.st.session.depth).toBe(depth + 1);
      h.st.session.undo();
      expect(lwOf(h, a)).toBe(-1);
    }
  });

  it('CHANGE 특성(P)의 선가중치도 같은 공통 함수로 맞춘다', async () => {
    const { h, a } = harness();
    await h.run('CHANGE', [{ sel: [a] }, 'P', 'LW', '0.27', '']);
    expect(lwOf(h, a)).toBe(25);
  });

  it('맞춘 값은 DWG·DXF 어느 쪽으로 저장해도 같은 선가중치로 읽힌다 — 표 밖 값을 그대로 쓰면 형식마다 달라진다(쓰기 코드는 그대로)', async () => {
    const { h, a, b } = harness();
    await h.run('CHPROP', [{ sel: [a] }, 'LW', '0.29', '']);
    await h.run('CHPROP', [{ sel: [b] }, 'LW', '3', '']);
    const lws = [lwOf(h, a), lwOf(h, b)];
    expect(lws).toEqual([30, 211]);
    const doc = lineDoc(lws);
    for (const version of ['AC1018', 'AC1032'] as const) expect([version, ...lwsOf(readDwg(writeDwg(doc, { version }).data), 2)]).toEqual([version, 30, 211]);
    const dxf = writeDxf(doc);
    expect(lwsOf(readDxf(dxf.data), 2)).toEqual([30, 211]);
    expect(dxf.warnings.some((w) => w.code === 'entity.lineweight_fixed')).toBe(false);
    // 전처럼 객체에 29·300이 남으면: DWG 쓰기 `lwIndex`는 표의 아래 값 번호(0.25·2.11), DXF 쓰기 `validLineweight`는 가장 가까운 값(0.30·2.11)과 알림
    const raw = lineDoc([29, 300]);
    expect(lwsOf(readDwg(writeDwg(raw, { version: 'AC1032' }).data), 2)).toEqual([25, 211]);
    const rawDxf = writeDxf(raw);
    expect(lwsOf(readDxf(rawDxf.data), 2)).toEqual([30, 211]);
    expect(rawDxf.warnings.some((w) => w.code === 'entity.lineweight_fixed')).toBe(true);
  });

  it('음수는 받지 않고 알린 뒤 특성 프롬프트로 돌아간다 — 객체 값은 그대로', async () => {
    const { h, a } = harness();
    await h.run('CHPROP', [{ sel: [a] }, 'LW', '0.5', 'LW', '-0.5', '']);
    expect(h.printed).toContain(ERR);
    expect(lwOf(h, a)).toBe(50);
  });

  it('전과 같은 값: 표준 값·0·2.11·BYLAYER·BYBLOCK·DEFAULT·Enter, 숫자가 아닌 글은 같은 알림', async () => {
    const cases: [string, number][] = [
      ['0.3', 30],
      ['0.25', 25],
      ['0', 0],
      ['2.11', 211],
      ['BYBLOCK', -2],
      ['DEFAULT', -3],
      ['기본값', -3],
      ['bylayer', -1],
    ];
    for (const [input, want] of cases) {
      const { h, a } = harness();
      await h.run('CHPROP', [{ sel: [a] }, 'LW', '0.5', 'LW', input, '']);
      expect([input, lwOf(h, a)]).toEqual([input, want]);
      expect(h.printed).not.toContain(ERR);
    }
    const e = harness();
    await e.h.run('CHPROP', [{ sel: [e.a] }, 'LW', '0.5', 'LW', '', '']);
    expect(lwOf(e.h, e.a)).toBe(-1);
    const bad = harness();
    await bad.h.run('CHPROP', [{ sel: [bad.a] }, 'LW', 'abc', '']);
    expect(bad.h.printed).toContain(ERR);
    expect(lwOf(bad.h, bad.a)).toBe(-1);
  });
});
