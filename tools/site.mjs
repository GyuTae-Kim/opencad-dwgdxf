// 이 앱의 사이트 설정(opencad-site-kit): 검색 정보·언어 페이지·앱 정보와 오프라인 서비스 워커. vite.config.ts와 시험이 같이 쓴다.
import metadata from '../site/metadata.json' with { type: 'json' };
import history from '../site/content-history.json' with { type: 'json' };
import '../site/i18n.mjs';
import { defineSite } from 'opencad-site-kit/seo/site-metadata';
import { templateSource } from 'opencad-site-kit/pwa/sw-plugin';

export const site = defineSite({ metadata, history, manifest: { source: new URL('../public/manifest.webmanifest', import.meta.url) } });

/**
 * 처음 설치 때 담을 파일: 다섯 언어 쪽과 앱 정보, 뿌리의 아이콘, assets의 스크립트·스타일 가운데 쓸 때만 받는 덩어리(lazy)를 뺀 것.
 * 글꼴(fonts/)·PDF 자료(pdfjs/)·예제 도면(samples/)은 staticDirs라 여기 오기 전에 빠진다(서비스 워커가 쓸 때 담는다).
 */
export const precache = (path, { lazy }) => {
  if (/\.map$/.test(path) || path === 'sw.js') return false;
  if (path.startsWith('assets/')) return /\.(?:m?js|css)$/.test(path) && !lazy.has(path);
  if (/^(?:[\w-]+\/)?(?:index\.html|manifest\.webmanifest)$/.test(path)) return true;
  return /^[\w.-]+\.(?:png|svg|ico)$/.test(path);
};

/** 쓸 때만 받는 덩어리: 다른 언어 사전(site/locales/*.json — 그 언어 쪽에서만 쓴다), PDF 해석기(pdfjs-dist — PDF 언더레이·가져오기에서만 쓴다) */
export const lazy = {
  facade: [/[\\/]site[\\/]locales[\\/][\w-]+\.json$/],
  modules: [/[\\/]node_modules[\\/]pdfjs-dist[\\/]/],
  assetOrigins: [/pdfjs-dist/],
  assetNames: [/(?:^|\/)pdf\.worker/],
};

/**
 * serviceWorker(offline): 워커 본문은 tools/sw-template.js. 판 이름은 미리 담는 파일 이름·내용 지문의 앞 16자리(도구 기본값과 같다).
 * 글꼴·PDF 자료·예제는 따로 판(STATIC)을 매겨, 바뀌지 않으면 배포가 바뀌어도 담아 둔 것을 지우지 않는다.
 */
export const offline = {
  source: templateSource(new URL('./sw-template.js', import.meta.url)),
  precache,
  lazy,
  staticDirs: ['fonts/', 'pdfjs/', 'samples/'],
};
