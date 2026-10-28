/**
 * 맞춤점 방식 스플라인을 DWG로 쓰고 다시 읽기(10차 실제 도면 훑기 — 자료는 직접 만든 합성 문서).
 * AutoCAD가 같은 도면을 DWG·DXF로 쓴 짝: DWG에는 맞춤점 자료만(끝 접선·공차·매듭 매개변수), DXF에는 그 자료에서 다시 구한 조정점·매듭이 함께 있다.
 * - R2013+: 맞춤점과 조정점이 함께 있으면(DXF 70에 1024) 맞춤점 자료로 쓰고, 다시 읽으면 같은 조정점·매듭을 다시 구한다.
 * - 조정점만 남은 맞춤점 방식(1024, 맞춤점 없음)은 맞춤점 자료를 되살려 쓴다(같은 곡선일 때만).
 * - R2000~R2010: 현 길이는 맞춤점 자료로, 제곱근·균일은 조정점 자료로 쓰고 저장 전 확인에 알린다.
 * - 조정점이 맞춤점에서 다시 구한 곡선과 다르면 조정점으로 쓰고(모양 그대로) 알린다.
 * - 로컬 대조(표본이 있을 때만): 맞춤점 자료에서 채운 조정점·매듭이 같은 도면을 AutoCAD가 쓴 DXF와 같다.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CadDocument, ReadWarning, SplineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { dwgSplinePlan } from '../../src/io/dwg/splineflags';
import { FIXTURES } from '../oracle/ezdxf';
import { fitPointsCurve, fitSplineAcad } from '../../src/geom/curves';
import { saveLosses } from '../../src/app/saveloss';
import { makeFitSpline } from '../../src/edit/geom/drawgeom';
import { fitMove, refit } from '../../src/edit/geom/splinedit';

let seq = 0x7c00;
const h = () => (seq++).toString(16).toUpperCase();
const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)!.entities;
const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const KP_BITS = [32, 64, 128];

/** DXF에서 읽은 것처럼: 맞춤점·끝 접선과 AutoCAD 방식으로 구한 조정점·매듭을 함께, 70 = 1024 + 매듭 매개변수 비트 + 평면 */
function fitSpline(fit: Vec3[], kp: number, st?: Vec3, et?: Vec3): SplineEntity {
  const s = fitSplineAcad(fit, kp, st, et)!;
  const e: SplineEntity = { ...entityDefaults(), handle: h(), layer: '0', type: 'SPLINE', flags: 1024 | KP_BITS[kp]! | 8, degree: 3, knots: s.knots, controlPoints: s.ctrl, fitPoints: fit, knotTolerance: 1e-9, controlTolerance: 1e-10, fitTolerance: 1e-10 };
  if (st) e.startTangent = st;
  if (et) e.endTangent = et;
  return e;
}

function roundTrip(e: SplineEntity, version: string): { back: SplineEntity; warnings: ReadWarning[] } {
  const doc = createNewDocument('metric');
  ms(doc).push(e);
  const w = writeDwg(doc, { version: version as never });
  const back = ms(readDwg(w.data)).find((x) => x.handle === e.handle) as SplineEntity;
  return { back, warnings: w.warnings };
}

const close = (a: readonly Vec3[], b: readonly Vec3[], tol = 1e-9) => a.length === b.length && a.every((p, i) => Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y, p.z - b[i]!.z) <= tol);
const fitWarn = (ws: ReadWarning[]) => ws.filter((w) => w.code === 'dwg.write_spline_fit_dropped');

describe('맞춤점 방식 스플라인 ↔ DWG', () => {
  const fit = [P(0, 0), P(30, 30), P(60, 0), P(90, 30)];

  it('R2018: 맞춤점·조정점이 함께 있는 1064 스플라인은 맞춤점 자료로 쓰고 다시 읽으면 플래그·맞춤점·조정점·매듭이 그대로(전에는 조정점 스플라인 — 1024와 맞춤점이 빠졌다)', () => {
    const e = fitSpline(fit, 0);
    expect(dwgSplinePlan(e, true).kind).toBe('fit');
    const { back, warnings } = roundTrip(e, 'AC1032');
    expect(back.flags & ~24).toBe(1024 | 32);
    expect(close(back.fitPoints, fit, 0)).toBe(true);
    expect(close(back.controlPoints, e.controlPoints)).toBe(true);
    expect(back.knots.length).toBe(e.knots.length);
    back.knots.forEach((k, i) => expect(k).toBeCloseTo(e.knots[i]!, 9));
    expect(fitWarn(warnings)).toEqual([]);
  });

  it('끝 접선(크기 그대로)·균일·제곱근 매듭도 그대로 돈다', () => {
    for (const [kp, st, et] of [
      [2, P(12, 30), P(-1, 28)],
      [1, P(1, 2), undefined],
      [0, undefined, P(3, -4)],
    ] as [number, Vec3 | undefined, Vec3 | undefined][]) {
      const e = fitSpline(fit, kp, st, et);
      const { back } = roundTrip(e, 'AC1032');
      expect(back.flags & ~24, String(kp)).toBe(1024 | KP_BITS[kp]!);
      expect(back.startTangent).toEqual(st);
      expect(back.endTangent).toEqual(et);
      expect(close(back.controlPoints, e.controlPoints)).toBe(true);
    }
  });

  it('조정점만 남은 1160 스플라인(DXF에 맞춤점 없음): 맞춤점 자료(두 점 + 끝 접선 = 3·(P1 − P0))를 되살려 쓰고 조정점은 그대로', () => {
    const ctrl = [P(10, 5), P(14, 16), P(19, 5), P(19, 15)];
    const e: SplineEntity = { ...entityDefaults(), handle: h(), layer: '0', type: 'SPLINE', flags: 1160, degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], controlPoints: ctrl, fitPoints: [], knotTolerance: 1e-9, controlTolerance: 1e-10, fitTolerance: 1e-10 };
    const plan = dwgSplinePlan(e, true);
    expect(plan.kind).toBe('fit');
    const { back } = roundTrip(e, 'AC1032');
    expect(back.flags & ~24).toBe(1160 & ~24);
    expect(back.fitPoints).toEqual([ctrl[0], ctrl[3]]);
    expect(back.startTangent).toEqual(P(12, 33));
    expect(back.endTangent).toEqual(P(0, 30));
    expect(close(back.controlPoints, ctrl)).toBe(true);
    expect(back.knots).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    // 자연 끝(2차 도함수 0)이면 접선을 쓰지 않는다
    const nat = fitSpline(fit, 0);
    const bare = { ...nat, handle: h(), fitPoints: [] };
    const p2 = dwgSplinePlan(bare, true);
    expect(p2.kind === 'fit' && !p2.startTangent && !p2.endTangent && close(p2.fit, fit, 1e-9)).toBe(true);
    // 1024가 없거나, 되살린 맞춤점으로 다시 구한 곡선이 다르면 조정점 그대로(알리지 않는다 — 빠지는 맞춤점이 없다)
    expect(dwgSplinePlan({ ...e, flags: 8 }, true).kind).toBe('ctrl');
    const odd = { ...e, controlPoints: [P(0, 0), P(1, 5), P(2, -5), P(3, 0), P(4, 1)], knots: [0, 0, 0, 0, 0.2, 1, 1, 1, 1] };
    const p3 = dwgSplinePlan(odd, true);
    expect(p3.kind === 'ctrl' && !p3.fitDropped).toBe(true);
  });

  it('R2000: 현 길이는 맞춤점 자료(AutoCAD가 같은 도면을 R2000 DWG로 쓸 때와 같다), 균일은 조정점 자료로 쓰고 알린다', () => {
    const chord = roundTrip(fitSpline(fit, 0), 'AC1015');
    expect(close(chord.back.fitPoints, fit, 0)).toBe(true);
    expect(chord.back.controlPoints.length).toBe(6);
    expect(chord.back.flags & ~24).toBe(1024 | 32);
    expect(fitWarn(chord.warnings)).toEqual([]);
    const e = fitSpline(fit, 2);
    const uni = roundTrip(e, 'AC1015');
    expect(uni.back.fitPoints).toEqual([]);
    expect(close(uni.back.controlPoints, e.controlPoints, 0)).toBe(true);
    const w = fitWarn(uni.warnings);
    expect(w.length).toBe(1);
    expect(w[0]!.message).toContain('제곱근·균일');
    expect(saveLosses(uni.warnings).some((l) => l.converted && l.message === w[0]!.message)).toBe(true);
  });

  it('조정점을 따로 고친 스플라인은 조정점 자료로(모양 그대로), 맞춤점이 빠진다고 알린다', () => {
    const e = fitSpline(fit, 0);
    e.controlPoints = e.controlPoints.map((p, i) => (i === 2 ? P(p.x, p.y + 5) : p));
    const { back, warnings } = roundTrip(e, 'AC1032');
    expect(back.flags & ~24).toBe(0);
    expect(back.fitPoints).toEqual([]);
    expect(close(back.controlPoints, e.controlPoints, 0)).toBe(true);
    expect(fitWarn(warnings)[0]!.message).toContain('다시 구한 곡선과 다른');
  });

  it('맞춤점 자료만 있는 DWG를 읽으면 AutoCAD처럼 조정점·매듭을 채운다(닫힌 곡선·근사 공차는 비워 둔다)', () => {
    const only: SplineEntity = { ...entityDefaults(), handle: h(), layer: '0', type: 'SPLINE', flags: 1064, degree: 3, knots: [], controlPoints: [], fitPoints: fit, knotTolerance: 0, controlTolerance: 0, fitTolerance: 1e-10 };
    const ref = fitSplineAcad(fit, 0)!;
    for (const v of ['AC1032', 'AC1015']) {
      const { back } = roundTrip(only, v);
      expect(close(back.controlPoints, ref.ctrl), v).toBe(true);
      expect(back.knots.length).toBe(ref.knots.length);
    }
    expect(roundTrip({ ...only, handle: h(), fitTolerance: 0.5 }, 'AC1032').back.controlPoints).toEqual([]);
    expect(roundTrip({ ...only, handle: h(), flags: 1 | 1064 }, 'AC1032').back.controlPoints).toEqual([]);
  });
});

describe('앱에서 그린·고친 맞춤점 스플라인(AutoCAD와 같은 보간)', () => {
  const fit = [P(0, 0), P(30, 30), P(60, 0), P(90, 30)];
  const base = () => ({ ...entityDefaults(), layer: '0' });

  it('SPLINE 맞춤 방식: 70 = 1024 + 매듭 매개변수 비트 + 평면, 조정점은 AutoCAD 방식(맞춤점 + 2개) — DWG에 맞춤점 자료로 알림 없이 쓴다', () => {
    for (const [knots, bit, kp] of [
      ['chord', 32, 0],
      ['sqrt', 64, 1],
      ['uniform', 128, 2],
    ] as const) {
      const e = makeFitSpline(base(), fit, { knots })!;
      e.handle = h();
      expect(e.flags, knots).toBe(8 | 1024 | bit);
      const ref = fitSplineAcad(fit, kp)!;
      expect(close(e.controlPoints, ref.ctrl, 0)).toBe(true);
      const { back, warnings } = roundTrip(e, 'AC1032');
      expect(close(back.fitPoints, fit, 0)).toBe(true);
      expect(close(back.controlPoints, e.controlPoints)).toBe(true);
      expect(fitWarn(warnings)).toEqual([]);
    }
    // 닫힌 맞춤점 곡선은 예전처럼(맞춤점 방식 비트 없이 주기 곡선)
    const c = makeFitSpline(base(), fit, { closed: true })!;
    expect(c.flags & 1024).toBe(0);
    expect(c.flags & 1).toBe(1);
  });

  it('맞춤점을 고쳐 다시 만들 때도 같은 보간: AutoCAD가 쓴 곡선을 그대로 다시 만들고(처음 고칠 때 모양이 튀지 않는다), 옮겼다 되돌리면 그대로', () => {
    const e = fitSpline(fit, 0, P(1, 2));
    const r = refit(e);
    expect(close(r.controlPoints, e.controlPoints, 1e-9)).toBe(true);
    const moved = fitMove(fitMove(e, 2, { x: 61, y: 3 })!, 2, { x: 60, y: 0 })!;
    expect(close(moved.controlPoints, e.controlPoints, 1e-9)).toBe(true);
    expect(dwgSplinePlan(fitMove(e, 1, { x: 31, y: 29 })!, true).kind).toBe('fit');
  });

  it('조정점이 없는 맞춤점 스플라인의 곡선(그리기·스냅·길이 등): 열린 곡선은 AutoCAD 방식, 닫힌 곡선·근사 공차는 예전 보간', () => {
    const open = fitPointsCurve({ fitPoints: fit, flags: 1024 | 128, startTangent: P(0, 9) });
    const ref = fitSplineAcad(fit, 2, P(0, 9))!;
    expect(close(open.ctrl, ref.ctrl, 0)).toBe(true);
    expect(fitPointsCurve({ fitPoints: fit, flags: 1 }).ctrl.length).toBe(fit.length);
    expect(fitPointsCurve({ fitPoints: fit, flags: 0, fitTolerance: 2 }).ctrl.length).toBe(fit.length);
  });
});

/**
 * 로컬 대조(CAD_FIXTURES의 samples·samples-dxf — 같은 도면을 AutoCAD가 판마다 DWG와 DXF로 저장한 짝, 표본이 없으면 건너뛴다):
 * DWG 맞춤점 자료에서 채운 조정점·매듭과 70이 AutoCAD가 같은 도면을 쓴 DXF와 같다. 대조 기준 DXF(AutoCAD가 쓰지 않은 DXF)에는
 * 맞춤점만 있어 그 차이를 normalize.ts 11번으로 맞추는데, 이 시험이 그 근거(AutoCAD DXF에는 조정점·매듭이 함께 있다)를 지킨다.
 * AutoCAD는 균일 매듭 맞춤점 스플라인을 DXF로 쓸 때 맞춤점을 빼므로 맞춤점은 견주지 않는다.
 */
const PAIR = (v: string) => ({ dwg: join(FIXTURES, 'samples', `sample_${v}.dwg`), dxf: join(FIXTURES, 'samples-dxf', `sample_${v}_ascii.dxf`) });
const PAIR_VERSIONS = ['AC1027', 'AC1032'];

describe.skipIf(!PAIR_VERSIONS.every((v) => existsSync(PAIR(v).dwg) && existsSync(PAIR(v).dxf)))('로컬 대조: DWG 맞춤점 자료 ↔ AutoCAD가 쓴 같은 도면의 DXF', () => {
  for (const v of PAIR_VERSIONS) {
    it(`${v}: 채운 조정점·매듭·70이 AutoCAD DXF와 같다`, () => {
      const A = readDwg(new Uint8Array(readFileSync(PAIR(v).dwg)));
      const D = readDxf(new Uint8Array(readFileSync(PAIR(v).dxf)));
      // DWG에는 맞춤점·조정점 자료 중 하나만 있으므로, 둘 다 가진 스플라인은 리더가 맞춤점 자료에서 조정점을 채운 것이다
      const filled = [...A.entityIndex.values()].filter((e): e is SplineEntity => e.type === 'SPLINE' && e.fitPoints.length >= 2 && e.controlPoints.length > 0);
      expect(filled.length).toBeGreaterThan(0);
      for (const a of filled) {
        const d = D.entityIndex.get(a.handle);
        expect(d?.type, a.handle).toBe('SPLINE');
        const s = d as SplineEntity;
        expect(a.flags, a.handle).toBe(s.flags);
        expect(a.degree, a.handle).toBe(s.degree);
        expect(close(a.controlPoints, s.controlPoints), a.handle).toBe(true);
        expect(a.knots.length, a.handle).toBe(s.knots.length);
        a.knots.forEach((k, i) => expect(k).toBeCloseTo(s.knots[i]!, 12));
      }
    });
  }
});
