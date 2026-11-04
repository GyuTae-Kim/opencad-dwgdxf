/**
 * 77차: 편집 하나를 모으는 동안 치수 스타일 값을 스타일마다 한 번만 푸는 캐시(withDimVarsCache)와 이어서 세는 핸들(newHandle).
 * 캐시 안에서 푼 값은 밖에서 푼 값과 같아야 하고(재지정·확장 자료·하위 스타일·옛 변수·스타일 없음), 돌려준 값은 서로 따로 고칠 수 있어야 한다.
 */
import { describe, expect, it } from 'vitest';
import type { DimensionEntity } from '../../src/core/model';
import { createAngularDimension, createLinearDimension, rawDimVars } from '../../src/edit/dim';
import { measureVars, withDimVarsCache } from '../../src/edit/dim/vars';
import { EditSession } from '../../src/edit/session';
import { ISO25, makeDoc } from './doc';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function sample() {
  const doc = makeDoc({
    'ISO-25$2': { ...ISO25, DIMTXT: 5 },
    // R14 이전 스타일: DIMUNIT·DIMFIT만 있다
    OLD: { DIMUNIT: 6, DIMFIT: 4, DIMTXT: 3 },
  });
  doc.linetypes.set('DASHED', { name: 'DASHED', handle: 'A1', flags: 0, description: '', pattern: [], length: 0 } as never);
  const lin = createLinearDimension(doc, V(0, 0), V(10, 0), V(5, 5), { style: 'ISO-25' });
  const ang = createAngularDimension(doc, V(0, 0), V(10, 0), V(0, 10), V(5, 5), { style: 'ISO-25' });
  const old = createLinearDimension(doc, V(0, 0), V(10, 0), V(5, 5), { style: 'OLD' });
  const none = { ...createLinearDimension(doc, V(0, 0), V(10, 0), V(5, 5), { style: 'ISO-25' }), dimStyle: 'NOSUCH' } as DimensionEntity;
  doc.header.set('$DIMTXT', 9);
  const over = { ...lin, overrides: { 140: 4.2, 271: 3 } } as DimensionEntity;
  const xd = { ...lin, xdata: [{ app: 'ACAD_DSTYLE_DIM_LINETYPE', items: [{ code: 1005, value: 'A1' }] }] } as DimensionEntity;
  return { doc, dims: [lin, ang, old, none, over, xd, lin, ang] };
}

describe('치수 스타일 값 캐시', () => {
  it('캐시 안에서 푼 값은 밖에서 푼 값과 같다', () => {
    const { doc, dims } = sample();
    const outside = dims.map((d) => rawDimVars(doc, d));
    const inside = withDimVarsCache(() => dims.map((d) => rawDimVars(doc, d)));
    expect(inside).toEqual(outside);
    // 하위 스타일·옛 변수·스타일 없음·재지정·확장 자료가 실제로 다른 값을 낸다(시험이 비지 않게)
    expect(outside.map((r) => r.DIMTXT)).toEqual([2.5, 5, 3, 9, 4.2, 2.5, 2.5, 5]);
    expect([outside[2]!.DIMLUNIT, outside[2]!.DIMATFIT, outside[4]!.DIMDEC, outside[5]!.DIMLTYPE]).toEqual([4, 3, 3, 'DASHED']);
  });

  it('같은 스타일의 두 치수에 돌려준 값은 따로 고칠 수 있고, 구간이 끝나면 캐시를 버린다', () => {
    const { doc, dims } = sample();
    const lin = dims[0]!;
    withDimVarsCache(() => {
      const a = measureVars(doc, lin);
      a.DIMTXT = 99;
      expect(rawDimVars(doc, lin).DIMTXT).toBe(2.5);
      // 안에서 다시 부르면(겹친 구간) 같은 캐시를 쓴다
      expect(withDimVarsCache(() => rawDimVars(doc, lin).DIMTXT)).toBe(2.5);
    });
    doc.dimStyles.get('ISO-25')!.vars.DIMTXT = 7;
    expect(rawDimVars(doc, lin).DIMTXT).toBe(7);
    expect(withDimVarsCache(() => rawDimVars(doc, lin).DIMTXT)).toBe(7);
  });
});

describe('newHandle', () => {
  it('머리말의 다음 값부터 이어서 세고, 머리말이 밖에서 바뀌거나 쓰인 핸들과 겹치면 다시 푼다', () => {
    const { doc } = sample();
    doc.header.set('$HANDSEED', '1F0');
    const s = new EditSession(doc, () => undefined);
    expect([s.newHandle(), s.newHandle(), doc.header.get('$HANDSEED')]).toEqual(['1F0', '1F1', '1F2']);
    // 밖에서 머리말을 바꾸면 그 값부터
    doc.header.set('$HANDSEED', '2000');
    expect(s.newHandle()).toBe('2000');
    // 다음 핸들이 이미 쓰였으면 가장 큰 핸들 다음으로
    doc.entityIndex.set('2001', { type: 'POINT', handle: '2001' } as never);
    doc.entityIndex.set('3000', { type: 'POINT', handle: '3000' } as never);
    expect([s.newHandle(), doc.header.get('$HANDSEED')]).toEqual(['3001', '3002']);
    expect(s.newHandle()).toBe('3002');
  });
});
