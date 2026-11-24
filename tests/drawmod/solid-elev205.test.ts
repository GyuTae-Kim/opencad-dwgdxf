/**
 * 205차: SOLID(2D 솔리드)가 현재 고도(ELEVATION)를 쓰는지.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰이며, 두께는 2D 객체를 그 고도에서 위아래로 돌출한다.
 * 전에는 SOLID가 점 Z를 늘 0으로 써서, 두께(THICKNESS)는 받으면서 바닥은 고도가 아닌 0에 있었다
 * (같은 앱의 LINE·PLINE·ARC·TRACE·3DFACE는 고도를 쓴다 — tests/drawmod/more 「ELEVATION은 Z」).
 * 고도가 0인 도면, 프롬프트 흐름(넷째 점 Enter = 삼각형, 셋째·넷째 이어 주기)은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { FaceEntity } from '../../src/core/model';
import { registerPropCommands } from '../../src/app/propcmds';
import { makeHarness, modelEntities } from '../cmds2/harness';

function harness() {
  const h = makeHarness();
  registerPropCommands(h.app);
  return h;
}

const solids = (h: ReturnType<typeof harness>) => modelEntities(h.doc, 'SOLID') as FaceEntity[];
const pts = (e: FaceEntity) => e.points.map((p) => [p.x, p.y, p.z]);

describe('SOLID의 현재 고도(205차)', () => {
  it('고도 5·두께 2: 네 점 모두 Z = 5, 두께 2(전에는 Z = 0)', async () => {
    const h = harness();
    h.doc.header.set('$ELEVATION', 5);
    h.doc.header.set('$THICKNESS', 2);
    await h.run('SOLID', ['0,0', '10,0', '0,10', '10,10', '']);
    const [s] = solids(h);
    expect(solids(h).length).toBe(1);
    expect(pts(s!)).toEqual([
      [0, 0, 5],
      [10, 0, 5],
      [0, 10, 5],
      [10, 10, 5],
    ]);
    expect(s!.thickness).toBe(2);
  });

  it('넷째 점 Enter(삼각형)와 이어 준 조각도 고도 위에', async () => {
    const h = harness();
    h.doc.header.set('$ELEVATION', -1.5);
    await h.run('SOLID', ['0,0', '10,0', '0,10', '10,10', '0,20', '']);
    const list = solids(h);
    expect(list.length).toBe(2);
    expect(pts(list[0]!)).toEqual([
      [0, 0, -1.5],
      [10, 0, -1.5],
      [0, 10, -1.5],
      [10, 10, -1.5],
    ]);
    // 둘째 조각: 앞 조각의 셋째·넷째 점에서 이어 셋째 점까지, 넷째 Enter라 넷째 = 셋째
    expect(pts(list[1]!)).toEqual([
      [0, 10, -1.5],
      [10, 10, -1.5],
      [0, 20, -1.5],
      [0, 20, -1.5],
    ]);
    // 명령 취소 한 번이면 둘 다 없다
    h.st.session.undo();
    expect(solids(h).length).toBe(0);
  });

  it('전과 같은 값: 고도가 없는 도면은 Z = 0, 셋째 점 Enter는 아무것도 만들지 않음', async () => {
    const h = harness();
    await h.run('SOLID', ['0,0', '10,0', '0,10', '']);
    const [s] = solids(h);
    expect(pts(s!)).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 10, 0],
    ]);
    expect(s!.thickness ?? 0).toBe(0);
    const h2 = harness();
    h2.doc.header.set('$ELEVATION', 3);
    await h2.run('SOLID', ['0,0', '10,0', '']);
    expect(solids(h2).length).toBe(0);
  });
});
