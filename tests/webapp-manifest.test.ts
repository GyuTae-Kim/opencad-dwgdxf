/** 홈 화면에 추가: 웹 앱 매니페스트와 아이콘(크기·마스크 가능), 공통 head의 연결 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
});
