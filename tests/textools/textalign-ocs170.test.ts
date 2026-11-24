/**
 * 170차: TEXTALIGN 간격 설정(S)이 돌출 방향이 −Z인 문자의 범위를 평면도(WCS)에서 재는지.
 * Autodesk TEXTALIGN 도움말: 간격 설정은 문자 객체의 범위(extents) 사이 간격을 정한다.
 * DXF 참조서 OCS 쪽: TEXT의 점은 객체 좌표(OCS)다 — 평면도에 보이는 범위는 OCS 모서리를 평면 사상으로 옮긴 것이다.
 * 여러 줄 문자의 위 방향은 돌출 방향 × 글줄 방향이다(그리기, TRIM 모서리 `textOutline`과 같다).
 * 전에는 −Z 한 줄 문자의 모서리를 OCS 좌표 그대로(X 거울상 자리), −Z 여러 줄 문자의 위 방향을 +Z처럼(상자가 삽입점 반대쪽) 잡아,
 * 맞추는 점(WCS)과 범위가 어긋나 간격이 틀렸다. 같은 범위를 쓰는 ATTIPEDIT(속성 고르기)·Express 문자 상자도 −Z에서 어긋났다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity, TextEntity, Vec2 } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { type AlignPlan, anchorOf, planTextAlign, textCorners } from '../../src/edit/textools/textalign';
import { attributeAt } from '../../src/edit/textools/attipedit';
import { boxCorners, textBox } from '../../src/edit/express/textbox';
import { textOutline } from '../../src/edit/geom/textjust';
import { affTranslate, transformEntity } from '../../src/edit/geom';
import { NEG_Z, P, deg, mtext, text } from '../edit/make';

const doc: CadDocument = createNewDocument('metric');

/** 소수 9자리로 맞춘 좌표(−0은 0으로) */
const r9 = (v: number) => +v.toFixed(9) + 0;
const xy = (a: Vec2) => [r9(a.x), r9(a.y)];

/** 계획대로 옮긴 객체(TEXTALIGN 명령과 같이 WCS 평행 이동) */
function moved(e: Entity, plan: AlignPlan[]): Entity {
  const p = plan.find((q) => q.handle === e.handle);
  if (!p) return e;
  return transformEntity(e, affTranslate(p.dx, p.dy), doc).replace![0]!;
}

/** 선 방향 d로 잰 평면도 범위(그리기와 같은 글자 상자 `textOutline`) */
function span(e: Entity, d: Vec2): { lo: number; hi: number } {
  const t = textOutline(e, doc)!.map((q) => q.x * d.x + q.y * d.y);
  return { lo: Math.min(...t), hi: Math.max(...t) };
}

describe('TEXTALIGN 간격 설정의 −Z 문자 범위(170차)', () => {
  it('−Z 한 줄 문자의 범위는 평면도에 보이는 글자 상자다(전에는 OCS 좌표 그대로)', () => {
    // OCS (−3,1)·30°·고도 2 = WCS (3,1), 글줄 방향 WCS 150°
    const neg = text(-3, 1, 'AB', 2.5, deg(30), { insert: P(-3, 1, 2), extrusion: NEG_Z });
    const pos = text(-3, 1, 'AB', 2.5, deg(30));
    expect(textCorners(neg, doc).map(xy)).toEqual(textOutline(neg, doc)!.map(xy));
    // 같은 OCS 값의 +Z 문자 범위(지금 규칙 — 그대로)의 X 거울상
    expect(textCorners(neg, doc).map(xy)).toEqual(textCorners(pos, doc).map((q) => [r9(-q.x), r9(q.y)]));
  });

  it('간격 설정: −Z 한 줄 문자를 수평선으로 줄 세우면 보이는 범위 사이 간격이 그 값', () => {
    // WCS로 R (0,0), A (27,5), B (40,−3) — −Z라 OCS X는 부호가 반대이고 글자는 삽입점에서 WCS −X 쪽으로 놓인다
    const ref = text(0, 0, 'R', 2.5, 0, { extrusion: NEG_Z });
    const a = text(-27, 5, 'AAA', 2.5, 0, { extrusion: NEG_Z });
    const b = text(-40, -3, 'B', 2.5, 0, { extrusion: NEG_Z });
    const from = anchorOf(ref, 'L', doc)!;
    expect(xy(from)).toEqual([0, 0]);
    const d = { x: 1, y: 0 };
    const plan = planTextAlign({ texts: [b, a], reference: ref, key: 'L', from, to: { x: 10, y: 0 }, mode: 'S', spacing: 1 }, doc);
    const ma = moved(a, plan);
    const mb = moved(b, plan);
    expect(span(ma, d).lo - span(ref, d).hi).toBeCloseTo(1, 9);
    expect(span(mb, d).lo - span(ma, d).hi).toBeCloseTo(1, 9);
    // 맞추는 점(왼쪽 = 삽입점, WCS)은 선 위
    expect(anchorOf(ma, 'L', doc)!.y).toBeCloseTo(0, 9);
    expect(anchorOf(mb, 'L', doc)!.y).toBeCloseTo(0, 9);
  });

  it('−Z 여러 줄 문자의 범위는 위 방향이 돌출 방향 × 글줄 방향이다(전에는 +Z처럼 삽입점 반대쪽)', () => {
    const neg = mtext(4, 2, 'AB\\PCD', 2.5, { extrusion: NEG_Z });
    const k = textCorners(neg, doc);
    expect(k.map(xy)).toEqual(textOutline(neg, doc)!.map(xy));
    // 맨 위 왼쪽 부착점: 두 줄 상자는 삽입점 아래로
    expect(Math.min(...k.map((q) => q.y))).toBeLessThan(2 - 2.5);
    expect(Math.max(...k.map((q) => q.y))).toBeLessThan(2 + 1e-9);
  });

  it('간격 설정: −Z 여러 줄 문자를 아래로 줄 세우면 보이는 범위 사이 간격이 그 값', () => {
    const ref = mtext(0, 0, 'R', 2.5, { extrusion: NEG_Z });
    const a = mtext(0, -7, 'A\\PA', 2.5, { extrusion: NEG_Z });
    const b = mtext(0, -20, 'B', 2.5, { extrusion: NEG_Z });
    const from = anchorOf(ref, 'TL', doc)!;
    expect(xy(from)).toEqual([0, 0]);
    const d = { x: 0, y: -1 };
    const plan = planTextAlign({ texts: [a, b], reference: ref, key: 'TL', from, to: { x: 0, y: -10 }, mode: 'S', spacing: 1 }, doc);
    const ma = moved(a, plan);
    const mb = moved(b, plan);
    expect(span(ma, d).lo - span(ref, d).hi).toBeCloseTo(1, 9);
    expect(span(mb, d).lo - span(ma, d).hi).toBeCloseTo(1, 9);
  });

  it('ATTIPEDIT: −Z 블록 참조의 속성을 보이는 자리에서 고른다', () => {
    const att = (tag: string, s: string, x: number, y: number): AttribEntity => ({
      ...(text(x, y, s, 2.5, 0, { extrusion: NEG_Z }) as TextEntity),
      type: 'ATTRIB',
      tag,
      attFlags: 0,
    });
    // OCS (−20,0)·(−20,−5) = WCS (20,0)·(20,−5), 글자는 WCS −X 쪽으로
    const ins: InsertEntity = {
      ...entityDefaults(),
      type: 'INSERT',
      handle: 'B170',
      block: 'TITLE',
      insert: { x: 0, y: 0, z: 0 },
      extrusion: NEG_Z,
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attribs: [att('NAME', 'ABCD', -20, 0), att('DATE', 'EFGH', -20, -5)],
    };
    const w = (span(ins.attribs[0]!, { x: 1, y: 0 }).hi - span(ins.attribs[0]!, { x: 1, y: 0 }).lo) / 2;
    expect(attributeAt(ins, { x: 20 - w, y: 1.25 }, doc, 0.1)?.tag).toBe('NAME');
    expect(attributeAt(ins, { x: 20 - w, y: -4 }, doc, 0.1)?.tag).toBe('DATE');
    // OCS 좌표 자리(X 거울상)에는 속성이 없다
    expect(attributeAt(ins, { x: -20 + w, y: 1.25 }, doc, 0.1)).toBeNull();
  });

  it('Express 문자 상자: −Z 한 줄 문자는 전과 같고 −Z 여러 줄 문자는 보이는 글자 상자', () => {
    const t = text(-6, 3, 'AB', 2.5, deg(20), { insert: P(-6, 3, 1), extrusion: NEG_Z });
    const m = mtext(6, 3, 'AB\\PCD', 2.5, { extrusion: NEG_Z });
    for (const e of [t, m]) expect(boxCorners(textBox(e, doc)!).map(xy)).toEqual(textOutline(e, doc)!.map(xy));
  });
});
