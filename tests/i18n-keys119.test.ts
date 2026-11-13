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
    // 맞춤 탭의 칸(DIMSCALE·DIMSOXD·DIMTOFL·DIMTIX): 전체 축척을 Vollbildmodus(전체 화면)·全屏·Extents로, 화살표가 맞지 않음을 "잘못 정렬"로 옮기던 줄
    expect(['en', 'de', 'zh-CN'].map((l) => translate('전체 축척 사용', l))).toEqual(['Use overall scale of', 'Globaler Skalierfaktor', '使用全局比例']);
    expect(translate('화살표가 맞지 않으면 억제', 'de')).toBe('Pfeile unterdrücken, wenn sie nicht zwischen Hilfslinien passen');
    expect(translate('화살표가 맞지 않으면 억제', 'zh-CN')).toBe('若不能放在尺寸界线内，则不显示箭头');
    expect(translate('치수보조선 사이에 치수선 그리기', 'de')).toBe('Maßlinie zwischen Hilfslinien');
    expect(translate('항상 치수보조선 사이에 문자 유지', 'de')).toBe('Text immer zwischen Hilfslinien anzeigen');
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

  it('주석 축척·주석 객체는 Autodesk 낱말(주석 객체 축척 대화 상자: Beschriftungsobjekt-Maßstab·異尺度対応オブジェクトの尺度·注释性对象比例)', () => {
    // 주석 축척을 Kommentarskala(주석 눈금)·评论评分(댓글 평점)로, 주석 객체를 コメント(댓글) 객체로 옮기던 줄
    expect(LANGS.map((l) => translate('주석 축척', l))).toEqual(['Annotation scale', 'Beschriftungsmaßstab', '注釈尺度', '注释比例']);
    expect(LANGS.map((l) => translate('주석 객체 축척', l))).toEqual(['Annotative Object Scale', 'Beschriftungsobjekt-Maßstab', '異尺度対応オブジェクトの尺度', '注释性对象比例']);
    for (const k of ['주석 축척', '주석 축척 "{0}"을(를) 찾을 수 없습니다.', '주석 객체 축척', '{0}개는 주석 객체가 아닙니다.', '고른 객체 가운데 주석 객체가 없습니다.', '주석 블록 작성 [예(Y)/아니오(N)] <예>:', '주석 업데이트', '주석 위치 재설정']) {
      expect(translate(k, 'de'), k).not.toMatch(/Kommentar|Anmerkung/);
      expect(translate(k, 'ja'), k).not.toMatch(/コメント|注記/);
      expect(translate(k, 'zh-CN'), k).not.toMatch(/评论|评分|相等|缩放/);
    }
    expect(translate('주석 문자 스타일을 작성하시겠습니까?', 'zh-CN')).toBe('是否创建注释性文字样式？');
    expect(translate('주석 객체는 주석 축척마다 크기(용지 크기 × 축척)가 다른 표현을 가집니다', 'de')).not.toMatch(/Skala$/);
  });

  it('명령행 옵션 이름(한국어 입력으로 고르는 글)은 도움말 낱말을 확인한 것만 가른다(120차 MVIEW, 121차 COPY 배열·TEXT·-PLOT·LEADER — tests/i18n-keys120·121)', () => {
    // 스플라인 메서드 맞춤 옵션은 그대로 "맞춤" — 한국어로 "맞춤"을 쳐서 고른다
    expect(src('app/draw.ts')).toContain(`{ key: 'F', label: '맞춤' }`);
    for (const f of ['app/draw.ts', 'app/modify2.ts', 'app/tablecmds.ts']) expect(src(f)).not.toMatch(/label: '(맞춤|열 폭)\\u\{2060\}'/);
  });
});
