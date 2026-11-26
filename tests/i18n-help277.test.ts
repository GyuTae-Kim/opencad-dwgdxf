/**
 * 277차(276차 보고 (3)): 도움말(F1) 조작 표(`src/editor.ts` HELP rows)의 글과 네 언어 번역을 원문 뜻과 대조했다.
 * - 원문 「객체 두 번 클릭 = 특성 보기」는 코드와 달랐다 — 두 번 누르기는 종류마다 문자 편집기·표 셀 편집·빠른 특성·PEDIT·블록 편집기 등을 열고
 *   특성 팔레트는 남은 종류뿐이다(app.ts onDblClick·dblClickCommand). 원문을 고치면 소스 글과 사전 열쇠가 글자 하나까지 같아야 번역이 붙는다
 *   (check:i18n은 언어끼리 열쇠가 같은지만 본다) — 표의 한글 글이 모두 네 사전에 그 열쇠로 있는지 지킨다.
 * - 번역이 뜻에서 벗어난 줄: 가운데 버튼을 가운데 맞춤 단추(居中按钮)로, 스냅 재지정을 재할당·「…키를 누를 때」로, Esc의 명령 취소를 되돌리기로,
 *   그립 순환의 「Enter로 이동」을 「Enter로 가기」로(이동 모드가 빠짐), 직교를 정투영으로, 새 도면을 빼고, 기준점을 참조점으로, 플롯을 그리기로 옮겼다.
 *   용어는 같은 사전 안에서 이미 쓰는 번역을 따랐다(근거는 docs/CHANGELOG.md 277차 절).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const editor = readFileSync(new URL('../src/editor.ts', import.meta.url), 'utf8');

/** HELP 조작 표의 [키, 값] 줄 */
function helpRows(): [string, string][] {
  const start = editor.indexOf('const rows: [string, string][] = [');
  const block = editor.slice(start, editor.indexOf('];', start));
  return [...block.matchAll(/\['([^']*)', '([^']*)'\]/g)].map((m) => [m[1]!, m[2]!]);
}

const DBL = '객체 종류에 맞는 편집(문자 편집기·표 셀 편집·빠른 특성·PEDIT·블록 편집기 등 — 그 밖에는 특성 팔레트)';

describe('F1 도움말 조작 표(277차)', () => {
  it('표의 한글 글(키 칸·값 칸)은 모두 네 사전에 그 열쇠로 있고 번역에 한글이 남지 않는다', () => {
    const rows = helpRows();
    expect(rows).toHaveLength(21);
    for (const s of rows.flat().filter((x) => /[가-힣]/.test(x))) {
      for (const lang of LANGS) {
        const t = dict[lang][s];
        expect(t, `${lang}: ${s}`).toBeTruthy();
        expect(t, `${lang}: ${s}`).not.toMatch(/[가-힣]/);
      }
    }
  });

  it('객체 두 번 클릭은 종류에 맞는 편집(그 밖에는 특성 팔레트)이고 옛 「특성 보기」는 소스·사전에 없다', () => {
    expect(editor).toContain(`['객체 두 번 클릭', '${DBL}']`);
    expect(editor).not.toContain(`'특성 보기'`);
    for (const lang of LANGS) {
      const t = dict[lang][DBL];
      expect(t, lang).toBeTruthy();
      expect(t, lang).toContain('PEDIT');
      expect(dict[lang]['특성 보기'], lang).toBeUndefined();
    }
    expect(dict.en[DBL]).toContain('Quick Properties');
    expect(dict.de[DBL]).toContain('Schnelleigenschaften');
  });

  it('뜻에서 벗어났던 번역을 원문 뜻과 사전의 용어로 고쳤다', () => {
    const fixed: [key: string, lang: Lang, has: string, not: string | null][] = [
      ['가운데 버튼 끌기 · Alt+끌기 · Space+끌기', 'zh-CN', '中间按钮', '居中'],
      ['가운데 버튼 두 번 누르기', 'zh-CN', '中间按钮', '居中'],
      ['윈도우 선택 / 걸침 선택', 'de', 'Fensterauswahl / Kreuzungsauswahl', 'überlappen'],
      ['바로가기 메뉴(명령 중에는 Enter·옵션·스냅 재지정)', 'en', 'Options·Object snap overrides', 'reassignment'],
      ['바로가기 메뉴(명령 중에는 Enter·옵션·스냅 재지정)', 'zh-CN', '选项·对象捕捉覆盖', '键'],
      ['바로가기 메뉴(명령 중에는 Enter·옵션·스냅 재지정)', 'de', 'Optionen·Überschreiben des Objektfangs', 'Neuzuweisung'],
      ['명령 취소, 선택 해제', 'ja', 'キャンセル', '元に戻す'],
      ['명령 취소, 선택 해제', 'zh-CN', '取消命令', '撤销'],
      ['그립 편집: 신축(Enter로 이동 → 회전 → 축척 → 대칭)', 'en', 'Move → Rotate → Scale → Mirror', 'Go to'],
      ['그립 편집: 신축(Enter로 이동 → 회전 → 축척 → 대칭)', 'de', 'Verschieben → Drehen → Skalieren → Spiegeln', 'Gehen Sie'],
      ['그립 편집: 신축(Enter로 이동 → 회전 → 축척 → 대칭)', 'zh-CN', '移动 → 旋转 → 缩放 → 镜像', '翻转'],
      ['도움말 · 명령 기록 펼치기 · 객체 스냅 · 직교 · 극좌표 추적 · 객체 스냅 추적 · 동적 입력', 'zh-CN', ' · 正交 · ', '投影'],
      ['새 도면 · 열기 · 저장 · 다른 이름으로 저장', 'ja', '新規図面 · 開く · 保存', null],
      ['기준점을 사용하여 복사', 'zh-CN', '基点', '参考点'],
      ['특성 · 모두 선택 · 플롯 · 명령행 숨기기', 'de', 'Plotten', 'Zeichnen'],
    ];
    for (const [key, lang, has, not] of fixed) {
      const t = dict[lang][key];
      expect(t, `${lang}: ${key}`).toContain(has);
      if (not !== null) expect(t, `${lang}: ${key}`).not.toContain(not);
    }
  });
});
