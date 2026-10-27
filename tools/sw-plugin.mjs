import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * 오프라인용 서비스 워커(dist/sw.js)를 빌드 끝(closeBundle — 언어 쪽까지 다 쓴 뒤)에 만든다. 원본은 tools/sw-template.js.
 *
 * 미리 담는 것(처음 방문 뒤 오프라인에서 앱·편집기·저장이 되게): 다섯 언어 쪽과 앱 정보, 아이콘, assets/의 스크립트·스타일 가운데
 * "쓸 때만 받는" 덩어리를 뺀 것. 쓸 때만 받는 덩어리(lazy)는 빌드가 알려 준다(generateBundle):
 *   - 다른 언어 사전(site/locales/*.json — 하나에 180KB 안팎, 그 언어 쪽에서만 쓴다)
 *   - PDF 해석기(pdfjs-dist — PDF 언더레이·가져오기에서만 쓴다, 1.7MB)
 * 이것들과 글꼴(fonts/)·PDF 자료(pdfjs/)·예제 도면(samples/)은 서비스 워커가 쓸 때 담는다.
 * 판 이름 = 미리 담는 파일 이름·내용의 지문. 글꼴 등 큰 정적 파일은 따로 지문(STATIC)을 매겨, 바뀌지 않으면 배포가 바뀌어도 담아 둔 것을 지우지 않는다.
 */

const STATIC_DIRS = ['fonts/', 'pdfjs/', 'samples/'];

/** dist 아래 파일 목록(/ 구분 상대 경로, 정렬) */
export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/** 처음 설치 때 담을 파일인지. lazy: 쓸 때만 받는 assets/ 파일 이름 모음 */
export function precacheable(path, lazy = new Set()) {
  if (/\.map$/.test(path) || path === 'sw.js') return false;
  if (STATIC_DIRS.some((d) => path.startsWith(d))) return false;
  if (path.startsWith('assets/')) return /\.(?:m?js|css)$/.test(path) && !lazy.has(path);
  // 앱 쪽과 앱 정보(뿌리와 언어 쪽), 뿌리의 아이콘
  if (/^(?:[\w-]+\/)?(?:index\.html|manifest\.webmanifest)$/.test(path)) return true;
  return /^[\w.-]+\.(?:png|svg|ico)$/.test(path);
}

/** 미리 담을 주소들(앱 뿌리 기준 상대) — index.html은 그 디렉터리 주소('./', 'en/')로(탐색 요청과 같은 열쇠) */
export function precacheUrls(files, lazy = new Set()) {
  return files.filter((f) => precacheable(f, lazy)).map((f) => (f === 'index.html' ? './' : f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f));
}

/** 파일 이름·내용의 지문(앞 16자리) */
export function fingerprint(files, read) {
  const h = createHash('sha256');
  for (const f of files) h.update(f).update('\0').update(read(f)).update('\0');
  return h.digest('hex').slice(0, 16);
}

/** 서비스 워커 원본 */
export function serviceWorkerSource({ version, staticVersion, precache, assets }, template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')) {
  return template
    .replace("'__VERSION__'", JSON.stringify(version))
    .replace("'__STATIC__'", JSON.stringify(staticVersion))
    .replace('__PRECACHE__', JSON.stringify(precache))
    .replace('__ASSETS__', JSON.stringify(assets));
}

/** 빌드 결과에서 "쓸 때만 받는" 덩어리 이름(assets/…) */
export function lazyFiles(bundle) {
  const lazy = new Set();
  for (const item of Object.values(bundle)) {
    const name = item.fileName;
    if (!name.startsWith('assets/')) continue;
    if (item.type === 'chunk') {
      const ids = item.moduleIds ?? Object.keys(item.modules ?? {});
      if (/[\\/]site[\\/]locales[\\/][\w-]+\.json$/.test(item.facadeModuleId ?? '') || ids.some((id) => /[\\/]node_modules[\\/]pdfjs-dist[\\/]/.test(id))) lazy.add(name);
    } else {
      const origins = [...(item.originalFileNames ?? []), item.originalFileName ?? ''];
      if (origins.some((o) => /pdfjs-dist/.test(o)) || /(?:^|\/)pdf\.worker/.test(name)) lazy.add(name);
    }
  }
  return lazy;
}

/** Vite 플러그인: 빌드 끝에 dist/sw.js */
export function serviceWorker() {
  let root = 'dist';
  let lazy = new Set();
  return {
    name: 'opencad-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = join(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      for (const name of lazyFiles(bundle)) lazy.add(name);
    },
    closeBundle() {
      const files = listFiles(root);
      const read = (f) => readFileSync(join(root, f));
      const pre = files.filter((f) => precacheable(f, lazy));
      const staticFiles = files.filter((f) => STATIC_DIRS.some((d) => f.startsWith(d)));
      const source = serviceWorkerSource({
        version: fingerprint(pre, read),
        staticVersion: fingerprint(staticFiles, read),
        precache: precacheUrls(files, lazy),
        assets: files.filter((f) => f.startsWith('assets/') && /\.(?:m?js|css)$/.test(f)),
      });
      writeFileSync(join(root, 'sw.js'), source);
      lazy = new Set();
    },
  };
}
