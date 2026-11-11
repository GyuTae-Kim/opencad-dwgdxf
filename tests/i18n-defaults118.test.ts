/**
 * 118차 언어 사전: 기본값이 옵션 이름인 프롬프트(<예>·<켜기>…)를 옵션 번역으로 옮기기, SCALETEXT 도면 높이(Paper height)·
 * 객체 일치·축척 비율, 치수 스타일 1차·대체 단위 탭, GRID 주(Major)·주 뷰포트·주 도면, 가리기 프레임 줄(Autodesk 언어별 도움말).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { installLocalization } from '../src/app/i18n';
import { defaultWord, installFileGuard, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
const HANGUL = /[가-힣]/;
const tail = (s: string, l: string) => translateTail(s, translate(s, l), (x) => translate(x, l));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('기본값이 옵션 이름인 꼬리', () => {
  it('옵션 번역에서 고를 글자를 뗀 낱말로 옮긴다(네 언어)', () => {
    const tr = (l: string) => (x: string) => translate(x, l);
    expect(defaultWord(' <아니오>:', ['예(Y)', '아니오(N)'], tr('en'))).toEqual({ from: '아니오', to: 'No' });
    expect(defaultWord(' <켜기>:', ['켜기(ON)', '끄기(OFF)'], tr('en'))).toEqual({ from: '켜기', to: 'ON' });
    expect(defaultWord(' <켜기>:', ['켜기(ON)', '끄기(OFF)'], tr('de'))).toEqual({ from: '켜기', to: 'Ein' });
    expect(defaultWord(' <예>:', ['예(Y)', '아니오(N)'], tr('ja'))?.to).not.toMatch(/[(（]/);
    expect(defaultWord(' <예>:', ['예(Y)', '아니오(N)'], tr('zh-CN'))?.to).not.toMatch(/[(（]/);
    // 옵션 그대로인 기본값(<정확하게(E)>)은 옵션 번역 그대로
    expect(defaultWord(' <정확하게(E)>:', ['최소(A)', '정확하게(E)'], tr('en'))).toEqual({ from: '정확하게(E)', to: translate('정확하게(E)', 'en') });
  });

  it('옵션이 아닌 기본값(수·현재 뷰포트 같은 앱 글)과 도면 글 표시가 있는 기본값은 그대로', () => {
    const tr = (x: string) => translate(x, 'en');
    expect(defaultWord(' <1>:', ['예(Y)', '아니오(N)'], tr)).toBeNull();
    expect(defaultWord(' <다음 객체>:', ['종료(E)', '다중(M)'], tr)).toBeNull();
    expect(defaultWord(` <${ft('예')}>:`, ['예(Y)', '아니오(N)'], tr)).toBeNull();
  });

  it('통째 번역(기록 줄·휴대폰 카드·캔버스 프롬프트)에 한국어 기본값이 남지 않는다', () => {
    for (const l of LANGS) {
      for (const s of [
        '해치 영역을 이중 해치하시겠습니까? [예(Y)/아니오(N)] <예>:',
        '모드 입력 [켜기(ON)/끄기(OFF)/표시하지만 플롯 안 함(D)] <끄기>:',
        '해치 스타일 입력 [섬 무시(I)/외부(O)/일반(N)] <섬 무시>:',
        '용지 단위 입력 [인치(I)/밀리미터(M)] <밀리미터>:',
      ]) {
        const out = tail(s, l);
        expect(out, `${l}: ${s}`).not.toMatch(HANGUL);
      }
      // 친 입력이 붙은 기록 줄도
      expect(tail('해치 영역을 이중 해치하시겠습니까? [예(Y)/아니오(N)] <예>: N', l)).not.toMatch(HANGUL);
    }
    expect(tail('해치 영역을 이중 해치하시겠습니까? [예(Y)/아니오(N)] <예>:', 'en')).toMatch(/<Yes>:$/);
    expect(tail('모드 입력 [켜기(ON)/끄기(OFF)/표시하지만 플롯 안 함(D)] <끄기>:', 'en')).toMatch(/<OFF>:$/);
  });

  it('명령행 프롬프트의 마지막 조각(" <예>:")도 옵션 목록으로 옮기고, 한국어 화면과 도면 글 기본값은 그대로', async () => {
    const run = async (url: string, prompt: string) => {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', { url });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent']) vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      cmd.setPrompt(prompt);
      await new Promise((r) => setTimeout(r, 0));
      const text = document.querySelector('.cmd-prompt')!.textContent!;
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      return text;
    };
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/en/', '방향 반전 [예(Y)/아니오(N)] <아니오>:')).toMatch(/\[Yes \(Y\)\/No \(N\)\] <No>:$/);
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/de/', 'UNDO 자동 모드 입력 [켜기(ON)/끄기(OFF)] <켜기>:')).toMatch(/<Ein>:$/);
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/zh-CN/', '해치 영역을 이중 해치하시겠습니까? [예(Y)/아니오(N)] <아니오>:')).toMatch(/\[是\(Y\)\/否\(N\)\] <否>:$/);
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/', '방향 반전 [예(Y)/아니오(N)] <아니오>:')).toBe('방향 반전 [예(Y)/아니오(N)] <아니오>:');
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/en/', `방향 반전 [예(Y)/아니오(N)] <${ft('예')}>:`)).toMatch(/<예>:$/);
  });
});

describe('SCALETEXT·치수 스타일·GRID·주 뷰포트·가리기 프레임 낱말', () => {
  it('SCALETEXT: 도면 높이(P)는 Paper height·Papierhöhe·用紙上の高さ·图纸高度, 객체 일치·축척 비율은 도움말 옵션 이름', () => {
    const p = '새 모형 높이 지정 또는 [도면 높이(P)/객체 일치(M)/축척 비율(S)]';
    expect(translate(p, 'en')).toBe('Specify new model height or [Paper height (P)/Match object (M)/Scale factor (S)]');
    expect(translate(p, 'de')).toContain('[Papierhöhe (P)/Objekt anpassen (M)/Skalierfaktor (S)]');
    expect(translate(p, 'ja')).toContain('[用紙上の高さ(P)/オブジェクトに合わせる(M)/尺度係数(S)]');
    expect(translate(p, 'zh-CN')).toContain('[图纸高度(P)/匹配对象(M)/比例因子(S)]');
    // 명령행이 조각마다 옮기는 옵션
    expect(LANGS.map((l) => translate('축척 비율(S)', l))).toEqual(['Scale factor (S)', 'Skalierfaktor (S)', '尺度係数(S)', '比例因子(S)']);
    expect(LANGS.map((l) => translate('도면 높이(P)', l))).toEqual(['Paper height (P)', 'Papierhöhe (P)', '用紙上の高さ(P)', '图纸高度(P)']);
    // 새 "도면"(drawing)의 높이가 아니다
    expect(translate('새 도면 높이 지정', 'ja')).not.toContain('図面');
    expect(translate('새 도면 높이 지정', 'zh-CN')).not.toMatch(/新建|绘图/);
  });

  it('치수 스타일 탭: 1차 단위·대체 단위(Primary·Alternate Units, Primär·Sekundäreinheiten, 基本·変換単位, 主·换算单位)', () => {
    expect(LANGS.map((l) => translate('1차 단위', l))).toEqual(['Primary Units', 'Primäreinheiten', '基本単位', '主单位']);
    expect(LANGS.map((l) => translate('대체 단위', l))).toEqual(['Alternate Units', 'Sekundäreinheiten', '変換単位', '换算单位']);
    for (const k of ['대체 단위 표시', '대체 단위 승수', '대체 단위 정밀도', '대체 단위 머리말·꼬리말([]가 값 자리)']) {
      expect(translate(k, 'ja')).toContain('変換単位');
      expect(translate(k, 'zh-CN')).toContain('换算单位');
    }
  });

  it('주(major·main)를 주석(annotation)으로 옮기지 않는다', () => {
    expect(LANGS.map((l) => translate('주(M)', l))).toEqual(['Major (M)', 'Haupt (M)', '主軸(M)', '主(M)']);
    for (const k of ['주', '주 격자선 간격(격자선 수)', '주 격자선 사이의 격자선 수 지정 <{0}>:', '주 도면: {0}', '주 뷰포트 선택 <현재 뷰포트>:']) expect(translate(k, 'zh-CN')).not.toContain('注释');
    expect(translate('주 뷰포트 선택 <현재 뷰포트>:', 'zh-CN')).toContain('主视口');
    expect(translate('참고', 'de')).toBe('Hinweis');
    const grid = '격자 간격두기(X) 지정 또는 [켜기(ON)/끄기(OFF)/스냅(S)/주(M)/종횡비(A)] <{0}>:';
    expect(translate(grid, 'de')).toContain('Haupt (M)');
    expect(translate(grid, 'ja')).toContain('主軸(M)');
    expect(translate(grid, 'zh-CN')).toContain('捕捉(S)');
  });

  it('여러 줄 문자 단(열)은 단 설정·-MTEXT 도움말 낱말(栏·段組み), 거터는 Bundsteg·栏间距·段の間隔', () => {
    for (const k of ['열 유형', '동적 열', '정적 열', '열 없음(N)', '열 설정', '열 높이 지정', '열 폭 지정', '열 수 지정', '열(C)', '열 유형 입력 [동적(D)/정적(S)/열 없음(N)] <동적(D)>:']) {
      expect(translate(k, 'zh-CN'), k).toContain('栏');
      expect(translate(k, 'zh-CN'), k).not.toContain('列');
      expect(translate(k, 'ja'), k).toMatch(/段/);
      expect(translate(k, 'ja'), k).not.toContain('列');
    }
    expect(LANGS.map((l) => translate('거터', l))).toEqual(['Gutter', 'Bundsteg', '段の間隔', '栏间距']);
    // 표와 함께 쓰는 열쇠는 그대로(列)
    expect(translate('열 폭', 'zh-CN')).toBe('列宽');
  });

  it('가리기 프레임 줄의 켜기·끄기가 한국어로 남지 않는다', () => {
    for (const l of LANGS) for (const v of ['끄기', '켜기', '표시하지만 플롯 안 함']) expect(translate(`가리기 프레임 = ${v}`, l)).not.toMatch(HANGUL);
  });
});
