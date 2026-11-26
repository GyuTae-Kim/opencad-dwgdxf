/**
 * 284차(278차 보고 (4)·279차 보고 (4)): 용어 묶음 밖에서 본 오역을, 그 글이 보이는 자리에서 코드가 하는 일과 같은 사전 안의 번역을 근거로 고쳤다.
 * - zh: <종료> <出口>(출구) → <退出>(「종료」 退出), 채우기 填写(서식 채워 넣기)·泵(펌프) → 填充, 객체 스냅 조준창(APERTURE) 十字线(십자선) → 靶框
 *   (「조준창 크기(Z)」), 다시 지정하십시오 重新分配(분배) → 重新指定, 선택 프롬프트 최종(L) 端点(끝점 — L은 마지막으로 만든 객체) → 最后一个
 *   (선택 키워드 「마지막」), 플롯 绘制(그리기) → 打印(소스에 있는 열쇠만), 복사 复印(복사기 복사) → 复制.
 * - ja: 두 점을 찍어 撮って(사진 찍기) → 指定して(「두 점을 지정하십시오」).
 * - de: 입력 öffnen(열기) → eingeben(같은 프롬프트의 앞 조각), 울타리 Fence → Zaun, 표 Table → Tabelle, 재지정 값 불일치 어순, 최종(L) Ende(끝) → Zuletzt.
 *   en·de 조준창 sight window·Sichtfenster → 같은 사전 「조준창 크기」의 Aperture·Zielfenster.
 * 표는 docs/CHANGELOG.md 284차 절.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const zh = dict['zh-CN'];
const de = dict.de;

/** 객체 선택 프롬프트(src/app/selmethod.ts SELECT_HELP — 「*잘못된 선택*」 줄) */
const SELECT = '점 또는 윈도우(W)/최종(L)/걸침(C)/상자(BOX)/모두(ALL)/울타리(F)/윈도우 폴리곤(WP)/걸침 폴리곤(CP)/그룹(G)/추가(A)/제거(R)/다중(M)/이전(P)/명령 취소(U)/자동(AU)/단일(SI)이(가) 필요함';
/** 시스템 변수 APERTURE 설명(src/app/sysvars.ts) */
const APERTURE = '객체 스냅 조준창 크기(픽셀)';

describe('용어 묶음 밖 오역(284차)', () => {
  it('zh: 종료·채우기·조준창·다시 지정·최종(L)·플롯·복사는 같은 사전의 낱말이다', () => {
    for (const [key, value] of Object.entries(zh)) {
      if (key.includes('종료')) expect(value, key).not.toContain('出口');
      if (key.includes('채우기')) expect(value, key).not.toMatch(/填写|泵/);
      if (key.includes('조준창')) expect(value, key).not.toContain('十字');
      if (key.includes('다시 지정하십시오')) expect(value, key).toContain('请重新指定');
      if (key.includes('복사')) expect(value, key).not.toContain('复印');
    }
    expect(zh['그립을 선택하여 배열을 편집하거나 [{0}] <종료>:']).toBe('选择一个夹点进行编辑[{0}] <退出>:');
    expect(zh['지시선 형식 옵션 입력 [스플라인(S)/직선(ST)/화살표(A)/없음(N)] <종료>:']).toMatch(/<退出>:$/);
    expect(zh['채우기']).toBe('填充');
    expect(zh['채우기 모드']).toBe('填充模式');
    expect(zh['전체 경로 채우기(F)']).toBe(`${zh['전체 경로 채우기']}(F)`);
    expect(zh[APERTURE]).toBe('对象捕捉靶框大小（像素）');
    expect(zh[SELECT]).toContain(`/${zh['마지막']}(L)/`);
    // 소스에 있는 플롯 열쇠(소스에 없는 옛 열쇠 넷은 그대로 — 284차 표)
    for (const key of ['위 아래를 뒤집어 플롯?', '객체의 선가중치 플롯', '플롯(PDF)…', '플롯(PDF로 출력)', '플롯(명령행)', '플롯…', '플롯을 진행합니까?']) {
      expect(zh[key], key).toContain('打印');
      expect(zh[key], key).not.toContain('绘制');
    }
    expect(zh['복사']).toBe('复制');
    expect(zh['복사 (CO)']).toBe(`${zh['복사']} (CO)`);
  });

  it('ja: 두 점을 찍어는 사진 찍기(撮る)가 아니라 「두 점을 지정」의 指定이다', () => {
    for (const [key, value] of Object.entries(dict.ja)) if (key.includes('찍')) expect(value, key).not.toContain('撮');
    expect(dict.ja['가운데 버튼으로 끌거나, 두 점을 찍어 이동합니다.']).toContain('2点を指定して移動');
  });

  it('de·en: 입력·울타리·표·재지정 값 불일치·최종(L)·조준창은 같은 사전의 낱말이다', () => {
    for (const [key, value] of Object.entries(de)) {
      if (key.includes('입력 [')) expect(value, key).not.toMatch(/öffnen/);
      if (key.includes('울타리')) expect(value, key).not.toContain('Fence');
      if (key.startsWith('표')) expect(value, key).not.toMatch(/\bTable\b/);
    }
    // 명령행 입력 줄은 앞 조각(「… [」)을, 명령 기록 줄은 전체 열쇠를 옮긴다 — 둘이 같은 글로 시작한다
    for (const key of [
      '플롯 영역 입력 [화면표시(D)/범위(E)/배치(L)/뷰(V)/윈도우(W)] <배치>:',
      '정점 편집 옵션 입력 [{0}] <종료>:',
      '정점 편집 옵션 입력 [다음(N)/이전(P)/끊기(B)/삽입(I)/이동(M)/재생성(R)/직선화(S)/접선(T)/폭(W)/종료(X)] <{0}>:',
    ]) {
      const head = de[key.slice(0, key.indexOf('[') + 1)];
      expect(de[key]?.slice(0, head?.length), key).toBe(head);
    }
    expect(de['울타리']).toBe('Zaun');
    expect(de['울타리 올가미']).toBe('Zaun-Lasso');
    expect(de['표']).toBe('Tabelle');
    expect(de['표 {0}{1}']).toBe('Tabelle {0}{1}');
    expect(de['재지정 값 불일치 ({0})']).toBe('Abweichende Überschreibungswerte ({0})');
    expect(de[SELECT]).toContain(`/${de['마지막']} (L)/`);
    expect(de[SELECT]).toContain(`/${de['울타리']} (F)/`);
    expect(dict.en[APERTURE]?.toLowerCase()).toContain(dict.en['조준창 크기']?.toLowerCase());
    expect(de[APERTURE]).toContain(de['조준창 크기']);
    for (const lang of ['en', 'de'] as const) expect(dict[lang][APERTURE], lang).not.toMatch(/sight|Sicht/i);
  });
});
