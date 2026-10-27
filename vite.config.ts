import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { siteLocalization } from 'opencad-site-kit/i18n/localization-plugin';
import { siteMetadata } from 'opencad-site-kit/seo/site-plugin';
import { serviceWorker } from 'opencad-site-kit/pwa/sw-plugin';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { offline, site } from './tools/site.mjs';

/**
 * pdf.js가 필요할 때 받아 가는 자료(표준 글꼴, CMap, 그림 해독 wasm, ICC)를 `pdfjs/` 아래로 낸다.
 * 개발 서버는 node_modules에서 바로 주고, 빌드는 같은 경로로 복사한다(PDF 언더레이를 쓸 때만 받는다).
 */
function pdfjsAssets(): Plugin {
  const root = join(process.cwd(), 'node_modules/pdfjs-dist');
  const dirs = ['standard_fonts', 'cmaps', 'wasm', 'iccs'];
  const skip = /^quickjs/;
  return {
    name: 'opencad-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/pdfjs\/([a-z_]+)\/([\w.-]+)$/.exec((req.url ?? '').split('?')[0]!);
        if (!m || !dirs.includes(m[1]!) || skip.test(m[2]!)) return next();
        try {
          const data = readFileSync(join(root, m[1]!, m[2]!));
          res.setHeader('Content-Type', m[2]!.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
          res.end(data);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const d of dirs)
        for (const f of readdirSync(join(root, d))) {
          const p = join(root, d, f);
          if (skip.test(f) || !statSync(p).isFile()) continue;
          this.emitFile({ type: 'asset', fileName: `pdfjs/${d}/${f}`, source: readFileSync(p) });
        }
    },
  };
}

export default defineConfig({
  // GitHub Pages 프로젝트 사이트 경로(https://gyutae-kim.github.io/opencad-dwgdxf/)
  base: './',
  // 언어 페이지·검색 정보·언어별 앱 정보·사이트맵과 빌드 끝(언어 쪽까지 다 쓴 뒤)의 dist/sw.js(오프라인·공유 받기)는
  // 공용 사이트 도구(opencad-site-kit)가 tools/site.mjs 설정으로 만든다
  plugins: [siteLocalization(site), siteMetadata(site), pdfjsAssets(), serviceWorker(offline)],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 120_000,
  },
});
