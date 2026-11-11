/**
 * 113차: 언어 사전의 명령 프롬프트. 명령행은 번역한 글의 [ ]·< >를 읽어 고르기 항목을 만들므로 괄호 짝이 깨진 번역은 항목이 틀어진다
 * (예: "<冻结>解锁>:", "[First]点(F)]", "[Vertikal] Koordinaten (O)/…]"). 중국어는 옵션 이름이 영어로 남거나("Smelt(M)") 플롯을 그리기(绘图)로 옮기지 않는다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const count = (s: string, c: string) => s.split(c).length - 1;

describe('언어 사전 프롬프트', () => {
  for (const lang of ['en', 'de', 'ja', 'zh-CN']) {
    it(`${lang}: 프롬프트의 대괄호·꺾쇠 짝이 맞는다`, () => {
      const bad: string[] = [];
      for (const [k, v] of Object.entries(load(lang))) {
        if (k.startsWith('#version') || !/[[<]/.test(k)) continue;
        // 원문 자체가 조각이라 짝이 없는 줄은 보지 않는다
        if (count(k, '[') !== count(k, ']') || count(k, '<') !== count(k, '>')) continue;
        if (count(v, '[') !== count(v, ']') || count(v, '<') !== count(v, '>')) bad.push(`${k} => ${v}`);
      }
      expect(bad).toEqual([]);
    });
  }

  const zh = load('zh-CN');

  it('zh-CN: 프롬프트의 옵션 이름을 영어로 두지 않는다', () => {
    // 고르기 항목(대괄호 안)과 기본값(꺾쇠 안)에 원문에 없는 네 글자 넘는 영어 낱말
    const keep = new Set(['Ttr', 'Qtext', 'Continuous', 'Standard', 'ByLayer', 'ByBlock', 'None', 'UCS']);
    const bad: string[] = [];
    for (const [k, v] of Object.entries(zh)) {
      if (!/[[<]/.test(k) || k.startsWith('#version') || k.includes('<a ') || k.includes('<p>')) continue;
      const inside = [...v.matchAll(/[[<]([^\]>]*)[\]>]/g)].map((m) => m[1]!).join(' ');
      const src = new Set(k.match(/[A-Za-z]{4,}/g) ?? []);
      for (const w of inside.match(/[A-Za-z]{4,}/g) ?? []) if (!src.has(w) && !keep.has(w)) bad.push(`${k} => ${v}`);
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('zh-CN: 플롯은 打印로 옮긴다(绘图는 AutoCAD의 그리기)', () => {
    const bad = Object.entries(zh)
      .filter(([k, v]) => /플롯/.test(k) && !/도면/.test(k) && !/그리기/.test(k) && v.includes('绘图'))
      .map(([k, v]) => `${k} => ${v}`);
    expect(bad).toEqual([]);
  });

  it('zh-CN: 도면 공간은 图纸空间, 솔리드 해치는 实体다', () => {
    expect(Object.values(zh).filter((v) => v.includes('绘图空间'))).toEqual([]);
    expect([zh['솔리드'], zh['솔리드 채우기'], zh['솔리드(S)']]).toEqual(['实体', '实体填充', '实体(S)']);
  });

  it('zh-CN: 도면(문서)은 图形이고, 도면 영역만 绘图区域다(114차 — AutoCAD 도움말의 图形特性·图形单位·当前图形·图形文件·绘图区域)', () => {
    expect([zh['도면'], zh['도면 특성'], zh['도면 파일 이름'], zh['새 도면(저장하지 않음)'], zh['{0} 용지 단위 = {1} 도면 단위']]).toEqual([
      '图形',
      '图形特性',
      '图形文件名',
      '新建图形（未保存）',
      '{0} 纸张单位 = {1} 图形单位',
    ]);
    expect(zh['AutoCAD 도면 템플릿 (*.dwt)']).toContain('图形样板');
    // 근거를 확인하지 못해 그대로 둔 줄(도면 영역 등)을 빼고 도면을 绘图로 옮긴 줄이 없다
    const skip = /도면 영역|도면 높이|도면 방향|도면 번호|도면 틀|도면 범위|도면 한계|머리말|도면 폴더|도면 요소|그리/;
    const bad = Object.entries(zh)
      .filter(([k, v]) => k.includes('도면') && !k.startsWith('#version') && !skip.test(k) && v.includes('绘图'))
      .map(([k, v]) => `${k} => ${v}`);
    expect(bad).toEqual([]);
  });

  it('zh-CN: 입력 프롬프트의 Enter는 进入(들어가기)가 아니라 输入이고, 복사 모드는 复制(单个·多个)다', () => {
    const bad = Object.entries(zh)
      .filter(([k, v]) => /입력 \[/.test(k) && v.includes('进入'))
      .map(([k, v]) => `${k} => ${v}`);
    expect(bad).toEqual([]);
    expect(zh['복사 모드 옵션 입력 [단일(S)/다중(M)] <{0}>:']).toBe('输入复制模式选项 [单个(S)/多个(M)] <{0}>:');
    expect(Object.values(zh).filter((v) => v.includes('【'))).toEqual([]);
  });

  it('zh-CN: 번역 틀 글이 남아 있지 않다', () => {
    expect(Object.values(zh).filter((v) => v.includes('此处填写'))).toEqual([]);
  });
});
