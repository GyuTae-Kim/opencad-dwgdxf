/**
 * 화면 번역층의 도면 글 지킴(104차 — 편집기 조각에 둔다. 첫 화면 조각의 i18n.ts에는 고리 fileGuard만 있다).
 *
 * - ft()로 감싼 자리(filetext.ts)는 사용 영역 글자로 바꿔 옮긴 뒤 되돌리고 표시를 지운다.
 * - <option>의 글이 값(value 속성)과 같으면(대소문자 무시 — 값이 표 열쇠인 목록) 도면 글로 본다(앱이 쓰는 고르기 항목은 값이 영문 부호다 —
 *   도면층·선종류·스타일 목록은 값과 글이 같다).
 * - 명령행 기록·프롬프트·알림은 ft() 없이 쓴 곳이 많아, 열린 도면의 이름 표(도면층·블록·선종류·문자 스타일·치수 스타일·뷰·UCS·배치)에
 *   있는 글이 줄 전체·나눔 조각(" · ", " — ", " | ", ", ", 줄바꿈)·따옴표·<기본값> 안에 통째로 있으면 같은 방법으로 지킨다.
 *   앱 글이 우연히 이름과 같으면(도면층 "모형"과 앱 줄 "모형") 그 줄·조각은 한국어로 남는다 — 이름을 바꾸는 것보다 낫다.
 */
import { type CadDocument, tableKey } from '../core/model';
import { currentLanguage, translate } from '../../site/i18n-core.mjs';
import { fileGuard } from './i18n';
import { unmark } from './filetext';

const MARKED = /⁨([^⁨⁩]*)⁩/g;
/** 자리 표시 글자(사용 영역). 원문에 이미 있으면(기호 글꼴 등) 자리 표시를 쓰지 않는다 */
const HOLD = /[-]/;
/** 명령행 기록·프롬프트·알림(휴대폰 보기의 결과·프롬프트·<기본값> 단추 포함): 이름 표로 지키는 곳 */
const LOG = '.cmd-history, .cmd-prompt, .toast-text, .mv-res, .mv-prompt, .mv-raw, .mv-chip';
/** 따옴표·<기본값> 안의 글 */
const QUOTED = /(["“「<])([^"”」<>\n]+)(["”」>])/g;
/** 번역층이 조각마다 옮기는 나눔(사전 쪽과 같은 것에 쉼표 목록을 더함) */
const PIECES = /(\n| · | \| | — |, )/;

const edge = (s: string, re: RegExp): string => s.match(re)?.[0] ?? '';

/**
 * 도면 글 자리를 지켜 옮긴다. isName이 있으면 표시 없는 글에서도 이름 표에 있는 글을 찾아 지킨다.
 * 지킬 것이 없으면 undefined(번역층이 늘 하던 대로)
 */
export function guardedTranslate(text: string, language: string, isName?: (s: string) => boolean, ui = false): string | undefined {
  const marked = text.includes('⁨');
  if (!marked && !isName) return undefined;
  if (HOLD.test(text)) return marked ? unmark(text) : undefined;
  const files: string[] = [];
  const hold = (s: string) => String.fromCharCode(0xe000 + files.push(s) - 1);
  let t = marked ? text.replace(MARKED, (_m, s: string) => hold(s)) : text;
  if (isName) {
    const whole = t.trim();
    if (whole && !HOLD.test(whole) && isName(whole)) return unmark(text);
    t = t.replace(QUOTED, (m, a: string, s: string, b: string) => (isName(s) ? a + hold(s) + b : m));
    t = t
      .split(PIECES)
      .map((p) => {
        const s = p.trim();
        return s && !HOLD.test(s) && isName(s) ? edge(p, /^\s*/) + hold(s) + edge(p, /\s*$/) : p;
      })
      .join('');
  }
  if (!files.length) return marked ? unmark(text) : undefined;
  const r = translate(t, language, ui);
  const out = r === t ? t : edge(t, /^\s*/) + r + edge(t, /\s*$/);
  return unmark(out.replace(/[-]/g, (c) => files[c.charCodeAt(0) - 0xe000] ?? c));
}

/** 이름 표를 볼 문서들(열린 도면) */
export interface NameSource {
  readonly docs: readonly { readonly doc: CadDocument }[];
}

/** 열린 도면의 이름 표에 있는 글인지(대소문자 무시 — 표 열쇠와 같다) */
export function docNameTest(src: NameSource): (s: string) => boolean {
  return (s) => {
    if (s.length > 255) return false;
    const k = tableKey(s);
    for (const { doc: d } of src.docs) {
      if (d.layers.has(k) || d.blocks.has(k) || d.linetypes.has(k) || d.textStyles.has(k) || d.dimStyles.has(k) || d.views.has(k) || d.ucs.has(k)) return true;
      if (d.layouts.some((l) => tableKey(l.name) === k)) return true;
    }
    return false;
  };
}

let names: ((s: string) => boolean) | undefined;

/**
 * 캔버스에 그리는 앱 글(커서 옆 프롬프트 — 번역층이 보지 않는다)을 지금 화면 언어로. 프롬프트의 <기본값>·따옴표 안 도면 이름은
 * 명령행과 같이 지킨다(i18n-text.ts의 uiText와 같은 번역에 지킴만 더함)
 */
export function uiTextGuarded(text: string): string {
  const language = currentLanguage(typeof location === 'undefined' ? '/' : location.href);
  return guardedTranslate(text, language, names) ?? translate(text, language);
}

/** 화면 번역층에 도면 글 지킴을 붙인다(편집기가 앱을 만든 뒤 한 번) */
export function installFileGuard(src: NameSource): void {
  const isName = docNameTest(src);
  names = isName;
  // el은 글 마디면 부모 요소, 속성이면 그 요소(고르기 항목·명령행 줄에는 번역할 속성을 두지 않는다)
  fileGuard.fn = (text, language, el) => {
    const t = text.trim();
    // 값이 글 그대로이거나 표 열쇠(대문자)인 고르기 항목
    if (el.tagName === 'OPTION' && t && el.getAttribute('value')?.toUpperCase() === t.toUpperCase()) return text;
    const log = !!el.closest(LOG);
    if (!log && !text.includes('⁨')) return undefined;
    return guardedTranslate(text, language, log ? isName : undefined, !!el.closest('[data-i18n-ui-copy]'));
  };
}
