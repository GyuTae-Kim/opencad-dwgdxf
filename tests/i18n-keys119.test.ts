/**
 * 119차 언어 사전 열쇠 가르기(116차 CLIP "자르기"와 같은 방식 — 한국어 화면 글은 그대로, 끝에 보이지 않는 U+2060):
 * - 치수 스타일 맞춤 탭: 스플라인·폴리선 맞춤과 같은 "맞춤"이라 중국어가 拟合으로 보였다. Autodesk 맞춤 탭(치수 스타일 관리자) 도움말:
 *   en Fit, de Registerkarte Anpassen(맞춤 옵션 Einpassungsoptionen), ja [フィット]タブ, zh “调整”选项卡(调整选项).
 * - 여러 줄 문자 단 설정의 "열 폭": 표의 열 폭(列幅·列宽)과 같은 열쇠였다. Autodesk 단 설정 대화 상자: ja 段組み(段および間隔の幅), zh 栏(栏和栏间距宽度).
 * 둘 다 대화 상자 글(탭·칸 이름)이라 명령행에서 치는 옵션 이름과 겹치지 않는다 — 옵션 이름(스플라인 [맞춤(F)] 등)은 그대로 "맞춤".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
const WJ = String.fromCodePoint(0x2060);
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('맞춤 탭·단의 열 폭 열쇠', () => {
  it('치수 스타일 맞춤 탭은 도움말 탭 이름(중국어 调整), 스플라인 맞춤은 그대로 拟合', () => {
    const s = src('app/dimstyle.ts');
    // 소스는 보이는 이스케이프로 쓴다(보이지 않는 글자를 그대로 두지 않는다)
    expect(s).toContain(String.raw`const FIT_TAB = '맞춤\u{2060}';`);
    expect(s).not.toContain(WJ);
    expect(s).toMatch(/\[\s*FIT_TAB,\s*\[\s*\{\s*v: 'DIMATFIT'/);
    const tab = '맞춤' + WJ;
    expect(LANGS.map((l) => translate(tab, l))).toEqual(['Fit', 'Anpassen', 'フィット', '调整']);
    expect(translate(tab, 'ko')).toBe(tab);
    expect(LANGS.map((l) => translate('맞춤', l))).toEqual(['Fit', 'Anpassen', 'フィット', '拟合']);
    expect(translate('맞춤 옵션(공간이 모자랄 때 밖으로)', 'de')).toContain('Einpassungsoption');
    expect(translate('맞춤 옵션(공간이 모자랄 때 밖으로)', 'zh-CN')).toContain('调整选项');
  });

  it('여러 줄 문자 단 설정의 열 폭은 段の幅·栏宽, 표의 열 폭은 列幅·列宽 그대로', () => {
    const s = src('app/textedit/editor.ts');
    expect(s).toContain(String.raw`label: '열 폭\u{2060}'`);
    expect(s).not.toContain(WJ);
    const col = '열 폭' + WJ;
    expect(LANGS.map((l) => translate(col, l))).toEqual(['Column width', 'Spaltenbreite', '段の幅', '栏宽']);
    expect(translate(col, 'ko')).toBe(col);
    expect(LANGS.map((l) => translate('열 폭', l))).toEqual(['Column width', 'Spaltenbreite', '列幅', '列宽']);
    // 같은 대화 상자의 다른 칸과 낱말이 맞는다(段組み·栏)
    expect(translate('열 설정', 'ja')).toContain('段組み');
    expect(translate('열 설정', 'zh-CN')).toContain('栏');
  });

  it('명령행 옵션 이름(한국어 입력으로 고르는 글)은 가르지 않는다', () => {
    // 스플라인 메서드·MVIEW·복사 배열 맞춤 옵션은 그대로 "맞춤" — 한국어로 "맞춤"을 쳐서 고른다
    expect(src('app/draw.ts')).toContain(`{ key: 'F', label: '맞춤' }`);
    expect(src('app/vpcmds.ts')).toContain(`{ key: 'F', label: '맞춤' }`);
    expect(src('app/modify.ts')).toContain(`keywords: [{ key: 'F', label: '맞춤' }]`);
    for (const f of ['app/draw.ts', 'app/vpcmds.ts', 'app/modify.ts', 'app/modify2.ts', 'app/tablecmds.ts']) expect(src(f)).not.toMatch(/label: '(맞춤|열 폭)\\u\{2060\}'/);
  });
});
