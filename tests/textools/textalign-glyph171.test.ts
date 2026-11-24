/**
 * 171차: 문자 범위(`textCornersOcs`·`textCorners`)가 한 줄 문자의 거꾸로·뒤집기 글자와 기울기를 그린 글자처럼 넣는지.
 * DXF 참조서 TEXT: 71 생성 플래그(2 = 거꾸로 — X 거울, 4 = 뒤집기 — Y 거울), 51 기울기 각도.
 * Autodesk TEXTALIGN 도움말: 간격 설정은 문자 객체의 범위(extents) 사이 간격을 정한다.
 * 이 앱의 그리기(`layoutText` — 회전 · 거울 · 기울기 밀기)와 TRIM 모서리 `textOutline`은 같은 글자 틀을 쓴다.
 * 전에는 범위가 플래그·기울기를 넣지 않아 거꾸로 글자의 범위가 원점 반대쪽, 뒤집기 글자의 범위가 기준선 반대쪽에 놓였고
 * 기운 글자는 기울지 않은 직사각형이었다 — 맞추는 점(`anchorOf`)은 이미 넣어 간격 설정이 그린 글자와 어긋났다.
 * 같은 범위를 쓰는 ATTIPEDIT(속성 고르기)·Express 문자 상자(거울 플래그만 — TCIRCLE의 직사각형)도 어긋났다.
 * 플래그·기울기가 없는 문자의 범위는 전과 같은 값이다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity, TextEntity, Vec2 } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { type AlignPlan, anchorOf, planTextAlign, textCorners } from '../../src/edit/textools/textalign';
import { attributeAt } from '../../src/edit/textools/attipedit';
import { boxCorners, textBox } from '../../src/edit/express/textbox';
import { type TextLike, textFrame, textOutline } from '../../src/edit/geom/textjust';
import { affApply } from '../../src/edit/geom/math';
import { isNaturalExt, planProj } from '../../src/edit/geom/ocs';
import { affTranslate, transformEntity } from '../../src/edit/geom';
import { NEG_Z, P, deg, text } from '../edit/make';

const doc: CadDocument = createNewDocument('metric');

/** 소수 9자리로 맞춘 좌표(−0은 0으로) */
const r9 = (v: number) => +v.toFixed(9) + 0;
const xy = (a: Vec2) => [r9(a.x), r9(a.y)];
/** 맞추지 않은 좌표(−0만 0으로) */
const exact = (a: Vec2) => [a.x + 0, a.y + 0];

/** 170차까지의 문자 범위 계산(플래그·기울기 없이) — 플래그·기울기 없는 문자는 지금도 이 값이어야 한다 */
function cornersBefore(e: TextLike): Vec2[] {
  const f = textFrame(e, doc);
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  const W = f.W * f.h * f.wf;
  const lo = -f.desc * f.h;
  const hi = f.h;
  const k = [
    [0, lo],
    [W, lo],
    [W, hi],
    [0, hi],
  ].map(([x, y]) => ({ x: f.o.x + c * x! - s * y!, y: f.o.y + s * x! + c * y! }));
  if (isNaturalExt(e.extrusion)) return k;
  const M = planProj(e.extrusion, e.insert.z);
  return k.map((q) => affApply(M, q));
}

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

describe('문자 범위의 거꾸로·뒤집기 글자와 기울기(171차)', () => {
  it('플래그·기울기가 없는 문자의 범위는 전과 같은 값이다(+Z·−Z, 자리맞추기·정렬·맞춤·폭 비율)', () => {
    const list: Entity[] = [
      text(3, 4, 'AB', 2.5, deg(30)),
      text(3, 4, 'Abc', 2.5, 0, { halign: 1, valign: 0, alignPoint: P(8, 4) }),
      text(-2, 1, 'Wg', 3, deg(-40), { halign: 2, valign: 3, alignPoint: P(-2, 1), widthFactor: 0.8 }),
      text(0, 0, 'MID', 2.5, deg(10), { halign: 4, valign: 0, alignPoint: P(5, 5) }),
      text(1, 1, 'ALIGN', 2.5, 0, { halign: 3, valign: 0, alignPoint: P(11, 4) }),
      text(1, 1, 'FIT', 2, 0, { halign: 5, valign: 0, alignPoint: P(9, -2) }),
      text(-3, 1, 'AB', 2.5, deg(30), { insert: P(-3, 1, 2), extrusion: NEG_Z }),
      text(-3, 1, 'Cd', 2.5, 0, { halign: 1, valign: 2, alignPoint: P(-6, 2, 1), insert: P(-3, 1, 1), extrusion: NEG_Z }),
      { ...(text(5, 5, 'TAGV', 2.5, deg(90)) as TextEntity), type: 'ATTDEF', tag: 'TAG', prompt: '', attFlags: 0 } as unknown as Entity,
    ];
    for (const e of list) expect(textCorners(e, doc).map(exact)).toEqual(cornersBefore(e as TextLike).map(exact));
  });

  it('거꾸로(2)·뒤집기(4)·기운 글자의 범위는 그린 글자 상자다(+Z·−Z, 정렬 문자)', () => {
    const list: Entity[] = [
      text(3, 4, 'AB', 2.5, deg(30), { generation: 2 }),
      text(3, 4, 'Ag', 2.5, deg(30), { generation: 4 }),
      text(3, 4, 'AB', 2.5, 0, { generation: 6 }),
      text(3, 4, 'Ag', 2.5, deg(15), { oblique: deg(20) }),
      text(3, 4, 'Ag', 2.5, deg(15), { oblique: deg(-15), generation: 2 }),
      text(-2, 1, 'Wg', 3, deg(-40), { halign: 2, valign: 3, alignPoint: P(-2, 1), generation: 2, oblique: deg(10) }),
      text(1, 1, 'ALIGN', 2.5, 0, { halign: 3, valign: 0, alignPoint: P(11, 4), generation: 4 }),
      text(-3, 1, 'AB', 2.5, deg(30), { insert: P(-3, 1, 2), extrusion: NEG_Z, generation: 2, oblique: deg(12) }),
      text(-3, 1, 'Cd', 2.5, 0, { insert: P(-3, 1, 1), extrusion: NEG_Z, generation: 4 }),
    ];
    for (const e of list) expect(textCorners(e, doc).map(xy)).toEqual(textOutline(e, doc)!.map(xy));
  });

  it('간격 설정: 거꾸로 글자를 수평선으로 줄 세우면 그린 글자 사이 간격이 그 값', () => {
    // 거꾸로 글자는 삽입점에서 −X 쪽으로 그린다
    const ref = text(0, 0, 'R', 2.5, 0, { generation: 2 });
    const a = text(27, 5, 'AAA', 2.5, 0, { generation: 2 });
    const b = text(40, -3, 'B', 2.5, 0, { generation: 2 });
    const from = anchorOf(ref, 'L', doc)!;
    expect(xy(from)).toEqual([0, 0]);
    const d = { x: 1, y: 0 };
    const plan = planTextAlign({ texts: [b, a], reference: ref, key: 'L', from, to: { x: 10, y: 0 }, mode: 'S', spacing: 1 }, doc);
    const ma = moved(a, plan);
    const mb = moved(b, plan);
    expect(span(ma, d).lo - span(ref, d).hi).toBeCloseTo(1, 9);
    expect(span(mb, d).lo - span(ma, d).hi).toBeCloseTo(1, 9);
    expect(anchorOf(ma, 'L', doc)!.y).toBeCloseTo(0, 9);
    expect(anchorOf(mb, 'L', doc)!.y).toBeCloseTo(0, 9);
  });

  it('간격 설정: 뒤집기 글자를 아래로 줄 세우면 그린 글자 사이 간격이 그 값', () => {
    // 뒤집기 글자는 기준선 아래로 그린다(높이가 같으면 앞뒤 어긋남이 서로 지워지므로 높이를 다르게)
    const ref = text(0, 0, 'R', 2.5, 0, { generation: 4 });
    const a = text(0, -9, 'Ag', 5, 0, { generation: 4 });
    const b = text(0, -20, 'B', 1.8, 0, { generation: 4 });
    const from = anchorOf(ref, 'L', doc)!;
    const d = { x: 0, y: -1 };
    const plan = planTextAlign({ texts: [a, b], reference: ref, key: 'L', from, to: { x: 0, y: -10 }, mode: 'S', spacing: 1 }, doc);
    const ma = moved(a, plan);
    const mb = moved(b, plan);
    expect(span(ma, d).lo - span(ref, d).hi).toBeCloseTo(1, 9);
    expect(span(mb, d).lo - span(ma, d).hi).toBeCloseTo(1, 9);
  });

  it('간격 설정: 기운 글자는 평행사변형 꼭짓점 넷의 범위 사이를 잰다', () => {
    const o = { oblique: deg(20) };
    const ref = text(0, 0, 'R', 2.5, 0, o);
    const a = text(27, 5, 'AAg', 2.5, 0, o);
    const b = text(40, -3, 'B', 2.5, 0, o);
    const from = anchorOf(ref, 'L', doc)!;
    const d = { x: 1, y: 0 };
    const plan = planTextAlign({ texts: [b, a], reference: ref, key: 'L', from, to: { x: 10, y: 0 }, mode: 'S', spacing: 1 }, doc);
    const ma = moved(a, plan);
    const mb = moved(b, plan);
    expect(span(ma, d).lo - span(ref, d).hi).toBeCloseTo(1, 9);
    expect(span(mb, d).lo - span(ma, d).hi).toBeCloseTo(1, 9);
  });

  it('ATTIPEDIT: 거꾸로 속성을 그린 자리에서 고른다', () => {
    const att = (tag: string, s: string, x: number, y: number): AttribEntity => ({
      ...(text(x, y, s, 2.5, 0, { generation: 2 }) as TextEntity),
      type: 'ATTRIB',
      tag,
      attFlags: 0,
    });
    const ins: InsertEntity = {
      ...entityDefaults(),
      type: 'INSERT',
      handle: 'B171',
      block: 'TITLE',
      insert: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attribs: [att('NAME', 'ABCD', 20, 0), att('DATE', 'EFGH', 20, -5)],
    };
    const s0 = span(ins.attribs[0]!, { x: 1, y: 0 });
    const w = (s0.hi - s0.lo) / 2;
    expect(s0.hi).toBeCloseTo(20, 9);
    expect(attributeAt(ins, { x: 20 - w, y: 1.25 }, doc, 0.1)?.tag).toBe('NAME');
    expect(attributeAt(ins, { x: 20 - w, y: -4 }, doc, 0.1)?.tag).toBe('DATE');
    // 원점 반대쪽(전의 범위 자리)에는 속성이 없다
    expect(attributeAt(ins, { x: 20 + w, y: 1.25 }, doc, 0.1)).toBeNull();
  });

  it('Express 문자 상자: 거꾸로·뒤집기 글자는 그린 글자 상자, 기운 글자는 전처럼 기울지 않은 직사각형', () => {
    for (const e of [
      text(3, 4, 'AB', 2.5, deg(30), { generation: 2 }),
      text(3, 4, 'Ag', 2.5, deg(30), { generation: 4 }),
      text(-3, 1, 'AB', 2.5, deg(30), { insert: P(-3, 1, 2), extrusion: NEG_Z, generation: 2 }),
    ])
      expect(boxCorners(textBox(e, doc)!).map(xy)).toEqual(textOutline(e, doc)!.map(xy));
    const flat = text(3, 4, 'Ag', 2.5, deg(15));
    const obl = { ...flat, oblique: deg(20) } as Entity;
    expect(textBox(obl, doc)).toEqual(textBox(flat, doc));
  });
});
