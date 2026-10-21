/**
 * AutoCAD 그리기 방법:
 * - ARC 11가지(3점, 시작-중심-끝·각도·길이, 시작-끝-각도·방향·반지름·중심, 중심-시작-끝·각도·길이, 이어 그리기)와 리본 매크로
 * - CIRCLE 리본 인자(3P·2P·T)와 접선, 접선, 접선(TTT)
 * - FILLET·CHAMFER: Shift를 누른 채 두 번째 객체를 고르면 반지름(거리) 0
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CircleEntity, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { circleTTT } from '../../src/edit/geom/drawgeom';
import { entityPath } from '../../src/edit/geom/path';
import { circle as circle0, line as line0 } from '../edit/make';
import { makeHarness } from '../cmds2/harness';
import { perCommandGroups } from './groups';

function harness() {
  const h = perCommandGroups(makeHarness());
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const last = <T extends Entity>(h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.at(-1) as T;
const D = Math.PI / 180;
const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** ARC 객체가 중심·반지름·반시계 시작각·끝각(도)과 같은가 */
function expectArc(e: ArcEntity, cx: number, cy: number, r: number, a0: number, a1: number) {
  expect(e.type).toBe('ARC');
  expect(e.center.x).toBeCloseTo(cx, 6);
  expect(e.center.y).toBeCloseTo(cy, 6);
  expect(e.radius).toBeCloseTo(r, 6);
  expect(norm(e.startAngle)).toBeCloseTo(norm(a0 * D), 6);
  expect(norm(e.endAngle)).toBeCloseTo(norm(a1 * D), 6);
}

describe('ARC 방법', () => {
  const cases: [string, string[], [number, number, number, number, number]][] = [
    ['3점', ['10,0', `${10 * Math.SQRT1_2},${10 * Math.SQRT1_2}`, '0,10'], [0, 0, 10, 0, 90]],
    ['3점(시계 차례)', ['0,10', `${10 * Math.SQRT1_2},${10 * Math.SQRT1_2}`, '10,0'], [0, 0, 10, 0, 90]],
    ['시작, 중심, 끝', ['10,0', 'C', '0,0', '0,10'], [0, 0, 10, 0, 90]],
    ['시작, 중심, 각도', ['10,0', 'C', '0,0', 'A', '90'], [0, 0, 10, 0, 90]],
    ['시작, 중심, 각도(음수 = 시계)', ['10,0', 'C', '0,0', 'A', '-90'], [0, 0, 10, -90, 0]],
    ['시작, 중심, 길이', ['10,0', 'C', '0,0', 'L', String(10 * Math.SQRT2)], [0, 0, 10, 0, 90]],
    ['시작, 중심, 길이(음수 = 큰 호)', ['10,0', 'C', '0,0', 'L', String(-10 * Math.SQRT2)], [0, 0, 10, 0, 270]],
    ['시작, 끝, 각도', ['10,0', 'E', '0,10', 'A', '90'], [0, 0, 10, 0, 90]],
    ['시작, 끝, 각도(음수 = 시계)', ['10,0', 'E', '0,10', 'A', '-90'], [10, 10, 10, 180, 270]],
    ['시작, 끝, 방향', ['10,0', 'E', '0,10', 'D', '90'], [0, 0, 10, 0, 90]],
    ['시작, 끝, 반지름', ['10,0', 'E', '0,10', 'R', '10'], [0, 0, 10, 0, 90]],
    ['시작, 끝, 반지름(음수 = 큰 호)', ['10,0', 'E', '0,10', 'R', '-10'], [10, 10, 10, 270, 180]],
    ['시작, 끝, 중심', ['10,0', 'E', '0,10', '0,0'], [0, 0, 10, 0, 90]],
    ['중심, 시작, 끝', ['C', '0,0', '10,0', '0,10'], [0, 0, 10, 0, 90]],
    ['중심, 시작, 각도', ['C', '0,0', '10,0', 'A', '90'], [0, 0, 10, 0, 90]],
    ['중심, 시작, 길이', ['C', '0,0', '10,0', 'L', String(10 * Math.SQRT2)], [0, 0, 10, 0, 90]],
  ];
  for (const [name, inputs, [cx, cy, r, a0, a1]] of cases) {
    it(name, async () => {
      const h = harness();
      await h.run('ARC', inputs);
      expectArc(last<ArcEntity>(h), cx, cy, r, a0, a1);
    });
  }

  it('시작, 끝, 방향의 방향 프롬프트가 키워드를 받는다(전에는 프롬프트에만 보였다)', async () => {
    const h = harness();
    await h.run('ARC', ['0,0', 'E', '10,0', 'D', '90']);
    // 위쪽으로 출발해 (10,0)에 닿는 호: 중심 (5,0), 반지름 5, 시계 방향 → 반시계 0°~180°
    expectArc(last<ArcEntity>(h), 5, 0, 5, 0, 180);
    expect(h.prompts.some((p) => p.includes('접선 방향'))).toBe(true);
  });

  it('Ctrl을 누른 채 끝점을 찍으면 방향이 바뀐다', async () => {
    const h = harness();
    await h.run('ARC', ['10,0', 'C', '0,0', { click: [0, 10], ctrl: true }]);
    // 시계 방향 270°: 반시계로는 90° → 360°
    expectArc(last<ArcEntity>(h), 0, 0, 10, 90, 0);
  });

  it('첫 프롬프트 Enter는 마지막 선의 끝에서 접하게 이어 그린다(호 다음 호도)', async () => {
    const h = harness();
    await h.run('LINE', ['0,0', '10,0', '']);
    await h.run('ARC', ['', '20,10']);
    expectArc(last<ArcEntity>(h), 10, 10, 10, -90, 0);
    await h.run('ARC', ['', '10,20']);
    expectArc(last<ArcEntity>(h), 10, 10, 10, 0, 90);
  });

  it('그린 것이 없으면 이어 그리기를 알리고 끝낸다', async () => {
    const h = harness();
    await h.run('ARC', ['']);
    expect(h.printed.some((t) => t.includes('이어 그릴 선이나 호가 없습니다'))).toBe(true);
  });

  it('리본 매크로: 시작점, 중심점, 각도 = ARC \\ C \\ A', async () => {
    const h = harness();
    await h.run('ARC', ['10,0', '0,0', '90'], '\\ C \\ A');
    expectArc(last<ArcEntity>(h), 0, 0, 10, 0, 90);
  });

  it('리본 매크로: 연속 = ARC ;', async () => {
    const h = harness();
    await h.run('LINE', ['0,0', '10,0', '']);
    await h.run('ARC', ['20,10'], ';');
    expectArc(last<ArcEntity>(h), 10, 10, 10, -90, 0);
  });
});

describe('CIRCLE 리본 인자와 접선, 접선, 접선', () => {
  it('CIRCLE 3P(리본 3점)는 바로 세 점을 묻는다(전에는 인자를 버리고 중심을 물었다)', async () => {
    const h = harness();
    await h.run('CIRCLE', ['0,0', '10,0', '5,5'], '3P');
    const c = last<CircleEntity>(h);
    expect(c.center.x).toBeCloseTo(5, 9);
    expect(c.center.y).toBeCloseTo(0, 9);
    expect(c.radius).toBeCloseTo(5, 9);
  });

  it('세 선(삼각형)에 접하는 원: 고른 점에 가까운 내접원', async () => {
    const h = harness();
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(0, 0, 0, 10));
    const c = h.add(line0(10, 0, 0, 10));
    await h.run(
      'CIRCLE',
      [
        { pick: a.handle, at: [3, 0] },
        { pick: b.handle, at: [0, 3] },
        { pick: c.handle, at: [5, 5] },
      ],
      'TTT',
    );
    const k = last<CircleEntity>(h);
    const r = (20 - 10 * Math.SQRT2) / 2;
    expect(k.radius).toBeCloseTo(r, 9);
    expect(k.center.x).toBeCloseTo(r, 9);
    expect(k.center.y).toBeCloseTo(r, 9);
  });

  it('두 선과 원에 접하는 원', async () => {
    const h = harness();
    const a = h.add(line0(-5, 0, 20, 0));
    const b = h.add(line0(0, -5, 0, 20));
    const c = h.add(circle0(10, 10, 3));
    await h.run(
      'CIRCLE',
      [
        { pick: a.handle, at: [4, 0] },
        { pick: b.handle, at: [0, 4] },
        { pick: c.handle, at: [10 - 2.1, 10 - 2.1] },
      ],
      'TTT',
    );
    const k = last<CircleEntity>(h);
    const t = (10 * Math.SQRT2 - 3) / (1 + Math.SQRT2);
    expect(k.radius).toBeCloseTo(t, 9);
    expect(k.center.x).toBeCloseTo(t, 9);
    expect(Math.hypot(k.center.x - 10, k.center.y - 10)).toBeCloseTo(t + 3, 9);
  });

  it('세 원에 바깥으로 접하는 원(아폴로니우스)', () => {
    const cs = [
      [0, 0],
      [10, 0],
      [5, 8],
    ] as const;
    const picks = cs.map(([x, y]) => {
      const p = entityPath(circle0(x, y, 1))!.pieces[0]!;
      const d = Math.hypot(5 - x, 3 - y);
      return { piece: p, pick: { x: x + ((5 - x) / d) * 1, y: y + ((3 - y) / d) * 1 } };
    });
    const k = circleTTT(picks)!;
    expect(k).not.toBeNull();
    for (const [x, y] of cs) expect(Math.hypot(k.c.x - x, k.c.y - y)).toBeCloseTo(k.r + 1, 9);
  });

  it('평행한 세 선처럼 접하는 원이 없으면 알린다', async () => {
    const h = harness();
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(0, 2, 10, 2));
    const c = h.add(line0(0, 4, 10, 4));
    await h.run(
      'CIRCLE',
      [
        { pick: a.handle, at: [5, 0] },
        { pick: b.handle, at: [5, 2] },
        { pick: c.handle, at: [5, 4] },
      ],
      'TTT',
    );
    expect(h.printed).toContain('원이 존재하지 않습니다.');
  });
});

describe('FILLET·CHAMFER Shift로 구석', () => {
  it('Shift를 누른 채 두 번째 선을 고르면 반지름 0으로 잇는다(호 없음)', async () => {
    const h = harness();
    h.doc.header.set('$FILLETRAD', 2);
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(12, 2, 12, 10));
    await h.run('FILLET', [
      { pick: a.handle, at: [5, 0] },
      { pick: b.handle, at: [12, 5], shift: true },
    ]);
    const ents = h.doc.blocks.get(MODEL_SPACE)!.entities;
    expect(ents.some((e) => e.type === 'ARC')).toBe(false);
    const l1 = h.doc.entityIndex.get(a.handle) as LineEntity;
    const l2 = h.doc.entityIndex.get(b.handle) as LineEntity;
    expect([l1.end.x, l1.end.y]).toEqual([12, 0]);
    expect([l2.start.x, l2.start.y]).toEqual([12, 0]);
    // 반지름 설정은 그대로
    expect(h.doc.header.get('$FILLETRAD')).toBe(2);
    expect(h.prompts.some((p) => p.includes('Shift 키를 누른 채 선택하여 구석 적용'))).toBe(true);
  });

  it('Shift 없이 고르면 반지름대로 호를 넣는다', async () => {
    const h = harness();
    h.doc.header.set('$FILLETRAD', 2);
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(12, 2, 12, 10));
    await h.run('FILLET', [
      { pick: a.handle, at: [5, 0] },
      { pick: b.handle, at: [12, 5] },
    ]);
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'ARC').length).toBe(1);
  });

  it('CHAMFER도 Shift면 거리 0', async () => {
    const h = harness();
    h.doc.header.set('$CHAMFERA', 2);
    h.doc.header.set('$CHAMFERB', 2);
    const a = h.add(line0(0, 0, 10, 0));
    const b = h.add(line0(12, 2, 12, 10));
    await h.run('CHAMFER', [
      { pick: a.handle, at: [5, 0] },
      { pick: b.handle, at: [12, 5], shift: true },
    ]);
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'LINE').length).toBe(2);
    expect([(h.doc.entityIndex.get(a.handle) as LineEntity).end.x]).toEqual([12]);
  });
});
