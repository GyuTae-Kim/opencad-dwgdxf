/**
 * 164차: MATCHPROP의 폴리선 칸(Autodesk 특성 설정 대화 상자 "Property Settings Dialog Box" — 폴리선: 폭과 선종류 생성을
 * 대상 폴리선에 옮기고, 원본이 폭이 바뀌는 폴리선이면 폭은 옮기지 않는다. 맞춤·고도는 옮기지 않는다).
 * 전에는 원본의 전역 폭 칸(폭이 바뀌는 폴리선은 0)으로 대상의 정점 폭을 모두 덮어 대상 폭이 지워졌고, 선종류 생성은 옮기지 않았다.
 */
import { describe, expect, it } from 'vitest';
import { entityDefaults, type Entity, type LwPolylineEntity } from '../../src/core/model';
import { packLw } from '../../src/core/lwpoly';
import { lwVerts } from '../../src/edit/geom/path';
import { MATCH_SETTINGS, registerEditCommands, setMatchSettings } from '../../src/app/editcmds';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

/** [x, y, 시작 폭, 끝 폭] */
type V = [number, number, number?, number?];

function pline(vs: V[], o: Partial<LwPolylineEntity> = {}): Entity {
  const packed = packLw(vs.map(([x, y, sw = 0, ew = 0]) => ({ x, y, bulge: 0, startWidth: sw, endWidth: ew })));
  return { ...entityDefaults(), type: 'LWPOLYLINE', ...packed, closed: false, plinegen: false, constantWidth: 0, elevation: 0, ...o } as Entity;
}

function harness(on: string[] = MATCH_SETTINGS.map((m) => m.key)) {
  const h = perCommandGroups(makeHarness());
  registerEditCommands(h.app);
  setMatchSettings(new Set(on));
  const get = (x: string) => h.doc.entityIndex.get(x) as LwPolylineEntity;
  /** 그리는 세그먼트의 [시작 폭, 끝 폭](정점 폭이 0이면 전역 폭 — 그리기·경로와 같은 셈, 열린 폴리선의 끝 정점은 빼고) */
  const seg = (x: string) => {
    const e = get(x);
    const v = lwVerts(e);
    return v.slice(0, e.closed ? v.length : v.length - 1).map((p) => [p.sw, p.ew]);
  };
  const match = (from: string, to: string[]) => runWith(h, 'MATCHPROP', [{ pick: from, at: [0, 0] }, { sel: to }, '']);
  return { h, get, seg, match };
}

describe('MATCHPROP 폴리선 칸(164차)', () => {
  it('폭이 바뀌는 원본은 폭을 옮기지 않는다 — 대상의 전역 폭·정점 폭이 남고, 선종류 생성과 색은 옮긴다(명령 취소 한 번)', async () => {
    const { h, get, seg, match } = harness();
    const src = h.add(pline([[0, 0, 0, 2], [10, 0, 2, 0], [20, 0]], { plinegen: true, color: { aci: 1 } })).handle;
    const a = h.add(pline([[0, 10], [10, 10], [20, 10]], { constantWidth: 1.5 })).handle;
    const b = h.add(pline([[0, 20, 1, 3], [10, 20, 3, 1], [20, 20]])).handle;
    await match(src, [a, b]);
    expect([get(a).constantWidth, seg(a)]).toEqual([1.5, [[1.5, 1.5], [1.5, 1.5]]]);
    expect(seg(b)).toEqual([[1, 3], [3, 1]]);
    expect([get(a).plinegen, get(b).plinegen, get(a).color, get(b).color]).toEqual([true, true, { aci: 1 }, { aci: 1 }]);
    h.st.session.undo();
    expect([get(a).plinegen, get(b).plinegen, get(a).color.aci, seg(a), seg(b)]).toEqual([false, false, 256, [[1.5, 1.5], [1.5, 1.5]], [[1, 3], [3, 1]]]);
  });

  it('폭이 하나인 원본(전역 폭)은 폭과 선종류 생성을 옮긴다 — 정점 폭이 다른 대상도 그 폭 하나가 되고, 고도는 옮기지 않는다', async () => {
    const { h, get, seg, match } = harness();
    const src = h.add(pline([[0, 0], [10, 0], [20, 0]], { constantWidth: 3, plinegen: false, elevation: 5 })).handle;
    const a = h.add(pline([[0, 10, 1, 3], [10, 10, 3, 1], [20, 10]], { plinegen: true })).handle;
    await match(src, [a]);
    expect([get(a).constantWidth, seg(a), get(a).plinegen, get(a).elevation]).toEqual([3, [[3, 3], [3, 3]], false, 0]);
  });

  it('정점 폭이 모두 같은 원본(DXF 40·41로 읽은 꼴 — 전역 폭 칸 0)은 그 폭을 옮긴다(열린 폴리선 끝 정점의 폭은 그리지 않아 세지 않는다)', async () => {
    const { h, get, seg, match } = harness();
    const src = h.add(pline([[0, 0, 2, 2], [10, 0, 2, 2], [20, 0, 0, 0]])).handle;
    const a = h.add(pline([[0, 10], [10, 10], [20, 10]], { constantWidth: 1 })).handle;
    await match(src, [a]);
    expect([get(a).constantWidth, seg(a)]).toEqual([2, [[2, 2], [2, 2]]]);
  });

  it('폭이 없는 원본은 폭 0을 옮긴다(폭이 하나인 폴리선 — 전후 같음)', async () => {
    const { h, get, seg, match } = harness();
    const src = h.add(pline([[0, 0], [10, 0], [20, 0]])).handle;
    const a = h.add(pline([[0, 10], [10, 10], [20, 10]], { constantWidth: 2 })).handle;
    await match(src, [a]);
    expect([get(a).constantWidth, get(a).widths, seg(a)]).toEqual([0, undefined, [[0, 0], [0, 0]]]);
  });

  it('폴리선 설정을 끄면 폭·선종류 생성을 옮기지 않는다(색은 옮긴다 — 전후 같음)', async () => {
    const { h, get, seg, match } = harness(MATCH_SETTINGS.map((m) => m.key).filter((k) => k !== 'polyline'));
    const src = h.add(pline([[0, 0], [10, 0], [20, 0]], { constantWidth: 3, plinegen: true, color: { aci: 5 } })).handle;
    const a = h.add(pline([[0, 10, 1, 3], [10, 10, 3, 1], [20, 10]])).handle;
    await match(src, [a]);
    expect([seg(a), get(a).plinegen, get(a).color]).toEqual([[[1, 3], [3, 1]], false, { aci: 5 }]);
  });
});
