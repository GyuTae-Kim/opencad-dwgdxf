/**
 * 319차: 클립보드·붙여넣기 묶음(COPYCLIP·CUTCLIP·COPYBASE·PASTECLIP·PASTEORIG·PASTEBLOCK·PASTESPEC, 오른쪽 클릭 「클립보드」, 명령행 메뉴 복사·붙여넣기)의
 * 번역 대조와 빠진 번역.
 * - PASTESPEC 명령행 물음(blkcmds-misc.ts — 스크립트 중·CMDDIA 0)은 「붙여넣을 형식 [원래 객체(O)/…] <…>:」. 입력 줄은 옵션 「이름(글자)」 열쇠를 쓰는데
 *   원래 객체(O)·그림(P)가 사전에 없었고, 기록 줄·휴대폰 카드·커서 옆(translateTail)은 프롬프트 통째다 — 공용 번역기는 틀({0})이 잡은 옵션 목록을
 *   옮기지 않으므로 옵션 묶음(이 앱 클립보드 객체 셋 + 시스템 클립보드 그림·글)마다 통째 열쇠를 둔다(286차 꼴).
 * - PASTESPEC 상자 안내 「원본: …」(form-note — data-i18n-ui-copy 밖)와 빈 클립보드 오류 줄의 「(시스템 클립보드: …)」도 틀이 잡은 한국어를 옮기지
 *   않아 통째 열쇠를 둔다. 통째 = 틀 번역에 조각 번역을 끼운 것.
 * - 오역(같은 사전의 맞는 번역으로): 명령행 메뉴 「기록 복사」는 명령 기록(history — 「명령 기록 펼치기」) 복사이지 Record·録制가 아니다.
 *   PASTESPEC 상자 「다음으로」는 붙여넣을 형식을 고르는 칸(명령행 물음 「붙여넣을 형식」과 같은 것)이지 「다음」(Next Replace with·Weiter Durch)이 아니다.
 *   독일어 「붙여넣을 형식」은 명령꼴(Format einfügen)이 아니라 같은 사전 「자를 객체」 Zu stutzendes Objekt 꼴, 「그림」 옵션은 같은 물음의
 *   「이미지」 Bild와 다른 이름(같은 사전 「참고: 그림은 파일…」 Abbildung). 중국어 PASTEBLOCK 결과 줄은 개수에 따옴표(对象“{1}”)를 쳐 이름처럼 읽혔다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { sourceMessage, translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** PASTESPEC 옵션(blkcmds-misc.ts registerPasteSpec — keys·names, 옵션을 넣는 차례) */
const KEYS = { objects: 'O', block: 'B', picture: 'P', image: 'I', text: 'T' } as const;
const NAMES = { objects: '원래 객체', block: '블록', picture: '그림', image: '이미지', text: '문자' } as const;
type Kind = keyof typeof KEYS;
/** 이 앱 클립보드에 객체가 있으면 객체·블록·그림, 시스템 클립보드에 그림·글이 있으면 그 뒤에 이미지·문자 — 기본값은 첫 옵션 */
const COMBOS: Kind[][] = [
  ['objects', 'block', 'picture'],
  ['objects', 'block', 'picture', 'image'],
  ['objects', 'block', 'picture', 'text'],
  ['objects', 'block', 'picture', 'image', 'text'],
  ['image'],
  ['text'],
  ['image', 'text'],
];
const kw = (k: Kind) => `${NAMES[k]}(${KEYS[k]})`;
const PROMPTS = COMBOS.map((c) => `붙여넣을 형식 [${c.map(kw).join('/')}] <${NAMES[c[0]!]}>:`);
const HEAD = '붙여넣을 형식 [';
const TPL = '붙여넣을 형식 [{0}] <{1}>:';
/** PASTESPEC 상자 안내(form note)·빈 클립보드 오류 줄 */
const NOTE_TPL = '원본: {0}{1}';
const OWN = '이 앱 클립보드(객체 {0}개)';
const OWN_EMPTY = '이 앱 클립보드 비어 있음';
const SYS = ', 시스템 클립보드';
const NOTES: [key: string, a: string, b: string][] = [
  ['원본: 이 앱 클립보드(객체 {0}개)', OWN, ''],
  ['원본: 이 앱 클립보드(객체 {0}개), 시스템 클립보드', OWN, SYS],
  ['원본: 이 앱 클립보드 비어 있음, 시스템 클립보드', OWN_EMPTY, SYS],
];
const NONE_TPL = '클립보드에 붙여 넣을 내용이 없습니다.{0}';
const SYS_ERR = '(시스템 클립보드: {0})';
const NO_API = '이 브라우저에서는 시스템 클립보드를 읽을 수 없습니다.';
const NONE_ERR = '클립보드에 붙여 넣을 내용이 없습니다. (시스템 클립보드: {0})';
const NONE_NO_API = `클립보드에 붙여 넣을 내용이 없습니다. (시스템 클립보드: ${NO_API})`;
/** 오역을 고친 열쇠 */
const HISTORY_COPY = '기록 복사';
const AS = '다음으로';
const AS_BLOCK = '블록 "{0}"(객체 {1}개)으로 붙여 넣었습니다.';
const PICTURE_OPT = '이미지 개체(복사한 객체를 PNG 그림으로)';
const MTEXT_DONE = '클립보드의 글을 여러 줄 문자로 붙여 넣었습니다.';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('클립보드·붙여넣기 묶음의 번역(319차)', () => {
  it('PASTESPEC 명령행 입력 줄(앞 글 「붙여넣을 형식 [」·옵션 「이름(글자)」·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보인다', async () => {
    const misc = src('blkcmds-misc.ts');
    expect(misc).toContain("{ objects: 'O', block: 'B', picture: 'P', image: 'I', text: 'T' }");
    expect(misc).toContain("{ objects: '원래 객체', block: '블록', picture: '그림', image: '이미지', text: '문자' }");
    expect(misc).toContain("`붙여넣을 형식 [${kws.map((x) => `${x.label}(${x.key})`).join('/')}] <${kws[0]!.label}>:`");
    for (const s of ["if (own) {\n        opts.push({ value: 'objects'", "if (sys.image) opts.push({ value: 'image'", "if (sys.text) opts.push({ value: 'text'"]) expect(misc).toContain(s);
    expect(PROMPTS[3]).toBe('붙여넣을 형식 [원래 객체(O)/블록(B)/그림(P)/이미지(I)/문자(T)] <원래 객체>:');
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

  it('PASTESPEC 통째 물음(기록 줄·휴대폰 카드·커서 옆)이 네 언어 모두 한국어 없이 보이고, 통째 = 틀 번역 + 옵션 번역이다', () => {
    const show = (s: string, l: string) => translateTail(s, translate(s, l), (x) => translate(x, l));
    const left: string[] = [];
    for (const l of LANGS) {
      const d = dict[l];
      for (const p of PROMPTS) for (const s of [p, `${p} ${p.includes('(O)') ? 'O' : 'I'}`]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      COMBOS.forEach((c, i) => {
        expect(d[PROMPTS[i]!], `${l}: ${PROMPTS[i]}`).toBe(d[TPL]!.replace('{0}', c.map((k) => d[kw(k)]).join('/')).replace('{1}', d[NAMES[c[0]!]]!));
        // 앞 조각으로 시작한다(285차 규칙)
        expect(squash(d[PROMPTS[i]!]).startsWith(squash(d[HEAD])), `${l}: ${PROMPTS[i]}`).toBe(true);
      });
      // 옵션 이름 열쇠는 낱말 열쇠와 같은 낱말(입력 줄 기본값 바꾸기 — fileguard.ts defaultWord)
      expect(d[kw('objects')]!.replace('(O)', '').trim(), l).toBe(d['원래 객체']);
    }
    expect(left).toEqual([]);
    expect(dict.en[PROMPTS[0]!]).toBe('Format to paste [Original object (O)/Block (B)/Picture (P)] <Original object>:');
    expect(dict.de[PROMPTS[4]!]).toBe('Einzufügendes Format [Bild (I)] <Bild>:');
    // 같은 물음 안에서 그림(P)과 이미지(I)는 다른 이름(독일어 「그림」 낱말 열쇠는 Bild라 같은 사전 「참고: 그림은 파일 …」의 Abbildung)
    for (const l of LANGS) expect(dict[l][kw('picture')]!.replace(/\s*\(P\)/, ''), l).not.toBe(dict[l][kw('image')]!.replace(/\s*\(I\)/, ''));
    expect(dict.de['참고: 그림은 파일 {0}(으)로 연결했습니다. 도면을 다른 곳에서 열려면 이 파일이 함께 있어야 합니다(ETRANSMIT로 묶으면 들어갑니다).']).toContain('Abbildung');
    expect(dict.de[kw('picture')]).toBe('Abbildung (P)');
  });

  it('PASTESPEC 상자 안내 「원본: …」과 빈 클립보드 오류 줄이 네 언어 모두 한국어 없이 보인다(통째 = 틀 번역 + 조각 번역)', () => {
    const misc = src('blkcmds-misc.ts');
    expect(misc).toContain("note: `원본: ${own ? `이 앱 클립보드(객체 ${own}개)` : '이 앱 클립보드 비어 있음'}${sys.image || sys.text ? ', 시스템 클립보드' : ''}`");
    expect(misc).toContain("`클립보드에 붙여 넣을 내용이 없습니다.${sys.error ? ` (시스템 클립보드: ${sys.error})` : ''}`");
    expect(misc).toContain(`error: '${NO_API}'`);
    const shown = ['원본: 이 앱 클립보드(객체 3개)', '원본: 이 앱 클립보드(객체 3개), 시스템 클립보드', '원본: 이 앱 클립보드 비어 있음, 시스템 클립보드', '클립보드에 붙여 넣을 내용이 없습니다. (시스템 클립보드: NotAllowedError: Read permission denied.)', NONE_NO_API];
    const left: string[] = [];
    for (const l of LANGS) {
      const d = dict[l];
      for (const s of shown) if (HANGUL.test(translate(s, l))) left.push(`${l}: ${translate(s, l)}`);
      for (const [key, a, b] of NOTES) expect(d[key], `${l}: ${key}`).toBe(d[NOTE_TPL]!.replace('{1}', b ? d[b]! : '').replace('{0}', d[a]!));
      const gap = l === 'ja' || l === 'zh-CN' ? '' : ' ';
      expect(d[NONE_ERR], l).toBe(d[NONE_TPL]!.replace('{0}', gap + d[SYS_ERR]));
      expect(d[NONE_NO_API], l).toBe(d[NONE_ERR]!.replace('{0}', d[NO_API]!));
    }
    expect(left).toEqual([]);
    expect(dict['zh-CN'][NOTES[1]![0]]).toBe('源：此应用程序剪贴板（{0} 个对象）,系统剪贴板');
    expect(dict.de[NONE_NO_API]).toBe('Die Zwischenablage enthält nichts zum Einfügen. (Systemzwischenablage: Dieser Browser kann die Systemzwischenablage nicht lesen.)');
  });

  it('오역: 기록 복사·다음으로·붙여넣을 형식(독일어)·PASTEBLOCK 결과(중국어)·그림 옵션·시스템 클립보드·빈 클립보드·여러 줄 문자·원본은 같은 사전의 낱말이다', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 명령행 메뉴 「기록 복사」 = 명령 기록(history) 복사 — 같은 사전 「명령 기록 펼치기」의 낱말
    expect(src('ctxmenu.ts')).toContain("{ label: '기록 복사', run: () => write(historyText()) }");
    const HELP = '도움말 · 명령 기록 펼치기 · 객체 스냅 · 직교 · 극좌표 추적 · 객체 스냅 추적 · 동적 입력';
    const HIST: Record<Lang, string> = { en: 'history', de: 'verlauf', ja: '履歴', 'zh-CN': '历史记录' };
    for (const l of LANGS) {
      expect(dict[l][HELP]!.toLowerCase(), l).toContain(HIST[l]);
      expect(dict[l][HISTORY_COPY]!.toLowerCase(), l).toContain(HIST[l]);
      expect(dict[l][HISTORY_COPY], l).not.toMatch(/Record|記録|录制|Datensatz/);
    }
    // PASTESPEC 상자 「다음으로」 = 붙여넣을 형식을 고르는 칸(명령행 물음과 같은 낱말)
    expect(src('blkcmds-misc.ts')).toContain("label: '다음으로', type: 'select'");
    for (const l of LANGS) expect(dict[l][AS], l).toBe(dict[l][HEAD]!.replace('[', '').trim());
    expect(LANGS.map((l) => dict[l][AS])).toEqual(['Format to paste', 'Einzufügendes Format', '貼り付け形式', '粘贴格式']);
    // 독일어 「붙여넣을 형식」: 같은 사전 「자를 객체」·「연장할 객체」의 꼴(zu + 분사) — 명령꼴 Format einfügen이 아니다
    expect(de['자를 객체 선택 또는 Shift 키를 누른 채 선택하여 연장']).toMatch(/^Zu stutzendes Objekt/);
    expect(de[TPL]).toBe('Einzufügendes Format [{0}] <{1}>:');
    // PASTEBLOCK 결과 줄(modify.ts): 개수는 「이 앱 클립보드(객체 {0}개)」 꼴 — 따옴표로 이름처럼 두르지 않는다
    expect(src('modify.ts')).toContain('`블록 "${ft(name)}"(객체 ${list.length}개)으로 붙여 넣었습니다.`');
    expect(zh[OWN]).toContain('{0} 个对象');
    expect(zh[AS_BLOCK]).toContain('{1} 个对象');
    expect(zh[AS_BLOCK]).not.toContain('“{1}”');
    // 그림 옵션: 복사한 객체를 PNG로 바꾼다(「복사한 객체를 그림으로 만들 수 없습니다.」 꼴) — 「PNG로 복사됨」이 아니다
    expect(src('blkcmds-misc.ts')).toContain(`label: '${PICTURE_OPT}'`);
    expect(zh['복사한 객체를 그림으로 만들 수 없습니다.']).toContain('将复制的对象转换为');
    expect(zh[PICTURE_OPT]).toContain('将复制的对象转换为');
    expect(de[PICTURE_OPT]).toContain('kopierte Objekte');
    expect(de[PICTURE_OPT]).not.toMatch(/kopiert\)/);
    // 시스템 클립보드(이 앱 클립보드와 다른 것)·빈 클립보드(붙여 넣을 것이 없음 — 「클립보드에 넣지 않았다」가 아니다)
    expect(de[NO_API]).toContain(de[SYS]!.replace(', ', ''));
    expect(de[NONE_TPL]).not.toMatch(/in die Zwischenablage eingefügt/);
    expect(de[NONE_TPL]).toContain(de['클립보드가 비어 있습니다. 먼저 객체를 복사(Ctrl+C)하십시오.']!.split(' ').slice(0, 2).join(' '));
    // 여러 줄 문자(MTEXT): 같은 사전 「여러 줄 문자」 낱말(multi-line string·複数行の文字列이 아니다)
    expect(src('blkcmds-misc.ts')).toContain(`ctx.print('${MTEXT_DONE}');`);
    expect(en[MTEXT_DONE]!.toLowerCase()).toContain(en['여러 줄 문자']!.toLowerCase());
    expect(ja[MTEXT_DONE]).toContain(ja['여러 줄 문자']!);
    // 원본 = 붙여 넣을 내용이 온 곳(source — 같은 사전 「원본 객체 선택:」 Select source object), 안내 조각은 뒤에 「, 시스템 클립보드」가 붙어 마침표가 없다
    expect(en['원본 객체 선택:']).toContain('source');
    expect(en[NOTE_TPL]).toBe('Source: {0}{1}');
    for (const l of LANGS) expect(dict[l][OWN_EMPTY], l).not.toMatch(/[.。]$/);
  });

  it('거꾸로 찾기: 바꾼 값과 새 열쇠의 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const fresh = [kw('objects'), kw('picture'), ...PROMPTS, ...NOTES.map(([k]) => k), NONE_ERR, NONE_NO_API];
    expect(fresh).toHaveLength(14);
    const changed: [Lang, string[]][] = [
      ['en', [HISTORY_COPY, AS, MTEXT_DONE, NOTE_TPL, OWN_EMPTY]],
      ['ja', [HISTORY_COPY, AS, MTEXT_DONE]],
      ['zh-CN', [HISTORY_COPY, AS, AS_BLOCK, PICTURE_OPT]],
      ['de', [HISTORY_COPY, AS, HEAD, TPL, PICTURE_OPT, NO_API, NONE_TPL, OWN_EMPTY]],
    ];
    expect(changed.map(([, ks]) => ks.length)).toEqual([5, 3, 4, 8]);
    for (const [l, keys] of changed) for (const k of keys) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
    for (const l of LANGS) for (const k of fresh) expect(sourceMessage(dict[l][k] ?? '(없음)'), `${l}: ${k}`).toBe(k);
  });
});
