/**
 * 204차: 새 객체의 선가중치 CELWEIGHT를 변수 이름 입력·SETVAR·SYSVDLG(`setSysvarText`)와 AutoLISP setvar로 정할 때
 * 표준 선가중치 표에 없는 값을 가장 가까운 표준 값으로 맞춘다.
 * 근거 — Autodesk CELWEIGHT 도움말(2026): −1·−2·−3 밖의 유효 값은 1/100 mm 표준 값 24개(0·5·…·200·211)다.
 * -LWEIGHT 도움말(2026): 같은 설정(새 객체의 기본 선가중치)에 유효 값이 아닌 값을 넣으면 가장 가까운 유효 값이 된다.
 * 계산은 CHPROP(203차)·-LAYER 선가중치와 같은 `nearestLineweight`(한가운데면 작은 쪽).
 * 전에는 29를 그대로 두어, 저장할 때 DWG 머리말은 표의 아래 값(`lwIndex` — 0.25), DXF 머리말은 29 그대로였고,
 * 그 값으로 그린 새 객체는 DWG 0.25·DXF 0.30(알림)으로 저장 형식마다 달랐다.
 * 범위(−3~211) 밖·정수가 아닌 값은 SETVAR의 지금 알림 그대로다. AutoLISP setvar도 같은 검사를 거친다
 * (전에는 검사 없이 300·−5도 머리말에 넣었다 — 브라우저 변수의 setvar처럼 거절).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { promptSysvar, setSysvarText } from '../../src/app/sysvars';
import { setSysVar } from '../../src/app/lisp-host';
import { currentProps } from '../../src/app/draw';
import { Real } from '../../src/edit/lisp/types';
import { makeHarness } from '../cmds2/harness';

const RANGE = '-3과(와) 211 사이의 정수가 필요합니다.';
const harness = () => makeHarness((d) => d.header.set('$CELWEIGHT', -1));
type H = ReturnType<typeof harness>;
const cel = (h: H) => h.doc.header.get('$CELWEIGHT');

/** 머리말 CELWEIGHT와 선 하나(DWG·DXF 쓰기·읽기용) */
function celDoc(cw: number, lw: number): CadDocument {
  const doc = createNewDocument('metric');
  doc.header.set('$CELWEIGHT', cw);
  const e = { ...entityDefaults(), type: 'LINE', handle: 'A1', lineweight: lw, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity;
  doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
  doc.entityIndex.set('A1', e as Entity);
  return doc;
}
const got = (doc: CadDocument) => [doc.header.get('$CELWEIGHT'), doc.entityIndex.get('A1')!.lineweight];

describe('CELWEIGHT — 표준 선가중치 표에 없는 값(204차)', () => {
  it('표에 없는 값은 가장 가까운 표준 값: 29 → 30, 27 → 25, 52 → 53, 110 → 106, 210 → 211, 1 → 0, 한가운데 7 → 5 — 명령 취소 한 단계', async () => {
    const cases: [string, number][] = [
      ['29', 30],
      ['27', 25],
      ['52', 53],
      ['110', 106],
      ['210', 211],
      ['1', 0],
      ['7', 5],
    ];
    for (const [input, want] of cases) {
      const h = harness();
      const depth = h.st.session.depth;
      expect(setSysvarText(h.app, 'CELWEIGHT', input)).toBeNull();
      expect([input, cel(h)]).toEqual([input, want]);
      expect(h.st.session.depth).toBe(depth + 1);
      h.st.session.undo();
      expect(cel(h)).toBe(-1);
    }
    // 명령행에 변수 이름을 친 프롬프트도 같은 함수 — 그 뒤 새 객체의 선가중치
    const h = harness();
    h.app.register({ name: 'T', title: 't', run: (ctx) => promptSysvar(h.app, ctx, 'CELWEIGHT') });
    await h.run('T', ['29']);
    expect(cel(h)).toBe(30);
    expect(currentProps(h.app).lineweight).toBe(30);
  });

  it('맞춘 값은 DWG·DXF 어느 쪽으로 저장해도 같다 — 머리말과 그 값으로 그린 선. 29를 그대로 두면 형식마다 달라진다(쓰기 코드는 그대로)', () => {
    const h = harness();
    expect(setSysvarText(h.app, 'CELWEIGHT', '29')).toBeNull();
    const cw = cel(h) as number;
    const lw = currentProps(h.app).lineweight;
    expect([cw, lw]).toEqual([30, 30]);
    const doc = celDoc(cw, lw);
    for (const version of ['AC1018', 'AC1032'] as const) expect([version, ...got(readDwg(writeDwg(doc, { version }).data))]).toEqual([version, 30, 30]);
    const dxf = writeDxf(doc);
    expect(got(readDxf(dxf.data))).toEqual([30, 30]);
    expect(dxf.warnings.some((w) => w.code === 'entity.lineweight_fixed')).toBe(false);
    // 전처럼 29가 남으면: DWG는 머리말·선 모두 표의 아래 값 번호(`lwIndex` — 0.25), DXF는 머리말 29 그대로·선은 가장 가까운 값(0.30)과 알림
    const raw = celDoc(29, 29);
    expect(got(readDwg(writeDwg(raw, { version: 'AC1032' }).data))).toEqual([25, 25]);
    const rawDxf = writeDxf(raw);
    expect(got(readDxf(rawDxf.data))).toEqual([29, 30]);
    expect(rawDxf.warnings.some((w) => w.code === 'entity.lineweight_fixed')).toBe(true);
  });

  it('AutoLISP setvar도 같은 검사: 29 → 30, 52.0 → 53, 범위 밖 300·−5는 거절(값 그대로), 정수 아님은 전과 같은 문구', () => {
    const h = harness();
    expect(setSysVar(h.app, 'CELWEIGHT', 29)).toBeNull();
    expect(cel(h)).toBe(30);
    expect(setSysVar(h.app, 'celweight', new Real(52))).toBeNull();
    expect(cel(h)).toBe(53);
    expect(setSysVar(h.app, 'CELWEIGHT', 300)).toBe(RANGE.slice(0, -1));
    expect(setSysVar(h.app, 'CELWEIGHT', -5)).toBe(RANGE.slice(0, -1));
    expect(cel(h)).toBe(53);
    expect(setSysVar(h.app, 'CELWEIGHT', new Real(2.5))).toBe('정수가 필요합니다');
    expect(setSysVar(h.app, 'CELWEIGHT', 'abc')).toBe('');
    expect(setSysVar(h.app, 'CELWEIGHT', -2)).toBeNull();
    expect(cel(h)).toBe(-2);
    expect(setSysVar(h.app, 'CELWEIGHT', 25)).toBeNull();
    expect(cel(h)).toBe(25);
  });

  it('전과 같은 값: 표준 값·−1·−2·−3·0·211, 범위 밖·정수가 아닌 글은 같은 알림', () => {
    const cases: [string, number][] = [
      ['-1', -1],
      ['-2', -2],
      ['-3', -3],
      ['0', 0],
      ['25', 25],
      ['30', 30],
      ['158', 158],
      ['211', 211],
    ];
    for (const [input, want] of cases) {
      const h = harness();
      h.doc.header.set('$CELWEIGHT', 50);
      expect(setSysvarText(h.app, 'CELWEIGHT', input)).toBeNull();
      expect([input, cel(h)]).toEqual([input, want]);
    }
    const h = harness();
    expect(setSysvarText(h.app, 'CELWEIGHT', '212')).toBe(RANGE);
    expect(setSysvarText(h.app, 'CELWEIGHT', '-4')).toBe(RANGE);
    expect(setSysvarText(h.app, 'CELWEIGHT', '0.3')).toBe('정수가 필요합니다.');
    expect(cel(h)).toBe(-1);
  });
});
