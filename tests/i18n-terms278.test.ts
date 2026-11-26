/**
 * 278차(277차 보고 (3)): 네 언어 사전에서 자주 보이는 CAD 용어(걸침·올가미·윈도우·빠른 특성·직교·극좌표 추적·객체 스냅·재지정·그립·신축·대칭·
 * 축척·도면층·블록·치수·배치·뷰포트·특성 팔레트·명령행·바로 가기 메뉴)가 든 열쇠를 모아, 언어마다 가장 많이 쓰는 번역과 다른 소수 번역 가운데
 * 낱말 뜻이 CAD 뜻과 다른 것만 다수 번역으로 고쳤다(뜻이 맞는 다른 말투는 그대로 — 표는 docs/CHANGELOG.md 278차 절).
 * 예: 걸침 올가미 Hanging noose(교수형 올가미)·悬挑套索(돌출)·Hängeschlinge, 빠른 특성 Fast Characteristics, 직교 正交投影(정투영),
 * 그립 控制点(이 사전에서 스플라인 조정점의 번역), 신축 newly constructed·新築(새로 지음), 축척 Waage(저울)·音阶(음계), 치수 Abmessung(크기).
 * 옛 오역이 다시 들어오지 않게 용어가 든 열쇠 전체에서 그 낱말을 막고, 고친 줄 몇 개는 다수 번역 낱말이 있는지 본다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;

describe('사전의 핵심 CAD 용어(278차)', () => {
  it('용어가 든 열쇠의 번역에 옛 오역 낱말이 없다', () => {
    // [열쇠에 든 용어, 언어, 없어야 할 낱말, 빼는 열쇠]
    const bans: [term: string, lang: Lang, ban: RegExp, except?: RegExp][] = [
      ['걸침', 'en', /noose|hanging|\bstep\b|engagement|overlap/i],
      ['걸침', 'de', /Hänge|Überstand|Schritt|Spann/],
      ['걸침', 'zh-CN', /悬挑/],
      ['빠른 특성', 'en', /characteristic|attribute/i],
      ['빠른 특성', 'de', /Attribut/],
      ['빠른 특성', 'zh-CN', /特征/],
      ['직교', 'zh-CN', /投影/],
      ['극좌표 추적', 'zh-CN', /轨迹|描边/],
      ['객체 스냅', 'zh-CN', /描边/],
      ['객체 스냅', 'de', /Snapshot/],
      ['재지정', 'en', /reassign/i],
      ['재지정', 'zh-CN', /重新分配/],
      ['재지정', 'de', /zuweis/i],
      ['그립', 'zh-CN', /控制点/, /그립니다/],
      ['그립', 'de', /\bHalt\b/, /그립니다/],
      ['신축', 'en', /construct/i],
      ['신축', 'ja', /新築|基点/],
      ['신축', 'de', /neu erstellt/],
      ['축척', 'de', /[Ww]aage/],
      ['축척', 'zh-CN', /音阶|级别/],
      ['특성 팔레트', 'de', /Attribut/],
      ['명령행', 'de', /Befehlslinie/],
      ['뷰포트', 'de', /Sichtfeld/],
    ];
    for (const [term, lang, ban, except] of bans)
      for (const [key, value] of Object.entries(dict[lang])) {
        if (!key.includes(term) || except?.test(key)) continue;
        expect(value, `${lang}: ${key}`).not.toMatch(ban);
      }
  });

  it('고친 줄은 같은 사전의 다수 번역을 쓴다', () => {
    const fixed: [key: string, lang: Lang, has: string][] = [
      ['직교', 'zh-CN', '正交'],
      ['그립', 'zh-CN', '夹点'],
      ['극좌표 추적', 'zh-CN', '极轴追踪'],
      ['걸침 올가미', 'zh-CN', '窗交套索'], // 279차: 重叠(이 사전의 겹침) → 窗交
      ['축척 리스트에 나타나는 이름(N)', 'zh-CN', '比例尺列表'],
      ['이 배치에 뷰포트가 없습니다.', 'zh-CN', '布局'],
      ['걸침 올가미', 'en', 'Crossing lasso'],
      ['빠른 특성', 'en', 'Quick Properties'],
      ['객체 {0}개를 신축했습니다.', 'en', 'Stretched'],
      ['대칭 (MI)', 'en', 'Mirror (MI)'],
      ['블록 방향을 배치에 일치', 'en', 'layout'],
      ['객체 {0}개를 신축했습니다.', 'ja', 'ストレッチ'],
      ['신축점', 'ja', 'ストレッチ点'],
      ['걸침 올가미', 'de', 'Kreuzungs-Lasso'],
      ['단일 축척', 'de', 'Maßstab'],
      ['치수', 'de', 'Bemaßung'],
      ['선형 치수', 'de', 'Bemaßung'],
      ['특성 팔레트 (Ctrl+1)', 'de', 'Eigenschaftenpalette'],
      ['그립이 없습니다.', 'de', 'Griff'],
      ['실행 중인 객체 스냅(비트)', 'de', 'Objektfänge'],
    ];
    for (const [key, lang, has] of fixed) expect(dict[lang][key], `${lang}: ${key}`).toContain(has);
    expect(dict['zh-CN']['직교']).toBe('正交');
    expect(dict['zh-CN']['그립']).toBe('夹点');
    expect(dict.de['치수']).toBe('Bemaßung');
  });
});
