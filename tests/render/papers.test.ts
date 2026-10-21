// @vitest-environment jsdom
/**
 * 플롯 용지: ISO B·JIS B·ARCH와 사용자 크기, AutoCAD식 용지 이름, -PLOT 용지 이름 읽기.
 * PUBLISH 시트 목록: 열린 도면마다 모형과 배치.
 */
import { describe, expect, it } from 'vitest';
import { PAPERS, mediaName, paperKeyOfSize, paperOf, userPaperKey } from '../../src/app/papers';
import { paperKeyOf } from '../../src/app/dashcmds-plot';
import { type PageForm, pageFields, pageSettingsOf } from '../../src/app/pagesetup-ui';
import { publishSheets } from '../../src/app/plot';
import type { App } from '../../src/app/app';
import { DocState } from '../../src/app/docstate';
import { createNewDocument } from '../../src/core/newdoc';
import type { PlotSettings as PageSettings } from '../../src/core/model';

describe('용지 표', () => {
  it('ISO B·JIS B·ARCH 크기(mm)', () => {
    expect(paperOf('ISOB4')).toMatchObject({ w: 250, h: 353 });
    expect(paperOf('JISB4')).toMatchObject({ w: 257, h: 364 });
    expect(paperOf('ARCHD')!.w).toBeCloseTo(609.6, 9);
    expect(paperOf('ARCHD')!.h).toBeCloseTo(914.4, 9);
    expect(paperOf('ARCHE1')!.h).toBeCloseTo(1066.8, 9);
    expect(new Set(PAPERS.map((p) => p.key)).size).toBe(PAPERS.length);
    // 기존 열쇠와 차례(A4, A3 …)는 그대로
    expect(PAPERS[1]!.key).toBe('A3');
  });
  it('사용자 크기: 짧은 변이 폭, 열쇠로 다시 읽는다', () => {
    const k = userPaperKey(420, 297)!;
    expect(k).toBe('USER_297x420');
    expect(paperOf(k)).toMatchObject({ w: 297, h: 420 });
    expect(userPaperKey(0, 100)).toBeNull();
    expect(paperKeyOfSize(353, 250)).toBe('ISOB4');
  });
  it('AutoCAD식 용지 이름', () => {
    expect(mediaName('ISOB4', 250, 353)).toBe('ISO_full_bleed_B4_(250.00_x_353.00_MM)');
    expect(mediaName('ARCHD', 914.4, 609.6)).toBe('ARCH_full_bleed_D_(36.00_x_24.00_Inches)');
    expect(mediaName('JISB4', 257, 364)).toBe('JIS_B4_(257.00_x_364.00_MM)');
    expect(mediaName('USER_297x420', 420, 297)).toBe('UserDefinedMetric_(420.00_x_297.00_MM)');
    expect(mediaName('A3', 420, 297)).toBe('ISO_full_bleed_A3_(420.00_x_297.00_MM)');
  });
  it('-PLOT 용지 이름 읽기', () => {
    expect(paperKeyOf('ISO_full_bleed_B2_(500.00_x_707.00_MM)')).toBe('ISOB2');
    expect(paperKeyOf('JIS B5 (182.00 x 257.00 MM)')).toBe('JISB5');
    expect(paperKeyOf('ARCH_full_bleed_E1_(30.00_x_42.00_Inches)')).toBe('ARCHE1');
    expect(paperKeyOf('ARCH C')).toBe('ARCHC');
    expect(paperKeyOf('500 x 300')).toBe('USER_300x500');
    expect(paperKeyOf('사용자 420x297')).toBe('USER_297x420');
    expect(paperKeyOf('ISO A3 (297.00 x 420.00 MM)')).toBe('A3');
  });
});

describe('페이지 설정의 사용자 크기', () => {
  const form = (paper: string): PageForm => ({
    paper,
    landscape: true,
    upsideDown: false,
    styleSheet: '',
    area: 'layout',
    window: undefined,
    scale: '1:1',
    offsetX: 0,
    offsetY: 0,
    centered: true,
    lineweights: true,
    scaleLineweights: false,
    paperUnits: 'mm',
    plotTransparency: false,
    paperspaceLast: false,
  });
  it('사용자 크기를 고르면 폭·높이 칸이 보이고 USER_ 열쇠로 읽는다', () => {
    const f = pageFields(form('A3'), false);
    const sel = f.el.querySelector('select[aria-label="용지 크기"]') as HTMLSelectElement;
    const w = f.el.querySelector('input[aria-label="사용자 용지 폭(mm)"]') as HTMLInputElement;
    const hh = f.el.querySelector('input[aria-label="사용자 용지 높이(mm)"]') as HTMLInputElement;
    expect((w.closest('.paper-user') as HTMLElement).hidden).toBe(true);
    sel.value = 'USER';
    sel.dispatchEvent(new Event('change'));
    expect((w.closest('.paper-user') as HTMLElement).hidden).toBe(false);
    w.value = '600';
    hh.value = '400';
    const v = f.read();
    expect(v.paper).toBe('USER_400x600');
    const base = { paperWidth: 420, paperHeight: 297, rotation: 0, flags: 0 } as unknown as PageSettings;
    const p = pageSettingsOf(base, v, false);
    expect([p.paperWidth, p.paperHeight]).toEqual([600, 400]);
    expect(p.paperName).toBe('UserDefinedMetric_(600.00_x_400.00_MM)');
    // 다시 열면 사용자 크기 칸에 그 값
    const g = pageFields(form('USER_400x600'), false);
    expect((g.el.querySelector('select[aria-label="용지 크기"]') as HTMLSelectElement).value).toBe('USER');
    expect((g.el.querySelector('input[aria-label="사용자 용지 폭(mm)"]') as HTMLInputElement).value).toBe('400');
  });
});

describe('PUBLISH 시트 목록', () => {
  it('열린 도면마다 모형과 배치(탭 순서)', () => {
    const a = new DocState(1, createNewDocument('metric'), 'a.dwg', 0, 0);
    const b = new DocState(2, createNewDocument('imperial'), 'b.dxf', 0, 0);
    const sheets = publishSheets({ docs: [a, b] } as unknown as App);
    const of = (st: DocState) => sheets.filter((x) => x.st === st);
    expect(of(a)[0]).toMatchObject({ model: true, name: '모형' });
    expect(of(a).filter((x) => !x.model).length).toBe(a.layouts.filter((l) => l.blockName.toUpperCase() !== '*MODEL_SPACE').length);
    expect(of(b).length).toBeGreaterThan(1);
    expect(sheets.find((x) => x.st === b && !x.model)!.label.startsWith('b - ')).toBe(true);
  });
});
