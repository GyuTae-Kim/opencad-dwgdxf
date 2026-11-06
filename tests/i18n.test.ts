import { metadataForLanguage } from '../site/i18n.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { installLocalization } from '../src/app/i18n';
import { catalogs, currentLanguage, languageUrl, languages, translate } from '../site/i18n.mjs';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); vi.unstubAllGlobals(); });
describe('language URLs and UI presentation', () => {
  it('keeps launch parameters and fragments, with explicit language URLs', () => {
    expect(currentLanguage('https://example.test/opencad-skp/ja/?sample#view')).toBe('ja');
    expect(currentLanguage('https://example.test/opencad-skp/?lang=de')).toBe('de');
    const url = new URL(languageUrl('https://gyutae-kim.github.io/opencad-skp/?sample&open=a.skp#view','en'));
    expect(url.pathname).toBe('/opencad-skp/en/'); expect(url.searchParams.has('sample')).toBe(true);
    expect(url.searchParams.get('open')).toBe('a.skp'); expect(url.hash).toBe('#view');
  });
  it('ships matching catalogs and preserves numbered parameters', () => {
    const keys = Object.keys(catalogs['en']).sort();
    for (const {code} of languages.filter(item => item.code !== 'ko')) {
      expect(Object.keys(catalogs[code]).sort()).toEqual(keys);
      for (const key of keys) expect((catalogs[code][key].match(/\{\d+\}/g) ?? []).sort()).toEqual((key.match(/\{\d+\}/g) ?? []).sort());
    }
    expect(translate('열기 ▾','en')).toBe('Open ▾');
    const template = Object.keys(catalogs.en).find(key => key.includes('{0}') && /[가-힣]/.test(key))!;
    const example = template.replace(/\{\d+\}/g, 'FILE_A.skp');
    expect(translate(example,'en')).toContain('FILE_A.skp');
    expect(translate(example,'en')).not.toBe(example);
    expect(translate(template.replace(/\{\d+\}/g,'열기'),'en')).toContain('열기');
  });
  it('keeps CAD homonyms, command words and option letters in every catalog (101st review)', () => {
    const codes = ['en', 'ja', 'zh-CN', 'de'];
    const depth = (text: string) => [...text].reduce((n, ch) => n + Number('(（'.includes(ch)) - Number(')）'.includes(ch)), 0);
    // [한국어 열쇠에 든 말, 언어(*는 넷 다), 없어야 할 말, 이 열쇠는 빼기] — 101차에 찾은 한국어 동음이의 오역(AutoCAD 해당 언어 도움말의 낱말로 고침)
    // 배치(layout)→일괄(batch)·배포, 고름·고른(selected)→고름(膿)·짝수, 원점→Herkunft·起源, 배열(array)→数组, 축척→刻度(눈금), 치수→Dimension·维度(차원),
    // 플롯→Diagramm·地块(필지), 지시선→Führer(지도자)·引导线, 외 {0}개→바깥, 문자(text)→글자(character), 도면층 상태→Bundesstaat(연방 주),
    // 스냅→快照(스냅샷), 블록→区块·Blockieren(막다)·Schreibblock(메모장), 엔티티→Unternehmen, 여는 중→Eröffnung, 델타→航空(항공사)
    const rules: [string, string, RegExp, RegExp?][] = [
      ['배치', '*', /\bbatch|Stapel|Charge\b|Chargen|批次|批量|批处理|バッチ|[Dd]eployment|Bereitstellung/i, /일괄/],
      ['고름', '*', /Pus|Eiter|膿|脓|更正/],
      ['고른', '*', /偶数|\beven\b|gerade/],
      ['원점', '*', /Herkunft|起源/],
      ['배열', 'zh-CN', /数组/],
      ['축척', 'zh-CN', /刻度/],
      ['치수', 'de', /\bDimension(en)?\b|Dimensions/, /DIM[A-Z]/],
      ['치수', 'zh-CN', /维度/],
      ['플롯', 'de', /Diagramm/],
      ['플롯', 'zh-CN', /地块/],
      ['지시선', 'de', /Führers?\b/],
      ['지시선', 'zh-CN', /引导线/],
      ['외 {', '*', /Außerhalb|外部|Outside/],
      ['문자 스타일', '*', /character|Zeichenstil|字符/i],
      ['문자 높이', '*', /character|Zeichenhöhe|字符/i],
      ['여러 줄 문자', '*', /multiline character|mehrzeilige[nrs]? Zeichen|多行字符/i],
      ['문자 객체', '*', /character|Zeichenobjekt|字符/i],
      ['상태', 'de', /Bundesstaat/],
      ['스냅', 'zh-CN', /快照/, /스냅샷/],
      ['블록', 'zh-CN', /区块/],
      ['블록', 'de', /Blockier|Schreibblock/],
      ['엔티티', 'de', /Unternehmen/],
      ['여는 중', 'de', /Eröffnung/],
      ['델타', '*', /航空/],
    ];
    for (const [term, lang, ban, except] of rules)
      for (const code of lang === '*' ? codes : [lang])
        for (const [key, value] of Object.entries(catalogs[code])) {
          if (!key.includes(term) || except?.test(key)) continue;
          expect(value, `${code}: ${key}`).not.toMatch(ban);
        }
    // 배치 탭·배치 이름·배치(L)처럼 레이아웃을 말하는 열쇠는 Layout·レイアウト·布局으로(반복·수직·문자 배치처럼 놓기를 말하는 곳은 빼고)
    const layoutKey = /^<?배치|배치 (탭|블록|이름|옵션)|모형·배치|[의에] 배치가|배치 "/;
    const placeKey = /반복 배치|수직 배치|수평 배치|배치할|번호 배치|문자 배치|지시선 배치|항목 배치|옆에 배치|배치 지정|배치 가능/;
    for (const code of codes)
      for (const [key, value] of Object.entries(catalogs[code])) {
        if (layoutKey.test(key) && !placeKey.test(key)) expect(value, `${code}: ${key}`).toMatch(/[Ll]ayout|レイアウト|布局/);
        // 보이지 않는 글자·한국어가 남은 글·괄호 짝이 깨진 글(de "Versatz (O))", zh "间距（用户）定义）")
        expect(value, `${code}: ${key}`).not.toMatch(/[​-‍﻿]|[가-힣]/);
        if (depth(key) === 0) expect(depth(value), `${code}: ${key}`).toBe(0);
        // 입력하는 고를 글자: 번역의 (X)·(LA)는 원문에 있는 글자(de Ja (J)·Breite (B), zh 半径(L)·(瓦)처럼 바뀌면 입력이 맞지 않는다). 독일어 BKS는 UCS
        for (const m of value.matchAll(/[(（]([A-Z][A-Z0-9]{0,3}|\.)[)）]/g))
          if (!(code === 'de' && m[1] === 'BKS')) expect(key, `${code}: ${value}`).toContain(m[1]);
        // 괄호 속 명령·변수 이름(PUBLISH·OVERKILL·DIMCEN 등)과 입력하는 ByLayer·BYLAYER는 옮기지 않는다(README: 명령 식별자는 번역하지 않습니다)
        for (const m of key.matchAll(/\(([A-Z][A-Z0-9]{2,})\)/g)) expect(value, `${code}: ${key}`).toContain(m[1]);
        if (/bylayer|byblock/i.test(key) && !(code === 'de' && /VonLayer|VonBlock/.test(value) && !/입력/.test(key)))
          expect(value, `${code}: ${key}`).toMatch(/bylayer|byblock/i);
        // 1인칭으로 옮긴 알림(I didn't use…, Ich habe…, 我…)과 밀린 줄(다음 줄 머리 "The value"·"Der Wert"가 끝에 붙은 것)
        if (!key.startsWith('<p>')) expect(value, `${code}: ${key}`).not.toMatch(/\bI (read|did|didn't|can't|work|selected)\b|\bIch (habe|brauche|arbeite|kann|konnte)\b|District|Bezirk|VONAYER|ETERANSMIT/);
        if (code === 'zh-CN' && !key.startsWith('<p>') && !key.includes('나요?')) expect(value, `${code}: ${key}`).not.toMatch(/我(?!们)/);
        expect(value, `${code}: ${key}`).not.toMatch(/\b(The value|The|Der Wert|Der|Die|Das)$/);
        // 머리가 앞 줄로 밀려 문장 부호나 {0}만 남은 번역(".", "?", "{0}", "ein.")
        if (/[가-힣]{2}/.test(key.replace(/\{\d+\}/g, ''))) {
          expect(value.replace(/\{\d+\}|[\s.,:;!?·…()（）。，：？]/g, ''), `${code}: ${key}`).not.toBe('');
          expect(value, `${code}: ${key}`).not.toMatch(/^[a-zäöü]+[.?]$/);
        }
        if (code === 'en' && /^[가-힣]/.test(key) && !/^(또는|를|을|의|에|와|과|로)/.test(key) && /[.:?]$/.test(key)) expect(value, `${code}: ${key}`).not.toMatch(/^[a-z]/);
      }
    expect(codes.map((code) => translate('구', code))).toEqual(['Sphere', '球', '球体', 'Kugel']);
    expect(codes.map((code) => translate('(원점)', code))).toEqual(['(origin)', '(原点)', '（原点）', '(Ursprung)']);
    expect(codes.map((code) => translate('배치', code))).toEqual(['Layout', 'レイアウト', '布局', 'Layout']);
    expect(codes.map((code) => translate('반복 배치', code))).toEqual(['Repeat placement', '繰り返し配置', '重复放置', 'Platzierung wiederholen']);
    expect(codes.map((code) => translate('고름: LINE "0" #1A (2D)', code).split(/[:：]/)[0])).toEqual(['Selected', '選択', '选择', 'Ausgewählt']);
    expect(codes.map((code) => translate('비교 닫기(COMPARECLOSE)', code))).toEqual(['Close comparison (COMPARECLOSE)', '比較を終了 (COMPARECLOSE)', '关闭比较 (COMPARECLOSE)', 'Vergleich schließen (COMPARECLOSE)']);
    // 이웃 줄로 밀렸던 문장: 앞 줄 꼬리와 뒤 줄 머리가 제자리로
    expect(translate('값은 0보다 커야 합니다.', 'en')).toBe('The value must be greater than 0.');
    expect(translate('객체를 선택하십시오.', 'de')).toBe('Wählen Sie Objekte aus.');
    expect(translate('{0} 지정 또는 [양쪽(B)]:', 'zh-CN')).toBe('指定 {0} 或 [两者(B)]：');
  });
  it('updates dynamic UI and switches languages without changing document data or listeners', async () => {
    const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"><button>열기</button><span class="docname">열기</span></header><canvas></canvas><div class="anno-layer">열기</div><input value="열기" placeholder="열기"><div contenteditable="true">열기</div><div translate="no">열기</div><p id="status">열기</p></div></body></html>', {url:'https://gyutae-kim.github.io/opencad-skp/en/?sample#view'});
    for (const name of ['window','document','Node','Element','HTMLAnchorElement','MutationObserver','location','history','localStorage','CustomEvent']) vi.stubGlobal(name,(dom.window as unknown as Record<string,unknown>)[name]);
    const root = document.getElementById('app')!;
    const existing=document.createElement('p');existing.id='pretranslated';existing.textContent=translate('열기','en');root.append(existing);
    const canvas = root.querySelector('canvas');
    const button = root.querySelector('button')!; const clicked = vi.fn(); button.addEventListener('click',clicked);
    dispose=await installLocalization(root);
    expect(button.textContent).toBe(translate('열기','en'));
    expect(root.querySelector('.docname')!.textContent).toBe('열기'); expect(root.querySelector('input')!.value).toBe('열기');
    expect(root.querySelector('input')!.placeholder).toBe(translate('열기','en'));
    expect(root.querySelector('[contenteditable]')!.textContent).toBe('열기');
    expect(root.querySelector('.anno-layer')!.textContent).toBe('열기');
    const status = document.getElementById('status')!; status.textContent='닫기';
    await new Promise(resolve=>setTimeout(resolve,0)); expect(status.textContent).toBe(translate('닫기','en'));
    const dialog=document.createElement('div');dialog.textContent='닫기';document.body.append(dialog);
    await new Promise(resolve=>setTimeout(resolve,0));expect(dialog.textContent).toBe(translate('닫기','en'));
    const prompt=document.createElement('span');prompt.textContent='객체 선택 또는 [';document.body.append(prompt);
    await new Promise(resolve=>setTimeout(resolve,0));expect(prompt.textContent).toBe(translate('객체 선택 또는 [','en'));
    expect(prompt.textContent).not.toMatch(/[가-힣]/);
    const label=document.createElement('p');label.setAttribute('data-i18n-ui-copy','');label.textContent='도면 비교: 현재 도면에서만 있는 객체의 색상';document.body.append(label);
    await new Promise(resolve=>setTimeout(resolve,0));expect(label.textContent).not.toMatch(/[가-힣]/);
    const trigger=root.querySelector<HTMLButtonElement>('.language-trigger')!;
    trigger.click();expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu=document.querySelector<HTMLElement>('.language-list')!;
    expect(menu.hidden).toBe(false);expect(menu.querySelectorAll('[role=menuitemradio]')).toHaveLength(5);
    (menu.querySelector('[data-language=de]') as HTMLButtonElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(document.getElementById('pretranslated')!.textContent).toBe(translate('열기','de'));
    expect(document.documentElement.lang).toBe('de');expect(button.textContent).toBe(translate('열기','de'));
    expect(dialog.textContent).toBe(translate('닫기','de'));
    expect(location.search).toBe('?sample');expect(location.hash).toBe('#view');
    expect(menu.hidden).toBe(true);
    expect(menu.querySelector('[data-language=de]')!.getAttribute('aria-checked')).toBe('true');
    trigger.click();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(menu.hidden).toBe(true);expect(document.activeElement).toBe(trigger);
    trigger.click();(menu.querySelector('[data-language=ko]') as HTMLButtonElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));expect(button.textContent).toBe('열기');
    expect(root.querySelector('canvas')).toBe(canvas);button.click();expect(clicked).toHaveBeenCalledOnce();
    expect(root.querySelector('[translate="no"]:not(.language-control):not(.language-list)')!.textContent).toBe('열기');
    dispose();dispose=undefined;dom.window.close();
  });
  it('switches actual sharing image URLs and native control names while preserving source data', async () => {
    const korean = metadataForLanguage('ko');
    const dom = new JSDOM(`<!doctype html><html><head><title>OpenCAD</title><meta property="og:image"><meta property="og:image:secure_url"><meta name="twitter:image"><script type="application/ld+json">{"@graph":[{"@type":"WebApplication"}]}</script></head><body><div id="app"><header class="titlebar"><button>열기</button></header><span class="docname">열기.skp</span></div></body></html>`, {url:languageUrl(korean.url,'en')+'?sample#view'});
    for (const name of ['window','document','Node','Element','HTMLAnchorElement','MutationObserver','location','history','localStorage','CustomEvent']) vi.stubGlobal(name,(dom.window as unknown as Record<string,unknown>)[name]);
    const root = document.getElementById('app')!;
    dispose=await installLocalization(root);
    const labels = {en:'Choose language', de:'Sprache wählen', ko:'언어 선택'};
    for (const code of ['en','de','ko'] as const) {
      if (code!=='en') {
        (document.querySelector(`.language-list [data-language="${code}"]`) as HTMLButtonElement).click();
        for (let i=0;i<4;i++) await new Promise(resolve=>setTimeout(resolve,0));
      }
      const image = code==='ko' ? korean.image.url : `https://gyutae-kim.github.io/assets/i18n/${code}/og/opencad.jpg`;
      for (const selector of ['meta[property="og:image"]','meta[property="og:image:secure_url"]','meta[name="twitter:image"]']) expect(document.querySelector(selector)!.getAttribute('content')).toBe(image);
      expect(JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!)['@graph'][0].image).toBe(image);
      expect(root.querySelector('.language-trigger')!.getAttribute('aria-label')).toBe(labels[code]);
      expect(root.querySelector('.docname')!.textContent).toBe('열기.skp');

    }
    dispose();dispose=undefined;dom.window.close();
  });

});
