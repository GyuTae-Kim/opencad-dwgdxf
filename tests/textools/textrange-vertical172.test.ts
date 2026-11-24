/**
 * 172차: 세로 문자 스타일(STYLE 70 비트 4, SHX 글꼴)의 한 줄 문자 범위·TRIM 모서리·문자 상자가 그린 글자를 감싸는지.
 * Autodesk 문자 스타일 대화 상자 도움말: 세로(Vertical)는 글자를 세로로 줄지어 보인다(두 방향을 지원하는 글꼴만 — 트루타입 글꼴에는 없다).
 * DXF 참조서 STYLE 70: 4 = 세로 문자. 이 앱의 그리기(`layoutText` → 세로 배치)는 글자를 바로 세워 삽입점부터 진행 방향으로 1.3 높이씩 쌓고,
 * 객체 범위(`entityBounds`)도 그 배치의 범위다. 전에는 문자 범위(`textCornersOcs`)·TRIM 모서리(`textOutline`)가 가로 글자 틀(`textFrame`)로 재어
 * 글줄 한쪽에 높이만큼 놓인 상자였다 — 그린 글자는 글줄 가운데에 서 있다. 같은 범위를 쓰는 TEXTALIGN 간격 설정·ATTIPEDIT·Express 문자 상자도 어긋났다.
 * Autodesk TEXT 도움말은 맞춤·TL~BR을 가로 문자에만 쓴다고 적을 뿐 세로 문자의 자리맞추기 점을 적지 않으므로 자리맞추기 점은 그대로 둔다.
 * 세로 스타일이 아닌 문자(트루타입 글꼴에 세로 비트가 켜진 스타일 포함)의 값은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity, TextEntity, TextStyle, Vec2 } from '../../src/core/model';
import { entityDefaults, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { type AlignPlan, anchorOf, planTextAlign, textCorners, textCornersOcs } from '../../src/edit/textools/textalign';
import { attributeAt } from '../../src/edit/textools/attipedit';
import { boxCorners, textBox } from '../../src/edit/express/textbox';
import { type TextLike, textFrame, textOutline } from '../../src/edit/geom/textjust';
import { edgeSet } from '../../src/edit/geom/edges';
import { entityBounds } from '../../src/edit/geom/query';
import { affApply } from '../../src/edit/geom/math';
import { isNaturalExt, planProj } from '../../src/edit/geom/ocs';
import { affTranslate, transformEntity } from '../../src/edit/geom';
import { TextEngine } from '../../src/text/layout';
import { NEG_Z, P, deg, text } from '../edit/make';

const doc: CadDocument = createNewDocument('metric');
const style = (name: string, flags: number, font: string): TextStyle => ({ name, handle: `S${name}`, flags, height: 0, widthFactor: 1, oblique: 0, generation: 0, lastHeight: 2.5, font, bigFont: '' });
doc.textStyles.set('VERT', style('VERT', 4, 'txt'));
doc.textStyles.set('VSHX', style('VSHX', 4, 'romans.shx'));
doc.textStyles.set('VTTF', style('VTTF', 4, 'arial.ttf'));
doc.textStyles.set('HSHX', style('HSHX', 0, 'txt'));

/** 세로 스타일 문자 */
const vtext = (x: number, y: number, s: string, h: number, rot: number, extra: Record<string, unknown> = {}) => text(x, y, s, h, rot, { style: 'VERT', ...extra });

/** 소수 9자리로 맞춘 좌표(−0은 0으로) */
const r9 = (v: number) => +v.toFixed(9) + 0;
const xy = (a: Vec2) => [r9(a.x), r9(a.y)];
const exact = (a: Vec2) => [a.x + 0, a.y + 0];

const eng = new TextEngine(null);

/** 그린 글자 상자(OCS, 왼쪽 아래부터 반시계): 그리기 배치의 글자마다 바로 선 글자 칸(글자 폭 × 문자 높이)을 합친 범위 */
function drawnOcs(e: TextLike): Vec2[] {
  const lay = eng.layoutText({
    text: e.text,
    insert: e.insert,
    alignPoint: e.alignPoint,
    height: e.height,
    rotation: e.rotation,
    widthFactor: e.widthFactor,
    oblique: e.oblique,
    generation: e.generation,
    halign: e.halign,
    valign: e.valign,
    style: doc.textStyles.get(tableKey(e.style)),
  });
  expect(lay.glyphs.length).toBe([...e.text].length);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of lay.glyphs) {
    // 세로 문자의 글자는 글줄 방향과 상관없이 바로 선다
    expect(g.m[1]).toBe(0);
    x0 = Math.min(x0, g.m[4]);
    x1 = Math.max(x1, g.m[4] + g.geom.advance * g.m[0]);
    y0 = Math.min(y0, g.m[5]);
    y1 = Math.max(y1, g.m[5] + g.m[3]);
  }
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** 그린 글자 상자(WCS 평면도) */
function drawn(e: TextLike): Vec2[] {
  const k = drawnOcs(e);
  if (isNaturalExt(e.extrusion)) return k;
  const M = planProj(e.extrusion, e.insert.z);
  return k.map((q) => affApply(M, q));
}

/** 선 방향 d로 잰 그린 글자 범위 */
function span(e: Entity, d: Vec2): { lo: number; hi: number } {
  const t = drawn(e as TextLike).map((q) => q.x * d.x + q.y * d.y);
  return { lo: Math.min(...t), hi: Math.max(...t) };
}

/** 계획대로 옮긴 객체(TEXTALIGN 명령과 같이 WCS 평행 이동) */
function moved(e: Entity, plan: AlignPlan[]): Entity {
  const p = plan.find((q) => q.handle === e.handle);
  if (!p) return e;
  return transformEntity(e, affTranslate(p.dx, p.dy), doc).replace![0]!;
}

/** 171차까지의 한 줄 문자 범위(OCS, 가로 글자 틀 — 거울·기울기 포함). 세로 스타일이 아닌 문자는 지금도 이 값이어야 한다 */
function cornersBefore(e: TextLike, slant = true): Vec2[] {
  const f = textFrame(e, doc);
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  const W = f.W * f.h * f.wf;
  const lo = -f.desc * f.h;
  const hi = f.h;
  const sh = slant ? f.sh : 0;
  return [
    [0, lo],
    [W, lo],
    [W, hi],
    [0, hi],
  ].map(([u, v]) => {
    const x = f.mx * (u! + sh * v!);
    const y = f.my * v!;
    return { x: f.o.x + c * x - s * y, y: f.o.y + s * x + c * y };
  });
}

/** 171차까지의 TRIM 모서리(평면도, 가로 글자 틀) */
function outlineBefore(e: TextLike): Vec2[] {
  const f = textFrame(e, doc);
  const M = planProj(e.extrusion, e.insert.z);
  return [
    [0, -f.desc],
    [f.W, -f.desc],
    [f.W, 1],
    [0, 1],
  ].map(([u, v]) => {
    const sx = f.h * f.wf;
    const sy = f.h;
    const lx = f.mx * (sx * u! + f.sh * sy * v!);
    const ly = f.my * (sy * v!);
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    return affApply(M, { x: f.o.x + (c * lx - s * ly), y: f.o.y + (s * lx + c * ly) });
  });
}

describe('세로 문자 스타일의 한 줄 문자 범위(172차)', () => {
  it('범위·TRIM 모서리·문자 상자는 그린 글자 상자다(+Z·−Z, 자리맞추기·정렬, 폭 비율, 속성 정의)', () => {
    const list: TextLike[] = [
      vtext(5, 10, 'ABC', 2, deg(270)),
      vtext(5, 10, 'AB', 2, deg(270), { widthFactor: 0.7 }),
      vtext(0, 0, 'WiW', 3, deg(300)),
      vtext(-2, 4, 'AB', 2.5, deg(270), { halign: 1, valign: 0, alignPoint: P(-2, 0) }),
      vtext(1, 1, 'ALI', 2, deg(270), { halign: 3, valign: 0, alignPoint: P(1, -9) }),
      vtext(-3, 1, 'AB', 2.5, deg(270), { insert: P(-3, 1, 2), extrusion: NEG_Z }),
      text(4, 4, 'Kg', 2.5, deg(270), { style: 'VSHX' }),
      { ...(vtext(5, 5, 'TAGV', 2.5, deg(270)) as TextEntity), type: 'ATTDEF', tag: 'TAG', prompt: '', attFlags: 0 } as unknown as TextLike,
    ] as TextLike[];
    for (const e of list) {
      const want = drawn(e).map(xy);
      expect(textCorners(e, doc).map(xy), e.text).toEqual(want);
      expect(textOutline(e, doc)!.map(xy), e.text).toEqual(want);
      expect(boxCorners(textBox(e, doc)!).map(xy), e.text).toEqual(want);
      // TRIM·EXTEND 모서리
      expect(edgeSet(e, doc, false).map((p) => xy((p as { a: Vec2 }).a)), e.text).toEqual(want);
      if (isNaturalExt(e.extrusion)) {
        const b = entityBounds(e, doc)!;
        expect([r9(b.minX), r9(b.minY), r9(b.maxX), r9(b.maxY)], e.text).toEqual([...want[0]!, ...want[2]!]);
      }
    }
    // 손셈: 높이 2, 270°, 삽입점 (5, 10)의 세 글자는 y 10 − 3·2.6 ~ 10 − 2.6 + 2, 글줄 x 5 가운데
    const k = textOutline(list[0]!, doc)!;
    expect(k[0]!.y).toBeCloseTo(2.2, 9);
    expect(k[2]!.y).toBeCloseTo(9.4, 9);
    expect((k[0]!.x + k[1]!.x) / 2).toBeCloseTo(5, 9);
  });

  it('간격 설정: 세로 문자를 수평선으로 줄 세우면 그린 글자 사이 간격이 그 값', () => {
    const ref = vtext(0, 0, 'AB', 2, deg(270));
    const a = vtext(9, 4, 'WWW', 3, deg(270));
    const b = vtext(20, -2, 'I', 1.5, deg(270));
    const from = anchorOf(ref, 'L', doc)!;
    expect(xy(from)).toEqual([0, 0]);
    const d = { x: 1, y: 0 };
    const plan = planTextAlign({ texts: [b, a], reference: ref, key: 'L', from, to: { x: 10, y: 0 }, mode: 'S', spacing: 1 }, doc);
    const ma = moved(a, plan);
    const mb = moved(b, plan);
    expect(span(ma, d).lo - span(ref, d).hi).toBeCloseTo(1, 9);
    expect(span(mb, d).lo - span(ma, d).hi).toBeCloseTo(1, 9);
    // 맞추는 점(자리맞추기 점)은 그대로 선 위
    expect(anchorOf(ma, 'L', doc)!.y).toBeCloseTo(0, 9);
    expect(anchorOf(mb, 'L', doc)!.y).toBeCloseTo(0, 9);
  });

  it('ATTIPEDIT: 세로 속성을 그린 자리에서 고른다', () => {
    const att = (tag: string, s: string, x: number, y: number): AttribEntity => ({
      ...(vtext(x, y, s, 2.5, deg(270)) as TextEntity),
      type: 'ATTRIB',
      tag,
      attFlags: 0,
    });
    const ins: InsertEntity = {
      ...entityDefaults(),
      type: 'INSERT',
      handle: 'B172',
      block: 'TITLE',
      insert: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attribs: [att('NAME', 'ABCD', 20, 0), att('DATE', 'EFGH', 30, 0)],
    };
    const k = drawn(ins.attribs[0]!);
    const x0 = k[0]!.x;
    const x1 = k[1]!.x;
    expect((x0 + x1) / 2).toBeCloseTo(20, 9);
    // 글줄 왼쪽 반(그린 글자 안, 가로 틀 상자 x 20 ~ 22.5 밖)
    expect(attributeAt(ins, { x: (x0 + 20) / 2, y: -5 }, doc, 0.1)?.tag).toBe('NAME');
    expect(attributeAt(ins, { x: 30, y: -5 }, doc, 0.1)?.tag).toBe('DATE');
    // 가로 틀 상자에만 드는 자리(그린 글자 오른쪽 바깥)에는 속성이 없다
    expect(x1).toBeLessThan(22.2);
    expect(attributeAt(ins, { x: (x1 + 22.5) / 2, y: -5 }, doc, 0.1)).toBeNull();
  });

  it('세로 스타일이 아닌 문자(트루타입 글꼴의 세로 비트 포함)의 범위·TRIM 모서리·문자 상자는 전과 같은 값이다', () => {
    const list: TextLike[] = [
      text(3, 4, 'AB', 2.5, deg(270), { style: 'VTTF' }),
      text(3, 4, 'Abc', 2.5, 0, { style: 'VTTF', halign: 1, valign: 0, alignPoint: P(8, 4) }),
      text(3, 4, 'Ag', 2.5, deg(30), { style: 'HSHX' }),
      text(-2, 1, 'Wg', 3, deg(-40), { style: 'HSHX', halign: 2, valign: 3, alignPoint: P(-2, 1), generation: 2, oblique: deg(10) }),
      text(1, 1, 'ALIGN', 2.5, 0, { halign: 3, valign: 0, alignPoint: P(11, 4), generation: 4 }),
      text(-3, 1, 'AB', 2.5, deg(30), { insert: P(-3, 1, 2), extrusion: NEG_Z, oblique: deg(12) }),
      text(-3, 1, 'Cd', 2.5, 0, { style: 'HSHX', insert: P(-3, 1, 1), extrusion: NEG_Z, generation: 6 }),
    ] as TextLike[];
    for (const e of list) {
      expect(textCornersOcs(e, doc).map(exact), e.text).toEqual(cornersBefore(e).map(exact));
      expect(textCornersOcs(e, doc, false).map(exact), e.text).toEqual(cornersBefore(e, false).map(exact));
      expect(textOutline(e, doc)!.map(exact), e.text).toEqual(outlineBefore(e).map(exact));
    }
  });
});
