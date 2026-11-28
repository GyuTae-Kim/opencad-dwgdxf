/**
 * 333차: 331차가 보고 둔 물음 둘 — 앞 조각·옵션 낱말 열쇠가 없어 물음 줄부터 한국어로 남던 것(사전·번역층·진짜 명령행 물음 줄, 빌드 없이).
 * (가) -VPORTS 저장·복원·삭제할 이름 물음(vports.ts `${verb} 뷰포트 구성의 이름 입력 또는 [?]:`)은 앞 조각 「저장할 … 또는 [」 열쇠가 없어
 *     앞 조각 틀 「{0} 뷰포트 구성의 이름 입력 또는 [」이 「저장할」을 그대로 끼웠다(틀이 잡은 값은 옮기지 않는다) — 물음 줄·기록 줄 모두 한국어.
 *     앞 조각 셋을 네 사전에: 같은 꼴 물음 「복원할 UCS의 이름 입력 또는 [」 값의 UCS 자리를 그 사전의 「뷰포트 구성」 값으로, 저장·삭제는 같은 VPORTS
 *     옵션 물음의 낱말로. 기록 줄은 통째 열쇠 없이 331차 askedLine이 물음 줄처럼 조각마다 옮긴다(두 줄이 같은 문장).
 * (나) PEDIT 옵션 물음(modify2-pedit.ts `옵션 입력 [${textOf(list)}]:`)의 옵션 낱말 여섯(열기(O)·정점 편집(E)·스플라인 곡선(S)·비곡선화(D)·반전(R)·
 *     선종류생성(L))은 열쇠가 없어 물음 줄 단추부터 한국어였다 — 같은 사전의 다중 PEDIT 통째 물음 값의 같은 옵션(열기·비곡선화·선종류생성·반전),
 *     없는 둘은 홀로 쓴 낱말 값 + 그 사전 옵션 꼴(정점 편집·스플라인 곡선). 옵션 글자는 옮기지 않는다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { unmark } from '../src/app/filetext';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const hangul = (s: string): number => s.match(/[가-힣]/g)?.length ?? 0;
const squash = (s: string): string => s.replace(/\s/g, '');
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
/** 옵션 목록 「[이름(글자)/…]」의 항목 */
const optsOf = (s: string): string[] => /\[([^[\]]*)\]/.exec(s)![1]!.split('/');
/** 기록 줄을 번역층처럼(fileguard.ts installFileGuard — 통째 번역이 한국어를 남기면 translateTail, 화면 언어도) 옮기고 도면 글 표시를 뗀다 */
const record = (line: string, l: Lang): string => unmark(translateTail(line, translate(line, l), (s) => translate(s, l), l));

const VERBS = ['저장할', '복원할', '삭제할'] as const;
const VPORTS = VERBS.map((v) => `${v} 뷰포트 구성의 이름 입력 또는 [?]:`);
/** 물음의 앞 조각(물음 줄 setPrompt의 첫 마디 「… [」) */
const headOf = (q: string): string => q.slice(0, q.indexOf('[') + 1);
const VP_OPTS = '옵션 입력 [저장(S)/복원(R)/삭제(D)/결합(J)/단일(SI)/?/2/3/4] <3>:';
const UCS = '복원할 UCS의 이름 입력 또는 [';
const PEDIT_ALL = '옵션 입력 [닫기(C)/열기(O)/결합(J)/폭(W)/맞춤(F)/스플라인(S)/비곡선화(D)/선종류생성(L)/반전(R)/명령 취소(U)/종료(X)] <종료>:';
const NEW = ['열기(O)', '정점 편집(E)', '스플라인 곡선(S)', '비곡선화(D)', '반전(R)', '선종류생성(L)'];
const PEDIT3 = ['정점 편집(E)', '스플라인 곡선(S)', '비곡선화(D)', '반전(R)', '명령 취소(U)'];
const PEDIT2 = ['결합(J)', '폭(W)', '정점 편집(E)', '맞춤(F)', '스플라인(S)', '비곡선화(D)', '선종류생성(L)', '반전(R)', '명령 취소(U)'];
/** modify2-pedit.ts 250·251줄 목록(3D·2D × 닫힘·열림) */
const PEDIT = [...['닫기(C)', '열기(O)'].map((c) => [c, ...PEDIT3]), ...['닫기(C)', '열기(O)'].map((c) => [c, ...PEDIT2])].map((o) => `옵션 입력 [${o.join('/')}]:`);

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

/** el이 타이머 두 바퀴 잇달아 조용할 때까지(번역층이 다시 옮기기를 마침 — 마감 2초, 횟수 기다림 대신: 공용 규칙 13번) */
const quiet = async (el: Element): Promise<void> => {
  let seen = 0;
  const mo = new MutationObserver(() => {
    seen++;
  });
  mo.observe(el, { subtree: true, childList: true, characterData: true });
  const end = Date.now() + 2000;
  for (let calm = 0; calm < 2 && Date.now() < end; ) {
    const before = seen;
    await new Promise((r) => setTimeout(r, 0));
    calm = seen === before ? calm + 1 : 0;
  }
  mo.disconnect();
};

describe('331차가 보고 둔 물음 둘 — -VPORTS 이름 물음 앞 조각·PEDIT 옵션 낱말(333차)', () => {
  it('(가) -VPORTS 이름 물음 셋의 앞 조각 — 같은 사전의 UCS 복원 물음 꼴 + 「뷰포트 구성」 + VPORTS 옵션 낱말', () => {
    for (const l of LANGS)
      for (const q of VPORTS) {
        const v = dict[l][headOf(q)];
        expect(v, `${l} ${q}`).toBeDefined();
        expect(hangul(v!), `${l} ${q}`).toBe(0);
        expect(v, `${l} ${q}`).toMatch(/\[$/);
        expect(v!.toLowerCase(), `${l} ${q}`).toContain(dict[l]['뷰포트 구성']!.toLowerCase());
      }
    // 복원: 「복원할 UCS의 이름 입력 또는 [」의 UCS 자리를 그 사전의 「뷰포트 구성」으로(de는 여성 명사라 관사 der)
    const vp = (l: Lang): string => dict[l]['뷰포트 구성']!;
    const restore = headOf(VPORTS[1]!);
    expect(dict.en[restore]).toBe(dict.en[UCS]!.replace('UCS', vp('en').toLowerCase()));
    expect(dict.ja[restore]).toBe(dict.ja[UCS]!.replace('UCS', vp('ja')));
    expect(dict['zh-CN'][restore]).toBe(dict['zh-CN'][UCS]!.replace('UCS', vp('zh-CN')));
    expect(dict.de[restore]).toBe(dict.de[UCS]!.replace('des ', 'der ').replace('BKS', vp('de')));
    // 저장·삭제: 복원 값의 복원 낱말을 같은 VPORTS 옵션 물음의 저장·삭제 낱말로(en·ja·zh — de는 분사 꼴이라 값으로 고정)
    const word = (l: Lang, i: number): string => optsOf(dict[l][VP_OPTS]!)[i]!.replace(/\s*\([A-Z]+\)$/, '');
    for (const l of ['en', 'ja', 'zh-CN'] as const) {
      const low = (s: string): string => (l === 'en' ? s.toLowerCase() : s);
      const r = dict[l][restore]!;
      expect(r, l).toContain(low(word(l, 1)));
      for (const i of [0, 2]) expect(dict[l][headOf(VPORTS[i]!)], `${l} ${VERBS[i]}`).toBe(r.replace(low(word(l, 1)), low(word(l, i))));
    }
    expect(VPORTS.map((q) => dict.de[headOf(q)])).toEqual([
      'Name der zu speichernden Ansichtsfensterkonfiguration eingeben oder [',
      'Name der wiederherzustellenden Ansichtsfensterkonfiguration eingeben oder [',
      'Name der zu löschenden Ansichtsfensterkonfiguration eingeben oder [',
    ]);
  });

  it('(나) PEDIT 옵션 낱말 여섯 — 같은 사전 다중 PEDIT 물음의 같은 옵션, 없는 둘은 홀로 쓴 낱말 + 그 사전 옵션 꼴(옵션 글자는 그대로)', () => {
    const KO = optsOf(PEDIT_ALL);
    for (const l of LANGS) {
      const d = dict[l];
      const tr = optsOf(d[PEDIT_ALL]!);
      expect(tr.length, l).toBe(KO.length);
      for (const k of ['열기(O)', '비곡선화(D)', '선종류생성(L)', '반전(R)']) expect(d[k], `${l} ${k}`).toBe(tr[KO.indexOf(k)]);
      // 옵션 꼴: 그 사전 다중 PEDIT 물음의 글자 앞 빈칸(en·de 있음, ja·zh 없음)
      const sep = / \(O\)$/.test(tr[KO.indexOf('열기(O)')]!) ? ' ' : '';
      for (const [k, w] of [['정점 편집(E)', '정점 편집'], ['스플라인 곡선(S)', '스플라인 곡선']] as const) expect(d[k], `${l} ${k}`).toBe(`${d[w]}${sep}${k.slice(-3)}`);
      for (const k of NEW) {
        expect(hangul(d[k] ?? '가'), `${l} ${k}`).toBe(0);
        expect(d[k]!.endsWith(k.slice(-3)), `${l} ${k}`).toBe(true);
      }
      // 한 물음 안의 두 옵션이 같은 이름이 되지 않는다
      for (const q of PEDIT) {
        const o = optsOf(q).map((x) => translate(x, l));
        expect(new Set(o).size, `${l} ${q}`).toBe(o.length);
      }
    }
    expect(LANGS.map((l) => dict[l]['열기(O)'])).toEqual(['Open (O)', '開く(O)', '打开(O)', 'Öffnen (O)']);
  });

  it('물음 줄(진짜 명령행 setPrompt + 번역층)과 기록 줄(물음 + 친 입력)이 네 언어에서 한글 0·같은 문장, 한국어 화면은 그대로', async () => {
    const ASKS = [...VPORTS, ...PEDIT];
    expect(ASKS.length).toBe(7);
    const bad: string[] = [];
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      const el = document.querySelector('.cmd-prompt')!;
      for (const q of ASKS) {
        cmd.setPrompt(q);
        await quiet(el);
        const shown = el.textContent!;
        // 친 입력: 이름은 도면 글 표시(app.ts promptOf), 옵션은 친 글자 그대로
        const vp = VPORTS.includes(q);
        const rec = record(`${q} ${vp ? '⁨A⁩' : 'O'}`, l);
        const opts = (s: string): string => s.slice(s.indexOf('['), s.lastIndexOf(']') + 1);
        const same = squash(shown.split('[')[0]!) === squash(rec.split('[')[0]!) && opts(shown) === opts(rec);
        // 343차: 전각 쌍점 뒤에는 친 입력 앞 빈칸이 없다(fileguard.ts glue — 같은 사전 다수 꼴)
        const end = `${shown.endsWith('：') ? '：' : ' '}${vp ? 'A' : 'O'}`;
        if (hangul(shown) || hangul(rec) || !same || !rec.endsWith(end)) bad.push(`${l}: ${shown} ≠ ${rec}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(bad, bad.slice(0, 6).join('\n')).toEqual([]);
    // 한국어 화면은 번역층이 그대로 둔다
    for (const q of ASKS) expect(translate(`${q} A`, 'ko')).toBe(`${q} A`);
  });
});
