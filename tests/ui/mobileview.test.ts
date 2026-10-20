/** 휴대폰 보기 모드의 순수 함수: 처음 모드, 프롬프트 나누기(키워드·<기본값>), 정보 카드 행, 정밀 조준 자리 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIM_OFFSET_PX, aimPoint } from '../../src/app/aim';
import { infoRows, promptParts, readMobileMode, startInViewMode, storeMobileMode } from '../../src/app/ui/mobileview';

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

  it('정밀 조준 십자선은 손가락 위, 도면 영역 위 가장자리에서 멈춘다', () => {
    expect(aimPoint({ x: 30, y: 200 })).toEqual({ x: 30, y: 200 - AIM_OFFSET_PX });
    expect(aimPoint({ x: 30, y: 10 })).toEqual({ x: 30, y: 0 });
  });
});
