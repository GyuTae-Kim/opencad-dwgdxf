/** 휴대폰 보기 모드의 순수 함수: 처음 모드, 프롬프트 나누기(키워드·<기본값>), 정보 카드 행, 정밀 조준 자리 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIM_OFFSET_PX, aimPoint } from '../../src/app/aim';
import { type MeasureFormat, angleResult, areaResult, distanceResult, radiusResult } from '../../src/app/measure-result';
import { fitLabels, infoRows, latestResults, measureView, promptParts, readMobileMode, resultBlocks, startInViewMode, storeMobileMode } from '../../src/app/ui/mobileview';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

/** 소수 둘째 자리, mm 도면 */
const mm: MeasureFormat = { length: (v) => v.toFixed(2), angle: (a) => `${((a * 180) / Math.PI).toFixed(2)}°`, area: (v) => v.toFixed(2), unit: ' mm' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('휴대폰 보기 모드', () => {
  it('손가락 기기만: 고른 적이 있으면 그대로, 아니면 겹침 리본 배치(좁거나 낮은 화면)일 때 보기 모드', () => {
    expect(startInViewMode(null, false, 375, 812)).toBe(false);
    expect(startInViewMode('view', false, 375, 812)).toBe(false);
    expect(startInViewMode(null, true, 375, 812)).toBe(true);
    expect(startInViewMode(null, true, 844, 390)).toBe(true);
    expect(startInViewMode(null, true, 1024, 768)).toBe(false);
    expect(startInViewMode('edit', true, 375, 812)).toBe(false);
    expect(startInViewMode('view', true, 1024, 768)).toBe(true);
  });

  it('고른 모드를 기억하고, 못 쓰는 저장소·깨진 값은 견딘다', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
    expect(readMobileMode()).toBeNull();
    storeMobileMode('edit');
    expect(readMobileMode()).toBe('edit');
    mem.set('opencad-dwgdxf.mobile-mode', 'x');
    expect(readMobileMode()).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('막힘');
      },
      setItem: () => {
        throw new Error('막힘');
      },
    });
    expect(readMobileMode()).toBeNull();
    expect(() => storeMobileMode('view')).not.toThrow();
  });

  it('프롬프트를 본문·키워드(눌러 고르기)·<기본값>(Enter)으로 나눈다', () => {
    expect(promptParts('첫 번째 점 지정:')).toEqual({ text: '첫 번째 점 지정:', keywords: [], fallback: null });
    expect(promptParts('첫 번째 구석점 지정 또는 [객체(O)] <객체(O)>:')).toEqual({
      text: '첫 번째 구석점 지정 또는 [객체(O)] <객체(O)>:',
      keywords: [{ key: 'O', label: '객체(O)' }],
      fallback: '객체(O)',
    });
    expect(promptParts('호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:').keywords.map((k) => k.key)).toEqual(['D', 'A', 'AR', 'X']);
    expect(promptParts('다음 점 지정 <합계>:').fallback).toBe('합계');
    expect(promptParts('호, 원, 선을 선택하거나 <정점 지정>:').fallback).toBe('정점 지정');
  });

  it('정보 카드는 특성 목록에서 치수 항목만 정한 차례로 여섯 개까지', () => {
    const rows = infoRows([
      { rows: [{ k: '종류', v: '선' }, { k: '도면층', v: '0' }] },
      { rows: [{ k: '시작점', v: '0, 0' }, { k: '델타 X', v: '3' }, { k: '델타 Y', v: '4' }, { k: '길이', v: '5' }, { k: '각도', v: '53°' }] },
    ]);
    expect(rows).toEqual([
      { k: '길이', v: '5' },
      { k: '각도', v: '53°' },
      { k: '델타 X', v: '3' },
      { k: '델타 Y', v: '4' },
    ]);
    const circle = infoRows([{ rows: ['중심', '반지름', '지름', '둘레', '면적'].map((k) => ({ k, v: k })) }]);
    expect(circle.map((r) => r.k)).toEqual(['반지름', '지름', '둘레', '면적']);
    const dim = infoRows([{ rows: ['치수 종류', '측정값', '표시 문자', '문자 재지정', '치수 스타일'].map((k) => ({ k, v: k })) }]);
    expect(dim.map((r) => r.k)).toEqual(['측정값', '표시 문자', '치수 종류']);
    expect(infoRows([{ rows: [...'ABCDEFGH'].map(() => ({ k: '길이', v: '1' })) }])).toHaveLength(1);
  });

  it('보기 단추 이름은 12px, 한 줄에 넘칠 때만 11.5px → 10.5px로 한 단계씩 줄인다', () => {
    // 글자 단계마다 줄의 내용 폭(scrollWidth)이 다른 가짜 막대
    const bar = (clientWidth: number, widths: Record<string, number>) => {
      const cls = new Set<string>(['viewbar', 'tighter']);
      return {
        clientWidth,
        get scrollWidth() {
          return widths[cls.has('tighter') ? 'tighter' : cls.has('tight') ? 'tight' : '']!;
        },
        classList: { add: (...c: string[]) => c.forEach((x) => cls.add(x)), remove: (...c: string[]) => c.forEach((x) => cls.delete(x)) },
        cls,
      };
    };
    const fits = bar(352, { '': 340, tight: 330, tighter: 320 });
    expect(fitLabels(fits as unknown as HTMLElement)).toBe('');
    expect([...fits.cls]).toEqual(['viewbar']);
    const german = bar(352, { '': 376, tight: 350, tighter: 339 });
    expect(fitLabels(german as unknown as HTMLElement)).toBe('tight');
    expect([...german.cls]).toEqual(['viewbar', 'tight']);
    expect(fitLabels(bar(320, { '': 376, tight: 350, tighter: 339 }) as unknown as HTMLElement)).toBe('tighter');
    // 숨은 막대(편집 화면)는 재지 않는다
    expect(fitLabels(bar(0, { '': 376, tight: 350, tighter: 339 }) as unknown as HTMLElement)).toBe('');
  });

  it('측정 결과 값: 큰 값(단위 포함)과 보조 줄(거리는 각도·ΔX·ΔY, ΔZ는 0이 아닐 때만)', () => {
    expect(distanceResult(mm, 129.37, -111.95)).toEqual({
      kind: 'distance',
      label: '거리',
      value: '171.08 mm',
      details: [
        { k: '각도', v: '319.13°' },
        { k: 'ΔX', v: '129.37' },
        { k: 'ΔY', v: '-111.95' },
      ],
    });
    expect(distanceResult(mm, 3, 4, 12).details.at(-1)).toEqual({ k: 'ΔZ', v: '12.00' });
    expect(distanceResult(mm, 3, 4, 12).value).toBe('13.00 mm');
    expect(radiusResult(mm, 12.5)).toEqual({ kind: 'radius', label: '반지름', value: '12.50 mm', details: [{ k: '지름', v: '25.00 mm' }] });
    expect(angleResult(mm, Math.PI / 4)).toEqual({ kind: 'angle', label: '각도', value: '45.00°', details: [] });
    expect(angleResult(mm, Math.PI / 4, true).details).toEqual([{ k: '보각', v: '135.00°' }]);
    expect(areaResult(mm, 1200, 140)).toEqual({ kind: 'area', label: '면적', value: '1200.00 mm²', details: [{ k: '둘레', v: '140.00 mm' }] });
    expect(areaResult({ ...mm, unit: '' }, 1200, null)).toEqual({ kind: 'area', label: '면적', value: '1200.00', details: [] });
    // 면적을 모르는 객체(스플라인)는 둘레가 큰 값
    expect(areaResult(mm, null, 31.4)).toEqual({ kind: 'area', label: '둘레', value: '31.40 mm', details: [] });
  });

  it('결과 줄 묶기: 같은 측정 값을 단 줄은 한 덩어리, 카드는 마지막 측정과 그 뒤만', () => {
    const a = distanceResult(mm, 3, 4);
    const b = radiusResult(mm, 2);
    const lines = [
      { text: '거리 = 5.00 mm, …', cls: 'res' as const, measure: a },
      { text: 'X 증분 = 3.00, …', cls: 'res' as const, measure: a },
      { text: '반지름 = 2.00 mm', cls: 'res' as const, measure: b },
      { text: '지름 = 4.00 mm', cls: 'res' as const, measure: b },
      { text: '호나 원이 아닙니다.', cls: 'err' as const },
    ];
    const blocks = resultBlocks(lines);
    expect(blocks).toEqual([
      { measure: a, text: ['거리 = 5.00 mm, …', 'X 증분 = 3.00, …'] },
      { measure: b, text: ['반지름 = 2.00 mm', '지름 = 4.00 mm'] },
      { line: lines[4] },
    ]);
    expect(latestResults(blocks)).toEqual(blocks.slice(1));
    // 값이 없는 결과(다른 명령, 값을 넘기지 않은 경로)는 명령행 글 그대로 모두
    const plain = resultBlocks([{ text: 'X = 1  Y = 2', cls: 'res' }, { text: '오류', cls: 'err' }]);
    expect(latestResults(plain)).toEqual(plain);
  });

  it('측정 결과 카드: 큰 값과 보조 줄, 값은 번역하지 않고, 명령행 원문은 펼침에 줄마다 그대로', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('document', dom.window.document);
    const text = ['거리 = 171.08 mm,  XY 평면에서의 각도 = 319.13°,  XY 평면으로부터의 각도 = 0', 'X 증분 = 129.37,  Y 증분 = -111.95,  Z 증분 = 0.00'];
    const el = measureView(distanceResult(mm, 129.37, -111.95), text);
    expect(el.tagName).toBe('DETAILS');
    expect(el.querySelector('.mv-kind')!.textContent).toBe('거리');
    expect(el.querySelector('.mv-big')!.textContent).toBe('171.08 mm');
    expect(el.querySelector('.mv-big')!.hasAttribute('data-i18n-skip')).toBe(true);
    expect(el.querySelector('.mv-sub')!.textContent).toBe('각도 319.13° · ΔX 129.37 · ΔY -111.95');
    expect([...el.querySelectorAll('.mv-sub b')].every((b) => b.hasAttribute('data-i18n-skip'))).toBe(true);
    expect([...el.querySelectorAll('.mv-raw > div')].map((d) => d.textContent)).toEqual(text);
    // 보조 줄이 없으면 그 줄을 두지 않는다
    expect(measureView(angleResult(mm, 1), ['각도 = 57.30°']).querySelector('.mv-sub')).toBeNull();
    dom.window.close();
  });

  it('정밀 조준 십자선은 손가락 위, 도면 영역 위 가장자리에서 멈춘다', () => {
    expect(aimPoint({ x: 30, y: 200 })).toEqual({ x: 30, y: 200 - AIM_OFFSET_PX });
    expect(aimPoint({ x: 30, y: 10 })).toEqual({ x: 30, y: 0 });
  });
});
