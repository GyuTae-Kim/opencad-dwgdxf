/**
 * 315차: 세 언어 사전 안에서 갈린 「고도(elevation)」 낱말 통일(리드 결정 — WCAG 3.2.4 같은 것을 같은 이름으로, 308·313차 꼴).
 * 원문에 「고도」가 든 열쇠 16개는 모두 CAD 고도(Z — 특성 팔레트·LIST 칸, ELEV·ELEVATION·OSNAPZ, RECTANG 고도(E), FLATTEN, STATUS, 배열 행 고도 증분)다.
 * - 독일어: Höhe(11 열쇠)·Standardhöhe·Erhöhung은 「높이」 Höhe와 같은 이름이라(특성 팔레트의 LWPOLYLINE 고도 칸과 문자 높이 칸이 같은 낱말),
 *   AutoCAD 독일어판 ELEVATION 낱말 Erhebung(같은 사전 OSNAPZ 세 열쇠)으로. 둘 다 여성 명사라 관사·어미 그대로, 합성어 Standarderhebung·Erhebungsunterschied.
 * - 일본어: 標高(7 열쇠)를 AutoCAD 일본어판 ELEVATION 특성 낱말 高度(같은 사전 9 열쇠)로 — 「높이」는 高さ.
 * - 중국어: 高程(9 열쇠)을 AutoCAD 중국어판 ELEVATION 특성 낱말 标高(같은 사전 7 열쇠 — 314차 FLATTEN 결과 줄)로 — 「높이」는 高度.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceMessage } from '../site/i18n.mjs';

const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const de = load('de');
const ja = load('ja');
const zh = load('zh-CN');
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

/** 원문에 「고도」가 든 열쇠(모두 CAD 고도 뜻) */
const ELEV = Object.keys(de).filter((k) => k.includes('고도'));
/** FLATTEN 리본 풍선·결과 줄 */
const RIBBON = 'Z·고도·두께를 0으로 (FLATTEN)';
const FLAT = '객체 {0}개를 평면화했습니다(Z·고도·두께 = 0).';
/** ELEVATION 설명·ELEV 프롬프트 */
const NEW_OBJ = '새 객체의 고도';
const ELEV_ASK = '새 기본 고도 지정 <{0}>:';
/** RECTANG 고도(E) 프롬프트와 첫 프롬프트(통째) */
const RECT_ASK = '직사각형의 고도 지정';
const RECT = '첫 번째 구석점 지정 또는 [모따기(C)/고도(E)/모깎기(F)/두께(T)/폭(W)]:';
/** 배열 특성 칸과 ARRAYEDIT 행(R) 프롬프트(앞 조각·통째) */
const ROW_CELL = '행 고도 증분';
const ROW_HEAD = '행 사이의 증분 고도 지정 또는 [';
const ROW = '행 사이의 증분 고도 지정 또는 [표현식(E)] <{0}>:';
/** STATUS */
const STATUS = '현재 고도:';

describe('세 언어 사전 안에서 갈린 고도 낱말 통일(315차 리드 결정)', () => {
  it('원문에 고도가 든 열쇠 16개는 모두 CAD 고도다(쓰는 곳)', () => {
    expect(ELEV).toHaveLength(16);
    expect(src('app/propedit.ts')).toContain("scalar('고도', 'elevation'),");
    expect(src('app/inquiry.ts')).toContain("if (e.elevation) geo.push({ k: '고도', v: L(e.elevation) });");
    expect(src('app/draw.ts')).toContain("{ key: 'E', label: '고도' }");
    expect(src('app/draw.ts')).toContain(`'${RECT_ASK}'`);
    expect(src('app/sysvars.ts')).toContain(`ELEVATION: '${NEW_OBJ}',`);
    expect(src('app/editcmds2-query.ts')).toContain('`새 기본 고도 지정 <${show(e0)}>:`');
    expect(src('app/assocarray-ui.ts')).toContain(`label: '${ROW_CELL}'`);
    expect(src('app/util2-misc.ts')).toContain(`padWide('${STATUS}', 16)`);
  });

  it('독일어: 고도 값에 Höhe 꼴(Höhe·Standardhöhe·Erhöhung·Höhenunterschied)이 없고 Erhebung이다 — 「높이」 Höhe와 갈림', () => {
    for (const k of ELEV) {
      expect(de[k], k).not.toMatch(/höh/i);
      expect(de[k], k).toMatch(/erhebung/i);
    }
    // 같은 사전의 근거: OSNAPZ 「현재 고도」 aktuelle Erhebung
    expect(de['Z 값을 현재 고도로 대체']).toBe('Z-Wert durch aktuelle Erhebung ersetzen');
    expect([de['고도'], de['고도(E)'], de['고도={0}'], de[STATUS]]).toEqual(['Erhebung', 'Erhebung (E)', 'Erhebung={0}', 'Aktuelle Erhebung:']);
    expect(de[NEW_OBJ]).toBe(de['새 객체의 두께']!.replace(de['두께']!, de['고도']!));
    expect(de[ELEV_ASK]).toBe('Neue Standarderhebung angeben <{0}>:');
    expect(de[RECT_ASK]).toBe('Erhebung des Rechtecks festlegen');
    expect(de[RECT]).toBe('Ersten Eckpunkt angeben oder [Fase(C)/Erhebung(E)/Abrundung(F)/Dicke(T)/Breite(W)]:');
    expect(de[RIBBON]).toBe('Setzen Sie Z, Erhebung und Dicke auf 0 (FLATTEN).');
    expect(de[FLAT]).toBe('Abgeflachte {0} Objekte (Z·Erhebung·Dicke = 0).');
    expect([de[ROW_CELL], de[ROW_HEAD], de[ROW]]).toEqual([
      'Erhebungsunterschied zwischen Zeilen',
      'Erhebungsunterschied zwischen Zeilen angeben oder [',
      'Erhebungsunterschied zwischen Zeilen angeben oder [Ausdruck(E)] <{0}>:',
    ]);
    // 높이(height)는 Höhe 그대로 — 특성 팔레트의 LWPOLYLINE 고도 칸과 문자 높이 칸이 다른 이름이 된다
    expect(src('app/propedit.ts')).toContain("scalar('높이', 'height', 'length', true),");
    expect([de['높이'], de['도면 높이(P)']]).toEqual(['Höhe', 'Papierhöhe (P)']);
    expect(de['고도']).not.toBe(de['높이']);
  });

  it('일본어: 고도 값에 標高가 없고 高度다 — 「높이」 高さ와 갈림', () => {
    for (const k of ELEV) {
      expect(ja[k], k).not.toContain('標高');
      expect(ja[k], k).toContain('高度');
    }
    // 같은 사전의 근거: 고도·고도(E)·OSNAPZ
    expect([ja['고도'], ja['고도(E)'], ja['Z 값을 현재 고도로 대체']]).toEqual(['高度', '高度(E)', 'Z 値を現在の高度に置き換え']);
    expect(ja[NEW_OBJ]).toBe(ja['새 객체의 두께']!.replace(ja['두께']!, ja['고도']!));
    expect(ja[ELEV_ASK]).toBe(ja['새 기본 두께 지정 <{0}>:']!.replace(ja['두께']!, ja['고도']!));
    expect([ja[RECT_ASK], ja[ROW_CELL], ja[STATUS]]).toEqual(['長方形の高度を指定', '行の高度の増分', '現在の高度:']);
    expect(ja[ROW]).toBe(`${ja[ROW_HEAD]}式(E)] <{0}>:`);
    expect(ja[RECT]).toContain(`/${ja['고도(E)']}/`);
    expect(ja['높이']).toBe('高さ');
  });

  it('중국어: 고도 값에 高程이 없고 标高다 — 「높이」 高度와 갈림', () => {
    for (const k of ELEV) {
      expect(zh[k], k).not.toContain('高程');
      expect(zh[k], k).toContain('标高');
    }
    expect([zh['고도'], zh['고도(E)'], zh['고도={0}']]).toEqual(['标高', '标高(E)', '标高={0}']);
    // RECTANG 통째 프롬프트(같은 사전의 근거)와 옵션 조각이 같은 낱말
    expect(zh[RECT]).toContain(`/${zh['고도(E)']}/`);
    expect(zh[ELEV_ASK]).toBe(zh['새 기본 두께 지정 <{0}>:']!.replace(zh['두께']!, zh['고도']!));
    expect([zh[NEW_OBJ], zh[RECT_ASK], zh[ROW_CELL], zh[ROW_HEAD]]).toEqual(['新的对象标高', '指定矩形标高', '行间标高增量', '指定行间增量标高或 [']);
    expect(zh[ROW]).toBe(`${zh[ROW_HEAD]}表达式(E)] <{0}>:`);
    expect(zh['높이']).toBe('高度');
    expect(zh['고도']).not.toBe(zh['높이']);
  });

  it('거꾸로 찾기: 바꾼 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const changed: [Record<string, string>, string[]][] = [
      [de, [RIBBON, FLAT, '고도', '고도(E)', '고도={0}', NEW_OBJ, ELEV_ASK, RECT_ASK, RECT, ROW_CELL, ROW_HEAD, ROW, STATUS]],
      [ja, [NEW_OBJ, ELEV_ASK, RECT_ASK, ROW_CELL, ROW_HEAD, ROW, STATUS]],
      [zh, ['고도', '고도(E)', '고도={0}', NEW_OBJ, ELEV_ASK, RECT_ASK, ROW_CELL, ROW_HEAD, ROW]],
    ];
    for (const [d, keys] of changed) for (const k of keys) expect(sourceMessage(d[k]!), k).toBe(k);
  });
});
