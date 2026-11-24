/**
 * 203차: -LAYER 만들기(M)·설정(S)·색상(C)이 꺼진 도면층을 켠다.
 * 근거 — Autodesk -LAYER 도움말(2026): 만들기는 도면층이 있는데 꺼져 있으면 켜고, 설정은 꺼져 있으면 켜고 현재로 만들며
 * (동결 도면층은 현재로 만들 수 없다), 색상은 색을 도면층에 주고 도면층을 켠다(색 앞에 −를 붙이면 색을 주고 끈다).
 * 전에는 만들기·설정이 현재 도면층만 바꿔 꺼진 현재 도면층이 남았고(새로 그린 객체가 보이지 않음), 색상은 색만 바꿨다.
 * 만들기·설정의 켜기와 현재 도면층 바꾸기는 명령 취소 한 단계. 켜진 도면층·새 도면층·동결 도면층·− 색상은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { registerDashLayerCommand } from '../../src/app/layercmd';
import { makeHarness } from './harness';

function harness() {
  const h = makeHarness((doc: CadDocument) => {
    const l0 = doc.layers.get('0')!;
    doc.layers.set('A1', { ...l0, name: 'A1', handle: 'B1', off: true });
    doc.layers.set('A2', { ...l0, name: 'A2', handle: 'B2', off: true });
    doc.layers.set('ON1', { ...l0, name: 'ON1', handle: 'B3' });
    doc.layers.set('FZ', { ...l0, name: 'FZ', handle: 'B4', off: true, frozen: true });
  });
  registerDashLayerCommand(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const layer = (h: H, n: string) => h.doc.layers.get(tableKey(n))!;
const clayer = (h: H) => h.doc.header.get('$CLAYER');

describe('-LAYER 만들기·설정·색상이 꺼진 도면층 켜기(203차)', () => {
  it('만들기(M): 있는데 꺼진 도면층을 켜고 현재로 — 명령 취소 한 단계', async () => {
    const h = harness();
    const depth = h.st.session.depth;
    await h.run('-LAYER', ['M', 'A1', '']);
    expect(clayer(h)).toBe('A1');
    expect(layer(h, 'A1').off).toBe(false);
    expect(h.st.session.depth).toBe(depth + 1);
    h.st.session.undo();
    expect(layer(h, 'A1').off).toBe(true);
    expect(clayer(h)).toBe('0');
  });

  it('만들기(M) Enter: 꺼진 현재 도면층을 켠다', async () => {
    const h = harness();
    h.doc.layers.set('0', { ...layer(h, '0'), off: true });
    await h.run('-LAYER', ['M', '', '']);
    expect(clayer(h)).toBe('0');
    expect(layer(h, '0').off).toBe(false);
  });

  it('설정(S): 꺼진 도면층을 켜고 현재로 — 명령 취소 한 단계', async () => {
    const h = harness();
    const depth = h.st.session.depth;
    await h.run('-LAYER', ['S', 'a2', '']);
    expect(clayer(h)).toBe('A2');
    expect(layer(h, 'A2').off).toBe(false);
    expect(layer(h, 'A1').off).toBe(true);
    expect(h.st.session.depth).toBe(depth + 1);
    h.st.session.undo();
    expect(layer(h, 'A2').off).toBe(true);
    expect(clayer(h)).toBe('0');
  });

  it('색상(C): 색을 주고 꺼진 도면층을 켠다(이름 리스트·와일드카드), 앞에 −면 전처럼 색을 주고 끈다', async () => {
    const h = harness();
    await h.run('-LAYER', ['C', '1', 'A*', 'C', '-3', 'ON1', '']);
    for (const n of ['A1', 'A2']) {
      expect(layer(h, n).color).toEqual({ aci: 1 });
      expect(layer(h, n).off).toBe(false);
    }
    expect(layer(h, 'ON1').color).toEqual({ aci: 3 });
    expect(layer(h, 'ON1').off).toBe(true);
  });

  it('전과 같은 값: 켜진 도면층의 만들기·설정·색상, 새 도면층, 동결 도면층은 알림만(켜지 않음)', async () => {
    const h = harness();
    const depth = h.st.session.depth;
    await h.run('-LAYER', ['S', 'ON1', 'C', '5', 'ON1', 'M', 'NEW1', 'M', 'ON1', '']);
    expect(layer(h, 'ON1').off).toBe(false);
    expect(layer(h, 'ON1').color).toEqual({ aci: 5 });
    expect(layer(h, 'NEW1').off).toBe(false);
    expect(clayer(h)).toBe('ON1');
    // 설정·색상·만들기(새)·만들기(있는 것) = 네 단계
    expect(h.st.session.depth).toBe(depth + 4);
    await h.run('-LAYER', ['S', 'FZ', 'M', 'FZ', '']);
    expect(h.printed.filter((t) => t === '동결된 도면층 "FZ"은(는) 현재 도면층으로 만들 수 없습니다.')).toHaveLength(2);
    expect(layer(h, 'FZ').off).toBe(true);
    expect(clayer(h)).toBe('ON1');
  });
});
