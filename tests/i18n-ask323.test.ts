/**
 * 323차: 공통 질문(예/아니오·덮어쓰기·재정의·변경 내용 버리기·이미 있습니다) 묶음의 번역 대조와 빠진 번역.
 * - 빠진 번역: 도우미(dashcmds-ask askYN·util2-ui askYesNo·modify2-util yesNo·undocmd yn)가 「물음 [예(Y)/아니오(N)] <예|아니오>:」를 붙이는
 *   물음 열여섯(SETBYLAYER·-DIMSTYLE·DIMIM·TINSERT·-OVERKILL·GATTE·-LAYERSTATE·UNDO·FLATTEN·EXOFFSET·-PSETUPIN)은 명령행 입력 줄 앞 조각
 *   「물음 [」과 통째(기록 줄·휴대폰 카드·커서 옆 — 「… <{n}>:」 틀)가 사전에 없어 네 언어 모두 한국어로 보였다. 291차 꼴로 더한다
 *   (앞 조각 = 본 열쇠 번역 + 「[」, 통째 = 앞 조각 + 예(Y)·아니오(N) 번역 + 「] <{n}>:」).
 * - 오역(같은 사전의 맞는 번역으로): REVERT 「변경 내용을 모두 버리고 …」 앞 조각(영어 이름 자리·중국어 「从 {0} 开始的」·독일어 von)과
 *   XCLIP 「기존 경계를 삭제」 독일어 앞 조각(깨진 문장)은 통째와 다른 문장이었다(통째는 앞 조각으로 시작 — 285차). DIMIM 「같은 이름의 치수 스타일 덮어쓰기」는
 *   재지정(Overrides)·3인칭(Überschreibt), 파일 삽입 재정의 물음은 파일 이름을 블록으로(图块“{1}”)·Block을 es로, 도면층 상태 가져오기는 검색(已检索到),
 *   참조 편집 띠 풍선은 영어(REFCLOSE Save)·주문 취소(Stornierung), SETBYLAYER 「블록을 포함」은 이 블록(此块)·binden 닮은 einbinden,
 *   이미 정의된 외부 참조·이미지 알림은 명령꼴(请使用·Verwenden Sie), OVERKILL 칸은 3인칭·零件(부품), 페이지 설정 재정의는 上書き(덮어쓰기)였다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { sourceMessage, translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** 도우미 넷이 붙이는 꼬리(dashcmds-ask askYN·util2-ui askYesNo·modify2-util yesNo·undocmd yn) */
const HELPER_TAIL = "`${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`";
const yn = (q: string, def: boolean) => `${q} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`;
/** [소스 파일, 부르는 글(소스 그대로), 열쇠(이름 자리 {n}), 기본값 자리 번호, 화면에 보이는 물음(도면 이름은 ft)] */
const QS: [string, string, string, number, string][] = [
  ['layerstate-tools.ts', "askYesNo(ctx, 'ByBlock을 ByLayer로 변경하시겠습니까?', (mode & SBL_BYBLOCK) !== 0)", 'ByBlock을 ByLayer로 변경하시겠습니까?', 0, 'ByBlock을 ByLayer로 변경하시겠습니까?'],
  ['layerstate-tools.ts', "askYesNo(ctx, '블록을 포함하시겠습니까?', (mode & SBL_BLOCKS) !== 0)", '블록을 포함하시겠습니까?', 0, '블록을 포함하시겠습니까?'],
  ['dashcmds-tables.ts', 'askYN(ctx, `기존 스타일 "${ft(before.name)}"을(를) 재정의하시겠습니까?`, false)', '기존 스타일 "{0}"을(를) 재정의하시겠습니까?', 1, `기존 스타일 "${ft('DIM-2')}"을(를) 재정의하시겠습니까?`],
  ['blkcmds-misc.ts', "askYN(ctx, `기존 치수 스타일(${dup.map(ft).join(', ')})을 덮어쓰시겠습니까?`, true)", '기존 치수 스타일({0})을 덮어쓰시겠습니까?', 1, `기존 치수 스타일(${[ft('DIM-A'), ft('DIM-B')].join(', ')})을 덮어쓰시겠습니까?`],
  ['dashcmds-misc.ts', "askYN(ctx, '끝과 끝이 정렬된 동일 선상의 객체 결합', end)", '끝과 끝이 정렬된 동일 선상의 객체 결합', 0, '끝과 끝이 정렬된 동일 선상의 객체 결합'],
  ['dashcmds-misc.ts', "askYN(ctx, '부분 겹침 객체 결합', overlap)", '부분 겹침 객체 결합', 0, '부분 겹침 객체 결합'],
  ['dashcmds-misc.ts', "askYN(ctx, '폴리선 내의 세그먼트 최적화', opt)", '폴리선 내의 세그먼트 최적화', 0, '폴리선 내의 세그먼트 최적화'],
  ['express-select.ts', 'yesNo(ctx, `도면의 블록 참조 수 = ${refs.length}. 모두 처리하겠습니까?`, true)', '도면의 블록 참조 수 = {0}. 모두 처리하겠습니까?', 1, '도면의 블록 참조 수 = 12. 모두 처리하겠습니까?'],
  ['layerstate-cmd.ts', 'askYesNo(ctx, `도면층 상태 "${ft(old.key)}"이(가) 이미 있습니다. 덮어쓰시겠습니까?`, false)', '도면층 상태 "{0}"이(가) 이미 있습니다. 덮어쓰시겠습니까?', 1, `도면층 상태 "${ft('ALT')}"이(가) 이미 있습니다. 덮어쓰시겠습니까?`],
  ['undocmd.ts', "yn('도면층 특성 변경사항을 결합하시겠습니까?', st.combineLayer)", '도면층 특성 변경사항을 결합하시겠습니까?', 0, '도면층 특성 변경사항을 결합하시겠습니까?'],
  ['undocmd.ts', "yn('확대/축소 및 초점이동 명령을 결합하시겠습니까?', st.combineZoom)", '확대/축소 및 초점이동 명령을 결합하시겠습니까?', 0, '확대/축소 및 초점이동 명령을 결합하시겠습니까?'],
  ['blkcmds-misc.ts', "askYN(ctx, '셀에 맞춰 자동 축척', true)", '셀에 맞춰 자동 축척', 0, '셀에 맞춰 자동 축척'],
  ['express-draw.ts', "yesNo(ctx, '숨은선을 제거하겠습니까?', false)", '숨은선을 제거하겠습니까?', 0, '숨은선을 제거하겠습니까?'],
  ['express-draw.ts', "yesNo(ctx, '이어진 객체의 간격띄우기 결과를 한 폴리선으로 결합하겠습니까?', join)", '이어진 객체의 간격띄우기 결과를 한 폴리선으로 결합하겠습니까?', 0, '이어진 객체의 간격띄우기 결과를 한 폴리선으로 결합하겠습니까?'],
  ['dashcmds-tables.ts', "askYN(ctx, '주석 치수 스타일을 작성하시겠습니까?', true)", '주석 치수 스타일을 작성하시겠습니까?', 0, '주석 치수 스타일을 작성하시겠습니까?'],
  ['dashcmds-plot.ts', 'askYN(ctx, `페이지 설정 "${ft(it.name)}"이(가) 이미 있습니다. 재정의하시겠습니까?`, false)', '페이지 설정 "{0}"이(가) 이미 있습니다. 재정의하시겠습니까?', 1, `페이지 설정 "${ft('A3')}"이(가) 이미 있습니다. 재정의하시겠습니까?`],
];
const head = (q: string) => `${q} [`;
const whole = (q: string, n: number) => `${q} [예(Y)/아니오(N)] <{${n}}>:`;
/** 직접 쓴 물음(옵션 목록까지 소스 글 안) — 앞 조각·통째를 고친 둘 */
const REV_HEAD = '{0}의 변경 내용을 모두 버리고 마지막으로 저장한 상태로 되돌리겠습니까? [';
const REV_WHOLE = '{0}의 변경 내용을 모두 버리고 마지막으로 저장한 상태로 되돌리겠습니까? [예(Y)/아니오(N)] <예>:';
const XC_HEAD = '기존 경계를 삭제하시겠습니까? [';
const XC_WHOLE = '기존 경계를 삭제하시겠습니까? [예(Y)/아니오(N)] <예>:';
const DIRECT = [`${ft('plan.dwg')}의 변경 내용을 모두 버리고 마지막으로 저장한 상태로 되돌리겠습니까? [예(Y)/아니오(N)] <예>:`, XC_WHOLE];
const PROMPTS = [...QS.flatMap(([, , , , fill]) => [yn(fill, true), yn(fill, false)]), ...DIRECT];
/** 고친 열쇠(앞 차수 시험·문서에 나오지 않는 열쇠) */
const DIMIM = '같은 이름의 치수 스타일 덮어쓰기';
const FROM_FILE = '블록 "{0}"이(가) 이미 도면에 있습니다. {1}의 내용으로 재정의할까요?';
const BLOCK_TITLE = '블록 - 재정의';
const LS_IMPORT = '도면층 상태 "{0}"을(를) 가져왔습니다. 지금 복원하시겠습니까?';
const RC_SAVE = '변경 사항 저장(REFCLOSE 저장)';
const RC_DISCARD = '변경 사항 취소(REFCLOSE 취소)';
const OVR_DISCARD = '현재 스타일의 재지정을 버리시겠습니까?';
const XREF_DEF = '외부 참조 {0}이(가) 이미 정의되어 있습니다. 기존 정의를 사용합니다.';
const IMG_DEF = '이미지 {0}이(가) 이미 정의되어 있습니다. 기존 정의를 사용합니다.';
const PS_DIALOG = '페이지 설정 "{0}"이(가) 이 도면에 이미 있습니다. 재정의하시겠습니까?';
const [P2, P5, P6, P8, P16] = [QS[1]![2], QS[4]![2], QS[5]![2], QS[7]![2], QS[15]![2]];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('공통 질문(예/아니오·덮어쓰기·재정의·변경 내용 버리기) 묶음의 번역(323차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션 「이름(글자)」·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 물음이 명령이 내는 글과 같다(도우미가 짜 맞추는 꼴)
    for (const f of ['dashcmds-ask.ts', 'util2-ui.ts', 'modify2-util.ts', 'undocmd.ts']) expect(src(f), f).toContain(HELPER_TAIL);
    for (const [f, call] of QS) expect(src(f), f).toContain(call);
    expect(src('filecmds.ts')).toContain('`${ft(st.saveName)}의 변경 내용을 모두 버리고 마지막으로 저장한 상태로 되돌리겠습니까? [예(Y)/아니오(N)] <예>:`');
    expect(src('xclip.ts')).toContain(`'${XC_WHOLE}'`);
    expect(PROMPTS).toHaveLength(34);
    const left: string[] = [];
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      for (const p of PROMPTS) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const shown = document.querySelector('.cmd-prompt')!.textContent!;
        if (HANGUL.test(shown)) left.push(`${l}: ${shown}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(left).toEqual([]);
  });

  it('통째 물음(기록 줄·휴대폰 카드·커서 옆)이 네 언어 모두 한국어 없이 보이고, 앞 조각 = 본 열쇠 + 「[」, 통째 = 앞 조각 + 예/아니오다', () => {
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const left: string[] = [];
    for (const l of LANGS) {
      const d = dict[l];
      for (const p of PROMPTS) for (const s of [p, `${p} Y`]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      const colon = l === 'zh-CN' ? '：' : ':';
      for (const [, , q, n] of QS) {
        expect(squash(d[head(q)]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[whole(q, n)]), `${l}: ${q}`).toBe(squash(`${d[head(q)]}${d['예(Y)']}/${d['아니오(N)']}] <{${n}}>`) + colon);
      }
    }
    expect(left).toEqual([]);
    expect(show(yn(QS[0]![4], true), 'en')).toBe('Do you want to change ByBlock to ByLayer? [Yes (Y)/No (N)] <Yes>:');
    expect(show(yn(QS[8]![4], false), 'de')).toBe('Layer-Status „ALT“ existiert bereits. Möchten Sie überschreiben? [Ja (Y)/Nein (N)] <Nein>:');
    expect(show(yn(QS[15]![4], false), 'ja')).toBe('ページ設定「A3」は既に存在します。再定義しますか? [はい(Y)/いいえ(N)] <いいえ>:');
    expect(show(yn(QS[1]![4], true), 'zh-CN')).toBe('是否包含块？[是(Y)/否(N)] <是>：');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 변경 내용 버리기·경계 삭제(통째 = 앞 조각), 덮어쓰기·재정의·재지정, 가져오기, 참조 편집 띠, 블록 포함, 이미 정의됨, OVERKILL', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // REVERT·XCLIP: 통째 = 앞 조각 + 예/아니오 + 기본값 「예」(285차 — 입력 줄과 기록 줄이 같은 문장)
    for (const l of LANGS) {
      const d = dict[l];
      for (const [h, w] of [[REV_HEAD, REV_WHOLE], [XC_HEAD, XC_WHOLE]] as const) expect(d[w], `${l}: ${w}`).toBe(`${d[h]}${d['예(Y)']}/${d['아니오(N)']}] <${d['예']}>:`);
    }
    expect(en[REV_HEAD]).toBe('Do you want to discard all changes to {0} and revert to the last saved state? [');
    expect(zh[REV_HEAD]).toContain('放弃对 {0} 的所有更改');
    expect(zh[REV_HEAD]).not.toContain('从');
    expect(de[REV_HEAD]).toContain('Änderungen an {0}');
    expect(ja[REV_WHOLE]).not.toMatch(/[（）：]/);
    // XCLIP 경계 = 같은 사전 IMAGECLIP의 Begrenzung(깨진 「Möchten Sie löschen? Bestehende …」가 아니다)
    expect(de['이전 경계를 삭제하시겠습니까? [예(Y)/아니오(N)] <예>:']).toContain('Begrenzung');
    expect(de[XC_HEAD]).toBe('Möchten Sie die vorhandene Begrenzung löschen? [');
    // 덮어쓰기(overwrite)는 재지정(override)이 아니다 — DIMIM 상자 칸(3인칭 Überschreibt도 아니다)
    expect(src('blkcmds-misc.ts')).toContain(`label: '${DIMIM}'`);
    expect(en[DIMIM]).toContain(en['덮어쓰기']!);
    expect(en[DIMIM]).not.toContain(en['재지정']!);
    expect(de[DIMIM]!.endsWith(de['덮어쓰기']!.toLowerCase())).toBe(true);
    // 파일 삽입 재정의 물음: {1}은 파일 이름(블록이 아니다), 독일어 Block은 ihn(같은 사전 「… 재정의하시겠습니까?」)
    expect(src('filecmds-export.ts')).toContain('`블록 "${ft(have.name)}"이(가) 이미 도면에 있습니다. ${ft(file.name)}의 내용으로 재정의할까요?`');
    expect(src('filecmds-export.ts')).toContain(`ask('${BLOCK_TITLE}',`);
    expect(zh[FROM_FILE]).not.toContain('“{1}”');
    expect(zh[FROM_FILE]).toContain('使用 {1} 的内容');
    expect(de['블록 "{0}"이(가) 이미 있습니다. 재정의하시겠습니까?']).toContain('Möchten Sie ihn');
    expect(de[FROM_FILE]).toContain('Möchten Sie ihn');
    expect(en[BLOCK_TITLE]).toBe('Block - redefine');
    // 도면층 상태 가져오기 = 导入(검색 检索가 아니다)
    expect(src('layerstate-ui.ts')).toContain('을(를) 가져왔습니다. 지금 복원하시겠습니까?`');
    expect(zh[LS_IMPORT]).toContain(zh['가져오기']!);
    expect(zh[LS_IMPORT]).not.toContain('检索');
    // 참조 편집 띠 단추 풍선: 저장·취소는 같은 사전 낱말(영어 Save·Cancel이 남거나 주문 취소 Stornierung이 아니다)
    expect(src('refedit-ui.ts')).toContain(`btn('변경 사항 저장', '${RC_SAVE}', actions.save, 'save')`);
    expect(src('refedit-ui.ts')).toContain(`btn('변경 사항 취소', '${RC_DISCARD}', actions.discard)`);
    expect([zh[RC_SAVE], zh[RC_DISCARD]]).toEqual([`${zh['변경 사항 저장']} (REFCLOSE ${zh['저장']})`, `${zh['변경 사항 취소']} (REFCLOSE ${zh['취소']})`]);
    expect(de[RC_DISCARD]!.startsWith(de['변경 사항 취소']!)).toBe(true);
    expect(de[RC_DISCARD]).not.toContain('Stornierung');
    // SETBYLAYER 「블록을 포함」: 블록 전부(이 블록 此块이 아니다), 독일어는 같은 사전 「포함」 einschließen(바인드 binden 닮은 einbinden이 아니다)
    expect(de['새 선택 세트에 포함']).toContain('einschließen');
    expect([en[P2], zh[P2], de[P2]]).toEqual(['Include blocks?', '是否包含块？', 'Blöcke einschließen?']);
    // 치수 스타일 재지정 = 같은 사전 「<스타일 재지정>」 Stilüberschreibung(서식 Format이 아니다)
    expect(src('dimstyle.ts')).toContain(`ask('치수 스타일 관리자', '${OVR_DISCARD}'`);
    expect(de['<스타일 재지정>']).toBe('<Stilüberschreibung>');
    expect(de[OVR_DISCARD]).toContain('Überschreibungen');
    expect(de[OVR_DISCARD]).not.toContain('Format');
    // 이미 정의된 외부 참조·이미지: 앱이 기존 정의를 쓴다는 알림(같은 열쇠 en will be used) — 명령꼴(请使用·Verwenden Sie)이 아니다
    expect(src('blkcmds-xref.ts')).toContain('이(가) 이미 정의되어 있습니다. 기존 정의를 사용합니다.`');
    expect(en[XREF_DEF]).toContain('will be used');
    for (const k of [XREF_DEF, IMG_DEF]) {
      expect(zh[k], k).toMatch(/将使用现有定义。$/);
      expect(zh[k], k).not.toContain('请');
      expect(de[k], k).toMatch(/Die vorhandene Definition wird verwendet\.$/);
    }
    // OVERKILL 상자 칸·-OVERKILL 물음: 같은 사전 「끝과 끝 결합」 Join·连接·verbinden, 「부분」 部分(부품 零件이 아니다), 칸 이름은 부정사(3인칭·명령꼴이 아니다)
    expect(src('modify2.ts')).toContain(`{ key: 'end', label: '${P5}', type: 'check'`);
    expect(src('modify2.ts')).toContain(`{ key: 'overlap', label: '${P6}', type: 'check'`);
    expect(en['끝과 끝 결합']!.split(' ')[0]).toBe('Join');
    expect(en[P5]!.startsWith('Join ')).toBe(true);
    expect(zh['현재 설정: 공차={0}, 무시={1}, 폴리선 최적화={2}, 부분 겹침 결합={3}, 끝과 끝 결합={4}']).toContain('连接部分重叠');
    expect(zh[P5]).toContain('连接端到端');
    expect(zh[P6]).toContain('部分重叠');
    for (const k of [P5, P6]) expect(zh[k], k).not.toContain('零件');
    expect([de[P5], de[P6]]).toEqual(['Kollineare Objekte verbinden, die Ende an Ende ausgerichtet sind', 'Teilweise überlappende Objekte kombinieren']);
    // GATTE 「모두 처리」 = 같은 사전 「처리합니다」 verarbeitet(감당하다 bewältigen이 아니다)
    expect(de[P8]).toContain('verarbeiten');
    expect(de[P8]).not.toContain('bewältigen');
    // 페이지 설정 재정의 = 같은 사전 블록·선종류 재정의의 再定義(덮어쓰기 上書き가 아니다)
    expect(src('dashcmds-plot.ts')).toContain('`페이지 설정 "${ft(it.name)}"이(가) 이 도면에 이미 있습니다. 재정의하시겠습니까?`');
    expect(ja['블록 "{0}"이(가) 이미 있습니다. 재정의하시겠습니까?']).toContain('再定義');
    expect(ja['덮어쓰기']).toBe('上書き');
    for (const k of [PS_DIALOG, P16]) {
      expect(ja[k], k).toContain('再定義');
      expect(ja[k], k).not.toContain('上書き');
    }
  });

  it('거꾸로 찾기: 바꾼 값과 새 열쇠의 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const fresh = QS.flatMap(([, , q, n]) => [head(q), whole(q, n)]);
    expect(fresh).toHaveLength(32);
    const changed: [Lang, string[]][] = [
      ['en', [REV_HEAD, REV_WHOLE, XC_WHOLE, DIMIM, BLOCK_TITLE, P2, P5]],
      ['ja', [REV_WHOLE, XC_WHOLE, PS_DIALOG, P16]],
      ['zh-CN', [REV_HEAD, XC_WHOLE, FROM_FILE, LS_IMPORT, RC_SAVE, RC_DISCARD, P2, XREF_DEF, IMG_DEF, P5, P6]],
      ['de', [REV_HEAD, REV_WHOLE, XC_HEAD, XC_WHOLE, DIMIM, FROM_FILE, RC_DISCARD, P2, OVR_DISCARD, XREF_DEF, IMG_DEF, P5, P6, P8]],
    ];
    expect(changed.map(([, ks]) => ks.length)).toEqual([7, 4, 11, 14]);
    for (const [l, keys] of changed) for (const k of keys) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
    for (const l of LANGS) for (const k of fresh) expect(sourceMessage(dict[l][k] ?? '(없음)'), `${l}: ${k}`).toBe(k);
  });
});
