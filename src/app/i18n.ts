import { createLanguageMenu } from 'opencad-site-kit/i18n/language-menu';
/** Localize only presentation DOM. CAD data, input values and command keys stay intact. */
import { catalogs, currentLanguage, languages, languageUrl, metadataForLanguage, registerCatalog, sourceMessage, translate } from '../../site/i18n-core.mjs';

const loaders: Record<string, () => Promise<{default: Record<string,string>}>> = {
  en: () => import('../../site/locales/en.json'), ja: () => import('../../site/locales/ja.json'),
  'zh-CN': () => import('../../site/locales/zh-CN.json'), de: () => import('../../site/locales/de.json'),
};
async function loadLanguage(language: string): Promise<void> { if (loaders[language]) registerCatalog(language,(await loaders[language]()).default); }

type RecordValue = { source: string; rendered: string };
/**
 * 편집기가 붙이는 도면 글 지킴(104차, fileguard.ts — 첫 화면 조각에는 이 고리만 둔다): 원문·언어·요소(글 마디면 부모, 속성이면 그 요소)를 받아
 * 보일 글을 돌려준다(도면 글이면 원문 그대로). undefined면 아래 번역을 그대로 한다
 */
export const fileGuard: { fn?: (text: string, language: string, el: Element) => string | undefined } = {};
// 다른 OpenCAD 앱(SKP·STEP)에만 있는 칸(.pmi-layer·.tree-name·.scene-tabs 등)은 뺐다(104차 — 이 앱에는 없는 클래스, 첫 화면 조각 크기)
const SKIP = '[data-static-languages], [translate="no"], [data-i18n-skip], script, style, [contenteditable]:not([contenteditable="false"]), textarea, input, code, pre, canvas, svg, .anno-layer, .docname, .cmd-input, .boot-recent-list button, .layer-name';
export async function installLocalization(root: HTMLElement): Promise<() => void> {
  let language = currentLanguage(location.href);
  await loadLanguage(language);
  const presentationRoot = document.body;
  const texts = new WeakMap<Node, RecordValue>();
  const attributes = new WeakMap<Element, Map<string, RecordValue>>();
  const control = createLanguageMenu(languages, language, changeLanguage);
  function value(current: string, el: Element, record?: RecordValue, uiCopy = false): RecordValue {
    const kept = record && current === record.rendered ? record.source : undefined;
    // 도면 글 지킴은 거꾸로 찾기(sourceMessage)보다 먼저 — 다른 언어 번역 글과 같은 이름("Standard")을 한국어 열쇠로 되돌리지 않는다
    const raw = kept ?? current, guarded = fileGuard.fn?.(raw, language, el);
    if (guarded !== undefined) return { source: raw, rendered: guarded };
    const source = kept ?? sourceMessage(current);
    // Only explicitly authored UI titles may translate composite fragments.
    const rendered = uiCopy && !catalogs[language]?.[source.replace(/\s+/g,' ').trim()]
      ? source.split(/(:\s+)/).map(part => translate(part,language,true)).join('')
      : translate(source, language, uiCopy);
    // Keep spacing around split text nodes and inline elements.
    return { source, rendered: rendered === source ? source : (source.match(/^\s*/)?.[0] ?? '') + rendered + (source.match(/\s*$/)?.[0] ?? '') };
  }
  function element(el: Element): void {
    if ((el.matches(SKIP) && !el.matches('input, textarea, canvas, [contenteditable]')) || el.closest('[translate="no"], [data-i18n-skip]')) return;
    const records = attributes.get(el) ?? new Map<string, RecordValue>(); attributes.set(el, records);
    for (const name of ['title','aria-label','aria-description','placeholder','alt']) {
      if (!el.hasAttribute(name)) continue;
      const record = value(el.getAttribute(name)!, el, records.get(name), !!el.closest('[data-i18n-ui-copy]')); records.set(name, record);
      if (el.getAttribute(name) !== record.rendered) el.setAttribute(name, record.rendered);
    }
    if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) {
      const current = el.getAttribute('href')!; const old = records.get('href');
      const source = old && current === old.rendered ? old.source : current;
      const rendered = languageUrl(new URL(source, document.baseURI).href, language);
      records.set('href',{source,rendered}); if (el.getAttribute('href') !== rendered) el.setAttribute('href',rendered);
    }
  }
  function update(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(SKIP)) return;
      const record = value(node.nodeValue ?? '', node.parentElement, texts.get(node), !!node.parentElement.closest('[data-i18n-ui-copy]')); texts.set(node, record);
      if (node.nodeValue !== record.rendered) node.nodeValue = record.rendered;
      return;
    }
    if (!(node instanceof Element) || node.parentElement?.closest(SKIP)) return;
    if (node.matches(SKIP)) { if (node.matches('input, textarea, canvas, [contenteditable]')) element(node); return; }
    element(node);
    for (const child of Array.from(node.childNodes)) update(child);
  }
  function mountSelector(): void {
    // The shared widget preserves native language names with translate="no".
    // Its own accessible name still follows the selected UI language.
    const label = translate('언어 선택', language);
    const trigger = control.element.querySelector('button');
    const menu = document.getElementById(trigger?.getAttribute('aria-controls') ?? '');
    for (const el of [trigger, menu]) if (el && el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    if (trigger && trigger.title !== label) trigger.title = label;
    const host = root.querySelector('.titlebar, .topbar, header');
    if (host) { control.element.classList.remove('language-control-floating'); if (control.element.parentNode !== host) host.append(control.element); }
    if (!control.element.isConnected) { control.element.classList.add('language-control-floating'); root.append(control.element); }
  }
  let titleSource = sourceMessage(document.title);
  function metadata(): void {
    const data = metadataForLanguage(language);
    document.documentElement.lang = language;
    const previous = titleSource;
    document.title = translate(previous,language);
    const originalName = metadataForLanguage('ko').siteName;
    if (previous.endsWith(originalName)) document.title = previous.slice(0,-originalName.length) + translate(originalName,language);
    // og:로 시작하는 것은 meta[property=…], 나머지는 meta[name=…]
    const fields: Record<string,string> = {
      description:data.description,author:data.author.name,'og:locale':data.locale,
      'og:title':data.title,'og:description':data.description,'og:url':data.url,
      'og:site_name':data.siteName,'og:image':data.image.url,'og:image:secure_url':data.image.url,'og:image:alt':data.image.alt,
      'twitter:title':data.title,'twitter:description':data.description,'twitter:image':data.image.url,'twitter:image:alt':data.image.alt,
    };
    for (const [key,content] of Object.entries(fields)) document.querySelector(`meta[${key.startsWith('og:') ? 'property' : 'name'}="${key}"]`)?.setAttribute('content',content);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href',data.url);
    const graph = document.querySelector('script[type="application/ld+json"]');
    if (graph?.textContent) {
      const existing = JSON.parse(graph.textContent);
      for (const item of existing['@graph'] ?? []) {
        if (item['@type'] === 'WebApplication') Object.assign(item,{...data.application,'@id':data.url+'#app',url:data.url,description:data.description,inLanguage:language,image:data.image.url,author:data.author});
        if (item['@type'] === 'BreadcrumbList') item.itemListElement=data.breadcrumbs;
      }
      graph.textContent=JSON.stringify(existing).replace(/</g,'\\u003c');
    }
  }
  async function changeLanguage(next: string): Promise<void> {
    try { await loadLanguage(next); } catch { return; }
    const url = new URL(languageUrl(location.href,next));
    // Dev servers use /en/; published apps use /opencad-<format>/en/.
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      const base = location.pathname.match(/^\/(?:2dcad-viewer|opencad-(?:dwgdxf|skp|step|nc))\//)?.[0] ?? '/';
      url.pathname = base + (next === 'ko' ? '' : next + '/');
    }
    language = next;
    control.setLanguage(language);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    metadata(); update(presentationRoot);
    mountSelector();
    root.dispatchEvent(new CustomEvent('languagechange',{detail:language}));
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of Array.from(record.addedNodes)) update(node);
      else update(record.target);
    }
    mountSelector();
  });
  metadata(); update(presentationRoot); mountSelector();
  root.dispatchEvent(new CustomEvent('languagechange',{detail:language}));
  const title = document.querySelector('title');
  const titleObserver = new MutationObserver(() => {
    const current = document.title;
    const originalName = metadataForLanguage('ko').siteName;
    const translatedName = translate(originalName,language);
    if (current === translate(titleSource,language) || (titleSource.endsWith(originalName) && current === titleSource.slice(0,-originalName.length)+translatedName)) return;
    titleSource=sourceMessage(current);
    if (current.endsWith(originalName)) document.title=current.slice(0,-originalName.length)+translatedName;
    else document.title=translate(current,language);
  });
  if (title) titleObserver.observe(title,{childList:true,subtree:true,characterData:true});
  observer.observe(presentationRoot,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','aria-description','placeholder','alt','href']});
  return () => { observer.disconnect(); titleObserver.disconnect(); control.dispose(); };
}
