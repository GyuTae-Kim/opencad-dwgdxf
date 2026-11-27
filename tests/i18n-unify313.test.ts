/**
 * 313차: 독일어 사전 안에서 갈린 「주석」·「(도면) 축척」 낱말 통일(리드 결정 둘 — WCAG 3.2.4 같은 것을 같은 이름으로, 308차 꼴).
 * - 주석(주석 특성 annotative·주석 객체): 원문에 「주석」이 든 열쇠의 값에 Anmerkung(16 열쇠)과 Beschriftung(62 열쇠)이 섞였다.
 *   AutoCAD 독일어판 낱말 Beschriftung(Beschriftungsobjekt·Beschriftungsmaßstab — 같은 사전 62 열쇠, 119차 시험)으로 맞춘다. 둘 다 여성 명사라 관사 그대로.
 *   공유 열쇠 「주석」(홀로)은 주석 특성 자리와 함께 FIELD 문서 특성 Comments·DWGPROPS 설명 칸이 써서 뜻이 갈린다 — 그대로.
 * - 축척: 원문에 「축척」이 든 열쇠의 값에 Skal…(99 열쇠)과 Maßstab(152 열쇠)이 섞였다. 도면·주석·뷰포트·플롯 축척(1:50 같은 비율 이름 —
 *   AutoCAD de Maßstab: Beschriftungsmaßstab·Ansichtsfenstermaßstab·Maßstabsliste) 뜻인 열쇠만 Maßstab으로(der Maßstab — 4격 어미 -en).
 *   축척 비율·크기 바꾸기(SCALE·블록 삽입 X/Y/Z·선종류·해치 축척·MVSETUP 뷰포트 크기 맞추기)는 그대로.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceMessage } from '../site/i18n.mjs';

const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const de = load('de');
const en = load('en');
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

const HATCH_MAIN = '내부 점 지정 또는 [특성(P)/객체 선택(S)/그리기 경계(W)/경계 제거(B)/고급(A)/그리기 순서(DR)/원점(O)/주석(AN)/해치 색상(CO)/도면층(LA)/투명도(T)]:';
const DIMSTYLE_OPT = '치수 스타일 옵션 입력 [주석(AN)/저장(S)/복원(R)/상태(ST)/변수(V)/적용(A)/?] <복원>:';
/** 상태 막대 ANNOALLVISIBLE·ANNOAUTOSCALE 단추 풍선 */
const ALLVIS = '주석 객체 표시 (ANNOALLVISIBLE) · 켜면 현재 주석 축척을 지원하지 않는 주석 객체도 보입니다';
const AUTOSCALE = '주석 축척 변경 시 축척 추가 (ANNOAUTOSCALE) · 켜면 주석 축척을 바꿀 때 주석 객체에 새 축척을 더합니다';
/** 리본 ANNORESET 풍선(축척 표현 = 주석 축척마다의 표현) */
const RESET_TIP = '모든 축척 표현의 위치를 현재 표현의 위치로 (ANNORESET)';
const SYNC_TIP = '주석 축척이 뷰포트 축척과 같지 않음: 동기화하려면 클릭';
/** -PLOT 잘못 친 플롯 축척 */
const PLOT_BAD = '축척은 "1=100"처럼 입력하거나 맞춤(F)을 입력하십시오.';
/** DIMSTYLE 맞춤 탭 주석 확인란 — 앞 「축척」은 치수 피처 축척(DIMSCALE 비율), 뒤 「주석 축척」은 비율 이름 */
const DIM_ANNO = '주석(축척은 주석 축척을 따름)';
const HATCH_NOTE = '주석 해치는 이 명령행 버전에서 만들 수 없습니다. 보통 해치로 만듭니다(주석 축척은 특성 팔레트에서 켜십시오).';
const MVSETUP_OPT = '옵션 입력 [정렬(A)/작성(C)/뷰포트 축척(S)/옵션(O)/제목 블록(T)/명령 취소(U)]:';

/** 도면 축척 뜻(주석·뷰포트·플롯 축척, 축척 목록 이름)이라 Skal…을 Maßstab으로 바꾼 열쇠(DIM_ANNO는 앞 축척 비율이 남아 따로 본다) */
const DRAWING_SCALE = [
  'pf-주석 축척',
  '{0}비율 축척 백분율',
  '{0}외부 참조 축척 숨기기',
  '외부 참조 축척 숨기기',
  '고른 주석 객체에서 현재 주석 축척 삭제',
  '과학 축척',
  '미터법 축척',
  '십진 축척',
  RESET_TIP,
  '뷰포트 축척 동기화',
  '뷰포트 축척 보기',
  ALLVIS,
  AUTOSCALE,
  PLOT_BAD,
];

describe('독일어 사전 안에서 갈린 주석·도면 축척 낱말 통일(313차 리드 결정)', () => {
  it('주석: 원문에 주석이 든 열쇠의 값은 Anmerkung 대신 Beschriftung이다(공유 열쇠 「주석」 하나 빼고)', () => {
    const keys = Object.keys(de).filter((k) => k.includes('주석'));
    expect(keys.filter((k) => /Anmerkung/.test(de[k]!))).toEqual(['주석']);
    // 같은 사전의 근거
    expect([de['주석 축척'], de['주석 객체 축척'], de['주석(A)']]).toEqual(['Beschriftungsmaßstab', 'Beschriftungsobjekt-Maßstab', 'Beschriftung (A)']);
    // 옵션 조각 = 「주석(A)」 꼴, HATCH·-DIMSTYLE 통째 프롬프트도 같은 이름
    expect(de['주석(AN)']).toBe(de['주석(A)']!.replace('(A)', '(AN)'));
    expect(de[HATCH_MAIN]).toContain(`/${de['주석(AN)']}/`);
    expect(de[DIMSTYLE_OPT]).toContain(`[${de['주석(AN)']}/`);
    expect(src('app/dashcmds-hatch.ts')).toContain("{ key: 'AN', label: '주석' }");
    // 주석 객체 = Beschriftungsobjekt
    expect(de['주석 객체 선택:']).toBe('Beschriftungsobjekte auswählen:');
    expect(de['주석 객체 선택 또는 [명령 취소(U)/모드(M)]:']).toBe('Beschriftungsobjekte auswählen oder [Rückgängig (U)/Modus (M)]:');
    expect(de['선택한 주석 객체 {0}개']).toBe('{0} ausgewählte Beschriftungsobjekte');
    expect(de['{0}은(는) 주석 객체가 쓰고 있어 삭제할 수 없습니다.']).toBe('{0} kann nicht gelöscht werden, da es von einem Beschriftungsobjekt verwendet wird.');
    expect(de['주석 객체 표시']).toBe('Beschriftungsobjekte anzeigen');
    expect(de[ALLVIS]).toBe(
      `${de['주석 객체 표시']} (ANNOALLVISIBLE) · Wenn diese Option aktiviert ist, werden auch Beschriftungsobjekte angezeigt, die den aktuellen Beschriftungsmaßstab nicht unterstützen.`,
    );
    // 리본 풍선 둘(der Maßstab — 4격 Aktuellen)
    expect([de['고른 주석 객체에 현재 주석 축척 추가'], de['고른 주석 객체에서 현재 주석 축척 삭제']]).toEqual([
      'Aktuellen Beschriftungsmaßstab zu ausgewählten Beschriftungsobjekten hinzufügen',
      'Aktuellen Beschriftungsmaßstab aus ausgewähltem Beschriftungsobjekt löschen',
    ]);
    expect(de['문자를 문자 스타일의 주석 설정에 맞춤']).toBe('Richten Sie den Text im Textstil an den Beschriftungseinstellungen aus');
    // 특성 팔레트 칸 id(pf-)
    expect([de['pf-주석'], de['pf-주석 축척']]).toEqual(['pf-Beschriftung', 'pf – Beschriftungsmaßstab']);
    // 거꾸로 찾기(sourceMessage): 바꾼 값이 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)
    for (const k of ['주석(AN)', '주석 객체 선택:', '주석 객체 표시', '선택한 주석 객체 {0}개', '고른 주석 객체에서 현재 주석 축척 삭제', '문자를 문자 스타일의 주석 설정에 맞춤'])
      expect(sourceMessage(de[k]!), k).toBe(k);
  });

  it('도면 축척: 주석·뷰포트·플롯 축척과 축척 목록 이름 열쇠의 값은 Skal… 대신 Maßstab이다(목록으로 고정)', () => {
    for (const k of DRAWING_SCALE) {
      expect(de[k], k).not.toMatch(/skal/i);
      expect(de[k], k).toMatch(/[Mm]aßst/);
    }
    // MVSETUP 축척 목록 제목 = 같은 목록 「공학 축척」·「건축 축척」 꼴(형용사 + Maßstab)
    expect(['과학 축척', '미터법 축척', '십진 축척', '공학 축척', '건축 축척'].map((k) => de[k])).toEqual([
      'Wissenschaftlicher Maßstab',
      'Metrischer Maßstab',
      'Dezimaler Maßstab',
      'Technischer Maßstab',
      'Architektonischer Maßstab',
    ]);
    expect(src('app/filecmds-layout.ts')).toContain("['미터법 축척', METRIC_SCALES]");
    // HIDEXREFSCALES(der Maßstab — 4격 Externen), 켜진 메뉴 틀 = {0} + 꺼진 이름(312차)
    expect(de['외부 참조 축척 숨기기']).toBe('Externen Referenzmaßstab ausblenden');
    expect(de['{0}외부 참조 축척 숨기기']).toBe(`{0}${de['외부 참조 축척 숨기기']}`);
    expect(de['{0}비율 축척 백분율']).toBe('{0}Prozentsatz des Verhältnismaßstabs');
    // 뷰포트 축척 = 같은 동기화 단추 풍선의 Ansichtsfenstermaßstab
    expect(de[SYNC_TIP]).toContain('mit dem Ansichtsfenstermaßstab überein');
    expect([de['뷰포트 축척 동기화'], de['뷰포트 축척 보기']]).toEqual(['Synchronisierung des Ansichtsfenstermaßstabs', 'Ansichtsfenstermaßstab anzeigen']);
    expect(de[RESET_TIP]).toBe('Setzt die Positionen aller Maßstabsdarstellungen auf die Positionen der aktuellen Darstellung (ANNORESET)');
    // ANNOAUTOSCALE 풍선 앞머리 = 제목 열쇠(312차)
    expect(de[AUTOSCALE]!.startsWith(`${de['주석 축척 변경 시 축척 추가']} (ANNOAUTOSCALE) · `)).toBe(true);
    // -PLOT 축척 = 같은 흐름 「플롯 축척」 Plotmaßstab
    expect(de['플롯 축척']).toBe('Plotmaßstab');
    expect(de[PLOT_BAD]!.startsWith('Maßstab als ')).toBe(true);
    // DIMSTYLE 주석 확인란: 뒤 「주석 축척」만 Beschriftungsmaßstab(앞 「축척」은 치수 피처 축척 비율 — Skalierung 그대로)
    expect(de[DIM_ANNO]).toBe(`Beschriftung (Skalierung folgt ${de['주석 축척']})`);
    // 거꾸로 찾기
    for (const k of ['외부 참조 축척 숨기기', '과학 축척', '뷰포트 축척 보기', RESET_TIP, PLOT_BAD, DIM_ANNO]) expect(sourceMessage(de[k]!), k).toBe(k);
  });

  it('그대로: 축척 비율·크기 바꾸기 뜻(표본), 주석 특성 켜기 안내, 공유 열쇠 「주석」(설명 Comments 자리)', () => {
    expect(de['축척 비율(S)']).toBe('Skalierfaktor (S)');
    expect(de['X 축척 비율 지정 <{0}>:']).toBe('Geben Sie den X-Skalierungsfaktor <{0}> an:');
    expect(de['삽입점 지정 또는 [축척(S)/회전(R)]:']).toBe('Geben Sie den Einfügepunkt oder [Skalierung(S)/Rotation(R)] an:');
    expect([de['선종류 축척'], de['전역 축척(LTSCALE)']]).toEqual(['Linientypskala', 'Globale Skalierung (LTSCALE)']);
    expect(de['** 축척 **']).toBe('** SKALIEREN **');
    // MVSETUP 뷰포트 축척(S) = 뷰포트 크기 맞추기 동작(통째가 Ansichtsfenster skalieren)
    expect(de[MVSETUP_OPT]).toContain('/Ansichtsfenster skalieren (S)/');
    // 주석 해치 안내의 「주석 축척은 특성 팔레트에서 켜십시오」 = 주석 특성 켜기(영어 annotative property) — 비율 이름이 아니다
    expect(de[HATCH_NOTE]).toContain('aktivieren Sie die Beschriftungsskalierung');
    expect(en[HATCH_NOTE]).toContain('annotative property');
    // 공유 열쇠 「주석」: 주석 특성 자리와 함께 FIELD 문서 특성 Comments·DWGPROPS 설명 칸이 쓴다
    expect(src('app/fieldcmds.ts')).toContain("{ id: 'Comments', cat: 'doc', label: '주석', kind: 'text' }");
    expect(src('app/dwgprops.ts')).toContain("areaIn(cur.comments, '주석', 3)");
    expect(de['주석']).toBe('Anmerkungen');
  });
});
