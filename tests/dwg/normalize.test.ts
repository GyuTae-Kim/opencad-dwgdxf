/**
 * 대조 정규화(normalize.ts) — 표본 없이 도는 합성 시험.
 * - 10번: 기준 DXF(R2000~R2007)는 동적 블록 정의를 `*U<n>`으로 쓰고, DWG 쪽은 본래 이름을 가진다.
 * - 11번: 기준 DXF에는 맞춤점만 있고 DWG 리더는 AutoCAD처럼 조정점·매듭을 채운다.
 */
import { describe, expect, it } from 'vitest';
import type { SplineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { compareSummaries } from '../oracle/compare';
import { DXF_RENAMES_DYNAMIC_BLOCKS, acadFitControl, dynamicBlockRenames, isDynamicBlock, normalizePair } from './normalize';
import { ctrlCount, pack3, splineCtrl } from '../../src/core/flat3';

const yes = () => true;

describe('동적 블록 이름 정규화', () => {
  it('블록 안 도형 핸들이 같으면 기준의 *U<n>을 본래 이름으로 짝짓는다', () => {
    const m = dynamicBlockRenames(
      [{ key: '*U7', handles: ['A1', 'A2'] }, { key: '*U2', handles: ['B1'] }],
      [{ key: 'DOOR', handles: ['A1', 'A2'] }, { key: '*U2', handles: ['B1'] }],
      new Map(),
      new Map(),
      yes,
    );
    expect([...m]).toEqual([['*U7', 'DOOR']]);
  });

  it('빈 블록은 같은 핸들의 INSERT가 가리키는 이름으로 짝짓는다', () => {
    const m = dynamicBlockRenames([{ key: '*U3', handles: [] }], [{ key: 'EMPTY', handles: [] }], new Map([['90', '*U3']]), new Map([['90', 'Empty']]), yes);
    expect([...m]).toEqual([['*U3', 'EMPTY']]);
  });

  it('동적 블록 표지가 없거나 이름이 이미 맞으면 짝짓지 않는다', () => {
    expect(dynamicBlockRenames([{ key: '*U1', handles: ['A1'] }], [{ key: 'PLAIN', handles: ['A1'] }], new Map(), new Map(), () => false).size).toBe(0);
    expect(dynamicBlockRenames([{ key: '*U1', handles: ['A1'] }], [{ key: '*U1', handles: ['A1'] }], new Map(), new Map(), yes).size).toBe(0);
    expect(dynamicBlockRenames([{ key: 'DOOR', handles: ['A1'] }], [{ key: 'DOOR2', handles: ['A1'] }], new Map(), new Map(), yes).size).toBe(0);
  });

  it('R2000~R2007 기준에서만 요약의 블록 열쇠와 참조를 되돌린다', () => {
    expect(['AC1015', 'AC1018', 'AC1021'].every(DXF_RENAMES_DYNAMIC_BLOCKS)).toBe(true);
    expect(['AC1009', 'AC1024', 'AC1032'].some(DXF_RENAMES_DYNAMIC_BLOCKS)).toBe(false);
    const doc = createNewDocument('metric');
    doc.blocks.set('DOOR', { name: 'Door', handle: 'D0', recordHandle: 'D1', basePoint: { x: 0, y: 0, z: 0 }, flags: 1, entities: [] });
    doc.blockRecords.set('DOOR', { name: 'Door', handle: 'D1', flags: 0, insertUnits: 0, explodable: true, scalable: true, xdata: [{ app: 'AcDbDynamicBlockGUID', items: [{ code: 1000, value: '{0}' }] }] });
    expect(isDynamicBlock(doc, 'DOOR')).toBe(true);
    const make = (name: string, key: string, version: string) => ({
      version,
      layers: [],
      dimStyles: [],
      blocks: { '*MODEL_SPACE': [{ type: 'INSERT', handle: '90', block: name }], [key]: [{ type: 'LINE', handle: 'A1' }] },
    });
    for (const [version, renamed] of [['AC1015', true], ['AC1024', false]] as const) {
      const expected = make('*U4', '*U4', version) as Record<string, unknown>;
      const actual = make('Door', 'DOOR', 'AC1015') as Record<string, unknown>;
      normalizePair(expected, actual, doc);
      const blocks = expected.blocks as Record<string, { block?: string }[]>;
      expect('DOOR' in blocks).toBe(renamed);
      expect(blocks['*MODEL_SPACE']![0]!.block).toBe(renamed ? 'Door' : '*U4');
    }
  });
});

describe('맞춤점만 적힌 기준 스플라인(11번)', () => {
  const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
  const fit = [P(0, 0), P(30, 30), P(60, 0)];
  const st = P(12, 30);
  const et = P(-1, 28);

  it('요약: 기준을 AutoCAD DXF의 수(조정점 = 맞춤점 + 2, 매듭 = 맞춤점 + 6)로 바꾸고, 맞춤점 수나 우리 쪽 수가 다르면 그대로 차이', () => {
    const doc = createNewDocument('metric');
    const run = (act: Record<string, number>) => {
      const sp = (x: Record<string, number>) => ({ type: 'SPLINE', handle: '9', degree: 3, flags: 24, knots: 0, controlPoints: 0, fitPoints: 3, ...x });
      const expected = { version: 'AC1032', layers: [], dimStyles: [], blocks: { '*MODEL_SPACE': [sp({})] } } as Record<string, unknown>;
      const actual = { version: 'AC1032', layers: [], dimStyles: [], blocks: { '*MODEL_SPACE': [sp({ flags: 24, ...act })] } } as Record<string, unknown>;
      normalizePair(expected, actual, doc);
      return compareSummaries(expected, actual).map((d) => d.path.replace(/^.*\./, ''));
    };
    expect(run({ controlPoints: 5, knots: 9 })).toEqual([]);
    // 우리가 조정점을 채우지 않은 것(닫힌 곡선 등)은 두 수가 모두 0이라 같다
    expect(run({})).toEqual([]);
    expect(run({ controlPoints: 6, knots: 10 })).toEqual(['knots', 'controlPoints']);
    expect(run({ controlPoints: 5, knots: 9, fitPoints: 4 })).toEqual(['knots', 'controlPoints', 'fitPoints']);
  });

  it('객체: DWG 맞춤점 자료를 읽어 채운 조정점·매듭과, 맞춤점만 적힌 기준 객체에서 구한 AutoCAD 방식 값이 좌표까지 같다', () => {
    const doc = createNewDocument('metric');
    const src: SplineEntity = { ...entityDefaults(), handle: '7C80', layer: '0', type: 'SPLINE', flags: 1024 | 128 | 8, degree: 3, knots: [], controlVerts: [], fitVerts: pack3(fit), startTangent: st, endTangent: et, knotTolerance: 1e-9, controlTolerance: 1e-10, fitTolerance: 1e-10 };
    doc.blocks.get(MODEL_SPACE)!.entities.push(src);
    const A = readDwg(writeDwg(doc, { version: 'AC1032' }).data).entityIndex.get('7C80') as SplineEntity;
    expect(ctrlCount(A)).toBe(fit.length + 2);
    // 기준 DXF를 읽은 것: 맞춤점·끝 접선만, 70은 매듭 매개변수 비트를 잃는다(5번)
    const E: SplineEntity = { ...src, flags: 24, fitVerts: pack3(fit) };
    acadFitControl(E, A);
    expect(ctrlCount(E)).toBe(ctrlCount(A));
    splineCtrl(E).forEach((p, i) => expect(Math.hypot(p.x - splineCtrl(A)[i]!.x, p.y - splineCtrl(A)[i]!.y, p.z - splineCtrl(A)[i]!.z)).toBeLessThan(1e-9));
    expect(E.knots).toEqual(A.knots);
    // 조정점이 이미 있거나 우리 쪽이 채우지 않았으면 그대로 둔다(차이는 비교에 남는다)
    const kept: SplineEntity = { ...E, controlVerts: pack3([P(1, 1)]), knots: [0, 1] };
    acadFitControl(kept, A);
    expect(splineCtrl(kept)).toEqual([P(1, 1)]);
    const none: SplineEntity = { ...src, controlVerts: [], knots: [] };
    acadFitControl(none, { ...A, controlVerts: [] });
    expect(splineCtrl(none)).toEqual([]);
  });
});
