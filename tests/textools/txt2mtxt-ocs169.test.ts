/**
 * 169차: TXT2MTXT가 돌출 방향이 −Z인 한 줄 문자·여러 줄 문자를 제자리의 여러 줄 문자로 바꾸는지.
 * Autodesk TXT2MTXT 도움말: 고른 문자 객체를 여러 줄 문자 객체로 바꾼다(크기·글꼴·색은 되도록 지킨다).
 * DXF 참조서 OCS 쪽: TEXT의 점은 객체 좌표(OCS)다. MTEXT의 삽입점은 OCS 목록에 없고(방향 11은 WCS) 이 앱 모델·그리기도 WCS로 둔다.
 * 전에는 −Z 한 줄 문자의 글자 틀 원점(OCS)을 그대로 여러 줄 문자 삽입점(WCS)에 넣어 결과가 X 거울상 자리로 갔고,
 * 첫 줄이 −Z 여러 줄 문자면 위 방향을 +Z로 보아 돌출 방향을 버린 +Z 여러 줄 문자(180° 돈 글자)를 만들었다.
 * −Z 평면은 +Z 평면의 X 거울상이다: −Z 문자를 바꾼 결과는 X 거울상 자리의 +Z 문자를 바꾼 결과(지금 규칙 — 그대로)의 거울상이어야 한다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, MTextEntity } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { textsToMText } from '../../src/edit/textools/txt2mtxt';
import { textOutline } from '../../src/edit/geom/textjust';
import { mtextDir } from '../../src/edit/geom/xtext';
import { NEG_Z, P, mtext, text } from '../edit/make';

const doc: CadDocument = createNewDocument('metric');

/** 소수 9자리로 맞춘 좌표(−0은 0으로) */
const r9 = (v: number) => +v.toFixed(9) + 0;
const xy = (a: { x: number; y: number }) => [r9(a.x), r9(a.y)];
/** X 거울상(x = 0 축) */
const mx = (a: { x: number; y: number }) => [r9(-a.x), r9(a.y)];

function one(list: Entity[], combine = true): MTextEntity {
  const r = textsToMText(list, doc, { combine, order: 'position', wordWrap: false })!;
  expect(r.add).toHaveLength(1);
  return r.add[0]!;
}

describe('TXT2MTXT의 −Z 문자(169차)', () => {
  it('−Z 한 줄 문자는 제자리의 −Z 여러 줄 문자가 된다(전에는 X 거울상 자리)', () => {
    // −Z OCS (−3,1)·고도 2 = WCS (3,1,−2) — WCS (−3,1,−2)의 +Z 문자와 거울상
    const neg = text(-3, 1, 'AB', 2.5, 0, { insert: P(-3, 1, 2), extrusion: NEG_Z });
    const pos = text(-3, 1, 'AB', 2.5, 0, { insert: P(-3, 1, -2) });
    const a = one([neg], false);
    const b = one([pos], false);
    expect(xy(a.insert)).toEqual(mx(b.insert));
    expect(a.insert.z).toBe(-2);
    expect(b.insert.z).toBe(-2);
    expect(a.extrusion).toEqual(NEG_Z);
    expect(a.rotation).toBe(b.rotation);
    expect(a.text).toBe(b.text);
    // 삽입점(왼쪽 위)은 원본 글자 틀의 왼쪽 위(WCS)이고, 글줄 방향도 원본과 같다(WCS −X)
    const o = textOutline(neg, doc)!;
    expect(xy(a.insert)).toEqual(xy(o[3]!));
    expect(xy(mtextDir(a))).toEqual([-1, 0]);
  });

  it('가운데 맞춤 −Z 문자 둘을 결합하면 가운데 위가 WCS 맞춤점 위에 놓인다', () => {
    // 맞춤점 OCS (−10,0)·(−10,−4) = WCS (10,0)·(10,−4) — WCS (−10,0)·(−10,−4)의 +Z 문자와 거울상
    const n1 = text(-10, 0, '제목', 2.5, 0, { halign: 1, alignPoint: P(-10, 0), extrusion: NEG_Z });
    const n2 = text(-10, -4, '부제', 2.5, 0, { halign: 1, alignPoint: P(-10, -4), extrusion: NEG_Z });
    const p1 = text(-10, 0, '제목', 2.5, 0, { halign: 1, alignPoint: P(-10, 0) });
    const p2 = text(-10, -4, '부제', 2.5, 0, { halign: 1, alignPoint: P(-10, -4) });
    const a = one([n2, n1]);
    const b = one([p2, p1]);
    expect(a.text).toBe('제목\\P부제');
    expect(a.text).toBe(b.text);
    expect(a.attachment).toBe(2);
    expect(xy(a.insert)).toEqual(mx(b.insert));
    expect(r9(a.insert.x)).toBe(10);
    expect(a.lineSpacingFactor).toBeCloseTo(b.lineSpacingFactor, 12);
    expect(a.extrusion).toEqual(NEG_Z);
  });

  it('−Z 여러 줄 문자는 돌출 방향과 위 방향을 지킨다(전에는 +Z로 바꾸어 180° 돈 글자)', () => {
    // −Z 여러 줄 문자(OCS 회전 0 = WCS −X 방향) at WCS (10,10) — WCS (−10,10)의 +Z 여러 줄 문자와 거울상
    const neg = mtext(10, 10, 'M1', 2.5, { extrusion: NEG_Z }) as MTextEntity;
    const pos = mtext(-10, 10, 'M1', 2.5) as MTextEntity;
    const a = one([neg]);
    const b = one([pos]);
    expect(a.extrusion).toEqual(NEG_Z);
    expect(a.rotation).toBeCloseTo(0, 12);
    expect(xy(mtextDir(a))).toEqual(xy(mtextDir(neg)));
    expect(xy(a.insert)).toEqual(mx(b.insert));
    // 원본 둘은 거울상이고, 바꾼 결과의 글자 상자도 +Z 결과 상자의 거울상이다(전에는 위아래가 뒤집혀 삽입점 위로 올라갔다)
    expect(textOutline(neg, doc)!.map(xy)).toEqual(textOutline(pos, doc)!.map(mx));
    expect(textOutline(a, doc)!.map(xy)).toEqual(textOutline(b, doc)!.map(mx));
  });

  it('−Z 여러 줄 문자 아래의 −Z 한 줄 문자는 다음 줄로 잇는다', () => {
    // 한 줄 문자 OCS (−10,5) = WCS (10,5) — 여러 줄 문자(WCS 위 끝 y = 10)의 아래
    const m = mtext(10, 10, 'M1', 2.5, { extrusion: NEG_Z });
    const t = text(-10, 5, 'T2', 2.5, 0, { extrusion: NEG_Z });
    const pm = mtext(-10, 10, 'M1', 2.5);
    const pt = text(-10, 5, 'T2', 2.5, 0);
    const a = one([m, t]);
    const b = one([pm, pt]);
    expect(b.text).toBe('M1\\PT2');
    expect(a.text).toBe(b.text);
    expect(xy(a.insert)).toEqual(mx(b.insert));
    expect(a.lineSpacingFactor).toBeCloseTo(b.lineSpacingFactor, 12);
    expect(a.extrusion).toEqual(NEG_Z);
  });

  it('+Z 문자는 전과 같다(왼쪽 위, 줄 간격)', () => {
    const a = text(0, 0, '둘째 줄', 2.5, 0);
    const b = text(0, 5, '첫째 줄', 2.5, 0);
    const m = one([a, b]);
    expect(m.text).toBe('첫째 줄\\P둘째 줄');
    expect(xy(m.insert)).toEqual([0, 7.5]);
    expect(m.insert.z).toBe(0);
    expect(m.extrusion).toBeUndefined();
    expect(m.lineSpacingFactor).toBeCloseTo(5 / (1.667 * 2.5), 12);
  });
});
