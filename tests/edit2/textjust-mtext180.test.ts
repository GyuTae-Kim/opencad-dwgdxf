/**
 * 180차: JUSTIFYTEXT·SCALETEXT의 왼쪽(L)·정렬(A)·맞춤(F)은 여러 줄 문자의 맨 아래 왼쪽(BL) 부착점이다.
 * Autodesk JUSTIFYTEXT 도움말(2018·2026 같은 글)·SCALETEXT 도움말: 한 줄 문자의 옵션은 여러 줄 문자와 비슷하지만
 * "the Align, Fit, and Left text options are equivalent to the bottom left (BL) multiline text attachment point".
 * 전에는 여러 줄 문자의 왼쪽을 맨 위 왼쪽(TL)으로 보고 정렬·맞춤은 아무것도 하지 않았다.
 * 중심(C)·중간(M)·오른쪽(R)의 여러 줄 문자 짝은 도움말이 적지 않아 그대로(TC·MC·TR), TEXTALIGN의 맞추는 점도 그대로다.
 */
import { describe, expect, it } from 'vitest';
import type { MTextEntity } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { justifyText, mtextPoint, scaleBasePoint } from '../../src/edit/geom/textjust';
import { mtextLocalBox } from '../../src/edit/geom/xtext';
import { transformEntity } from '../../src/edit/geom/transform';
import { affScale } from '../../src/edit/geom/math';
import { anchorOf } from '../../src/edit/textools/textalign';
import { P, near, newDoc } from '../edit/helpers';

const doc = newDoc();

/** 중간 중심(MC, 5) 부착점의 두 줄 여러 줄 문자 */
function mtext(over: Partial<MTextEntity> = {}): MTextEntity {
  return {
    type: 'MTEXT',
    ...entityDefaults(),
    handle: 'M1',
    insert: P(10, 20),
    height: 2,
    width: 0,
    attachment: 5,
    drawingDirection: 1,
    text: 'Hello\\PWorld',
    style: 'Standard',
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
    ...over,
  };
}

/** 글자 상자(WCS, 돌지 않은 +Z 여러 줄 문자) */
function box(m: MTextEntity) {
  const b = mtextLocalBox(m, doc);
  return { minX: m.insert.x + b.minX, minY: m.insert.y + b.minY, maxX: m.insert.x + b.maxX, maxY: m.insert.y + b.maxY };
}

function sameBox(a: MTextEntity, b: MTextEntity) {
  const x = box(a);
  const y = box(b);
  expect(x.minX).toBeCloseTo(y.minX, 9);
  expect(x.minY).toBeCloseTo(y.minY, 9);
  expect(x.maxX).toBeCloseTo(y.maxX, 9);
  expect(x.maxY).toBeCloseTo(y.maxY, 9);
}

describe('JUSTIFYTEXT 여러 줄 문자의 왼쪽·정렬·맞춤 = 맨 아래 왼쪽(BL)', () => {
  it('왼쪽(L)은 맨 아래 왼쪽 부착점(7) — 글자 상자는 그대로, 삽입점은 그 부착점 자리', () => {
    const m = mtext();
    const o = justifyText(m, 'L', doc) as MTextEntity;
    expect(o).toBeTruthy();
    expect(o.attachment).toBe(7);
    sameBox(m, o);
    near(o.insert, mtextPoint(m, 7, doc), 1e-9);
    // 맨 위 왼쪽(TL) 자리가 아니다
    expect(Math.abs(o.insert.y - mtextPoint(m, 1, doc).y)).toBeGreaterThan(1);
  });
  it('정렬(A)·맞춤(F)도 맨 아래 왼쪽 부착점(7)', () => {
    for (const k of ['A', 'F']) {
      const m = mtext();
      const o = justifyText(m, k, doc) as MTextEntity;
      expect(o, k).toBeTruthy();
      expect(o.attachment).toBe(7);
      sameBox(m, o);
      near(o.insert, mtextPoint(m, 7, doc), 1e-9);
    }
  });
  it('이미 맨 아래 왼쪽이면 왼쪽·정렬·맞춤은 바꾸지 않는다(null)', () => {
    for (const k of ['L', 'A', 'F', 'BL']) expect(justifyText(mtext({ attachment: 7 }), k, doc), k).toBeNull();
  });
  it('돌린 여러 줄 문자도 상자를 지키며 맨 아래 왼쪽으로', () => {
    const m = mtext({ rotation: 0.6, insert: P(-3, 4) });
    const o = justifyText(m, 'F', doc) as MTextEntity;
    expect(o.attachment).toBe(7);
    near(o.insert, mtextPoint(m, 7, doc), 1e-9);
    // 상자가 그대로면 바꾼 문자의 중간 중심 자리 = 원래 삽입점
    near(mtextPoint(o, 5, doc), m.insert, 1e-9);
  });
  it('중심(C)·중간(M)·오른쪽(R)은 전처럼 맨 위 중심·중간 중심·맨 위 오른쪽(도움말이 여러 줄 문자 짝을 적지 않는다)', () => {
    const m = mtext({ attachment: 9 });
    expect((justifyText(m, 'C', doc) as MTextEntity).attachment).toBe(2);
    expect((justifyText(m, 'M', doc) as MTextEntity).attachment).toBe(5);
    expect((justifyText(m, 'R', doc) as MTextEntity).attachment).toBe(3);
    expect((justifyText(m, 'TL', doc) as MTextEntity).attachment).toBe(1);
  });
});

describe('SCALETEXT 여러 줄 문자의 왼쪽 기준점 = 맨 아래 왼쪽(BL)', () => {
  it('왼쪽(L) 기준점은 맨 아래 왼쪽 자리 — 두 배로 축척해도 그 점이 그대로', () => {
    const m = mtext();
    const p = scaleBasePoint(m, 'L', doc)!;
    near(p, mtextPoint(m, 7, doc), 1e-9);
    const o = transformEntity(m, affScale(2, 2, p), doc).replace![0] as MTextEntity;
    expect(o.height).toBeCloseTo(4, 9);
    near(scaleBasePoint(o, 'BL', doc)!, p, 1e-9);
    // 왼쪽 끝은 그대로이고 글자는 위로 자란다(전에는 맨 위 왼쪽 점을 두고 아래로 자랐다)
    expect(box(o).minX).toBeCloseTo(box(m).minX, 9);
    expect(mtextPoint(o, 1, doc).y - mtextPoint(m, 1, doc).y).toBeGreaterThan(1);
  });
  it('두 글자 옵션·기존(E)은 전과 같다', () => {
    const m = mtext();
    near(scaleBasePoint(m, 'BL', doc)!, mtextPoint(m, 7, doc), 1e-9);
    near(scaleBasePoint(m, 'TL', doc)!, mtextPoint(m, 1, doc), 1e-9);
    near(scaleBasePoint(m, 'C', doc)!, mtextPoint(m, 2, doc), 1e-9);
    near(scaleBasePoint(m, 'E', doc)!, m.insert, 1e-9);
  });
});

describe('TEXTALIGN은 그대로', () => {
  it('왼쪽(L) 맞추는 점은 전처럼 맨 위 왼쪽(TEXTALIGN 도움말은 여러 줄 문자 짝을 적지 않는다)', () => {
    const m = mtext();
    near(anchorOf(m, 'L', doc)!, mtextPoint(m, 1, doc), 1e-9);
    near(anchorOf(m, 'BL', doc)!, mtextPoint(m, 7, doc), 1e-9);
  });
});
