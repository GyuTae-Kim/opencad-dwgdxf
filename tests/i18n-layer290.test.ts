/**
 * 290차: 도면층 묶음(LAYER 팔레트·-LAYER·필터·도면층 상태·LAYISO·LAYDEL·LAYMRG·LAYWALK·LAYTRANS·COPYTOLAYER 등)의 번역 —
 * 뜻이 어긋난 번역(오역)과 사전에 열쇠가 없어 네 언어 모두 한국어로 보이던 글(빠진 번역).
 * - 빠진 번역: -LAYER 옵션(만들기(M)·선종류(L)·잠금(LO)·상태(A) 등), 코드로 짜는 프롬프트(-LAYER 이름 리스트 `${prompt}${tail}:`,
 *   -LAYERSTATE 편집·복원 특성 옵션 목록, 「복원할 … 도면층 상태 이름 또는 [?] 입력:」 — 틀 「{0} 도면층 상태 이름 또는 [」이 앱 낱말을 잡아 한국어),
 *   LAYDEL·LAYMRG 고른 도면층 꼬리와 경고 줄, LAYWALK 상태 줄·소거 물음, 상태 편집 안내, LAYTRANS·SETBYLAYER 결과 줄, 그룹 필터 줄의 추가·대치.
 * - 오역: 소거(purge)를 비우기·지우개·맑은(Clear·橡皮擦·Klar)으로, 대치를 소리 옮김(Daechi)으로, 로드(L)를 막대(Rod·Stab)로, 검사(N)를 검찰(Prosecutor·Staatsanwalt)로,
 *   격리 해제를 검역(quarantine)으로, VP를 부사장(副总裁)·가상 투영으로, 매핑을 지도(地图)로, 공간을 빈칸 글자로, 식을 방정식으로, 특성을 블록 속성(attribute·属性)으로
 *   옮긴 것 — 같은 사전 안의 맞는 번역으로 고쳤다.
 * 프롬프트는 소스에서 모은다(edit/layercmd dashLayerPrompt, layercmd askLayers, layerstate-cmd 편집 kw·PROP_KEYS·askStateName, laytools LAYDEL·LAYMRG).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { dashLayerPrompt } from '../src/edit/layercmd';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8');
const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  return text.slice(i, text.indexOf(end, i + start.length));
};
const kwOf = (text: string) => [...text.matchAll(/\{ key: '([^']+)', label: '([^']+)'/g)].map((m) => `${m[2]}(${m[1]})`);
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

const lsCmd = src('layerstate-cmd.ts');
const layCmd = src('layercmd.ts');
const layTools = src('laytools.ts');
/** -LAYER 첫 프롬프트(옵션 20) */
const MAIN = dashLayerPrompt();
/** -LAYERSTATE 편집(E)의 옵션 목록 */
const EDIT_KW = kwOf(between(lsCmd, "{ key: 'ON', label: '켜기' }", '];'));
const EDIT = `옵션 입력 [${EDIT_KW.join('/')}] <종료>:`;
/** 저장·복원의 복원 특성 켜고 끄기(PROP_KEYS) */
const MASK_KW = kwOf(between(lsCmd, 'const PROP_KEYS', '];'));
const MASK = `켜거나 끌 복원 특성 입력 [${MASK_KW.join('/')}] <종료>:`;
/** -LAYERSTATE 복원(R)·편집(E)·이름(N)·삭제(D)·내보내기(EX)의 상태 이름 프롬프트 */
const WHAT = [...lsCmd.matchAll(/askStateName\(app, ctx, '([^']+)'\)/g)].map((m) => m[1]!);
const STATE = WHAT.map((w) => `${w} 도면층 상태 이름 또는 [?] 입력:`);
/** -LAYER 이름 리스트(`${prompt}${tail}:` — 객체 고르기·현재 도면층 기본값) */
const LISTS = [
  ...[...layCmd.matchAll(/askLayers\('([^']+)'(?:, \{ (select|current): true \})?\)/g)].map(
    (m) => m[1]! + (m[2] === 'select' ? ' 또는 <객체 선택>:' : m[2] === 'current' ? ` <${ft('0')}>:` : ':'),
  ),
  `색상 12에 대한 도면층의 이름 리스트 입력 <${ft('0')}>:`,
  `선종류 "${ft('DASHED')}"에 대한 도면층의 이름 리스트 입력 <${ft('0')}>:`,
  `선가중치 0.25mm에 대한 도면층의 이름 리스트 입력 <${ft('0')}>:`,
  `투명도 30%에 대한 도면층의 이름 리스트 입력 <${ft('0')}>:`,
];
/** LAYDEL·LAYMRG 객체 고르기(고른 도면층이 있으면 꼬리) */
const PICK = ['삭제할', '병합할'].flatMap((w) => [`${w} 도면층의 객체 선택 또는 [이름(N)]:`, `${w} 도면층의 객체 선택 또는 [이름(N)] (선택한 도면층: A-WALL, B):`]);
const PROMPTS = [MAIN, EDIT, MASK, ...STATE, ...LISTS, ...PICK];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('도면층 묶음의 번역(290차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션 「이름(글자)」·뒤 글 「] …」)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 프롬프트가 명령이 내는 글과 같다(코드가 짜 맞추는 꼴)
    expect(MAIN).toBe(
      '옵션 입력 [?/만들기(M)/설정(S)/새로 만들기(N)/이름 바꾸기(R)/켜기(ON)/끄기(OFF)/색상(C)/선종류(L)/선가중치(LW)/투명도(TR)/재료(MAT)/플롯(P)/동결(F)/동결 해제(T)/잠금(LO)/잠금 해제(U)/상태(A)/설명(D)/조정(E)]:',
    );
    expect(EDIT_KW).toEqual(['켜기(ON)', '끄기(OFF)', '색상(C)', '선종류(L)', '선가중치(LW)', '투명도(TR)', '플롯(P)', '동결(F)', '동결해제(T)', '잠금(LO)', '잠금해제(U)', '추가(A)', '제거(R)']);
    expect(MASK_KW).toEqual(['켜기(O)', '동결(F)', '잠금(K)', '플롯(P)', '새 VP 동결(N)', '현재 VP 가시성(V)', '색상(C)', '선종류(L)', '선가중치(W)', '투명도(T)', '플롯 스타일(S)']);
    expect(WHAT).toEqual(['복원할', '편집할', '이름을 바꿀', '삭제할', '내보낼']);
    expect(LISTS).toHaveLength(12);
    for (const s of [
      'const prompt = `옵션 입력 [${kw.map((k) => `${k.label}(${k.key})`).join(\'/\')}] <종료>:`;',
      'const prompt = `켜거나 끌 복원 특성 입력 [${PROP_KEYS.map((p) => `${p.label}(${p.key})`).join(\'/\')}] <종료>:`;',
      'askName(ctx, `${what} 도면층 상태 이름 또는 [?] 입력:`)',
    ])
      expect(lsCmd).toContain(s);
    for (const s of [
      "const tail = opt.select ? ' 또는 <객체 선택>' : opt.current ? ` <${ft(cur())}>` : '';",
      'askWord(ctx, `${prompt}${tail}:`)',
      'askLayers(`색상 ${layerColorText(color)}에 대한 도면층의 이름 리스트 입력`, { current: true })',
      'askLayers(`선종류 "${ft(lt)}"에 대한 도면층의 이름 리스트 입력`, { current: true })',
      'askLayers(`선가중치 ${lineweightText(v)}에 대한 도면층의 이름 리스트 입력`, { current: true })',
      'askLayers(`투명도 ${pct}%에 대한 도면층의 이름 리스트 입력`, { current: true })',
    ])
      expect(layCmd).toContain(s);
    for (const w of ['삭제할', '병합할'])
      expect(layTools).toContain(`\`${w} 도면층의 객체 선택 또는 [이름(N)]\${names.length ? \` (선택한 도면층: \${names.join(', ')})\` : ''}:\``);
    const left: string[] = [];
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      for (const p of PROMPTS) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const shown = document.querySelector('.cmd-prompt')!.textContent!;
        if (HANGUL.test(shown)) left.push(`${l}: ${shown}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(left).toEqual([]);
  });

  it('통째 프롬프트(기록 줄·휴대폰 카드·커서 옆)·결과 줄·상자 글이 네 언어 모두 한국어 없이 보인다', () => {
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const names = ['A-WALL', 'B'].map(ft).join(', ');
    /** 명령행 결과 줄(도면 이름은 ft) */
    const LOG = [
      `******** 경고 ********\n도면층 "${names}"을(를) 도면에서 삭제하려고 합니다.`,
      `******** 경고 ********\n도면층 "${names}"을(를) 도면층 "${ft('C-ALL')}"(으)로 병합하려고 합니다.`,
      `그룹 필터 "${ft('F1')}"의 도면층: 추가 — ${names}`,
      `그룹 필터 "${ft('F1')}"의 도면층: 대치 — ${names}`,
      `변환 대상에 도면층 3개를 넣었습니다(${ft('std.dwg')}).`,
      `변환 대상에 도면층 3개를 넣었습니다(${ft('std.dwg')}). 이름을 쓸 수 없거나 외부 참조 종속인 2개는 뺐습니다.`,
      '도면층 2개를 변환했습니다: 객체 5개를 옮겼습니다.',
      '도면층 2개를 변환했습니다: 객체 5개를 옮겼습니다. 만든 도면층: A-NEW.',
      '도면층 2개를 변환했습니다: 객체 5개를 옮겼습니다. 삭제한 도면층: OLD.',
      '도면층 2개를 변환했습니다: 객체 5개를 옮겼습니다. 만든 도면층: A-NEW. 삭제한 도면층: OLD.',
      '3개의 객체가 수정되었습니다. 블록 정의 2개 안의 객체 5개도 수정했습니다.',
    ];
    /** 상자 글(LAYWALK 상태·소거 물음, 상태 편집 안내) */
    const BOX = [
      '도면층 12개 중 3개 표시',
      '도면층 12개 중 3개 표시 · 선택 유지 2개',
      '참조되지 않은 도면층 2개(A-OLD, B-OLD)를 지우시겠습니까?',
      '참조되지 않은 도면층 2개(A-OLD, B-OLD)를 지우시겠습니까? 객체가 있거나 지울 수 없는 1개는 건너뜁니다.',
      '도면층 5개. 이름을 눌러 고르고(Ctrl로 여러 개), 값 칸을 눌러 바꿉니다.',
      '도면층 5개 (지워진 도면층 1개는 그대로 둡니다). 이름을 눌러 고르고(Ctrl로 여러 개), 값 칸을 눌러 바꿉니다.',
    ];
    for (const s of ['도면층 ${list.keys.length}개 중 ${list.keys.filter((k) => vis.has(k)).length}개 표시${held.size ? ` · 선택 유지 ${held.size}개` : \'\'}', ' 객체가 있거나 지울 수 없는 ${r.refused.length}개는 건너뜁니다.'])
      expect(src('laywalk.ts')).toContain(s);
    expect(src('layerfilter-ui.ts')).toContain("의 도면층: ${mode === 'add' ? '추가' : '대치'} — ${names.map(ft).join(', ')}`");
    expect(src('layerstate-tools.ts')).toContain('` 블록 정의 ${res.blocks}개 안의 객체 ${res.nested}개도 수정했습니다.`');
    const left: string[] = [];
    for (const l of LANGS) {
      for (const p of PROMPTS) for (const s of p.endsWith('>:') ? [p, `${p} A-WALL`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of LOG) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of BOX) if (HANGUL.test(translate(s, l))) left.push(`${l}: ${translate(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(show(MAIN, 'en')).toBe(
      'Enter option [?/Create (M)/Settings (S)/New (N)/Rename (R)/ON/OFF/Color (C)/Linetype (L)/Lineweight (LW)/Transparency(TR)/Material (MAT)/Plot (P)/Freeze (F)/Thaw (T)/Lock (LO)/Unlock (U)/State (A)/Description (D)/Adjust (E)]:',
    );
    expect(show(STATE[0]!, 'de')).toBe('Geben Sie den Namen des wiederherzustellenden Layer-Status oder [?] ein:');
    expect(translate(BOX[1]!, 'de')).toBe('Zeigt 3 von 12 Layern an · Ausgewählt bleiben: 2');
    expect(tr('ja')(LOG[0]!)).toContain('画層「A-WALL, B」を図面から削除しようとしています。');
    expect(tr('zh-CN')(LOG[2]!)).toBe('组过滤器“F1”中的图层：添加 — A-WALL, B');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 소거 purge, 대치 replace, 로드 load, 검사 inspect, 격리 해제 isolation, VP·매핑·공간·식·특성, 새 통째 = 조각 + 옵션', () => {
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    // 소거(PURGE) — 비우기(Clear)·지우개(橡皮擦)·맑은(Klar)·지우기(Löschen)가 아니다
    for (const k of ['소거', '소거(P)', '도면층 소거', '도면층 {0}개를 소거했습니다.']) {
      expect(dict.en[k], k).toMatch(/purge/i);
      expect(dict.en[k], k).not.toMatch(/clear/i);
      expect(dict['zh-CN'][k], k).not.toContain('橡皮擦');
      expect(dict.de[k], k).toMatch(/[Bb]ereinig/);
    }
    expect(row('대치')).toEqual(['Replace', 'Ersetzen', '置換', '替换']);
    expect([dict.en['로드(L)...'], dict.de['로드(L)...']]).toEqual(['Load (L)...', 'Laden (L)...']);
    expect([dict.en['검사(N)...'], dict.de['검사(N)...']]).toEqual(['Inspection (N)...', 'Inspektion (N)...']);
    // 격리 해제(LAYUNISO) — 검역(quarantine)·해결(resolved)·고침(behoben)이 아니다
    for (const k of ['격리 해제', '도면층 격리 해제', '도면층 격리를 풀었습니다.']) {
      expect(dict.en[k], k).not.toMatch(/quarantin|resolved/i);
      expect(dict.de[k], k).toMatch(/aufgehoben|aufheben/);
      expect(dict.de[k], k).not.toMatch(/Quarantäne|Release|behoben/);
    }
    expect(['도면층 이전', '도면층 이전 기록'].map((k) => dict.en[k])).toEqual(['Layer Previous', 'Layer Previous history']);
    expect([dict.en['‹ 유지'], dict.de['‹ 유지']]).toEqual(['‹ Keep', '‹ Behalten']);
    expect([dict.ja['공간'], dict.de['공간'], dict['zh-CN']['식'], dict.de['식']]).toEqual(['空間', 'Bereich', '表达式', 'Ausdruck']);
    expect([dict['zh-CN']['VP 동결'], dict.de['VP 동결'], dict['zh-CN']['현재 VP 가시성']]).toEqual(['VP 冻结', 'VP-Freeze', '当前 VP 可见性']);
    for (const k of ['매핑(M)', '매핑 {0}개 · 변환 대상 {1}개', '매핑을 저장하지 못했습니다: {0}', '파일에 저장된 도면층 매핑 {0}개를 불러왔습니다.'])
      expect(dict['zh-CN'][k], k).toContain('映射');
    for (const k of ['로드된 선종류 이름 입력 또는 [?] <Continuous>:', '로드된 선종류 이름 입력 <Continuous>:', '로드된 선종류: Continuous', '로드된 선종류: {0}', '선종류 {0}을(를) 찾을 수 없습니다. LINETYPE 명령으로 로드하십시오.'])
      expect(dict['zh-CN'][k], k).toContain('线型');
    // 특성(property) — 블록 속성(attribute·属性·Attribut)이 아니다
    for (const k of ['복원할 특성: {0}', 'SETBYLAYER 특성', 'ByLayer로 바꿀 특성을 고릅니다(SETBYLAYERMODE).', '그룹 필터 특성', '새 특성 필터', '새 특성 필터…', '그룹 필터가 들어 있는 필터는 특성 필터로 바꿀 수 없습니다.'])
      expect(dict.en[k], k).toMatch(/propert/i);
    for (const k of ['SETBYLAYER 특성', 'ByLayer로 바꿀 특성을 고릅니다(SETBYLAYERMODE).', '특성 필터 아래의 특성 필터는 그룹 필터로 바꿀 수 없습니다.']) expect(dict.ja[k], k).toContain('プロパティ');
    for (const k of ['그룹 필터 특성', '복원할 특성: {0}']) expect(dict.de[k], k).toMatch(/[Ee]igenschaften/);
    // 수(count)를 이름으로 옮기지 않는다, 깨진 문장
    expect(dict.en['도면층 {0}개를 상태에 추가했습니다.']).toBe('Added {0} layers to the state.');
    expect(dict['zh-CN']['필터 "{0}"과(와) 그 안의 필터 {1}개를 삭제하시겠습니까?']).toContain('{1} 个过滤器');
    expect(dict.en['필터를 자기 아래 필터 안에 둘 수 없습니다.']).toBe('A filter cannot be placed inside a filter below it.');
    expect(dict.ja['필터를 자기 아래 필터 안에 둘 수 없습니다.']).toBe('フィルターを、その下のフィルター内に配置することはできません。');
    expect(dict.en['상위 필터: {0} — 이 필터는 상위 필터의 도면층 가운데에서 고릅니다.']).not.toContain('middle');
    expect([dict.ja['해제(R)'], dict.de['해제(R)'], dict.de['모두 해제(A)'], dict.de['선택(C)'], dict.de['플롯(P)']]).toEqual(['解除(R)', 'Aufheben (R)', 'Alle aufheben (A)', 'Auswählen (C)', 'Plotten (P)']);
    expect(dict.ja['고른 객체의 도면층을 끕니다']).not.toContain('ドラッグ');
    for (const k of ['현재 도면층으로', '현재 도면층으로 변경할 객체 선택:']) expect(dict['zh-CN'][k], k).not.toContain('跳转');
    expect(dict['zh-CN']['ON 또는 OFF를 입력하십시오.']).toBe('输入 ON 或 OFF。');
    expect(dict.de['LAYERP 모드 입력 [켜기(ON)/끄기(OFF)] <{0}>:']).toBe('LAYERP-Modus eingeben [Ein (ON)/Aus (OFF)] <{0}>:');
    expect(dict.de['도면층 "{0}"이(가) 없습니다. 만드시겠습니까? [예(Y)/아니오(N)] <예>:']).toContain('erstellen');
    for (const k of ['변환 대상', '변환 대상(O)', '매핑 {0}개 · 변환 대상 {1}개']) expect(dict.de[k], k).toContain('Konvertierungsziel');
    expect([dict.de['가져오기(M)...'], dict.de['내보내기(X)...'], dict.en['가져오기(M)...'], dict.en['도면층 지우기']]).toEqual(['Importieren (M)...', 'Exportieren (X)...', 'Import (M)...', 'Delete Layer']);
    // 새 통째 = 명령행 앞 조각 + 옵션 번역(명령행 마디와 같은 낱말), 상태 이름 = 앞 조각 + ? + 뒤 조각
    for (const l of LANGS) {
      const d = dict[l];
      for (const p of [MAIN, EDIT, MASK]) {
        const opts = /\[(.*)\]/.exec(p)![1]!.split('/');
        expect(squash(d[p]), `${l}: ${p}`).toMatch(new RegExp('^' + squash(`${d[p.slice(0, p.indexOf('[') + 1)]}${opts.map((o) => (o === '?' ? '?' : d[o])).join('/')}]`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      for (const p of STATE) expect(squash(d[p]), `${l}: ${p}`).toBe(squash(`${d[p.slice(0, p.indexOf('[') + 1)]}?${d['] 입력:']}`));
      for (const w of ['삭제할', '병합할']) {
        const head = d[`${w} 도면층의 객체 선택 또는 [`]! + d['이름(N)'];
        expect(squash(d[`${w} 도면층의 객체 선택 또는 [이름(N)] (선택한 도면층: {0}):`]), `${l}: ${w}`).toBe(squash(head + d['] (선택한 도면층: {0}):']));
      }
      expect(squash(d[EDIT]), l).toMatch(new RegExp(squash(d['] <종료>:']).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    }
    expect(row('만들기(M)')).toEqual(['Create (M)', 'Erstellen (M)', '作成(M)', '创建(M)']);
    expect(row('조정(E)')).toEqual(['Adjust (E)', 'Anpassen (E)', '調整(E)', '调整(E)']);
    expect(row('] 입력:')).toEqual([']:', '] ein:', '] を入力:', ']：']);
  });
});
