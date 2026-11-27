/**
 * 309차: 리드 결정(독일어 파라메트릭 구속 Beschränkung → Abhängigkeit)과 이미지·PDF 언더레이·도면 비교·계산기 묶음의 번역 대조·빠진 번역.
 * - 리드 결정: 308차가 남긴 독일어 셋째 갈래 Beschränkung 가운데 파라메트릭 구속(치수 구속 무리·각도 구속점·점 구속·참조 구속)을 308차와 같은 근거
 *   (AutoCAD 독일어판 Bemaßungsabhängigkeit·Abhängigkeit, 같은 사전 91곳)로 Abhängigkeit로. QLEADER 지시선 각도 구속(app/annotate.ts — 세그먼트 각 제한,
 *   300차 시험이 Winkelbeschränkung으로 고정)과 LIMITS 「도면 공간 한계」(한계 — 구속이 아님)는 그대로.
 * - 빠진 번역: -COMPARE 설정 명령행 조각(「문자 비교 [」 등)·앞에 표시 옵션·PDFADJUST 단색 물음, 틀이 한국어를 잡는 기록 줄(반전 자르기 켜짐·꺼짐,
 *   -IMAGEADJUST 밝기·흐리기 값, 같은 계보 꼬리, 비교 요약, 다시 비교 줄, PDFLAYERS 제목의 쪽)이 네 언어 모두 한국어로 남았다.
 * - 오역: 흐리기(fade — 바탕색으로 섞음, 흐림 blur가 아님)·대비 comparison·단색 Solid·높음 Height·CLIP 切り取る(= 잘라내기 CUT)·자르기 修剪(= TRIM),
 *   도면 비교의 핸들 Griff·手柄·맞추기 fit·拟合·저장한 사람 Speichern bis·뜻이 거꾸로 된 외부 참조 비교 요약 등 — 같은 사전 안의 맞는 번역으로.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultWord, guardedTranslate, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
/** 명령행·휴대폰 카드·커서 옆에 보이는 꼴(통째 번역 + 옵션 이름인 기본값 — fileguard translateTail) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));

/** 비교 요약 틀(app/compare.ts summary)·괄호·다시 비교 줄·외부 참조 비교 요약(edit/viewtools/xcompare.ts) */
const S = '현재 도면에서만 {0}개, 비교 도면에서만 {1}개, 차이 없음 {2}개, 변경 세트 {3}개{4}.';
const S4 = '현재 도면에서만 {0}개, 비교 도면에서만 {1}개, 차이 없음 {2}개, 변경 세트 {3}개 (비교하지 않은 문자·해치 {4}개).';
const AGAIN = '다시 비교했습니다: {0}';
const XS = '현재 외부 참조에서만 {0}개, 현재 외부 참조에 없음 {1}개, 변경 세트 {2}개.';
/** 같은 계보 꼬리(COMPARE ·XCOMPARE 결과 줄) */
const LIN1 = ', 같은 계보 — 핸들로 맞춤';
const LIN2 = '(같은 계보 — 핸들로 맞춤)';
const CMP = '"{0}"과(와) "{1}"을(를) 비교했습니다(맞추기 {2}ms, 그리기 {3}ms{4}).';
const XCMP = '외부 참조 "{0}"을(를) 비교했습니다: 이전 "{1}", 현재 "{2}"{3}.';
/** 흐리기(fade)가 든 열쇠 */
const FADE = [
  '흐리기',
  '흐리기(F)',
  '<흐리기>:',
  '흐리기(0-100)',
  '흐리기 값 입력 (0-80) <{0}>:',
  '이미지 옵션 입력 [대비(C)/흐리기(F)/밝기(B)] <밝기>:',
  'PDF 언더레이 옵션 입력 [흐리기(F)/대비(C)/단색(M)] <흐리기>:',
];
const KEEP = '경계를 유지하시겠습니까?';

describe('이미지·PDF 언더레이·도면 비교·계산기 묶음의 번역과 리드 결정(309차)', () => {
  it('리드 결정: 독일어 파라메트릭 구속의 Beschränkung은 Abhängigkeit다(QLEADER 지시선 각도 구속·LIMITS 한계는 그대로)', () => {
    const de = dict.de;
    // 소스: 각도 구속점은 DCANGULAR(app/constraints.ts), 각도 구속 입력은 QLEADER 지시선 세그먼트 각(app/annotate.ts)
    expect(src('app/constraints.ts')).toContain("pickPoint(app, ctx, '첫 번째 각도 구속점 지정:', hl)");
    expect(src('app/annotate.ts')).toContain("${first ? '첫 번째' : '두 번째'} 각도 구속 입력 <");
    const QLEADER = ['첫 번째 각도 구속 입력 <{0}>:', '두 번째 각도 구속 입력 <{0}>:', '{0} 각도 구속 입력 <{1}>:'];
    const keys = Object.keys(de).filter((k) => k.includes('구속'));
    expect(keys.filter((k) => /[Bb]eschränk/.test(de[k]!)).sort()).toEqual([...QLEADER].sort());
    // 대표 값(합성어·복수·관사와 형용사 어미 — 둘 다 여성 명사)
    expect(de['치수 구속조건']).toBe('Bemaßungsabhängigkeiten');
    expect(de['수평 치수 구속조건']).toBe('Horizontale Bemaßungsabhängigkeit');
    expect(de['수직 치수 구속조건']).toBe('Vertikale Bemaßungsabhängigkeit');
    expect(de['선형 치수 구속']).toBe(de['선형 치수 구속조건']);
    expect(de['각도 치수 구속조건']).toBe('Winkelbemaßungsabhängigkeiten');
    expect(de['첫 번째 각도 구속점 지정:']).toBe('Geben Sie den ersten Winkelabhängigkeitspunkt an:');
    expect(de['두 번째 각도 구속점 지정:']).toBe('Geben Sie den zweiten Winkelabhängigkeitspunkt an:');
    // 동적 치수 구속은 같은 사전의 「치수 구속」 낱말 Bemaßungs-(Maß- 줄임이 아니다 — 한 물건 한 이름)
    expect(de['동적 치수 구속 표시·숨기기']).toBe(`Dynamische ${de['치수 구속조건']} ein-/ausblenden`);
    expect(de['치수 구속·사용자 매개변수 (PAR)']).toBe(`${de['치수 구속조건']} · Benutzerparameter (PAR)`);
    expect(de['치수 구속조건 만들지 않음']).toBe(`Keine ${de['치수 구속조건']} erstellen`);
    expect(de['치수 구속조건을 추가하면 형상이 과도하게 구속됩니다.']).toContain(`von ${de['치수 구속조건']} `);
    expect(de['스플라인 위의 점 구속조건은 지원하지 않습니다.']).toBe('Punktabhängigkeiten für Splines werden nicht unterstützt.');
    expect(de['참조 구속조건 만들기']).toBe('Referenzabhängigkeit erstellen');
    // 같은 사전의 근거(308차): 구속 Abhängigkeit
    expect(de['자동 구속']).toBe('Automatische Abhängigkeit');
    // 거꾸로 찾기: 바꾼 값이 제 원문으로 돌아온다
    for (const k of ['치수 구속조건', '수평 치수 구속조건', '각도 치수 구속조건', '첫 번째 각도 구속점 지정:', '참조 구속조건 만들기', '동적 치수 구속 표시·숨기기']) {
      expect(sourceMessage(de[k]!), k).toBe(k);
    }
    // 그대로: QLEADER 각도 구속 입력(300차). LIMITS 「도면 공간 한계」(한계 — 구속이 아니다)는 310차가 「모형 공간 한계」 꼴 Grenzen으로 고쳤다
    expect(de['첫 번째 각도 구속 입력 <{0}>:']).toBe('Erste Winkelbeschränkung eingeben <{0}>:');
    expect(de['도면 공간 한계 재설정:']).toBe('Papierbereichsgrenzen zurücksetzen:');
  });

  it('-COMPARE 설정·앞에 표시·PDFADJUST 단색·반전 자르기·-IMAGEADJUST 값·비교 결과와 요약·PDFLAYERS 제목이 네 언어 모두 한국어 없이 보인다', () => {
    const cmp = src('app/compare.ts');
    for (const s of [
      "return onOff(ctx, '문자 비교', 'COMPARETEXT');",
      "return onOff(ctx, '해치 비교', 'COMPAREHATCH');",
      "return onOff(ctx, '구름형 리비전', 'COMPARESHOWRC');",
      "return choice(ctx, '구름형 리비전 쉐이프', 'COMPARERCSHAPE', [",
      "return choice(ctx, '앞에 표시', 'COMPAREFRONT', [",
      "{ key: 'C', label: '현재 도면', value: 1 },",
      "{ key: 'O', label: '비교 도면', value: 2 },",
      "`${prompt} [켜기(ON)/끄기(OFF)] <${cur ? '켜기' : '끄기'}>:`",
      "`${prompt} [${opts.map((o) => `${o.label}(${o.key})`).join('/')}] <${def}>:`",
      "${r.sameLineage ? ', 같은 계보 — 핸들로 맞춤' : ''}).`",
      "변경 세트 ${s.sets.length}개${f ? ` (비교하지 않은 문자·해치 ${f}개)` : ''}.`",
      '`다시 비교했습니다: ${summary(s)}`',
    ])
      expect(cmp, s).toContain(s);
    const xc = src('app/xcompare.ts');
    for (const s of ['`다시 비교했습니다: ${xcompareSummary(this.diff!, this.sets.length)}`', "${d.sameLineage ? '(같은 계보 — 핸들로 맞춤)' : ''}.`"]) expect(xc, s).toContain(s);
    expect(src('edit/viewtools/xcompare.ts')).toContain('`현재 외부 참조에서만 ${d.onlyNew.length}개, 현재 외부 참조에 없음 ${d.onlyOld.length}개, 변경 세트 ${sets}개.`');
    expect(src('app/imageclip.ts')).toContain("ctx.print(`반전 자르기 상태가 ${inverted ? '켜짐' : '꺼짐'}입니다.`);");
    const img = src('app/editcmds2-image.ts');
    for (const s of [
      "const what = k === 'C' ? '대비' : k === 'F' ? '흐리기' : '밝기';",
      '`${what} 값 입력 (0-100) <${def}>:`',
      "askYN(ctx, '단색?', cur.monochrome)",
      "`PDF 언더레이 도면층 — ${src.file}${src.page > 1 ? ` (${src.page}쪽)` : ''}`",
    ])
      expect(img, s).toContain(s);
    expect(src('app/dashcmds-ask.ts')).toContain("`${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`");
    // 명령행 조각(앞 글·옵션)
    const PIECES = ['문자 비교 [', '해치 비교 [', '구름형 리비전 [', '구름형 리비전 쉐이프 [', '앞에 표시 [', '현재 도면(C)', '비교 도면(O)', '단색? ['];
    // 통째(커서 옆·휴대폰 카드)와 기록 줄
    const LINES = [
      '문자 비교 [켜기(ON)/끄기(OFF)] <켜기>:',
      '해치 비교 [켜기(ON)/끄기(OFF)] <끄기>:',
      '구름형 리비전 [켜기(ON)/끄기(OFF)] <켜기>:',
      '구름형 리비전 쉐이프 [직사각형(R)/폴리곤(P)] <직사각형>:',
      '앞에 표시 [현재 도면(C)/비교 도면(O)] <현재 도면>:',
      '단색? [예(Y)/아니오(N)] <아니오>:',
      '반전 자르기 상태가 켜짐입니다.',
      '반전 자르기 상태가 꺼짐입니다.',
      '밝기 값 입력 (0-100) <50>:',
      '흐리기 값 입력 (0-100) <0>:',
      `"${ft('a.dwg')}"과(와) "${ft('b.dwg')}"을(를) 비교했습니다(맞추기 12ms, 그리기 34ms, 같은 계보 — 핸들로 맞춤).`,
      `외부 참조 "${ft('X')}"을(를) 비교했습니다: 이전 "${ft('x1.dwg')}", 현재 "${ft('x2.dwg')}"(같은 계보 — 핸들로 맞춤).`,
      '현재 도면에서만 3개, 비교 도면에서만 2개, 차이 없음 5개, 변경 세트 1개 (비교하지 않은 문자·해치 4개).',
      '다시 비교했습니다: 현재 도면에서만 3개, 비교 도면에서만 2개, 차이 없음 5개, 변경 세트 1개.',
      '다시 비교했습니다: 현재 도면에서만 3개, 비교 도면에서만 2개, 차이 없음 5개, 변경 세트 1개 (비교하지 않은 문자·해치 4개).',
      '다시 비교했습니다: 현재 외부 참조에서만 2개, 현재 외부 참조에 없음 1개, 변경 세트 2개.',
      'PDF 언더레이 도면층 — plan.pdf (2쪽)',
    ];
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of PIECES) if (HANGUL.test(translate(s, l))) left.push(`${l}: ${translate(s, l)}`);
      const dw = defaultWord('] <현재 도면>:', ['현재 도면(C)', '비교 도면(O)'], (s) => translate(s, l));
      if (!dw || HANGUL.test(dw.to)) left.push(`${l}: ] <현재 도면>: → ${dw?.to}`);
      for (const s of LINES) if (HANGUL.test(show(l)(s))) left.push(`${l}: ${show(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show('en')('문자 비교 [켜기(ON)/끄기(OFF)] <켜기>:')).toBe('Text comparison [ON/OFF] <ON>:');
    expect(show('de')('앞에 표시 [현재 도면(C)/비교 도면(O)] <현재 도면>:')).toBe('Im Vordergrund anzeigen [Aktuelle Zeichnung (C)/Vergleichszeichnung (O)] <Aktuelle Zeichnung>:');
    expect(show('zh-CN')('단색? [예(Y)/아니오(N)] <아니오>:')).toBe('单色？[是(Y)/否(N)] <否>：');
    expect(show('ja')('반전 자르기 상태가 꺼짐입니다.')).toBe('[クリップを反転]はオフです。');
    expect(show('ja')('흐리기 값 입력 (0-100) <0>:')).toBe('フェード値を入力 (0-100) <0>:');
    expect(show('de')(LINES[10]!)).toBe('Verglichen „a.dwg“ mit „b.dwg“ (12ms abgleichen, 34ms zeichnen, gleiche Abstammung – nach Handle abgeglichen).');
    expect(show('en')(LINES[12]!)).toBe('In the current drawing only: 3; in the comparison drawing only: 2; no differences: 5; change sets: 1 (4 text and hatch objects not compared).');
    expect(show('en')(LINES[15]!)).toBe('Comparison again: 2 only in current external reference, 1 not in current external reference, 2 change sets.');
    expect(show('zh-CN')(LINES[16]!)).toBe('PDF 参考底图图层 — plan.pdf（第 2 页）');
  });

  it('고친 번역은 같은 사전의 낱말이다(흐리기 fade·대비·단색·높음·자르기·도면 비교·외부 참조 비교·이미지 테두리·계산기)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 흐리기 = 페이드(render/webgl.ts: 바탕색으로 섞는다 — 흐림 blur가 아니다). 근거: 영어·일본어 「<흐리기>:」, 중국어·독일어 XFADECTL 안내(淡入·abgeblendet)
    const XF = '{0}을(를) 내부 편집합니다. 작업 세트 {1}개(나머지는 XFADECTL {2}%로 흐리게). 끝내려면 REFCLOSE 또는 띠의 "변경 사항 저장"·"변경 사항 취소"를 쓰십시오.';
    expect(src('render/webgl.ts')).toContain('rgb = mix(rgb, u_bg, u_bcf.z / 100.0);');
    expect([en['<흐리기>:'], ja['<흐리기>:']]).toEqual(['<Fade>:', '<フェード>:']);
    expect(zh[XF]).toContain('淡入');
    expect(de[XF]).toContain('abgeblendet');
    const word: Record<Lang, RegExp> = { en: /Fade|fade/, de: /Abblend/, ja: /フェード/, 'zh-CN': /淡入度/ };
    for (const l of LANGS) {
      for (const k of FADE) {
        expect(dict[l][k], `${l}: ${k}`).toMatch(word[l]);
        expect(dict[l][k], `${l}: ${k}`).not.toMatch(/Blur|Weichzeichnen|Unschärfe|ぼかし|模糊/);
      }
      expect(strip(dict[l]['흐리기(F)']), l).toBe(dict[l]['흐리기']);
      // 단색(PDF 언더레이 monochrome — 단색 채우기 Solid가 아니다)·높음(IMAGEQUALITY high — 높이가 아니다)
      expect(strip(dict[l]['단색(M)']), l).toBe(dict[l]['단색']);
      expect(dict[l]['단색?']!.startsWith(dict[l]['단색']!), l).toBe(true);
      expect(strip(dict[l]['높음(H)']), l).toBe(dict[l]['높음']);
    }
    // 대비 = 이미지·PDF 언더레이 contrast(그 둘만 쓴다 — 비교 comparison이 아니다)
    expect(src('app/editcmds2-image.ts')).toContain("{ key: 'C', label: '대비' },");
    expect([en['대비'], de['대비']]).toEqual([en['대비(0-100)']!.replace(' (0-100)', ''), de['대비(0-100)']!.replace(' (0-100)', '')]);
    expect(zh['단색']).toBe('单色');
    expect(zh['PDF 언더레이 옵션 입력 [흐리기(F)/대비(C)/단색(M)] <흐리기>:']).toContain(`${zh['단색']} (M)`);
    // 자르기(CLIP): 일본어 クリップ(切り取り는 잘라내기 CUT), 독일어 Zuschneiden(Ausschneiden은 잘라내기), 중국어 剪裁(修剪은 TRIM)
    expect([ja['잘라내기'], de['잘라내기']]).toEqual(['切り取り', 'Ausschneiden']);
    for (const k of ['자를 PDF 언더레이 선택:', '자를 객체 선택:', '자를 이미지 선택:']) expect(ja[k], k).toMatch(/^クリップする/);
    expect(ja['자를 이미지 선택:']).toBe(`クリップする${ja['이미지 선택:']}`.replace('をを', 'を'));
    expect(de['자를 이미지 선택:']).toBe(de['자를 객체 선택:']!.replace('Objekt', 'Bild'));
    expect(zh['자르기 경계가 없습니다.']).toBe(`无${zh['자르기\u{2060}']}边界。`);
    expect(de['이미지 {0}개에 적용합니다.']).toBe('Wird auf {0} Bilder angewendet.');
    expect(zh['PDF 파일({0})이 연결되지 않았습니다. EXTERNALREFERENCES(XR)에서 파일을 연결하십시오.']).toBe('PDF 文件 ({0}) 未连接。请在 EXTERNALREFERENCES (XR) 中链接文件。');
    // -COMPARE 설정 통째 = 옵션 조각의 낱말(특성 Properties·Eigenschaften, 앞 Vordergrund·前置, 구름형 리비전 雲型リビジョン·云状修订)
    const SET = '설정 옵션 입력 [문자(T)/해치(H)/특성(P)/허용 오차(O)/구름형 리비전(R)/쉐이프(S)/여백(M)/앞(F)]:';
    expect(en[SET]).toContain('/Properties (P)/');
    expect(de[SET]).toContain(`/${de['특성(P)']}/`);
    expect(de[SET]).toContain(`/${de['앞(F)']}]`);
    expect(ja[SET]).toContain(`/${ja['구름형 리비전']}(R)/`);
    expect(zh[SET]).toContain(`/${zh['구름형 리비전']}(R)/`);
    expect(zh[SET]).toContain(`/${zh['앞(F)']}]`);
    const SNAP = '스냅샷 "{0}"을(를) 열었습니다: 현재 도면에서만 {1}개, 차이 없음 {2}개, 비교 도면에서만 {3}개, 구름형 리비전 {4}개. QSAVE나 SAVEAS로 저장하십시오.';
    expect(ja[SNAP]).toContain(`${ja['구름형 리비전']} {4}個`);
    expect(zh[SNAP]).toContain(`{4} 个${zh['구름형 리비전']}`);
    for (const d of [ja, zh]) expect([d[SNAP], d[SET]].join('')).not.toMatch(/雲マーク|云版本|云图修订/);
    expect(zh['비교된 도면에만 있는 객체가 없습니다.']).toBe('没有仅存在于比较图纸中的对象。');
    // 같은 계보 꼬리: 핸들 = 객체 핸들(de Handle·zh 句柄 — 그립 Griff·手柄이 아니다), 맞추기 = 짝 맞춤(matched·abgleichen·匹配 — fit·拟合이 아니다)
    for (const k of [LIN1, LIN2]) {
      expect(en[k], k).toContain('matched by handle');
      expect(de[k], k).toContain(`nach ${de['핸들']} abgeglichen`);
      expect(zh[k], k).toContain(`按${zh['핸들']}匹配`);
      expect([en[k], de[k], zh[k]].join(''), k).not.toMatch(/fit|Griff|Passform|手柄/);
    }
    expect(ja[LIN2]).toBe(`（${ja[LIN1]!.replace(/^、/, '')}）`);
    expect(en[CMP]).toContain('(match {2}ms, ');
    expect(de[CMP]).toBe('Verglichen „{0}“ mit „{1}“ ({2}ms abgleichen, {3}ms zeichnen{4}).');
    expect(de['주석 축척 맞추기 실패']).toContain('Abgleich');
    expect(zh[CMP]).toContain('（匹配{2}ms，');
    expect(de['저장한 사람']).toBe(de['작성자']!.replace('Erstellt', 'Gespeichert'));
    expect(en['{0}개를 가져왔습니다.']).toBe('Imported {0}.');
    expect(en['도면층 상태 {0}개를 가져왔습니다: {1}']!.startsWith('Imported')).toBe(true);
    expect(de['{0}개를 가져왔습니다.']).toBe('{0} importiert.');
    expect(de['앞에 표시']).toBe(`Im ${strip(de['앞(F)'])} anzeigen`);
    expect(zh['앞에 표시']).toBe(`${strip(zh['앞(F)'])}显示`);
    // -COMPARE 옵션 통째 = 조각(독일어 설정 Einstellungen — Festlegen이 아니다), 중국어 기본값 = 「다음(N)」 이름
    const OPT = ['다음(N)', '이전(P)', '설정(S)', '가져오기(I)', '내보내기(E)', '정보(F)', '닫기(C)'];
    const WHOLE = `옵션 입력 [${OPT.join('/')}] <다음>:`;
    expect(de[WHOLE]).toBe(`${de['옵션 입력 [']}${OPT.map((k) => de[k]).join('/')}${de['] <다음>:']}`);
    expect(zh[WHOLE]!.endsWith(`<${strip(zh['다음(N)'])}>:`)).toBe(true);
    expect(strip(zh['가져오기(I)'])).toBe(zh['가져오기']);
    expect(zh['도면 비교 정보']).toBe(zh['도면 비교 정보(COMPAREINFO)']!.replace(' (COMPAREINFO)', ''));
    expect(zh['비교 도면의 객체 가져오기(COMPAREIMPORT)']).toBe(`${zh['비교 도면의 객체 가져오기']} (COMPAREIMPORT)`);
    expect(de['열린 도면']).toBe('Geöffnete Zeichnungen');
    expect(zh['열린 도면']).toBe(`${zh['열린 도면 목록']!.slice(0, 4)}图形`);
    expect(de['비교할 도면 이름 입력 <찾아보기>:']).toContain('<Durchsuchen>');
    expect(zh['비교할 도면 이름 입력 <찾아보기>:']).toContain('<浏览>');
    expect([de['찾아보기(B)...'], zh['찾아보기(B)...']]).toEqual(['Durchsuchen (B)...', '浏览(B)...']);
    // 외부 참조 비교: 닫기 단추 = 「도면 비교 닫기」 꼴, 외부 참조 externe Referenz(Verweis가 아니다), 변경 세트, 요약의 「없음」(뜻이 거꾸로였다)
    expect(de['외부 참조 비교 닫기']).toBe(de['도면 비교 닫기']!.replace('Zeichnungsvergleich', 'Vergleich externer Referenzen'));
    expect(de['외부 참조 비교를 닫았습니다.']).toBe(de['도면 비교를 닫았습니다.']!.replace('Zeichnungsvergleich', 'Vergleich externer Referenzen'));
    expect(de[XCMP]).toBe('Externe Referenz „{0}“ verglichen: vorherige „{1}“, aktuelle „{2}“{3}.');
    expect(zh[XCMP]).toBe('已比较外部参照“{0}”：先前“{1}”，当前“{2}”{3}。');
    for (const k of ['외부 참조 비교: 다음 변경 세트', '외부 참조 비교: 이전 변경 세트']) {
      expect(de[k], k).toContain(de['변경 세트']!);
      expect(zh[k], k).toContain(zh['변경 세트']!);
    }
    const CHANGED = '외부 참조 "{0}"이(가) 바뀌었습니다(현재 외부 참조에서만 {1}개, 현재 외부 참조에 없음 {2}개). XCOMPARE로 바뀐 내용을 비교할 수 있습니다.';
    expect(zh[CHANGED]).toContain('{2} 不在当前外部参照中');
    expect(en[XS]).toBe(`{0} ${en['현재 외부 참조에서만']!.toLowerCase()}, {1} ${en['현재 외부 참조에 없음']!.toLowerCase()}, {2} change sets.`);
    expect(de[XS]).toContain('{1} nicht in aktuellen externen Referenzen');
    expect(zh[XS]).toBe('{0} 项仅存在于当前外部参照中，{1} 项不在当前外部参照中，{2} 个更改集。');
    expect(ja[XS]).toBe(`${ja['현재 외부 참조에서만']}: {0}個、${ja['현재 외부 참조에 없음']}: {1}個、${ja['변경 세트']}: {2}個。`);
    for (const k of ['현재 외부 참조에서만', '현재 외부 참조에 없음']) expect(ja[CHANGED], k).toContain(ja[k]!);
    expect([zh[CHANGED], zh[XS], zh['외부 참조 비교: 다음 변경 세트']].join('')).not.toMatch(/也存在于|项存在于当前|变更集/);
    // 이미지 테두리(IMAGEFRAME) = 「가리기 테두리」(WIPEOUTFRAME) 꼴, 계산기(명령행) = 「계산기」·「(명령행)」
    expect(en['이미지 테두리']).toBe(en['가리기 테두리']!.replace('Wipeout', 'Image'));
    expect(de['이미지 테두리']).toBe(de['가리기 테두리']!.replace('Abdeckungs', 'Bild'));
    expect(ja['이미지 테두리']).toBe(ja['가리기 테두리']!.replace('ワイプアウト', 'イメージ'));
    expect(ja['계산기(명령행)']).toBe(`${ja['계산기']}（${ja['이미지 조정(명령행)']!.split('（')[1]}`);
  });

  it('새 열쇠는 조각·틀 번역에서 만든 꼴이다(비교 설정 조각·통째, 단색 물음, 반전 자르기, 밝기·흐리기 값, 계보 꼬리, 요약, PDFLAYERS 제목)', () => {
    for (const l of LANGS) {
      const d = dict[l];
      for (const n of ['문자 비교', '해치 비교', '구름형 리비전', '구름형 리비전 쉐이프', '앞에 표시']) expect(d[`${n} [`], `${l}: ${n}`).toBe(`${d[n]} [`);
      const opt = (n: string, k: string) => (l === 'en' || l === 'de' ? `${d[n]} (${k})` : `${d[n]}(${k})`);
      expect([d['현재 도면(C)'], d['비교 도면(O)']], l).toEqual([opt('현재 도면', 'C'), opt('비교 도면', 'O')]);
      const W = d['{0} [켜기(ON)/끄기(OFF)] <{1}>:']!;
      for (const n of ['문자 비교', '해치 비교', '구름형 리비전']) expect(d[`${n} [켜기(ON)/끄기(OFF)] <{0}>:`], `${l}: ${n}`).toBe(W.replace('{0}', d[n]!).replace('{1}', '{0}'));
      const end = l === 'zh-CN' ? '] <{0}>：' : '] <{0}>:';
      expect(d['구름형 리비전 쉐이프 [직사각형(R)/폴리곤(P)] <{0}>:'], l).toBe(`${d['구름형 리비전 쉐이프 [']}${d['직사각형(R)']}/${d['폴리곤(P)']}${end}`);
      expect(d['앞에 표시 [현재 도면(C)/비교 도면(O)] <{0}>:'], l).toBe(`${d['앞에 표시 [']}${d['현재 도면(C)']}/${d['비교 도면(O)']}${end}`);
      // 단색 물음 = 「경계를 유지하시겠습니까?」의 조각·통째 꼴
      expect(d['단색? ['], l).toBe(d[`${KEEP} [`]!.replace(d[KEEP]!, d['단색?']!));
      expect(d['단색? [예(Y)/아니오(N)] <{0}>:'], l).toBe(d[`${KEEP} [예(Y)/아니오(N)] <{0}>:`]!.replace(d[KEEP]!, d['단색?']!));
      for (const s of ['켜짐', '꺼짐']) expect(d[`반전 자르기 상태가 ${s}입니다.`], `${l}: ${s}`).toBe(d['반전 자르기 상태가 {0}입니다.']!.replace('{0}', d[s]!));
      // 밝기·흐리기 값 = 「대비 값 입력 (0-100) <{0}>:」의 낱말을 바꾼 꼴(독일어는 합성어)
      const C = d['대비 값 입력 (0-100) <{0}>:']!;
      const as = (x: string) => (l === 'de' ? C.replace('Kontrast', x === '밝기' ? 'Helligkeits' : 'Abblend') : C.replace(l === 'en' ? 'contrast' : d['대비']!, l === 'en' ? d[x]!.toLowerCase() : d[x]!));
      for (const x of ['밝기', '흐리기']) expect(d[`${x} 값 입력 (0-100) <{0}>:`], `${l}: ${x}`).toBe(as(x));
      // 계보 꼬리 = 결과 틀의 꼬리 자리
      expect(d['"{0}"과(와) "{1}"을(를) 비교했습니다(맞추기 {2}ms, 그리기 {3}ms, 같은 계보 — 핸들로 맞춤).'], l).toBe(d[CMP]!.replace('{4}', d[LIN1]!));
      expect(d['외부 참조 "{0}"을(를) 비교했습니다: 이전 "{1}", 현재 "{2}"(같은 계보 — 핸들로 맞춤).'], l).toBe(d[XCMP]!.replace('{3}', d[LIN2]!));
      // 요약 = 요약 틀 + 괄호(일본어·중국어는 전각 괄호라 띄우지 않음), 다시 비교 = 「다시 비교했습니다: {0}」 + 요약
      const sp = l === 'ja' || l === 'zh-CN' ? '' : ' ';
      expect(d[S4], l).toBe(d[S]!.replace('{4}', sp + d['(비교하지 않은 문자·해치 {0}개)']!.replace('{0}', '{4}')));
      const R = d[AGAIN]!;
      expect(d[AGAIN.replace('{0}', S.replace('{4}', ''))], l).toBe(R.replace('{0}', d[S]!.replace('{4}', '')));
      expect(d[AGAIN.replace('{0}', S4)], l).toBe(R.replace('{0}', d[S4]!));
      expect(d[AGAIN.replace('{0}', XS)], l).toBe(R.replace('{0}', d[XS]!));
      // PDFLAYERS 제목 = 틀 + 「PDF 언더레이 {0}({1}쪽)을(를) 부착했습니다.」의 쪽 꼴(쪽 = page — side가 아니다)
      const page = /[(（][^()（）]*\{1\}[^()（）]*[)）]/.exec(d['PDF 언더레이 {0}({1}쪽)을(를) 부착했습니다.']!)![0];
      expect(d['PDF 언더레이 도면층 — {0} ({1}쪽)'], l).toBe(d['PDF 언더레이 도면층 — {0}{1}']!.replace('{1}', (l === 'zh-CN' ? '' : ' ') + page));
    }
  });
});
