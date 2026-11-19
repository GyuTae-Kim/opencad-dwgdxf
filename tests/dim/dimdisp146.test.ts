/**
 * 146차: 치수 표시 문자(특성 "표시 문자"·정보 카드·치수 목록 — app/inquiry dimDisplayText의 text).
 * 전에는 도면 단위 표시 꼴(core/units formatLength)로 만들어 블록 문자와 꼴이 달랐다 — 실제 도면 840개에서 사용자 문자가 없는 치수의
 * 표시가 AutoCAD 블록 문자와 같은 것 1,202/2,911(블록 `4'`·`11"`·`10°` ↔ 표시 `4'-0"`·`0'-11"`·`10d`).
 * 이제 측정값을 보이는 치수(사용자 문자 없음·`<>`)는 블록이 그리는 문자(MTEXT 하나 — 이 앱이 화면에 그리는 것이 그 블록), 블록 문자가 없으면 치수 생성기가
 * 블록에 쓰는 셈(storedDimensionText)이다. 쌓은 분수는 숫자 뒤에 빈칸을 두어 읽는다(`1'-10 1/2"`).
 * 측정값의 숫자 문자 formatted(치수 목록 재지정 판정·편집 커널 숫자 바꾸기가 읽음)와 측정값을 보이지 않는 사용자 문자는 그대로다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, MTextEntity, Vec3 } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { createAngularDimension, createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { dimDisplayText } from '../../src/app/inquiry';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const ARCH = { 277: 4, 271: 4, 276: 1 } as const;
let seq = 0;

/** 길이 len인 선형 치수(재지정 ov), 측정값은 생성기 값 */
function lin(doc: CadDocument, len: number, ov: Record<number, number | string>, text = ''): DimensionEntity {
  const d = createLinearDimension(doc, V(0, 0), V(len, 0), V(len / 2, 10));
  d.overrides = { ...(d.overrides ?? {}), ...ov };
  d.text = text;
  d.measurement = generateDimensionGeometry(doc, d).measurement;
  return d;
}

/** 생성기 그림으로 치수 블록을 만들어 붙인다. edit로 블록 객체를 바꿀 수 있다(낡은 블록·R12 TEXT 블록 흉내) */
function withBlock(doc: CadDocument, d: DimensionEntity, edit?: (ents: Entity[]) => Entity[]): DimensionEntity {
  let ents = generateDimensionGeometry(doc, d).entities;
  if (edit) ents = edit(ents);
  const name = `*D${900 + ++seq}`;
  doc.blocks.set(tableKey(name), { name, handle: '', recordHandle: '', basePoint: V(0, 0), flags: 1, entities: ents });
  d.block = name;
  return d;
}

const mtextOf = (ents: Entity[]): MTextEntity => ents.find((e): e is MTextEntity => e.type === 'MTEXT')!;

describe('치수 표시 문자 = 블록이 그리는 문자(146차)', () => {
  it('블록의 MTEXT를 그대로(서식 빼고) — 건축 단위 0 생략·쌓은 분수', () => {
    const doc = createNewDocument('metric');
    // DIMZIN 0: 0 피트와 꼭 0인 인치를 생략 — 블록 4'(전에는 4'-0")
    const a = withBlock(doc, lin(doc, 48, { ...ARCH, 78: 0 }));
    expect(dimDisplayText(doc, a).text).toBe("4'");
    // DIMZIN 3: 0 피트 생략 — 블록 11"(전에는 0'-11")
    expect(dimDisplayText(doc, withBlock(doc, lin(doc, 11, { ...ARCH, 78: 3 }))).text).toBe('11"');
    // 쌓은 분수는 숫자 뒤 빈칸(plainText만으로는 1'-101/2")
    const f = withBlock(doc, lin(doc, 22.5, { ...ARCH, 78: 3 }));
    expect(mtextOf(doc.blocks.get(tableKey(f.block))!.entities).text).toMatch(/1'-10\{\\H[\d.]+x;\\S1#2;\}"/);
    expect(dimDisplayText(doc, f).text).toBe('1\'-10 1/2"');
    // 측정값의 숫자 문자(formatted)는 그대로 — 치수 목록 재지정 판정·편집 커널이 숫자를 읽는다
    expect(dimDisplayText(doc, a).formatted).toBe('4\'-0"');
    expect(dimDisplayText(doc, a).value).toBeCloseTo(48, 9);
  });

  it('블록 문자가 스타일과 달라도(낡은 블록) 화면에 그려진 블록 문자를 보인다', () => {
    const doc = createNewDocument('metric');
    // 실제 도면: 블록 정의 안 치수의 AutoCAD 블록이 DIMZIN 0인데 1'-0"(같은 스타일의 모형 공간 치수는 1')
    const d = withBlock(doc, lin(doc, 12, { ...ARCH, 78: 0 }), (ents) => {
      mtextOf(ents).text = '\\A1;1\'-0"';
      return ents;
    });
    expect(dimDisplayText(doc, d).text).toBe('1\'-0"');
    // 블록이 없으면 생성기 셈
    d.block = '';
    expect(dimDisplayText(doc, d).text).toBe("1'");
  });

  it('블록 문자가 없으면(블록 없음·MTEXT 없음·MTEXT 여럿) 치수 생성기가 블록에 쓰는 셈', () => {
    const doc = createNewDocument('metric');
    expect(dimDisplayText(doc, lin(doc, 48, { ...ARCH, 78: 0 })).text).toBe("4'");
    // 소수 DIMZIN 0은 뒤 0을 남긴다(전에는 12.5)
    expect(dimDisplayText(doc, lin(doc, 12.5, { 277: 2, 271: 2, 78: 0, 278: 46 })).text).toBe('12.50');
    // 도분초(DIMAUNIT 1)는 ° 기호(전에는 90d)
    const ang = createAngularDimension(doc, V(0, 0), V(50, 0), V(0, 50), V(30, 30));
    ang.overrides = { ...(ang.overrides ?? {}), 275: 1, 179: 0 };
    ang.measurement = generateDimensionGeometry(doc, ang).measurement;
    expect(dimDisplayText(doc, ang).text).toBe('90°');
    // R12 TEXT 블록(MTEXT 없음)·MTEXT가 둘인 블록
    const noM = withBlock(doc, lin(doc, 11, { ...ARCH, 78: 3 }), (ents) => ents.filter((e) => e.type !== 'MTEXT'));
    expect(dimDisplayText(doc, noM).text).toBe('11"');
    const two = withBlock(doc, lin(doc, 11, { ...ARCH, 78: 3 }), (ents) => {
      const t = mtextOf(ents);
      return [...ents, { ...t, text: '[279]' }];
    });
    expect(dimDisplayText(doc, two).text).toBe('11"');
  });

  it('사용자 문자: <>는 블록 문자(없으면 셈), <>가 없는 문자와 숨김은 그대로', () => {
    const doc = createNewDocument('metric');
    const u = lin(doc, 6, { ...ARCH, 78: 3 }, '<> MIN');
    expect(dimDisplayText(doc, u).text).toBe('6" MIN');
    expect(dimDisplayText(doc, withBlock(doc, u)).text).toBe('6" MIN');
    const o = withBlock(doc, lin(doc, 6, { ...ARCH, 78: 3 }, '{\\H0.7x;\\S1#2;}"CLR\\P(TYP)'));
    expect(dimDisplayText(doc, o).text).toBe('1/2"CLR\n(TYP)');
    expect(dimDisplayText(doc, withBlock(doc, lin(doc, 6, { ...ARCH, 78: 3 }, ' '))).text).toBe('');
  });
});
