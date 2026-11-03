/**
 * 66차: 연관 해치·연관 치수가 많은 도면의 큰 선택(47차에 남긴 일).
 * 연관 치수 1만 개·연관 해치 1만 개·경계 1만 개를 모두 골라 옮기면(배포 빌드) 4초였고, 그 가운데 약 0.5초는
 * 연관을 따라가며 같은 편집의 객체 변경 목록(사전·DIMASSOC)을 키마다 처음부터 훑는 일(치수 수의 제곱)이었다.
 */
import { describe, expect, it } from 'vitest';
import type { DimensionEntity, Entity, LineEntity } from '../../src/core/model';
import { createLinearDimension } from '../../src/edit/dim';
import { OSNAP, snapRef } from '../../src/edit/dim/assoc';
import { P, bench, line } from '../dimassoc/helpers';

describe('연관 치수를 함께 옮기기', () => {
  it('같은 편집의 객체 변경 목록을 키마다 훑지 않고 치수가 모두 따라간다', () => {
    const b = bench();
    const n = 300;
    const dims: DimensionEntity[] = [];
    const lines: LineEntity[] = [];
    for (let i = 0; i < n; i++) {
      const l = b.add(line(P(0, i * 10), P(100, i * 10))) as LineEntity;
      const d0 = createLinearDimension(b.doc, P(0, i * 10), P(100, i * 10), P(50, i * 10 + 5), { rotation: 0 });
      dims.push(b.addDim(d0, [snapRef(b.doc, l, OSNAP.END, { x: 0, y: i * 10 }, 1e-6), snapRef(b.doc, l, OSNAP.END, { x: 100, y: i * 10 }, 1e-6)]));
      lines.push(l);
    }
    // 선마다 오른쪽 끝을 20 늘인다: 치수가 모두 따라가야 한다
    const changes = new Map<string, Entity | null>(lines.map((l) => [l.handle, { ...l, end: { ...l.end, x: 120 } } as Entity]));
    let scans = 0;
    const isChanges = (a: unknown[]) => a.length > 20 && typeof a[0] === 'object' && a[0] !== null && 'key' in a[0] && 'before' in a[0] && 'after' in a[0];
    const own = { findIndex: Array.prototype.findIndex, find: Array.prototype.find };
    Array.prototype.findIndex = function (this: unknown[], ...a: Parameters<unknown[]['findIndex']>) {
      if (isChanges(this)) scans++;
      return own.findIndex.apply(this, a);
    };
    Array.prototype.find = function (this: unknown[], ...a: Parameters<unknown[]['find']>) {
      if (isChanges(this)) scans++;
      return own.find.apply(this, a) as never;
    } as typeof Array.prototype.find;
    try {
      b.edit(changes);
    } finally {
      Array.prototype.findIndex = own.findIndex;
      Array.prototype.find = own.find;
    }
    expect(scans).toBe(0);
    for (const d of dims) expect(b.dim(d.handle).defPoint2.x === 120 || b.dim(d.handle).defPoint3.x === 120).toBe(true);
  });
});
