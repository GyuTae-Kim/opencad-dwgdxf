/**
 * 145차: 치수의 실제 측정값(DXF 42)은 정의점으로 잰 값 × DIMLFAC 몫이다.
 * 실제 도면에서 DIMLFAC가 1이 아닌 치수 278개(도면 9개, DIMLFAC 19가지, DWG R2004·R2018·DXF)의 AutoCAD 42가 모두 그 값이었다 —
 * 모형 공간 양수 DIMLFAC 270개는 잰 값 × DIMLFAC, 도면 공간 음수 DIMLFAC 8개는 × |DIMLFAC|, 잰 값 그대로인 것은 0개(136차에 "낡은 값"으로 본 것).
 * 이 앱은 42를 곱하기 전 값으로 보고 표시에서 DIMLFAC를 또 곱해(특성·정보 카드·문자 편집·명령행 안내) AutoCAD 블록 문자와 다른 값을 보였고,
 * 만들거나 다시 만든 치수와 42가 없는(R13·R14) 치수를 저장할 때는 곱하기 전 값을 썼다. 몫은 치수 문자와 같다(도움말 DIMLFAC — 반지름·지름·좌표를
 * 포함한 모든 선형 거리에 곱하고 각도에는 효과가 없다. 음수는 도면 공간에서만 — 모형 공간 치수는 1).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { createAngularDimension, createLinearDimension, createRadialDimension, generateDimensionGeometry, measureVars, storedDimensionText } from '../../src/edit/dim';
import { dimKindName } from '../../src/edit/dim/format';
import { dimGeomMeasurement, dimMeasurementOf } from '../../src/edit/geom/dimmeasure';
import { moveDimPoint } from '../../src/edit/geom/stretch';
import { transformEntity } from '../../src/edit/geom/transform';
import { affScale } from '../../src/edit/geom/math';
import { dimDisplayText } from '../../src/app/inquiry';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** 치수에 DIMLFAC 재지정을 넣고 공간(모형·도면)에 둔 뒤 생성기로 측정값을 다시 잰다(앱의 dimensionBlockOps와 같은 차례) */
function place(doc: CadDocument, d: DimensionEntity, lfac: number, space: 'model' | 'paper'): DimensionEntity {
  d.overrides = { ...(d.overrides ?? {}), 144: lfac };
  if (space === 'paper') {
    d.paperSpace = true;
    d.owner = doc.blocks.get(PAPER_SPACE)!.recordHandle;
  } else d.owner = doc.blocks.get(MODEL_SPACE)!.recordHandle;
  d.measurement = generateDimensionGeometry(doc, d).measurement;
  return d;
}

/** 치수 그림의 문자(서식 \A1; 뺀 것) */
function drawnText(doc: CadDocument, d: DimensionEntity): string {
  const t = generateDimensionGeometry(doc, d).entities.find((e): e is MTextEntity => e.type === 'MTEXT');
  return (t?.text ?? '').replace(/^\\A1;/, '');
}

describe('치수 측정값(42)의 DIMLFAC 몫', () => {
  it('생성기 측정값: 모형 공간 양수는 × DIMLFAC, 도면 공간 음수는 × |DIMLFAC|, 모형 공간 음수는 그대로, 각도는 곱하지 않는다', () => {
    const doc = createNewDocument('metric');
    // 실제 도면의 AutoCAD 값 꼴: 잰 값 54.857142864 × 0.875 = 48.000000006
    const a = place(doc, createLinearDimension(doc, V(0, 0), V(54.857142864, 0), V(20, 10)), 0.875, 'model');
    expect(a.measurement).toBeCloseTo(48.000000006, 9);
    expect(dimGeomMeasurement(a)).toBeCloseTo(54.857142864, 9);
    expect(place(doc, createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20)), -10, 'paper').measurement).toBeCloseTo(1000, 9);
    expect(place(doc, createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20)), -10, 'model').measurement).toBeCloseTo(100, 9);
    // 반지름도 곱한다(도움말 DIMLFAC — 실제 도면에는 DIMLFAC가 1이 아닌 반지름 치수가 없다)
    expect(place(doc, createRadialDimension(doc, V(0, 0), 25, Math.PI / 4), 2, 'model').measurement).toBeCloseTo(50, 9);
    const ang = place(doc, createAngularDimension(doc, V(0, 0), V(50, 0), V(0, 50), V(30, 30)), 2, 'model');
    expect(ang.measurement).toBeCloseTo(Math.PI / 2, 12);
  });

  it('표시: 저장된 42(DIMLFAC 몫이 든 값)를 다시 곱하지 않아 그림의 문자와 같다', () => {
    const doc = createNewDocument('metric');
    const d = place(doc, createLinearDimension(doc, V(0, 0), V(54.857142864, 0), V(20, 10)), 0.875, 'model');
    const drawn = drawnText(doc, d);
    expect(drawn).toMatch(/^48([.,]0+)?$/);
    expect(dimDisplayText(doc, d).formatted).toBe(drawn);
    expect(dimDisplayText(doc, d).value).toBeCloseTo(48.000000006, 9);
    expect(storedDimensionText(measureVars(doc, d), dimKindName(d), d.measurement, '').measured).toBe(drawn);
    // 전에는 48 × 0.875 = 42를 보였다
    expect(dimDisplayText(doc, d).formatted).not.toMatch(/^42/);
  });

  it('42가 없는 치수(NaN — R2000 전 판): doc이 있으면 잰 값 × 몫, 없으면 잰 값', () => {
    const doc = createNewDocument('metric');
    const d = place(doc, createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20)), 0.5, 'model');
    d.measurement = NaN;
    expect(dimMeasurementOf(d, doc)).toBeCloseTo(50, 12);
    expect(dimMeasurementOf(d)).toBeCloseTo(100, 12);
    expect(dimDisplayText(doc, d).formatted).toBe(drawnText(doc, d));
  });

  it('저장: 42가 없는 치수는 잰 값 × 몫을, 있는 치수는 그 값을 R2018 DXF·DWG에 쓴다', () => {
    const doc = createNewDocument('metric');
    const ms = doc.blocks.get(MODEL_SPACE)!;
    const a = place(doc, createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20)), 2, 'model');
    a.measurement = NaN;
    const b = place(doc, createLinearDimension(doc, V(0, 50), V(54.857142864, 50), V(20, 70)), 0.875, 'model');
    a.handle = 'A0';
    b.handle = 'A1';
    for (const d of [a, b]) {
      ms.entities.push(d);
      doc.entityIndex.set(d.handle, d);
    }
    for (const [name, data] of [
      ['x.dxf', writeDxf(doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(doc, { version: 'AC1032' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      const dims = back.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
      const ra = dims.find((e) => e.defPoint3.x === 100)!;
      const rb = dims.find((e) => e.defPoint3.y === 50)!;
      expect(ra.measurement, name).toBeCloseTo(200, 9);
      expect(rb.measurement, name).toBeCloseTo(48.000000006, 9);
    }
  });

  it('편집 커널: 정의점 옮기기(doc이 있을 때)와 축척 변환도 몫을 곱한 값', () => {
    const doc = createNewDocument('metric');
    const d = place(doc, createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20)), 0.5, 'model');
    expect(d.measurement).toBeCloseTo(50, 12);
    expect(moveDimPoint(d, 'defPoint3', { x: 10, y: 0 }, doc).measurement).toBeCloseTo(55, 12);
    // doc이 없으면 스타일을 몰라 잰 값(이전과 같다)
    expect(moveDimPoint(d, 'defPoint3', { x: 10, y: 0 }).measurement).toBeCloseTo(110, 12);
    const r = transformEntity(d, affScale(2), doc);
    const s = (r.replace ?? []).find((e): e is DimensionEntity => e.type === 'DIMENSION')!;
    expect(s.measurement).toBeCloseTo(100, 12);
  });
});
