/**
 * 도면에서 온 글(도면층·블록·스타일 이름, 문자 내용)은 화면 번역층이 바꾸지 않는다(104차).
 * 고치기 전에는 ① 사전 열쇠와 같은 이름("치수" → "Dimension"), ② 다른 언어 번역 글과 같은 이름(영어 화면에서 한국어로 바꾸면 "Standard" → "표준"),
 * ③ 나눔 글이 든 이름("치수 · 문자" → "Dimension · Text")이 바뀌었다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileGuard, installLocalization } from '../src/app/i18n';
import { docNameTest, guardedTranslate, installFileGuard } from '../src/app/fileguard';
import { ft, unmark } from '../src/app/filetext';
import { createNewDocument } from '../src/core/newdoc';
import { catalogs, translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

/** 사전 열쇠(틀) 하나와 그 영어 번역에 이름을 끼운 글 */
const template = (key: string, name: string) => {
  expect(catalogs.en?.[key], key).toBeTruthy();
  return translate(key, 'en').replace('{0}', name);
};

describe('guardedTranslate (명령행·알림 줄)', () => {
  const names = new Set(['치수', '문자', '치수 · 문자', 'Standard']);
  const isName = (s: string) => names.has(s);
  it('ft로 감싼 이름은 틀의 자리로만 옮기고 표시를 지운다', () => {
    expect(guardedTranslate(`블록 ${ft('치수')}을(를) 저장했습니다.`, 'en')).toBe(template('블록 {0}을(를) 저장했습니다.', '치수'));
    // 나눔 글이 든 이름도 통째로(전에는 조각마다 옮겨 "Dimension · Text"가 되었다)
    expect(guardedTranslate(`블록 ${ft('치수 · 문자')}을(를) 저장했습니다.`, 'en')).toBe(template('블록 {0}을(를) 저장했습니다.', '치수 · 문자'));
    // 한국어 화면: 번역 없이 표시만 지운다
    expect(guardedTranslate(`블록 ${ft('치수')}을(를) 저장했습니다.`, 'ko')).toBe('블록 치수을(를) 저장했습니다.');
  });
  it('이름 표에 있는 줄 전체·조각·따옴표·<기본값>은 그대로 둔다', () => {
    expect(guardedTranslate('치수', 'en', isName)).toBe('치수');
    expect(guardedTranslate('  Standard', 'en', isName)).toBe('  Standard');
    expect(guardedTranslate('치수 · 문자', 'en', isName)).toBe('치수 · 문자');
    expect(guardedTranslate('블록: 치수, 문자', 'en', isName)).toBe(template('블록: {0}', '치수, 문자'));
    const quoted = guardedTranslate('도면층 "치수"을(를) 찾을 수 없습니다.', 'en', isName)!;
    expect(quoted).toContain('"치수"');
    expect(quoted).not.toMatch(/찾을/);
    const prompt = guardedTranslate('블록 이름 입력 또는 [?] <치수>:', 'en', isName)!;
    expect(prompt).toContain('<치수>');
  });
  it('지킬 것이 없으면 번역층에 맡기고(undefined), 원문에 사용 영역 글자가 있으면 자리 표시를 쓰지 않는다', () => {
    expect(guardedTranslate('객체를 선택하십시오.', 'en', isName)).toBeUndefined();
    expect(guardedTranslate('객체를 선택하십시오.', 'en')).toBeUndefined();
    expect(guardedTranslate(` ${ft('치수')}`, 'en')).toBe(' 치수');
    expect(guardedTranslate(' 치수', 'en', isName)).toBeUndefined();
  });
  it('이름 표는 열린 도면의 도면층·블록·선종류·문자 스타일·치수 스타일·배치를 대소문자 없이 본다', () => {
    const doc = createNewDocument('metric');
    doc.layers.set('치수', { ...doc.layers.get('0')!, name: '치수' });
    const test = docNameTest({ docs: [{ doc }] });
    expect([test('치수'), test('standard'), test('Continuous'), test('ISO-25'), test('Layout1'), test('없는 이름')]).toEqual([true, true, true, true, true, false]);
    expect(test('x'.repeat(300))).toBe(false);
  });
  it('unmark는 표시만 지운다', () => {
    expect(unmark(`A ${ft('B')} C`)).toBe('A B C');
  });
});

describe('화면 번역층 + 도면 글 지킴(jsdom)', () => {
  const setup = async (url: string, body: string) => {
    const dom = new JSDOM(`<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header>${body}</div></body></html>`, { url });
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent']) vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
    const doc = createNewDocument('metric');
    for (const n of ['치수', '도면층', 'Dimension', '치수 · 문자']) doc.layers.set(n.toUpperCase(), { ...doc.layers.get('0')!, name: n });
    installFileGuard({ docs: [{ doc }] });
    dispose = await installLocalization(document.getElementById('app')!);
    return dom;
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('지킴이 없으면(103차까지) 같은 화면에서 도면 글이 바뀐다 — 아래 시험이 실제 결함을 보는지 확인', async () => {
    await setup('https://gyutae-kim.github.io/opencad-dwgdxf/en/', '');
    dispose?.();
    fileGuard.fn = undefined;
    dispose = await installLocalization(document.getElementById('app')!);
    const box = document.createElement('div');
    box.innerHTML = '<select><option value="치수">치수</option></select><div class="cmd-history"><div>  치수 · 문자</div></div>';
    document.getElementById('app')!.append(box);
    await tick();
    expect(box.querySelector('option')!.textContent).toBe(translate('치수', 'en'));
    expect(box.querySelector('.cmd-history div')!.textContent).not.toContain('치수 · 문자');
  });

  it('고르기 항목·명령행·ft 속성의 도면 글은 그대로, 앱 글은 옮긴다', async () => {
    await setup(
      'https://gyutae-kim.github.io/opencad-dwgdxf/en/',
      `<select id="s"><option value="치수">치수</option><option value="TEXT">Text</option><option value="Standard">Standard</option><option value="1">예</option><option>기본값</option></select>
       <div class="cmd-history"><div id="l1">치수</div><div id="l2">  치수 · 문자</div><div id="l3"></div></div>
       <button id="b" aria-label="${ft('치수')} 색 바꾸기">x</button><span id="v" translate="no">도면층</span><p id="app-copy">도면층</p>`,
    );
    const opts = [...document.querySelectorAll('#s option')].map((o) => o.textContent);
    expect(opts).toEqual(['치수', 'Text', 'Standard', translate('예', 'en'), translate('기본값', 'en')]);
    expect(document.getElementById('l1')!.textContent).toBe('치수');
    expect(document.getElementById('l2')!.textContent).toBe('  치수 · 문자');
    const label = document.getElementById('b')!.getAttribute('aria-label')!;
    expect(label).toContain('치수');
    expect(label).not.toMatch(/[⁨⁩]/);
    expect(document.getElementById('v')!.textContent).toBe('도면층');
    // 앱 글은 그대로 옮긴다(같은 글이 도면층 이름이어도 명령행·고르기 항목 밖이면 앱 글)
    expect(document.getElementById('app-copy')!.textContent).toBe(translate('도면층', 'en'));
    // 나중에 쓴 명령행 줄: ft로 감싼 이름과 앱 글
    document.getElementById('l3')!.textContent = `블록 ${ft('Dimension')}을(를) 저장했습니다.`;
    await tick();
    expect(document.getElementById('l3')!.textContent).toBe(template('블록 {0}을(를) 저장했습니다.', 'Dimension'));
  });

  it('영어 화면에서 한국어로 바꿔도 다른 언어 번역 글과 같은 이름을 한국어 열쇠로 되돌리지 않는다', async () => {
    await setup('https://gyutae-kim.github.io/opencad-dwgdxf/en/', '<select id="s"><option value="Standard">Standard</option><option value="Dimension">Dimension</option></select><div class="cmd-history"><div id="l">Dimension</div></div><p id="p">치수</p>');
    expect(document.getElementById('p')!.textContent).toBe('Dimension');
    (document.querySelector('.language-list [data-language="ko"]') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) await tick();
    expect(document.documentElement.lang).toBe('ko');
    expect([...document.querySelectorAll('#s option')].map((o) => o.textContent)).toEqual(['Standard', 'Dimension']);
    expect(document.getElementById('l')!.textContent).toBe('Dimension');
    // 앱 글은 한국어로 돌아온다
    expect(document.getElementById('p')!.textContent).toBe('치수');
  });
});
