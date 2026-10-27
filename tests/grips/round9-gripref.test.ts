/** 9차 그립: 회전·축척의 참조(R), 다기능 그립의 Ctrl 순환(GRIPMULTIFUNCTIONAL 비트 1) */
import { afterEach, describe, expect, it } from 'vitest';
import type { LineEntity, LwPolylineEntity } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerModifyCommands } from '../../src/app/modify';
import { registerGripMenu, setCtrlHeld } from '../../src/app/gripmenu';
import { BROWSER_VARS, setBrowserSysvar } from '../../src/app/sysvars';
import { prefSet } from '../../src/app/mgr-ui';
import { line, lw } from '../edit/make';
import { type Harness, makeHarness } from '../cmds2/harness';

afterEach(() => {
  setCtrlHeld(false);
  for (const v of BROWSER_VARS) prefSet(`opencad.sysvar.${v.name}`, null);
});

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });

function grips(): Harness {
  const h = makeHarness();
  registerModifyCommands(h.app);
  registerGripMenu(h.app);
  return h;
}

function hot(h: Harness, handle: string, id: string, at: Pt): void {
  h.st.selection.add(handle);
  (h.app as unknown as { hotGrip: unknown }).hotGrip = { point: at, items: [{ handle, id, point: at }] };
}

const ln = (h: Harness, handle: string) => h.doc.entityIndex.get(handle) as LineEntity;

describe('그립 회전·축척의 참조(R)', () => {
  it('회전: 참조 각도(숫자)와 새 각도로 그 차이만큼', async () => {
    const h = grips();
    const l = h.add(line(0, 0, 10, 0));
    hot(h, l.handle, 'start', P(0, 0));
    await h.run('GRIPEDIT', ['RO', 'R', '30', '90']);
    const e = ln(h, l.handle);
    expect(e.end.x).toBeCloseTo(10 * Math.cos(Math.PI / 3), 9);
    expect(e.end.y).toBeCloseTo(10 * Math.sin(Math.PI / 3), 9);
    expect(h.prompts).toContain('회전 각도 지정 또는 [기준점(B)/복사(C)/명령 취소(U)/참조(R)/종료(X)]:');
    expect(h.prompts).toContain('새 각도 지정 또는 [기준점(B)/복사(C)/명령 취소(U)/참조(R)/종료(X)]:');
  });

  it('회전: 참조 각도를 두 점으로, 새 각도를 점으로', async () => {
    const h = grips();
    const l = h.add(line(0, 0, 10, 0));
    hot(h, l.handle, 'start', P(0, 0));
    await h.run('GRIPEDIT', ['RO', 'R', '0,0', '10,10', { click: [0, 10] }]);
    const e = ln(h, l.handle);
    expect(e.end.x).toBeCloseTo(10 * Math.SQRT1_2, 9);
    expect(e.end.y).toBeCloseTo(10 * Math.SQRT1_2, 9);
  });

  it('축척: 참조 길이와 새 길이(숫자·기준점에서 잰 점)', async () => {
    const h = grips();
    const l = h.add(line(0, 0, 10, 0));
    hot(h, l.handle, 'start', P(0, 0));
    await h.run('GRIPEDIT', ['SC', 'R', '10', '5']);
    expect(ln(h, l.handle).end.x).toBeCloseTo(5, 9);
    hot(h, l.handle, 'start', P(0, 0));
    await h.run('GRIPEDIT', ['SC', 'R', '4', { click: [0, 8] }]);
    expect(ln(h, l.handle).end.x).toBeCloseTo(10, 9);
    expect(h.prompts).toContain('새 길이 지정 또는 [기준점(B)/복사(C)/명령 취소(U)/참조(R)/종료(X)]:');
  });

  it('모드를 바꾸면 참조는 지운다', async () => {
    const h = grips();
    const l = h.add(line(0, 0, 10, 0));
    hot(h, l.handle, 'start', P(0, 0));
    await h.run('GRIPEDIT', ['RO', 'R', '30', 'SC', 'RO', '90']);
    const e = ln(h, l.handle);
    expect(e.end.x).toBeCloseTo(0, 9);
    expect(e.end.y).toBeCloseTo(10, 9);
  });
});

describe('다기능 그립의 Ctrl 순환(GRIPMULTIFUNCTIONAL)', () => {
  const vcount = (h: Harness, handle: string) => lwVertices(h.doc.entityIndex.get(handle) as LwPolylineEntity).length;

  it('Ctrl을 한 번 누를 때마다 신축 → 정점 추가 → 정점 제거 → 신축', async () => {
    const h = grips();
    const pl = h.add(lw([[0, 0], [10, 0], [10, 10]]));
    hot(h, pl.handle, 'v1', P(10, 0));
    await h.run('GRIPEDIT', [{ ctrlTap: true }, { click: [15, 5] }]);
    expect(h.printed).toContain('** 정점 추가 **');
    expect(h.prompts).toContain('새 정점 지정:');
    expect(vcount(h, pl.handle)).toBe(4);
    hot(h, pl.handle, 'v1', P(10, 0));
    await h.run('GRIPEDIT', [{ ctrlTap: true }, { ctrlTap: true }, { click: [3, 3] }]);
    expect(h.printed).toContain('** 정점 제거 **');
    expect(h.prompts).toContain('적용하려면 점 지정:');
    expect(vcount(h, pl.handle)).toBe(3);
    const before = lwVertices(h.doc.entityIndex.get(pl.handle) as LwPolylineEntity)[1]!;
    hot(h, pl.handle, 'v1', P(before.x, before.y));
    await h.run('GRIPEDIT', [{ ctrlTap: true }, { ctrlTap: true }, { ctrlTap: true }, { click: [12, 1] }]);
    expect(lwVertices(h.doc.entityIndex.get(pl.handle) as LwPolylineEntity)[1]).toMatchObject({ x: 12, y: 1 });
  });

  it('옵션에서 Enter는 다음 모드(이동)', async () => {
    const h = grips();
    const l = h.add(line(0, 0, 10, 0));
    hot(h, l.handle, 'end', P(10, 0));
    await h.run('GRIPEDIT', [{ ctrlTap: true }, '', { click: [12, 3] }]);
    expect(h.printed).toContain('** 길이 조정 **');
    expect(h.printed).toContain('** 이동 **');
    expect(ln(h, l.handle).start).toMatchObject({ x: 2, y: 3 });
  });

  it('비트 1을 끄면 Ctrl 누르기를 받지 않는다', async () => {
    const h = grips();
    const pl = h.add(lw([[0, 0], [10, 0], [10, 10]]));
    expect(setBrowserSysvar('GRIPMULTIFUNCTIONAL', 2)).toBeNull();
    hot(h, pl.handle, 'v1', P(10, 0));
    await expect(h.run('GRIPEDIT', [{ ctrlTap: true }])).rejects.toThrow('Ctrl 누르기를 받지 않는');
  });
});
