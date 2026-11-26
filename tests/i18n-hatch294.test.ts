/**
 * 294차: 해치 묶음(HATCH·GRADIENT·-HATCH·-BOUNDARY·HATCHEDIT·-HATCHEDIT·HATCHTOBACK·무늬 설명)의 번역과 293차가 한도 밖으로 남긴 기준점 오역.
 * - 빠진 번역: -HATCH 예/아니오 물음 여덟(폴리선 경계 유지·경계 유지·섬 검출 여부·연관 여부·개별 해치 작성 여부·기본 원점 저장·주석 해치 작성·가운데 맞춤)은
 *   앞 조각 「… [」·통째 열쇠가 없었고, 해치 색상·배경색의 기본값 「<현재 사용>」·「<없음>」은 옵션 이름이 아니라 뒤 조각 열쇠가 없었다.
 *   HATCH 현재 설정 줄(섬 = 일반·외부·무시, 연관 = 예·아니오, 무늬 = 사용자 정의)과 결과 줄(「해치를·그라데이션를 만들었습니다(경계 N개, 연관).」)은
 *   틀이 앱 낱말을 잡아 옮기지 않았고, ISO 무늬 설명(`ISO ${제목}`)은 열쇠가 없어 해치 대화 상자 무늬 고르기에 한국어로 보였다.
 * - 오역: 영어 기준점 Reference point·독일어 Referenzpunkt·중국어 参考点을 base point·Basispunkt·基点으로, 「경계를 유지하시겠습니까?」 remain alert·wachsam bleiben(경계심),
 *   영어 경계 border·「Internal Specify a point」, 영역(REGION) Area·面积, 중국어 해치 孵化(알 깨기)·이중 双精度浮点数, 일본어 ㄱ형강 ㄱヒョンガン 등 — 같은 사전 안의 맞는 번역으로.
 * 프롬프트는 소스에서 모은다(dashcmds-hatch.ts askYN 물음, hatchcmd.ts 현재 설정·결과 줄, patterns.ts ISO 제목).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** askYN(dashcmds-ask.ts) 꼴: 물음 [예(Y)/아니오(N)] <기본값>: */
const yn = (q: string, def: boolean) => `${q} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`;
/** -HATCH·-BOUNDARY 예/아니오 물음(기본값은 새 명령의 값) */
const QS: [string, boolean][] = [
  ['폴리선 경계를 유지하시겠습니까?', false],
  ['경계를 유지하시겠습니까?', false],
  ['섬 검출 여부', true],
  ['연관 여부', true],
  ['개별 해치 작성 여부', false],
  ['이 원점을 기본 원점으로 저장하시겠습니까?', false],
  ['주석 해치 작성', false],
  ['가운데 맞춤', true],
];
const COLOR = '해치 색상 입력 또는 [트루 컬러(T)/색상표(CO)] <현재 사용>:';
const BACK = '해치 배경색 입력 또는 [트루 컬러(T)/색상표(CO)/.] <없음>:';
const MAIN = '내부 점 지정 또는 [특성(P)/객체 선택(S)/그리기 경계(W)/경계 제거(B)/고급(A)/그리기 순서(DR)/원점(O)/주석(AN)/해치 색상(CO)/도면층(LA)/투명도(T)]:';
const BO_OPT = '옵션 입력 [경계 세트(B)/섬 검출(I)/객체 유형(O)]:';
const BO_TYPE = '경계 객체 유형 입력 [영역(R)/폴리선(P)] <폴리선>:';
const PROMPTS = [...QS.map(([q, d]) => yn(q, d)), COLOR, BACK, MAIN, BO_OPT, BO_TYPE];

/** HATCH 현재 설정 줄(hatchcmd.ts status): 무늬 이름 또는 사용자 정의 × 섬 셋 × 연관 둘 */
const ISLANDS = ['일반', '외부', '무시'];
const YESNO = ['예', '아니오'];
const STATUS = ['ANSI31', '사용자 정의'].flatMap((p) =>
  ISLANDS.flatMap((i) => YESNO.map((a) => `현재 설정: 무늬 = ${p}, 축척 = ${p === 'ANSI31' ? '1' : '1.0000'}, 각도 = 45, 섬 = ${i}, 연관 = ${a}`)),
);
/** HATCH·GRADIENT 결과 줄 */
const MADE = ['해치', '그라데이션'].flatMap((w) => [`${w}를 만들었습니다(경계 2개, 연관).`, `${w}를 만들었습니다(경계 1개).`]);
/** ISO 무늬(patterns.ts iso('02', '파선', …) — 설명은 `ISO ${제목}`, 대화 상자 고르기 항목은 `이름 — 설명`) */
const ISO = [...src('edit/hatch/patterns.ts').matchAll(/iso\('(\d\d)', '([^']+)'/g)].map((m) => [m[1]!, m[2]!] as const);

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('해치 묶음의 번역과 293차 한도 밖 기준점 오역(294차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/dashcmds-hatch.ts', "const keep = await askYN(ctx, '폴리선 경계를 유지하시겠습니까?', false);"],
      ['app/dashcmds-hatch.ts', "retain = await askYN(ctx, '경계를 유지하시겠습니까?', retain);"],
      ['app/dashcmds-hatch.ts', "const on = await askYN(ctx, '섬 검출 여부', s.islands !== 'ignore');"],
      ['app/dashcmds-hatch.ts', "s.associative = await askYN(ctx, '연관 여부', s.associative);"],
      ['app/dashcmds-hatch.ts', "separate = await askYN(ctx, '개별 해치 작성 여부', separate);"],
      ['app/dashcmds-hatch.ts', "if (await askYN(ctx, '이 원점을 기본 원점으로 저장하시겠습니까?', false)) m.hpOrigin = origin;"],
      ['app/dashcmds-hatch.ts', "if (await askYN(ctx, '주석 해치 작성', false))"],
      ['app/dashcmds-hatch.ts', "g.shift = (await askYN(ctx, '가운데 맞춤', g.shift === 0)) ? 0 : 0.25;"],
      ['app/dashcmds-hatch.ts', "islands = await askYN(ctx, '섬 검출 여부', islands);"],
      ['app/dashcmds-ask.ts', "const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');"],
      ['app/dashcmds-hatch.ts', "`해치 색상 입력 또는 [트루 컬러(T)/색상표(CO)] <${color ? colorName(color) : '현재 사용'}>:`"],
      ['app/dashcmds-hatch.ts', `return askColor(ctx, '${COLOR}', k ?? t);`],
      ['app/dashcmds-hatch.ts', `const bg = await askWord(ctx, '${BACK}', [`],
      ['app/dashcmds-hatch.ts', `const r = await ctx.getPoint('${MAIN}', {`],
      ['app/dashcmds-hatch.ts', `'${BO_OPT}',`],
      ['app/dashcmds-hatch.ts', `'${BO_TYPE}',`],
    ])
      expect(src(f!), s).toContain(s);
    const left: string[] = [];
    const shown: Record<string, string[]> = {};
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      shown[l] = [];
      for (const p of PROMPTS) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const text = document.querySelector('.cmd-prompt')!.textContent!;
        shown[l]!.push(text);
        if (HANGUL.test(text)) left.push(`${l}: ${text}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(left).toEqual([]);
    const at = (l: Lang, p: string) => shown[l]![PROMPTS.indexOf(p)]!;
    // -HATCH 첫 줄: 앞 조각(깨진 「Internal Specify a point」가 아니다)·그리기 경계(Draw boundary)·주석(Annotative)
    for (const s of ['Specify interior point or [', 'Draw boundary (W)', 'Remove boundary (B)', 'Annotative (AN)']) expect(at('en', MAIN)).toContain(s);
    // -BOUNDARY 객체 유형의 영역은 REGION(넓이 Area·面积가 아니다), 경계 세트는 边界集·Umgrenzungssatz(경계 설정하기가 아니다)
    expect(at('en', BO_TYPE)).toContain('Region (R)');
    expect(at('zh-CN', BO_TYPE)).toContain('面域(R)');
    expect(at('zh-CN', BO_OPT)).toContain('边界集(B)');
    expect(at('de', BO_OPT)).toContain('Umgrenzungssatz (B)');
    expect(at('en', COLOR)).toMatch(/<Use current>:$/);
  });

  it('통째 프롬프트(기록 줄·휴대폰 카드)와 HATCH 현재 설정·결과 줄, ISO 무늬 고르기 항목이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/hatchcmd.ts', "`현재 설정: 무늬 = ${s.pattern === '_USER' ? '사용자 정의' : s.pattern}, 축척 = ${"],
      ['app/hatchcmd.ts', "섬 = ${s.islands === 'normal' ? '일반' : s.islands === 'outer' ? '외부' : '무시'}, 연관 = ${s.associative ? '예' : '아니오'}`,"],
      ['app/hatchcmd.ts', "ctx.print(`${gradient ? '그라데이션' : '해치'}를 만들었습니다(경계 ${paths.length}개${hatch.associative ? ', 연관' : ''}).`);"],
      ['app/hatchcmd.ts', 'label: `${p.name} — ${p.description}`'],
      ['edit/hatch/patterns.ts', 'return { name: `ISO${code}W100`, description: `ISO ${title}`,'],
    ])
      expect(src(f!), s).toContain(s);
    expect(ISO.map(([c]) => c)).toEqual(['02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15']);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const left: string[] = [];
    for (const l of LANGS) {
      // 기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 기록 줄 꼴도
      for (const p of PROMPTS) for (const s of p.endsWith('>:') ? [p, `${p} Y`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of [...STATUS, ...MADE, ...ISO.map(([c, t]) => `ISO${c}W100 — ISO ${t}`)]) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show(yn('경계를 유지하시겠습니까?', false), 'en')).toBe('Retain boundaries? [Yes (Y)/No (N)] <No>:');
    expect(show(`${yn('섬 검출 여부', true)} N`, 'zh-CN')).toBe('是否检测岛屿 [是(Y)/否(N)] <是>： N');
    expect(show(yn('가운데 맞춤', true), 'ja')).toBe('中央揃え [はい(Y)/いいえ(N)] <はい>:');
    expect(show(yn('폴리선 경계를 유지하시겠습니까?', false), 'de')).toBe('Soll die Polylinienbegrenzung erhalten bleiben? [Ja (Y)/Nein (N)] <Nein>:');
    expect(tr('en')(STATUS[0]!)).toBe('Current settings: Pattern = ANSI31, Scale = 1, Angle = 45, Islands = Normal, Associative = Yes');
    expect(tr('de')(STATUS[11]!)).toBe('Aktuelle Einstellungen: Muster = Benutzerdefiniert, Maßstab = 1.0000, Winkel = 45, Insel = Ignorieren, Assoziativ = Nein');
    expect(tr('ja')(STATUS[3]!)).toBe('現在の設定: パターン = ANSI31、尺度 = 1、角度 = 45、島 = 外部、関連付け = いいえ');
    expect(tr('zh-CN')(MADE[0]!)).toBe('已创建填充（2 个边界，关联）。');
    expect(tr('en')(MADE[3]!)).toBe('Created gradient (boundaries: 1).');
    expect(tr('en')('ISO12W100 — ISO 대시 이점선')).toBe('ISO12W100 — ISO dash double-dot line');
    expect(tr('de')('ISO07W100 — ISO 점선')).toBe('ISO07W100 — ISO gepunktete Linie');
    expect(tr('zh-CN')('ISO07W100 — ISO 점선')).toBe('ISO07W100 — ISO 点线');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 기준점 base point·Basispunkt·基点, 경계 boundary, 해치 填充, 영역 REGION, 현재 사용 use current, 새 통째 = 앞 조각 + 예/아니오, 덮인 틀은 지움', () => {
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 기준점(base point): 영어 Reference point·독일어 Referenzpunkt·중국어 参考点이 사전에 남지 않는다
    expect(Object.entries(en).filter(([, v]) => /\breference point\b/i.test(v)).map(([k]) => k)).toEqual([]);
    expect(Object.entries(de).filter(([, v]) => /referenzpunkt/i.test(v)).map(([k]) => k)).toEqual([]);
    expect(Object.entries(zh).filter(([, v]) => v.includes('参考点')).map(([k]) => k)).toEqual([]);
    expect([de['기준점 X'], de['기준점 Y'], de['기준점 Z']]).toEqual(['Basispunkt X', 'Basispunkt Y', 'Basispunkt Z']);
    expect(en['{0}객체 {1}개{2} · 기준점 {3}, {4}']).toBe('{0}{1} objects{2} · base point {3}, {4}');
    expect(de['삽입 기준점 지정 또는 [주석(A)]:']).toBe('Geben Sie den Einfügebasispunkt oder [Beschriftung (A)] an:');
    expect([de['지정된 기준점 또는 ['], zh['지정된 기준점 또는 [']]).toEqual(['Angegebener Basispunkt oder [', '指定基点或[']);
    // 경계(boundary): 영어 border·독일어 Rand(가장자리)가 아니다, 「경계를 유지」는 경계심이 아니다
    expect(row('경계를 유지하시겠습니까?')).toEqual(['Retain boundaries?', 'Sollen die Umgrenzungen beibehalten werden?', '境界を維持しますか？', '是否保留边界？']);
    for (const k of ['경계', '경계 뒤', '경계 앞', '그리기 경계', '경계 제거', '새 경계의 시작점 지정 또는 <해치 적용>:', '그리기 순서 옵션 입력 [지정 안 함(N)/맨 뒤로(B)/맨 앞으로(F)/경계 뒤(E)/경계 앞(R)] <{0}>:'])
      expect(en[k], k).not.toMatch(/border/i);
    expect([en['경계'], de['경계'], en['내부 점 지정 또는 [']]).toEqual(['Boundary', 'Umgrenzung', 'Specify interior point or [']);
    expect([en['그리기 경계(W)'], ja['그리기 경계(W)']]).toEqual(['Draw boundary (W)', '境界の作成(W)']);
    expect([en['주석(AN)'], ja['주석(AN)'], en['연관(A)'], en['새 원점 설정(S)'], en['점토']]).toEqual(['Annotative (AN)', '注釈(AN)', 'Associative (A)', 'Set new origin (S)', 'Clay']);
    // 영역(R)은 -BOUNDARY 객체 유형 REGION(같은 사전의 「영역(REGION)은 …」 面域)
    expect([en['영역(R)'], ja['영역(R)'], zh['영역(R)']]).toEqual(['Region (R)', '領域(R)', '面域(R)']);
    // 현재 사용 = 「현재 사용(.)」의 낱말(Use current — 지금 쓰는 중이 아니다; 독일어 이름표는 한도 밖)
    const cur = (l: Lang) => dict[l]['현재 사용(.)']!.replace(/\s*\(\.\)$/, '');
    for (const l of ['en', 'ja', 'zh-CN'] as const) expect(dict[l]['현재 사용'], l).toBe(cur(l));
    // 중국어 해치는 填充(孵化 알 깨기가 아니다), 이중은 双向, 세 방향 격자·강재·그라데이션·자갈, 경계 세트 边界集
    expect(Object.entries(zh).filter(([, v]) => v.includes('孵化')).map(([k]) => k)).toEqual([]);
    expect([zh['이중(사용자 정의, 90° 교차)'], zh['세 방향 격자'], zh['강재'], zh['그라데이션({0})'], zh['자갈'], zh['경계 세트(B)']]).toEqual([
      '双向（用户自定义，90° 交叉）',
      '三向网格',
      '钢材',
      '渐变({0})',
      '砾石',
      '边界集(B)',
    ]);
    expect([zh['해치 맨 뒤로'], de['해치 맨 뒤로'], de['맨 뒤로(B)'], de['맨 앞으로(F)'], de['그라데이션 각도 지정 <{0}>:']]).toEqual([
      '将填充置于底层',
      'Schraffuren in den Hintergrund',
      'Nach hinten (B)',
      'Nach vorne (F)',
      'Verlaufswinkel angeben <{0}>:',
    ]);
    expect([ja['ㄱ형강'], ja['가운데'], ja['가운데 맞춤'], ja['8x16 블록 입면, 줄눈 엇갈림'], ja['무늬 이름 입력 또는 [']]).toEqual(['L形鋼材', '中央', '中央揃え', '8x16ブロック立面、交互目地', 'パターン名を入力、または [']);
    expect([ja['일반(홀짝)'], zh['일반(홀짝)']]).toEqual(['標準（奇数・偶数）', '普通（奇数/偶数）']);
    // 새 열쇠: 예/아니오 통째 = 앞 조각 + 예(Y)/아니오(N), 뒤 조각 = 기본값 낱말, 현재 설정 줄은 해치 스타일 통째의 섬 낱말
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      for (const [q] of QS) {
        expect(squash(d[`${q} [`]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[`${q} [예(Y)/아니오(N)] <{0}>:`]), `${l}: ${q}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>`) + colon);
      }
      expect(squash(d['] <현재 사용>:']), l).toBe(squash(`] <${cur(l)}>`) + colon);
      expect(squash(d['] <없음>:']), l).toBe(squash(`] <${d['없음']}>`) + colon);
      const style = d['해치 스타일 입력 [무시(I)/외부(O)/일반(N)] <{0}>:']!;
      for (const [i, k] of [['일반', 'N'], ['외부', 'O'], ['무시', 'I']] as const) {
        const word = new RegExp(`[[/]([^/[]+?)\\s*[(（]${k}[)）]`).exec(style)![1]!.trim();
        for (const a of YESNO) {
          const yes = d[a === '예' ? '예(Y)' : '아니오(N)']!.replace(/\s*[(（]\w[)）]$/, '');
          for (const k2 of [`현재 설정: 무늬 = {0}, 축척 = {1}, 각도 = {2}, 섬 = ${i}, 연관 = ${a}`, `현재 설정: 무늬 = 사용자 정의, 축척 = {0}, 각도 = {1}, 섬 = ${i}, 연관 = ${a}`]) {
            expect(d[k2], `${l}: ${k2}`).toContain(word);
            expect(d[k2], `${l}: ${k2}`).toMatch(new RegExp(`${yes}$`));
          }
        }
      }
      for (const [, t] of ISO) expect(d[`ISO ${t}`], `${l}: ${t}`).toMatch(/^ISO \S/);
      // 새 통째가 덮어 쓰이지 않게 된 틀(293차 둘·이번 둘)은 지웠다
      for (const k of ['{0} 또는 [주석(A)] <{1}>:', '높이: {0} 폭 비율: {1} 기울기 각도: {2} 생성: {3}', '{0}를 만들었습니다(경계 {1}개{2}).', '현재 설정: 무늬 = {0}, 축척 = {1}, 각도 = {2}, 섬 = {3}, 연관 = {4}'])
        expect(d[k], `${l}: ${k}`).toBeUndefined();
    }
  });
});
