/** 홈 화면에 추가: 웹 앱 매니페스트와 아이콘(크기·마스크 가능), 공통 head의 연결 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizeHtml, localizeManifest } from '../tools/localization-plugin.mjs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
/** PNG 머리(IHDR)의 가로·세로와 알파 채널 여부 */
function png(path: string): { w: number; h: number; alpha: boolean } {
  const b = read(path);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  const colorType = b[25]!;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
}

describe('웹 앱 매니페스트', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8'));

  it('독립 창으로 열고, 시작 주소·범위는 배포 경로 기준(./), 색은 theme-color와 같다', () => {
    expect(manifest).toMatchObject({ start_url: './', scope: './', display: 'standalone', lang: 'ko', theme_color: '#252a33', background_color: '#252a33' });
    // id를 두지 않아 start_url(앱 주소)이 id가 된다. "./"는 start_url의 출처 기준으로 풀려 사이트 뿌리(다른 앱과 같은 id)가 된다
    expect(manifest).not.toHaveProperty('id');
    expect(manifest.name).toMatch(/[가-힣]/);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.description).toMatch(/[가-힣]/);
    expect(read('index.html').toString('utf8')).toContain('<meta name="theme-color" content="#252a33" />');
  });

  it('아이콘 파일이 적힌 크기 그대로 있고, 마스크 가능 아이콘·애플 아이콘은 투명한 곳이 없다', () => {
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      const p = png(`public/${icon.src}`);
      expect([p.w, p.h], icon.src).toEqual([w, h]);
      if (icon.purpose === 'maskable') expect(p.alpha, icon.src).toBe(false);
    }
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`).sort()).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    expect(png('public/apple-touch-icon.png')).toEqual({ w: 180, h: 180, alpha: false });
  });

  it('공통 head(다섯 언어 페이지가 같이 쓴다)가 매니페스트·애플 아이콘·독립 실행 표시를 건다', () => {
    const html = read('index.html').toString('utf8');
    for (const tag of [
      '<link rel="manifest" href="./manifest.webmanifest" />',
      '<link rel="apple-touch-icon" href="./apple-touch-icon.png" />',
      '<meta name="mobile-web-app-capable" content="yes" />',
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    ])
      expect(html).toContain(tag);
  });

  it('공유 받기(share_target)·파일 연결(file_handlers)·이미 열린 창 쓰기(launch_handler): DWG·DXF와 앱이 여는 스크립트·LISP', () => {
    expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
    const accept: string[] = manifest.share_target.params.files[0].accept;
    expect(manifest.share_target.params.files[0].name).toBe('file');
    for (const a of ['.dwg', '.dxf', 'image/vnd.dwg', 'image/vnd.dxf']) expect(accept).toContain(a);
    const exts = Object.values(manifest.file_handlers[0].accept as Record<string, string[]>).flat().sort();
    expect(exts).toEqual(['.dwg', '.dxf', '.lsp', '.mnl', '.scr']);
    expect(manifest.file_handlers[0].action).toBe('./');
    for (const mime of Object.keys(manifest.file_handlers[0].accept)) expect(mime).toMatch(/^[a-z]+\/[\w.+-]+$/);
    expect(manifest.launch_handler.client_mode[0]).toBe('focus-existing');
    // 앱의 파일 고르기와 같은 확장자
    const shell = read('src/app/ui/shell.ts').toString('utf8');
    for (const ext of exts) expect(shell).toContain(ext);
  });

  it('언어 페이지(<언어>/)는 그 언어 이름의 앱 정보: 그 언어 페이지에서 열고, 범위·아이콘은 앱 뿌리', () => {
    expect(localizeManifest(manifest, 'ko')).toBe(manifest);
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) {
      const m = localizeManifest(manifest, lang);
      expect(m).toMatchObject({ lang, start_url: './', scope: '../', display: 'standalone', theme_color: '#252a33' });
      expect(m, lang).not.toHaveProperty('id');
      expect(`${m.name} ${m.short_name} ${m.description}`, lang).not.toMatch(/[가-힣]/);
      expect(m.short_name.length, lang).toBeLessThanOrEqual(12);
      expect(m.icons.map((i: { src: string }) => i.src)).toEqual(manifest.icons.map((i: { src: string }) => `../${i.src}`));
      // <언어>/manifest.webmanifest 기준으로 풀면 시작은 언어 페이지, 범위·아이콘은 앱 뿌리
      const at = `https://gyutae-kim.github.io/opencad-dwgdxf/${lang}/manifest.webmanifest`;
      expect(new URL(m.start_url, at).pathname).toBe(`/opencad-dwgdxf/${lang}/`);
      expect(new URL(m.scope, at).pathname).toBe('/opencad-dwgdxf/');
      expect(new URL(m.icons[0].src, at).pathname).toBe(`/opencad-dwgdxf/${m.icons[0].src.slice(3)}`);
      // 공유 받기·파일 연결도 그 언어 페이지로(서비스 워커는 앱 뿌리 범위라 언어 쪽 share-target도 받는다)
      expect(new URL(m.share_target.action, at).pathname).toBe(`/opencad-dwgdxf/${lang}/share-target`);
      expect(new URL(m.file_handlers[0].action, at).pathname).toBe(`/opencad-dwgdxf/${lang}/`);
    }
    const html = read('index.html').toString('utf8').replace('<!-- site-metadata -->', '');
    const en = localizeHtml(html, 'en');
    expect(en).toContain('<base href="../">');
    expect(en).toContain('<link rel="manifest" href="./en/manifest.webmanifest" />');
    expect(en).toContain(`<meta name="apple-mobile-web-app-title" content="${localizeManifest(manifest, 'en').short_name}" />`);
    expect(en).toContain('<link rel="apple-touch-icon" href="./apple-touch-icon.png" />');
    expect(localizeHtml(html, 'ko')).toContain('<link rel="manifest" href="./manifest.webmanifest" />');
  });
});
