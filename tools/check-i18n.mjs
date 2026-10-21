import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {languages,catalogs,metadataForLanguage} from '../site/i18n.mjs';
const keys=Object.keys(catalogs.en).sort();
for(const{code}of languages){
 if(code!=='ko'){
  const catalog=catalogs[code];assert.deepEqual(Object.keys(catalog).sort(),keys,code);
  for(const key of keys){assert.ok(catalog[key]?.trim(),`${code}: empty ${key}`);assert.deepEqual((catalog[key].match(/\{\d+\}/g)??[]).sort(),(key.match(/\{\d+\}/g)??[]).sort(),`${code}: parameters ${key}`);}
 }
 const raw=readFileSync(`dist/${code==='ko'?'':code+'/'}index.html`,'utf8');const metadata=metadataForLanguage(code);const dom=new JSDOM(raw,{url:metadata.url});const doc=dom.window.document;
 assert.equal(doc.documentElement.lang,code);assert.equal(doc.title,metadata.title);assert.equal(doc.querySelector('link[rel=canonical]').href,metadata.url);
 assert.equal(doc.querySelectorAll('link[rel=alternate][hreflang]').length,6);
 for(const item of languages)assert.equal(doc.querySelector(`link[hreflang="${item.code}"]`).href,metadataForLanguage(item.code).url);
 for(const script of doc.querySelectorAll('script[src]'))assert.equal(new URL(script.src).pathname.includes(`/${code}/assets/`),false,'nested language assets must resolve to application root');
 // 홈 화면에 추가: 언어 페이지마다 그 언어 이름으로 그 페이지에서 열리고(start_url), 범위는 앱 전체, 아이콘이 있는 앱 정보
 const root=metadataForLanguage('ko').url,file=url=>{assert.ok(url.startsWith(root),`${code}: outside the app ${url}`);return 'dist/'+url.slice(root.length);};
 const links=doc.querySelectorAll('link[rel=manifest]');assert.equal(links.length,1,`${code}: manifest link`);
 const manifestUrl=links[0].href,manifest=JSON.parse(readFileSync(file(manifestUrl),'utf8'));
 assert.equal(manifest.lang,code);assert.equal(manifest.display,'standalone');
 assert.equal(new URL(manifest.start_url,manifestUrl).href,metadata.url,`${code}: manifest start_url`);
 assert.equal(new URL(manifest.scope,manifestUrl).href,root,`${code}: manifest scope`);
 assert.equal(doc.querySelector('meta[name="apple-mobile-web-app-title"]').content,manifest.short_name,`${code}: apple-mobile-web-app-title`);
 for(const icon of manifest.icons)assert.ok(existsSync(file(new URL(icon.src,manifestUrl).href)),`${code}: icon ${icon.src}`);
 assert.ok(existsSync(file(doc.querySelector('link[rel=apple-touch-icon]').href)),`${code}: apple-touch-icon`);
 if(code!=='ko')assert.doesNotMatch(`${manifest.name} ${manifest.short_name} ${manifest.description}`,/[가-힣]/,`${code}: untranslated manifest`);
 if(code!=='ko'){
  const main=doc.querySelector('main');main.querySelectorAll('[data-static-languages]').forEach(el=>el.remove());
  assert.doesNotMatch(main.textContent,/[가-힣]/,`${code}: untranslated static introduction`);
 }
 dom.window.close();
}
console.log(`i18n check passed: five static language pages, reciprocal alternatives, relative assets, home-screen manifests and ${keys.length} catalog messages.`);
