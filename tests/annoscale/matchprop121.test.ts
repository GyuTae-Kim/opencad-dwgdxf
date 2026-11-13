/**
 * 121차: MATCHPROP 해치 칸의 주석 특성(Autodesk 특성 설정 대화 상자 — 해치는 "해치 특성(주석 특성 포함)"을 대상에 옮긴다, ENU·DEU·JPN·CHS).
 * 전에는 무늬 이름·축척·선만 옮기고 주석 여부는 그대로라, 주석 해치를 원본으로 보통 해치에 맞추면 원본이 보이는 축척의 모형 크기
 * 무늬를 가진 보통 해치가 됐고(그 공간 축척과 다르면 선 간격도 틀렸다), 반대로 보통 해치를 원본으로 주석 해치에 맞추면 주석 해치로 남아
 * 원본 무늬를 지금 축척의 모형 크기로 보았다. 이제 120차 문자·치수·다중 지시선과 같은 규칙: 주석으로 — 그 공간의 주석 축척 하나,
 * 무늬 선 = 원본 용지 무늬 × 축척 배율(무늬 축척은 원본 값), 주석 아님으로 — 레코드·뷰포트별 모음을 지우고 원본 무늬 그대로.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, HatchEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { commitOwn, installAnnoHooks, setCannoscale } from '../../src/app/annoscale-core';
import { registerEditCommands, setMatchSettings, MATCH_SETTINGS } from '../../src/app/editcmds';
import { CLASS_HATCH, CLASS_HATCHVIEW, annoState, annotativeFlag, contextRecords } from '../../src/edit/annoscale';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { hatch } from './helpers';
import { annotate, hatch2 } from './ctxfix';

function harness() {
  const h = makeHarness((doc) => void Object.assign(doc, createNewDocument('metric')));
  installAnnoHooks(h.app);
  registerEditCommands(h.app);
  setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key)));
  setCannoscale(h.app, h.st, '1:20', 1);
  return h;
}
type H = ReturnType<typeof harness>;

/** 고리를 거치지 않고 넣는다 */
function put<T extends Entity>(h: H, e: T): T {
  e.handle = h.st.session.newHandle();
  e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  commitOwn(h.st, 'TEST', [{ kind: 'add', block: MODEL_SPACE, entity: e }]);
  return h.doc.entityIndex.get(e.handle) as T;
}
const get = (h: H, x: string) => h.doc.entityIndex.get(x) as HatchEntity;
const match = (h: H, from: string, to: string[]) => runWith(h, 'MATCHPROP', [{ pick: from, at: [0, 0] }, { sel: to }, '']);
const recs = (h: H, x: string) => contextRecords(h.doc, get(h, x)).length;
const views = (h: H) => [...h.doc.objects.values()].filter((o) => o.type.toUpperCase() === CLASS_HATCHVIEW).length;
const hatchRecs = (h: H) => [...h.doc.objects.values()].filter((o) => o.type.toUpperCase() === CLASS_HATCH).length;
/** 첫 무늬 선의 간격(offset 길이) */
const gap = (e: HatchEntity) => Math.hypot(e.patternLines[0]!.offset.x, e.patternLines[0]!.offset.y);
const PAPER = Math.hypot(2.2450640303, 2.2450640303);

/** 보통 해치(다른 무늬 — ANSI32 두 선, 무늬 축척 2) */
function plain(): HatchEntity {
  const e = hatch2();
  e.patternScale = 2;
  e.patternLines = e.patternLines.map((l) => ({ ...l, base: { x: l.base.x * 2, y: l.base.y * 2 }, offset: { x: l.offset.x * 2, y: l.offset.y * 2 }, dashes: l.dashes.map((d) => d * 2) }));
  return e;
}

describe('MATCHPROP이 해치의 주석 특성을 옮긴다', () => {
  it('주석 해치(1:20) → 보통 해치: 대상이 그 공간 축척(1:20)의 주석 해치, 무늬는 원본 용지 무늬 × 20, 명령 취소 한 번', async () => {
    const h = harness();
    const a = put(h, hatch());
    annotate(h.doc, h.st.session, a, ['1:20']);
    expect(gap(get(h, a.handle))).toBeCloseTo(PAPER * 20);
    const p = put(h, plain());
    const views0 = views(h);
    await match(h, a.handle, [p.handle]);
    const d = get(h, p.handle);
    expect([d.patternName, d.patternScale, d.patternLines.length, annoState(h.doc, d)?.scales, annotativeFlag(d.xdata), recs(h, p.handle)]).toEqual(['ANSI31', 1, 1, ['1:20'], true, 1]);
    expect(gap(d)).toBeCloseTo(PAPER * 20);
    // 뷰포트별 모음(HATCHVIEW)도 레코드 하나에 하나
    expect(views(h)).toBe(views0 + 1);
    h.st.session.undo();
    const u = get(h, p.handle);
    expect([u.patternName, u.patternScale, annoState(h.doc, u), u.xdict, views(h)]).toEqual(['ANSI32', 2, null, undefined, views0]);
    expect(gap(u)).toBeCloseTo(PAPER * 2);
  });

  it('원본이 공간 축척과 다른 축척(1:10)을 보이면 무늬 선은 원본 ÷ 10 × 20(전에는 원본 선 그대로 — 간격이 절반)', async () => {
    const h = harness();
    const a = put(h, hatch());
    annotate(h.doc, h.st.session, a, ['1:10', '1:20']);
    const src = get(h, a.handle);
    expect([annoState(h.doc, src)?.current, gap(src)]).toEqual(['1:10', expect.closeTo(PAPER * 10)]);
    const p = put(h, plain());
    await match(h, a.handle, [p.handle]);
    const d = get(h, p.handle);
    expect([annoState(h.doc, d)?.scales, annoState(h.doc, d)?.current, gap(d)]).toEqual([['1:20'], '1:20', expect.closeTo(PAPER * 20)]);
    // 원본은 그대로
    expect(gap(get(h, a.handle))).toBeCloseTo(PAPER * 10);
  });

  it('보통 해치 → 주석 해치: 대상이 주석이 아니게 되고(표지 0, 레코드·뷰포트별 모음 지움) 원본 무늬 그대로', async () => {
    const h = harness();
    const a = put(h, hatch());
    annotate(h.doc, h.st.session, a, ['1:10', '1:20']);
    expect([recs(h, a.handle), views(h), hatchRecs(h)]).toEqual([2, 2, 2]);
    const p = put(h, plain());
    await match(h, p.handle, [a.handle]);
    const d = get(h, a.handle);
    expect([d.patternName, d.patternScale, d.patternLines.length, annoState(h.doc, d), annotativeFlag(d.xdata), recs(h, a.handle), views(h), hatchRecs(h)]).toEqual(['ANSI32', 2, 2, null, false, 0, 0, 0]);
    expect(gap(d)).toBeCloseTo(PAPER * 2);
    h.st.session.undo();
    expect([annoState(h.doc, get(h, a.handle))?.scales, views(h), gap(get(h, a.handle))]).toEqual([['1:10', '1:20'], 2, expect.closeTo(PAPER * 10)]);
  });

  it('설정(S)에서 해치를 끄면 무늬도 주석 특성도 옮기지 않는다', async () => {
    const h = harness();
    setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key).filter((k) => k !== 'hatch')));
    const a = put(h, hatch());
    annotate(h.doc, h.st.session, a, ['1:20']);
    const p = put(h, plain());
    await match(h, a.handle, [p.handle]);
    const d = get(h, p.handle);
    expect([d.patternName, annoState(h.doc, d)]).toEqual(['ANSI32', null]);
    setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key)));
  });

  it('주석 해치끼리는 지금처럼 무늬만 옮기고 대상 레코드가 따라간다(주석 여부가 같다)', async () => {
    const h = harness();
    const a = put(h, hatch());
    annotate(h.doc, h.st.session, a, ['1:20']);
    const b = put(h, plain());
    annotate(h.doc, h.st.session, b, ['1:20']);
    await match(h, a.handle, [b.handle]);
    const d = get(h, b.handle);
    expect([d.patternName, annoState(h.doc, d)?.scales, recs(h, b.handle), gap(d)]).toEqual(['ANSI31', ['1:20'], 1, expect.closeTo(PAPER * 20)]);
  });
});
