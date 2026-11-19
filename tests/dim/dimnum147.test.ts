/**
 * 147차: 편집 커널의 치수 블록 숫자 바꾸기(edit/geom/xannot updateDimNumber — 치수 생성기 없이 옮기거나 늘인 치수의 블록 문자).
 * - 블록 문자에 치수 생성기가 쓰는 측정 문자(storedDimensionText().measured)가 그대로 있으면 새 측정값의 그 문자로 바꾼다 —
 *   건축·분수 단위는 전에 숫자 정규식이 피트만 바꿔 `2'-2"` → `4'-2"`가 됐다(146차 잼: 실제 도면 치수 2배 축척에서 건축 단위 1,458개 모두).
 * - 블록 문자에서 숫자를 찾을 때 MTEXT 서식 코드(`\A1;` 등) 안의 숫자는 건너뛴다(전에는 `\A1;1` → `\A2;1`).
 * - 측정값과 같은 숫자를 찾는 둘째 경로는 측정값(42 — 145차부터 DIMLFAC 몫이 든 값)에 DIMLFAC를 또 곱하지 않는다
 *   (전에는 DIMLFAC가 1이 아니면 블록 숫자를 못 찾아 그대로 두었고, 모형 공간 음수 DIMLFAC면 부호까지 틀렸다).
 */
import { describe, expect, it } from 'vitest';
import type { BlockDef, CadDocument, DimensionEntity, Entity, MTextEntity, Vec2, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { affScale } from '../../src/edit/geom/math';
import { stretch } from '../../src/edit/geom/stretch';
import { transformEntity } from '../../src/edit/geom/transform';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const ARCH = { 277: 4, 271: 4, 276: 1 } as const;
/** 소수 단위, 소수점 마침표 */
const DEC = { 277: 2, 278: 46 } as const;
let seq = 0;

/** 길이 len인 선형 치수(재지정 ov, 모형 공간), 측정값과 블록은 생성기 그림. edit로 블록 MTEXT를 바꿀 수 있다(AutoCAD·다른 프로그램이 쓴 블록 흉내) */
function dim(doc: CadDocument, len: number, ov: Record<number, number | string>, edit?: (t: MTextEntity) => void): DimensionEntity {
  const d = createLinearDimension(doc, V(0, 0), V(len, 0), V(len / 2, 10));
  d.overrides = { ...(d.overrides ?? {}), ...ov };
  d.owner = doc.blocks.get(MODEL_SPACE)!.recordHandle;
  d.measurement = generateDimensionGeometry(doc, d).measurement;
  const ents = generateDimensionGeometry(doc, d).entities;
  if (edit) edit(mtextOf(ents));
  const name = `*D${700 + ++seq}`;
  doc.blocks.set(tableKey(name), { name, handle: '', recordHandle: '', basePoint: V(0, 0), flags: 1, entities: ents });
  d.block = name;
  return d;
}

/** AutoCAD 블록처럼 문자 앞에 \A1; */
const acad = (t: MTextEntity) => (t.text = '\\A1;' + t.text);

const mtextOf = (ents: Entity[]): MTextEntity => ents.find((e): e is MTextEntity => e.type === 'MTEXT')!;
const blockText = (doc: CadDocument, d: DimensionEntity) => mtextOf(doc.blocks.get(tableKey(d.block))!.entities).text;

/** 편집 결과의 치수와 그 블록 MTEXT 문자 */
function result(r: { replace?: Entity[]; blocks?: BlockDef[] }): { d: DimensionEntity; text: string } {
  const d = (r.replace ?? []).find((e): e is DimensionEntity => e.type === 'DIMENSION')!;
  const b = (r.blocks ?? []).find((x) => tableKey(x.name) === tableKey(d.block))!;
  return { d, text: mtextOf(b.entities).text };
}

/** 2배 축척(치수 생성기 없이 — 편집 커널이 블록 내용을 옮기고 숫자를 바꾼다) */
const scale2 = (doc: CadDocument, d: DimensionEntity) => result(transformEntity(d, affScale(2), doc));

/** 생성기가 새 측정값으로 그리는 문자 */
const drawn = (doc: CadDocument, d: DimensionEntity) => mtextOf(generateDimensionGeometry(doc, d).entities).text;

describe('편집 커널의 치수 블록 숫자 바꾸기(147차)', () => {
  it('건축 단위: 블록의 측정 문자를 피트·인치·분수째 새 측정값 문자로', () => {
    const doc = createNewDocument('metric');
    const a = dim(doc, 26, { ...ARCH, 78: 3 });
    expect(blockText(doc, a)).toBe('2\'-2"');
    const ra = scale2(doc, a);
    expect(ra.d.measurement).toBeCloseTo(52, 9);
    // 전에는 피트만 바뀌어 4'-2"
    expect(ra.text).toBe('4\'-4"');
    expect(ra.text).toBe(drawn(doc, ra.d));
    // AutoCAD 블록(\A1; 앞붙임)도
    expect(scale2(doc, dim(doc, 26, { ...ARCH, 78: 3 }, acad)).text).toBe('\\A1;4\'-4"');
    // 쌓은 분수: 1'-10 1/2" → 3'-9"(전에는 3'-10 1/2")
    const f = dim(doc, 22.5, { ...ARCH, 78: 3 });
    expect(blockText(doc, f)).toMatch(/^1'-10\{\\H[\d.]+x;\\S1#2;\}"$/);
    const rf = scale2(doc, f);
    expect(rf.text).toBe('3\'-9"');
    expect(rf.text).toBe(drawn(doc, rf.d));
    // 늘이기(블록 그림 근사)도 같은 셈: 26 → 36.5 = 3'-1/2"(전에는 3'-2")
    const s = dim(doc, 26, { ...ARCH, 78: 3 });
    const rs = result(stretch([s], [{ x: 25, y: -1 }, { x: 27, y: -1 }, { x: 27, y: 1 }, { x: 25, y: 1 }] as Vec2[], { x: 10.5, y: 0 }, doc));
    expect(rs.d.measurement).toBeCloseTo(36.5, 9);
    expect(rs.text).toBe(drawn(doc, rs.d));
    expect(rs.text).not.toBe('3\'-2"');
  });

  it('소수 단위는 전과 같다: 측정 문자째 바꾸기 = 숫자만 바꾸기', () => {
    const doc = createNewDocument('metric');
    const d = dim(doc, 12.5, { ...DEC, 271: 2, 78: 0 });
    expect(blockText(doc, d)).toBe('12.50');
    expect(scale2(doc, d).text).toBe('25.00');
    expect(scale2(doc, dim(doc, 12.5, { ...DEC, 271: 2, 78: 0 }, acad)).text).toBe('\\A1;25.00');
  });

  it('블록 문자의 서식 코드 안 숫자는 바꾸지 않는다(`\\A1;1` → `\\A1;2`, 전에는 `\\A2;1`)', () => {
    const doc = createNewDocument('metric');
    const d = dim(doc, 1, { ...DEC, 271: 0, 78: 8 }, acad);
    expect(blockText(doc, d)).toBe('\\A1;1');
    expect(scale2(doc, d).text).toBe('\\A1;2');
    // 블록 안 다른 서식 코드의 숫자도 건너뛴다
    const o = dim(doc, 1, { ...DEC, 271: 0, 78: 8 }, (t) => (t.text = '\\A1;\\H1;1 MM'));
    expect(scale2(doc, o).text).toBe('\\A1;\\H1;2 MM');
  });

  it('측정값과 같은 숫자 찾기는 DIMLFAC 몫을 또 곱하지 않는다(블록 숫자의 자릿수가 측정 문자와 다를 때)', () => {
    const doc = createNewDocument('metric');
    // DIMLFAC 2: 잰 값 12.5 → 측정값 25(42), 블록은 다른 프로그램이 한 자리로 쓴 25.0
    const d = dim(doc, 12.5, { ...DEC, 271: 2, 78: 0, 144: 2 }, (t) => (t.text = '\\A1;25.0'));
    expect(d.measurement).toBeCloseTo(25, 9);
    const r = scale2(doc, d);
    expect(r.d.measurement).toBeCloseTo(50, 9);
    // 전에는 25 × 2 = 50을 찾아 블록 숫자를 못 바꿨다(25.0 그대로)
    expect(r.text).toBe('\\A1;50.0');
    // 모형 공간 음수 DIMLFAC는 몫 1(145차): 전에는 −3을 곱한 −37.5를 찾았다
    const n = dim(doc, 12.5, { ...DEC, 271: 2, 78: 0, 144: -3 }, (t) => (t.text = '\\A1;12.5'));
    expect(n.measurement).toBeCloseTo(12.5, 9);
    expect(scale2(doc, n).text).toBe('\\A1;25.0');
  });
});
