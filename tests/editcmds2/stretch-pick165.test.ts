/**
 * 165차: STRETCH로 하나씩 찍어 고른 객체는 늘이지 않고 옮긴다(Autodesk STRETCH 도움말 — 걸침 창에 일부만 든 객체는 늘이고,
 * 창 안에 다 든 객체나 하나씩 고른 객체는 늘이지 않고 옮긴다). 전에는 찍어 고른 객체도 마지막 걸침 영역으로 늘였고(영역 밖이면 그대로),
 * 찍기만 하면 신축을 거부했다. 겹쳐 고른 객체는 처음 고른 방식을 따른다(선택 세트는 중복을 버린다).
 */
import { describe, expect, it } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerModifyCommands } from '../../src/app/modify';
import { stretch } from '../../src/edit/geom/stretch';
import { makeHarness } from '../cmds2/harness';

const ln = (x0: number, y0: number, x1: number, y1: number): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } });

/** 명령 하네스에 걸침·윈도우 고르기를 붙인다(선의 끝점으로 판단 — appid-stretch.test.ts와 같다) */
function harness() {
  const h = makeHarness();
  registerModifyCommands(h.app);
  const pk = h.app.picker() as unknown as Record<string, unknown>;
  const ends = (e: Entity) => (e.type === 'LINE' ? [e.start, e.end] : []);
  pk.select = (r: [number, number, number, number], crossing: boolean) =>
    h.doc.blocks
      .get(MODEL_SPACE)!
      .entities.filter((e) => {
        const ps = ends(e);
        const inR = (p: { x: number; y: number }) => p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3];
        return ps.length && (crossing ? ps.some(inR) : ps.every(inR));
      })
      .map((e) => e.handle);
  pk.selectPolygon = () => [];
  pk.selectFence = () => [];
  return h;
}

const xs = (h: ReturnType<typeof harness>, handle: string) => {
  const l = h.doc.entityIndex.get(handle) as LineEntity;
  return [l.start.x, l.start.y, l.end.x, l.end.y];
};

describe('STRETCH로 하나씩 고른 객체(165차)', () => {
  it('걸침 창으로 고른 선은 늘이고, 영역 밖에서 찍어 고른 선은 옮긴다 — 명령 취소 한 번으로 돌아온다', async () => {
    const h = harness();
    const a = h.add(ln(0, 0, 10, 0));
    const b = h.add(ln(0, 10, 10, 10));
    // 오른쪽 끝(10,0)만 덮는 걸침 창 → a, 그다음 b를 찍는다
    await h.run('STRETCH', ['8,-1', '12,1', '5,10', '', '0,0', '5,0']);
    expect(xs(h, a.handle)).toEqual([0, 0, 15, 0]);
    // 전에는 b의 정의점이 영역 밖이라 그대로였다(0,10 → 10,10)
    expect(xs(h, b.handle)).toEqual([5, 10, 15, 10]);
    expect(h.printed.at(-1)).toBe('객체 2개를 신축했습니다.');
    h.st.session.undo();
    expect(xs(h, a.handle)).toEqual([0, 0, 10, 0]);
    expect(xs(h, b.handle)).toEqual([0, 10, 10, 10]);
  });

  it('먼저 찍어 고른 선은 뒤의 걸침 창에 일부가 들어도 옮긴다(중복은 처음 고른 방식)', async () => {
    const h = harness();
    const a = h.add(ln(0, 0, 10, 0));
    const c = h.add(ln(0, -5, 10, -5));
    // a를 찍고, a·c의 오른쪽 끝을 덮는 걸침 창
    await h.run('STRETCH', ['5,0', '8,-6', '12,1', '', '0,0', '5,0']);
    expect(h.printed).toContain('2개를 찾음 (1개 중복)');
    // 전에는 a도 늘였다(0,0 → 15,0)
    expect(xs(h, a.handle)).toEqual([5, 0, 15, 0]);
    expect(xs(h, c.handle)).toEqual([0, -5, 15, -5]);
  });

  it('걸침 창으로 먼저 고른 선은 다시 찍어도 늘인다(전후 같음)', async () => {
    const h = harness();
    const a = h.add(ln(0, 0, 10, 0));
    await h.run('STRETCH', ['8,-1', '12,1', '5,0', '', '0,0', '5,0']);
    expect(h.printed).toContain('1개를 찾음 (1개 중복)');
    expect(xs(h, a.handle)).toEqual([0, 0, 15, 0]);
  });

  it('찍기만 해도 고른 객체를 옮긴다(전에는 신축을 거부했다)', async () => {
    const h = harness();
    const a = h.add(ln(0, 0, 10, 0));
    const b = h.add(ln(0, 10, 10, 10));
    await h.run('STRETCH', ['5,0', '5,10', '', '0,0', '3,4']);
    expect(xs(h, a.handle)).toEqual([3, 4, 13, 4]);
    expect(xs(h, b.handle)).toEqual([3, 14, 13, 14]);
    expect(h.printed.some((t) => t.includes('걸침 윈도우 또는 걸침 폴리곤으로 객체를 선택해야'))).toBe(false);
    expect(h.printed.at(-1)).toBe('객체 2개를 신축했습니다.');
  });

  it('stretch(): picked의 객체는 영역과 관계없이 통째로 옮기고, 영역이 없으면 그것만 옮긴다', () => {
    const h = harness();
    const a = h.add(ln(0, 0, 10, 0));
    const b = h.add(ln(0, 10, 10, 10));
    const rect = [
      { x: 8, y: -1 },
      { x: 12, y: -1 },
      { x: 12, y: 11 },
      { x: 8, y: 11 },
    ];
    const r = stretch([a, b], rect, { x: 5, y: 0 }, h.doc, { picked: new Set([b.handle]) });
    const out = new Map((r.replace ?? []).map((e) => [e.handle, e as LineEntity]));
    expect([out.get(a.handle)!.start.x, out.get(a.handle)!.end.x]).toEqual([0, 15]);
    expect([out.get(b.handle)!.start.x, out.get(b.handle)!.end.x]).toEqual([5, 15]);
    const only = stretch([a, b], [], { x: 0, y: 2 }, h.doc, { picked: new Set([a.handle]) });
    expect((only.replace ?? []).map((e) => e.handle)).toEqual([a.handle]);
    expect((only.replace![0] as LineEntity).start.y).toBe(2);
  });
});
