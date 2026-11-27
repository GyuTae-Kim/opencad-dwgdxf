/**
 * 308차: 한 사전 안에서 갈린 CAD 낱말 통일(리드 결정 둘 — WCAG 3.2.4 같은 것을 같은 이름으로).
 * - 독일어 구속: 원문에 「구속」이 든 열쇠의 값에 Abhängigkeit(40곳)·Einschränkung(52곳)·Constraint(3곳)가 섞였다. AutoCAD 독일어판 낱말 Abhängigkeit
 *   (같은 사전 근거 — 「X 구속」 이름들·구속 매개변수 Abhängigkeitsparameter·AutoCAD 구속 안내의 Abhängigkeitsgruppe·Abhängigkeitsleiste)로 맞춘다.
 *   Einschränkung·Constraint → Abhängigkeit(둘 다 여성 명사라 관사·형용사 어미 그대로), 복수 → Abhängigkeiten, 합성어 앞머리 Einschränkungs- → Abhängigkeits-.
 *   구속 막대는 같은 사전의 안내가 이미 부르는 Abhängigkeitsleiste로(낱말만 바꾼 Abhängigkeitsbalken이 아니다 — 한 물건 한 이름).
 * - 중국어 외부 참조: 원문에 「외부 참조」가 든 열쇠의 값에 外部参照(153곳)와 外部参考(22곳)가 섞였다. AutoCAD 중국어판 낱말 外部参照로.
 * - 그대로: 원문에 구속이 없는 Einschränkung(제한 뜻), QLEADER 지시선 각도 구속의 「0 = 구속 없음」(파라메트릭 구속이 아니고, 같은 흐름의 「각도 구속 입력」이
 *   Winkelbeschränkung — 300차 시험), 「참조」 단독·다른 뜻 参考. 독일어 Beschränkung 무리는 리드 결정이 이름을 대지 않아 두었다(308차에 보고 두 것).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceMessage } from '../site/i18n.mjs';

const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const de = load('de');
const zh = load('zh-CN');
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
/** QLEADER 지시선 각도 구속(app/annotate.ts — 세그먼트 각을 묶는 제한, 파라메트릭 구속이 아니다) */
const QLEADER_ANGLE = '0에서 360 사이의 각도를 입력하십시오(0 = 구속 없음).';
const NOTE_READ = '참고: AutoCAD 구속 그룹의 구속 {0}개를 읽었습니다. 구속 막대·PARAMETERS에서 고칠 수 있고, 저장하면 AutoCAD 형식 그대로 갱신됩니다.';

describe('한 사전 안에서 갈린 CAD 낱말 통일(308차 리드 결정)', () => {
  it('독일어: 원문에 구속이 든 열쇠의 값은 Einschränkung·Constraint 대신 Abhängigkeit다', () => {
    const keys = Object.keys(de).filter((k) => k.includes('구속'));
    expect(keys.filter((k) => /Einschränkung|Constraint/.test(de[k]!))).toEqual([QLEADER_ANGLE]);
    // 같은 사전의 근거: 「X 구속」 이름·구속 매개변수·AutoCAD 구속 안내가 이미 Abhängigkeit
    expect(de['일치 구속']).toBe('Koinzidente Abhängigkeit');
    expect(de['구속 매개변수']).toBe('Abhängigkeitsparameter');
    expect(de['구속 매개변수 {0}']).toBe(`${de['구속 매개변수']} {0}`);
    // 구속 막대 = 안내 글이 부르는 이름
    expect(de['구속 막대']).toBe('Abhängigkeitsleiste');
    expect(de[NOTE_READ]).toContain(`in der ${de['구속 막대']} `);
    expect(de['구속 막대 표시·숨기기 (CBAR)']).toBe(`${de['구속 막대']} ein-/ausblenden (CBAR)`);
    // 합성어 앞머리·복수·관사와 형용사 어미
    expect(de['구속점 선택:']).toBe('Abhängigkeitspunkt auswählen:');
    expect(de['첫 번째 구속점 지정 또는 [']).toBe('Ersten Abhängigkeitspunkt festlegen oder [');
    expect(de['구속조건 유형 입력 [']).toBe('Eingabe des Abhängigkeitstyps [');
    expect(de['구속 그룹 {0}개는 읽지 못해(지원하지 않는 구속 종류) 원본 그대로 저장됩니다.']).toBe(
      'Die Abhängigkeitsgruppe {0} kann nicht gelesen werden (Abhängigkeitstyp wird nicht unterstützt) und wird als Original gespeichert.',
    );
    expect(de['구속조건 설정 - 자동 구속']).toBe('Abhängigkeitseinstellungen – automatische Abhängigkeit');
    expect(de['자동 구속']).toBe('Automatische Abhängigkeit');
    expect(de['기하학적 구속조건']).toBe('Geometrische Abhängigkeiten');
    expect(de['구속 {0}개']).toBe('{0} Abhängigkeiten');
    expect(de['일치 구속조건에는 두 참조가 필요합니다.']).toBe('Für eine koinzidente Abhängigkeit werden zwei Referenzen benötigt.');
    expect(de[NOTE_READ]!.startsWith(`Hinweis: ${de['구속 {0}개']} aus der AutoCAD-Abhängigkeitsgruppe`)).toBe(true);
    // Constraint 셋(구속 뜻)
    expect(de['현재 설정: 구속조건 폼 = 동적']).toBe('Aktuelle Einstellungen: Abhängigkeitsform = Dynamisch');
    const conv = de['연관 치수를 구속조건으로 바꾸는 변환은 지원하지 않습니다. 옵션으로 치수 구속조건을 만드십시오.']!;
    expect(conv).toContain('in Abhängigkeiten wird nicht unterstützt');
    expect(conv.endsWith('Bemaßungsabhängigkeiten.')).toBe(true);
    // 거꾸로 찾기(sourceMessage): 바꾼 값이 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)
    for (const k of ['구속 막대', '구속점 선택:', '자동 구속', '기하학적 구속조건', '현재 설정: 구속조건 폼 = 동적', '구속 그룹을 읽지 못했습니다.', '구속 {0}개']) {
      expect(sourceMessage(de[k]!), k).toBe(k);
    }
  });

  it('중국어: 원문에 외부 참조가 든 열쇠의 값은 外部参考 대신 外部参照다', () => {
    const keys = Object.keys(zh).filter((k) => k.includes('외부 참조'));
    expect(keys.filter((k) => zh[k]!.includes('外部参考'))).toEqual([]);
    expect(Object.values(zh).filter((v) => v.includes('外部参考'))).toEqual([]);
    // 같은 사전의 근거: 「외부 참조」 낱말 홀로
    expect(zh['외부 참조']).toBe('外部参照');
    expect(zh['외부 참조(X)']).toBe(`${zh['외부 참조']}(X)`);
    expect(zh['{0} (외부 참조)']).toBe(`{0}（${zh['외부 참조']}）`);
    expect(zh['{0} — 외부 참조']).toBe(`{0} — ${zh['외부 참조']}`);
    expect(zh['"{0}" 외부 참조: {1}']).toBe(`“{0}”${zh['외부 참조']}：{1}`);
    expect(zh['옵션 입력 [도면층(L)/한계(LI)/단위(U)/외부 참조(X)] <종료>:']).toContain(`/${zh['외부 참조(X)']}]`);
    expect(zh['비교할 외부 참조 선택:']).toBe('选择要比较的外部参照：');
    for (const k of ['외부 참조(X)', '{0} (외부 참조)', '비교할 외부 참조 선택:', '"{0}"은(는) 이미 외부 참조입니다.', '다시 로드할 외부 참조 이름 입력:']) {
      expect(sourceMessage(zh[k]!), k).toBe(k);
    }
  });

  it('원문에 구속이 없는 Einschränkung·QLEADER 각도 구속·「참조」 단독 参考는 그대로다', () => {
    expect(de['지원 범위와 확인할 점']).toBe('Unterstützung und Einschränkungen');
    // QLEADER: 소스 글 확인 + 같은 흐름의 각도 구속 입력은 Winkelbeschränkung(300차)
    expect(src('app/annotate.ts')).toContain(`ctx.print('${QLEADER_ANGLE}', 'err')`);
    expect(de[QLEADER_ANGLE]).toBe('Geben Sie einen Winkel zwischen 0 und 360 ein (0 = keine Einschränkungen).');
    expect(de['첫 번째 각도 구속 입력 <{0}>:']).toContain('Winkelbeschränkung');
    expect(zh['DWG 참조']).toBe('图纸参考');
    expect(zh['{0}(참조)']).toBe('{0}（参考）');
    expect(zh['참고: 외부 참조를 저장하면 고친 참조 도면을 같은 파일 이름으로 내려받습니다(원래 파일은 사용자가 바꿉니다).']).toContain('修正参考图');
  });
});
