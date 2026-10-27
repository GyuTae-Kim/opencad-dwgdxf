// @vitest-environment jsdom
/**
 * 2D 보기 링크(#view=): 지금 화면(가운데·보이는 크기·배치 탭)만 주소 조각에 담고, 그 주소로 열면 같은 범위를 맞춘다.
 * 파일 내용은 주소에 넣지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeViewLink, encodeViewLink, rectOf, viewFromRect, viewUrl } from '../../src/app/viewlink';
import { applyViewLink, copyViewLink, currentViewLink, installViewLinks } from '../../src/app/viewlink-app';
import type { App } from '../../src/app/app';
import type { DocState } from '../../src/app/docstate';

describe('보기 링크 부호화(순수)', () => {
  it('가운데·크기·배치 이름을 담고 그대로 풀린다', () => {
    const enc = encodeViewLink({ center: [1250.5, -30], size: [800, 600], layout: 'Layout1' });
    expect(enc).toBe('view=c:1250.5,-30;s:800,600;lay:Layout1');
    expect(decodeViewLink('#' + enc)).toEqual({ center: [1250.5, -30], size: [800, 600], layout: 'Layout1' });
    // 모형이면 배치 이름이 없다
    expect(encodeViewLink({ center: [0, 0], size: [10, 5] })).toBe('view=c:0,0;s:10,5');
    expect(decodeViewLink('view=c:0,0;s:10,5')).toEqual({ center: [0, 0], size: [10, 5] });
  });

  it('한글·기호(; , :)가 든 배치 이름도 부호화해 담는다', () => {
    const name = '1층 평면;A:B,C';
    const enc = encodeViewLink({ center: [1, 2], size: [3, 4], layout: name });
    expect(enc).not.toContain('층');
    expect(enc.split(';')).toHaveLength(3);
    expect(decodeViewLink(enc)?.layout).toBe(name);
    // 브라우저 주소의 해시로 넣었다 꺼내도 그대로
    const u = new URL('https://example.test/#' + enc);
    expect(decodeViewLink(u.hash)?.layout).toBe(name);
  });

  it('큰 좌표에서도 가운데가 어긋나지 않는다(12자리), 크기는 7자리', () => {
    const enc = encodeViewLink({ center: [532145.678912, 4100023.25], size: [0.123456789, 1234567.891] });
    const v = decodeViewLink(enc)!;
    expect(v.center[0]).toBeCloseTo(532145.678912, 6);
    expect(v.center[1]).toBe(4100023.25);
    expect(v.size).toEqual([0.1234568, 1234568]);
  });

  it('잘못된 값은 버린다(크기 0·음수, 수가 아님, 가운데 없음)', () => {
    expect(decodeViewLink('')).toBeNull();
    expect(decodeViewLink('#other=1')).toBeNull();
    expect(decodeViewLink('view=c:1,2;s:0,5')).toBeNull();
    expect(decodeViewLink('view=c:1,2;s:-1,5')).toBeNull();
    expect(decodeViewLink('view=c:x,2;s:1,5')).toBeNull();
    expect(decodeViewLink('view=s:1,5')).toBeNull();
    expect(decodeViewLink('view=c:1,2;s:3,4;lay:%E0%A4')).toEqual({ center: [1, 2], size: [3, 4] });
    expect(encodeViewLink({ center: [NaN, 0], size: [1, 1] })).toBe('');
    expect(encodeViewLink({ center: [0, 0], size: [0, 1] })).toBe('');
  });

  it('공유 주소: 시작 인자(?sample·?open=)와 다른 해시 인자는 남기고 view만 바꾼다', () => {
    const v = { center: [5, 6] as [number, number], size: [7, 8] as [number, number] };
    expect(viewUrl('https://example.test/app/?sample#view=c:0,0;s:1,1', v)).toBe('https://example.test/app/?sample#view=c:5,6;s:7,8');
    expect(viewUrl('https://example.test/app/?open=a.dxf#x=1', v)).toBe('https://example.test/app/?open=a.dxf#x=1&view=c:5,6;s:7,8');
  });

  it('보이는 사각형 ↔ 보기', () => {
    const v = viewFromRect([-10, 0, 30, 20], 'L');
    expect(v).toEqual({ center: [10, 10], size: [40, 20], layout: 'L' });
    expect(rectOf(v)).toEqual([-10, 0, 30, 20]);
  });
});

/** App·DocState 대신(이 기능이 쓰는 것만) */
function fakes(opts: { space?: string; msVp?: { layout: string; handle: string } | null; layouts?: { name: string; blockName: string }[] } = {}) {
  const layouts = opts.layouts ?? [
    { name: 'Model', blockName: '*Model_Space' },
    { name: '배치1', blockName: '*Paper_Space' },
  ];
  const st = {
    space: opts.space ?? '*MODEL_SPACE',
    msVp: opts.msVp ?? null,
    blockEdit: null,
    cameras: new Map([['*PAPER_SPACE', { cx: 100, cy: 50, scale: 2 }]]),
    doc: { layouts },
    layoutFor: (key: string) => layouts.find((l) => l.blockName.toUpperCase() === key),
  };
  const calls: unknown[][] = [];
  const app = {
    active: st,
    view: { width: 800, height: 600, visibleWorld: () => [-400, -300, 400, 300], zoomRect: (...a: unknown[]) => calls.push(['zoomRect', ...a]) },
    setSpace: async (s: string) => {
      calls.push(['setSpace', s]);
      st.space = s.toUpperCase();
    },
    exitViewport: () => {
      calls.push(['exitViewport']);
      st.msVp = null;
    },
    register: vi.fn(),
  };
  return { app: app as unknown as App, st: st as unknown as DocState, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  location.hash = '';
});

describe('보기 링크를 앱에', () => {
  it('지금 화면: 모형은 보이는 범위, 배치는 탭 이름, 뷰포트 안이면 배치 화면 카메라', () => {
    expect(currentViewLink(fakes().app, fakes().st)).toEqual({ center: [0, 0], size: [800, 600] });
    const p = fakes({ space: '*PAPER_SPACE' });
    expect(currentViewLink(p.app, p.st)).toEqual({ center: [0, 0], size: [800, 600], layout: '배치1' });
    // MSPACE: 배치 카메라(가운데 100,50, 2픽셀 = 1단위) → 400×300 범위
    const m = fakes({ space: '*MODEL_SPACE', msVp: { layout: '*PAPER_SPACE', handle: 'A' } });
    expect(currentViewLink(m.app, m.st)).toEqual({ center: [100, 50], size: [400, 300], layout: '배치1' });
  });

  it('적용: 배치 탭으로 바꾸고(대소문자 무시) 그 범위를 여백 없이 맞춘다', async () => {
    const f = fakes();
    expect(await applyViewLink(f.app, f.st, { center: [10, 20], size: [40, 30], layout: '배치1' })).toBe(true);
    expect(f.calls).toEqual([
      ['setSpace', '*Paper_Space'],
      ['zoomRect', -10, 5, 30, 35, true, 0],
    ]);
    const g = fakes({ layouts: [{ name: 'Model', blockName: '*Model_Space' }, { name: 'Layout1', blockName: '*Paper_Space' }] });
    expect(await applyViewLink(g.app, g.st, { center: [0, 0], size: [1, 1], layout: 'LAYOUT1' })).toBe(true);
    // 모형 링크
    const h = fakes({ space: '*PAPER_SPACE' });
    await applyViewLink(h.app, h.st, { center: [0, 0], size: [2, 2] });
    expect(h.calls[0]).toEqual(['setSpace', '*MODEL_SPACE']);
  });

  it('없는 배치면 화면을 바꾸지 않고 알린다', async () => {
    const f = fakes();
    expect(await applyViewLink(f.app, f.st, { center: [0, 0], size: [1, 1], layout: '없는 배치' })).toBe(false);
    expect(f.calls).toEqual([]);
    expect(document.body.textContent).toContain('주소의 보기에 있는 배치 탭 "없는 배치"이(가) 이 도면에 없습니다.');
  });

  it('복사: 클립보드에 주소를 넣고, 못 쓰면 주소 막대에 넣는다', async () => {
    const f = fakes();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await copyViewLink(f.app);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#view=c:0,0;s:800,600$/));
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => Promise.reject(new Error('denied')) } });
    await copyViewLink(f.app);
    expect(location.hash).toBe('#view=c:0,0;s:800,600');
    expect(document.body.textContent).toContain('클립보드를 쓸 수 없어 주소 막대에 보기 링크를 넣었습니다.');
  });

  it('주소의 보기는 처음 연 도면에 한 번만, 휴대폰 보기의 전체 보기 맞춤을 건너뛰게 하고 적용한다', async () => {
    location.hash = '#view=c:1,2;s:3,4;lay:%EB%B0%B0%EC%B9%981';
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0));
    const f = fakes();
    const keep = vi.fn();
    const links = installViewLinks(f.app, keep);
    expect((f.app.register as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0].name).toBe('VIEWLINK');
    links.opened(f.st);
    expect(keep).toHaveBeenCalledWith(f.st);
    await vi.waitFor(() => expect(f.calls).toContainEqual(['zoomRect', -0.5, 0, 2.5, 4, true, 0]));
    expect(f.calls[0]).toEqual(['setSpace', '*Paper_Space']);
    // 두 번째 도면에는 적용하지 않는다
    const g = fakes();
    links.opened(g.st);
    await new Promise((r) => setTimeout(r, 5));
    expect(g.calls).toEqual([]);
  });
});
