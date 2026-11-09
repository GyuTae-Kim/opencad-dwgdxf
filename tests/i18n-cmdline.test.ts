/**
 * 명령행 출력·프롬프트에 끼우는 도면 글(105차): ft()로 감싸 화면 번역층이 옮기지 않게 하고,
 * 값이 되는 길(AutoLISP 오류 글·변수 값·저장한 도면·기록 복사)에는 표시(U+2068·U+2069)가 섞이지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine, balanceMarks } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { writeDxf } from '../src/io/dxf/writer';
import { registerDrawCommands } from '../src/app/draw';
import { registerDashCommands } from '../src/app/dashcmds';
import { registerTableCommands } from '../src/app/tables';
import { translate } from '../site/i18n.mjs';
import { makeLispApp } from './lisp/app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const MARK = /[⁨⁩]/;

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('명령행 줄의 도면 글(ft)', () => {
  it('이름 표에 없는 도면 글이 줄 전체이거나 나눔 글을 품으면 번역층이 바꾼다 — ft로 감싸면 그대로', () => {
    // AutoLISP princ 출력·XDLIST 값처럼 줄 전체가 도면 글(사전 열쇠와 같은 글)
    expect(translate('치수', 'en')).not.toBe('치수');
    expect(guardedTranslate(ft('치수'), 'en')).toBe('치수');
    // -XREF ? 목록 줄: 이름에 " · "가 들면 조각마다 옮겨졌다
    const plain = `${'치수 · 문자'.padEnd(24)}a.dwg`;
    expect(translate(plain, 'en')).not.toBe(plain);
    expect(guardedTranslate(`${ft('치수 · 문자'.padEnd(24))}${ft('a.dwg')}`, 'en')).toBe(plain);
  });

  it('앱 글은 그대로 옮기고 감싼 자리만 남긴다', () => {
    const line = `블록 ${ft('치수 · 문자')}을(를) 저장했습니다.`;
    const out = guardedTranslate(line, 'en')!;
    expect(out).toBe(translate('블록 {0}을(를) 저장했습니다.', 'en').replace('{0}', '치수 · 문자'));
    expect(out).not.toMatch(MARK);
  });

  it('balanceMarks: 조각 경계에서 나뉜 표시를 조각마다 닫고 다시 연다', () => {
    expect(balanceMarks(['⁨A [', 'Yes', '/', 'No', ']⁩ <⁨B⁩>:'])).toEqual(['⁨A [⁩', '⁨Yes⁩', '⁨/⁩', '⁨No⁩', '⁨]⁩ <⁨B⁩>:']);
    expect(balanceMarks(['그대로 [', '예(Y)', ']:'])).toEqual(['그대로 [', '예(Y)', ']:']);
  });
});

describe('명령행 DOM(jsdom) — 프롬프트 키워드와 기록 복사', () => {
  const setup = async (url: string) => {
    const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', { url });
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent']) vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
    installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
    dispose = await installLocalization(document.getElementById('app')!);
    return dom;
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('프로그램이 정한 프롬프트(AutoLISP)를 키워드 단추로 나눠도 글은 그대로, 키워드는 표시 없이 넘긴다', async () => {
    const dom = await setup('https://gyutae-kim.github.io/opencad-dwgdxf/de/');
    const keys: string[] = [];
    const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword: (k) => void keys.push(k), repeat() {} });
    cmd.setPrompt(ft('Delete layer [Yes/No] <No>:'));
    await tick();
    const el = document.querySelector('.cmd-prompt')!;
    expect(el.textContent).toBe('Delete layer [Yes/No] <No>:');
    const spans = [...el.querySelectorAll('.kw')];
    expect(spans.map((s) => s.textContent)).toEqual(['Yes', 'No']);
    spans[0]!.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    expect(keys).toEqual(['Yes']);
    // 지켜보는 쪽(휴대폰 보기)·LISP가 읽는 프롬프트에는 표시가 없다
    expect(cmd.prompt).toBe('Delete layer [Yes/No] <No>:');
  });

  it('기록 줄의 표시는 화면과 기록 복사에서 모두 빠진다', async () => {
    await setup('https://gyutae-kim.github.io/opencad-dwgdxf/en/');
    const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
    cmd.print(`블록 ${ft('치수')}을(를) 저장했습니다.`);
    await tick();
    const shown = document.querySelector('.cmd-history div')!.textContent!;
    expect(shown).toContain('치수');
    expect(shown).not.toMatch(MARK);
    expect(cmd.historyText()).not.toMatch(MARK);
  });
});

describe('값이 되는 길에는 표시가 섞이지 않는다', () => {
  const setup = () => {
    const h = makeLispApp();
    registerDrawCommands(h.app);
    registerTableCommands(h.app);
    registerDashCommands(h.app);
    return h;
  };

  it('AutoLISP: *error*·vl-catch-all-error-message가 받는 오류 글에는 표시가 없고, 화면 줄에만 있다', async () => {
    const h = setup();
    await h.lisp('(setq r (vl-catch-all-apply (quote (lambda (x) (command x))) (list "없는명령")))');
    await h.lisp('(= (vl-catch-all-error-message r) "알 수 없는 명령 \\"없는명령\\"")');
    expect(h.printed.at(-1)?.text).toBe('T');
    await h.lisp('(defun *error* (m) (setq got m) (princ))');
    await h.lisp('(command "없는명령")');
    await h.lisp('(= got "알 수 없는 명령 \\"없는명령\\"")');
    expect(h.printed.at(-1)?.text).toBe('T');
    await h.lisp('(setq *error* nil)');
    await h.lisp('(command "없는명령")');
    expect(h.raw.some((l) => l.includes(`"${ft('없는명령')}"`))).toBe(true);
    // AutoLISP이 찍는 글은 통째로 감싸 번역층이 옮기지 않는다
    await h.lisp('(princ "치수")');
    expect(h.raw).toContain(ft('치수"치수"'));
    expect(h.printed.at(-1)?.text).toBe('치수"치수"');
  });

  it('도면 변수·저장한 도면에는 명령행에 감싸 보인 이름이 표시 없이 들어간다', async () => {
    const h = setup();
    await h.lisp('(entmake (list (cons 0 "LINE") (cons 8 "치수 · 문자") (list 10 0.0 0.0 0.0) (list 11 1.0 1.0 0.0)))');
    await h.lisp('(command "SETVAR" "CLAYER" "치수 · 문자")');
    await h.lisp('(= (getvar "CLAYER") "치수 · 문자")');
    expect(h.printed.at(-1)?.text).toBe('T');
    expect(String(h.doc.header.get('$CLAYER'))).toBe('치수 · 문자');
    for (const l of h.doc.layers.values()) expect(l.name).not.toMatch(MARK);
    const text = new TextDecoder().decode(writeDxf(h.doc).data);
    expect(text).toContain('치수 · 문자');
    expect(text).not.toMatch(MARK);
  });
});
