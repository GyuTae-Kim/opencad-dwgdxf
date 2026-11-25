/**
 * 218차: -PLOT 간단 구성(상세한 플롯 구성 아니오)의 페이지 설정 이름 ?. Autodesk -PLOT 도움말은 이 자리에서 ?를 치면
 * 이름 있는 페이지 설정 목록을 보인다고 적는다. 전에는 「페이지 설정 이름 입력 <…>:」이 ?를 이름으로 찾다가
 * 「페이지 설정 "?"을(를) 찾을 수 없습니다.」를 알리고 다시 물었다. 이제 「페이지 설정 이름 또는 [?] 입력 <…>:」이고 ?면 목록을 보인 뒤
 * 다시 묻는다(배치 이름·출력 장치 이름의 [?]와 같은 꼴). 페이지 설정 이름 규칙(validSetupName)이 ?를 막아 실제 이름을 빼앗지 않는다.
 * 이름·Enter·없는 이름 알림·상세 구성 경로는 전과 같다. -PLOT은 객체를 만들거나 바꾸지 않는다(저장 아니오면 명령 취소 항목도 없다).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, PlotSettings } from '../../src/core/model';
import { EditSession, applyOps } from '../../src/edit/session';
import { importPageSetupOps, namedPageSetups } from '../../src/edit/script/pagesetup';
import { registerDashCommands } from '../../src/app/dashcmds';
import { translate } from '../../site/i18n.mjs';
import { makeScriptApp } from './app';

/** 새 프롬프트(기본값은 모형 탭의 페이지 설정 이름 — 새 도면은 빈 글) */
const PROMPT = '페이지 설정 이름 또는 [?] 입력 <>:';
const EMPTY = '이 도면에는 이름 있는 페이지 설정이 없습니다.';

const plot = (name: string, printerName: string, w: number): PlotSettings => ({
  pageSetupName: name,
  printerName,
  paperName: `ISO_full_bleed_A3_(${w}_x_297_MM)`,
  paperWidth: w,
  paperHeight: 297,
  margins: [0, 0, 0, 0],
  plotOrigin: { x: 0, y: 0 },
  windowMin: { x: 0, y: 0 },
  windowMax: { x: 0, y: 0 },
  scaleNumerator: 1,
  scaleDenominator: 1,
  flags: 1024 | 688,
  paperUnits: 1,
  rotation: 1,
  plotType: 5,
  styleSheet: 'monochrome.ctb',
  standardScaleType: 16,
});

/** 이름 있는 모형 페이지 설정 둘(PDF·SVG 장치)을 넣는다 */
function withSetups(doc: CadDocument): void {
  const s = new EditSession(doc, () => {});
  const setups = [plot('PDF-A3', 'DWG To PDF.pc3', 420), plot('SVG-A4', 'SVG', 210)].map((p) => ({ name: p.pageSetupName, plot: p, model: true }));
  applyOps(doc, importPageSetupOps(doc, setups, new Set(), () => s.newHandle())!.ops);
}

function setup(seed?: (doc: CadDocument) => void) {
  const h = makeScriptApp(seed);
  registerDashCommands(h.app);
  return h;
}

const asked = (h: ReturnType<typeof setup>, prefix: string) => h.prompts.filter((p) => p.startsWith(prefix));

describe('-PLOT 페이지 설정 이름 ?(218차)', () => {
  it('?면 이름 있는 페이지 설정 목록을 보이고 다시 물어, 고른 설정의 장치(SVG)로 이어진다', async () => {
    const h = setup(withSetups);
    expect(namedPageSetups(h.doc).items.map((x) => x.name)).toEqual(['PDF-A3', 'SVG-A4']);
    const depth = h.st.session.depth;
    // 상세 아니오, 배치 모형, ?, 이름, 장치 Enter, 파일 이름 Enter, 페이지 설정 저장 아니오, 플롯 진행 아니오
    expect(await h.script('-PLOT\nN\n모형\n?\nSVG-A4\n\n\nN\nN\n')).toBe('idle');
    expect(h.errors()).toEqual([]);
    expect(asked(h, PROMPT)).toHaveLength(2);
    const lines = h.out().split('\n');
    expect(lines).toContain('  PDF-A3');
    expect(lines).toContain('  SVG-A4');
    expect(lines.indexOf('  PDF-A3')).toBeLessThan(lines.indexOf('  SVG-A4'));
    expect(h.prompts).toContain('출력 장치 이름 또는 [?] 입력 <SVG>:');
    expect(asked(h, '파일 이름 입력 <test-모형.svg>')).toHaveLength(1);
    expect(h.st.session.depth).toBe(depth);
  });

  it('이름 있는 페이지 설정이 없는 도면에서 ?면 없다고 알리고 다시 묻는다(오류 아님)', async () => {
    const h = setup();
    expect(namedPageSetups(h.doc).items).toEqual([]);
    expect(await h.script('-PLOT\nN\n모형\n?\n\n"DWG To PDF.pc3"\n\nN\nN\n')).toBe('idle');
    expect(h.errors()).toEqual([]);
    expect(h.out().split('\n')).toContain(EMPTY);
    expect(asked(h, PROMPT)).toHaveLength(2);
    expect(asked(h, '파일 이름 입력 <test-모형.pdf>')).toHaveLength(1);
  });

  it('전과 같은 값: 없는 이름은 알리고 다시 묻고, 이름은 대소문자 무관으로 고르며 목록을 보이지 않는다', async () => {
    const h = setup(withSetups);
    // 스크립트는 오류 알림에서 멈추므로 명령행에 한 줄씩 넣는다
    const flush = () => new Promise((r) => setTimeout(r, 0));
    void h.app.run('-PLOT');
    await flush();
    for (const t of ['N', '모형', 'NOPE', 'pdf-a3', '', '', 'N', 'N']) {
      h.app.submitInput(t);
      await flush();
    }
    expect(h.app.busyCommand).toBeNull();
    expect(h.errors()).toEqual(['페이지 설정 "NOPE"을(를) 찾을 수 없습니다.']);
    // 프롬프트 글은 218차에 [?]가 붙었다 — 앞머리로 센다
    expect(asked(h, '페이지 설정 이름')).toHaveLength(2);
    expect(h.out().split('\n')).not.toContain('  SVG-A4');
    expect(h.prompts).toContain('출력 장치 이름 또는 [?] 입력 <DWG To PDF.pc3>:');
    expect(asked(h, '파일 이름 입력 <test-모형.pdf>')).toHaveLength(1);
  });

  it('새 프롬프트·앞 조각·빈 목록 알림이 네 언어 사전에 있다', () => {
    expect(translate('페이지 설정 이름 또는 [?] 입력 <SVG-A4>:', 'en')).toBe('Enter page setup name or [?] <SVG-A4>:');
    expect(translate('페이지 설정 이름 또는 [', 'en')).toBe('Enter page setup name or [');
    expect(translate(EMPTY, 'en')).toBe('This drawing has no named page setups.');
    for (const l of ['de', 'ja', 'zh-CN']) {
      expect(translate('페이지 설정 이름 또는 [?] 입력 <SVG-A4>:', l), l).not.toMatch(/[가-힣]/);
      expect(translate('페이지 설정 이름 또는 [', l), l).toMatch(/^[^가-힣]*\[$/);
      expect(translate(EMPTY, l), l).not.toMatch(/[가-힣]/);
    }
  });
});
