/**
 * 292차: 블록·속성·외부 참조 묶음(BLOCK·-BLOCK·INSERT·-INSERT·ATTDEF·-ATTEDIT·EATTEDIT·BATTMAN·ATTSYNC·ATTREDEF·ATTIN·BURST·BCOUNT·WBLOCK·
 * XATTACH·IMAGEATTACH·PDFATTACH·XBIND·-XBIND·-XREF·외부 참조 팔레트)의 번역 — 오역과 빠진 번역.
 * - 빠진 번역: 예/아니오 물음(askYN·askYesNo)은 앞 조각 「… [」와 통째 열쇠가 없어 명령행·기록 줄이 한국어였고, 틀이 앱 낱말을 잡는 줄 —
 *   XBIND의 기호 종류(`SYM_LABEL`), XATTACH의 '부착'·'중첩', 꼬리를 붙인 결과 줄(BATTMAN·BURST·WBLOCK·ATTIN·-XREF 결합·XATTACH 안내),
 *   BCOUNT 범위 — 은 공용 번역기의 틀이 잡은 값을 옮기지 않아 네 언어 모두 한국어가 남았다.
 * - 오역: 속성(attribute)을 특성(property·Eigenschaft·プロパティ)으로, 중첩(overlay)을 겹침·네스트(Overlap·ネスト·重ね合わせ)로,
 *   결합(bind)을 합치기(Combine·結合·合并)로, 분해를 붕괴·뜯어내기(Disintegration·拆卸)로, 독일어 소거를 지우기(löschen)로,
 *   중국어 참조를 참고 문헌(参考文献)으로, 고른 객체를 같은 객체(相等对象)로 옮긴 것 등 — 같은 사전 안의 맞는 번역으로 고쳤다.
 * 프롬프트는 소스에서 모은다(edit/blkcmds/xref.ts SYM_LABEL, askYN·askYesNo 물음, wblockcmd.ts 프롬프트).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { SYM_KINDS, SYM_LABEL } from '../src/edit/blkcmds/xref';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** askYN(dashcmds-ask.ts)·askYesNo(util2-ui.ts) 꼴: 물음 [예(Y)/아니오(N)] <기본값>: */
const yn = (q: string, def: boolean) => `${q} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`;
/** 예/아니오 물음(기본값은 코드 그대로): -ATTEDIT 둘, BLOCKTOXREF 중첩, -BLOCK 재정의·배치 방향, ATTSYNC */
const QS: [string, boolean][] = [
  ['속성을 한 번에 하나씩 편집하시겠습니까?', true],
  ['화면에 보이는 속성만 편집하시겠습니까?', true],
  ['외부 참조를 중첩으로 부착하시겠습니까?', false],
  [`블록 "${ft('DOOR')}"이(가) 이미 있습니다. 재정의하시겠습니까?`, false],
  ['블록 방향을 배치에 일치시키겠습니까?', false],
  [`ATTSYNC 블록 ${ft('DOOR')}?`, true],
];
const WBLOCK = '기존 블록 이름 입력 또는 [= (블록=출력 파일)/* (전체 도면)] <객체 선택 지정>:';
/** XBIND·-XBIND가 끼우는 기호 종류 이름 */
const LABELS = SYM_KINDS.map((k) => SYM_LABEL[k]);
const PROMPTS = [...QS.map(([q, d]) => yn(q, d)), WBLOCK, ...LABELS.map((n) => `종속 ${n} 이름 입력:`)];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('블록·속성·외부 참조 묶음의 번역(292차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」, 대괄호 없는 프롬프트)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 프롬프트가 명령이 내는 글과 같다(코드가 짜 맞추는 꼴)
    expect(LABELS).toEqual(['블록', '치수 스타일', '도면층', '선종류', '문자 스타일']);
    expect(src('dashcmds-ask.ts')).toContain("const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');");
    expect(src('util2-ui.ts')).toContain("const r = await askKeyword(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, [");
    for (const [f, s] of [
      ['dashcmds-insert.ts', "askYN(ctx, '속성을 한 번에 하나씩 편집하시겠습니까?', true)"],
      ['dashcmds-insert.ts', "askYN(ctx, '화면에 보이는 속성만 편집하시겠습니까?', true)"],
      ['blkcmds-xref.ts', "askYN(ctx, '외부 참조를 중첩으로 부착하시겠습니까?', false)"],
      ['blockdefine.ts', 'askYN(ctx, `블록 "${ft(old.name)}"이(가) 이미 있습니다. 재정의하시겠습니까?`, false)'],
      ['blockdefine.ts', "askYN(ctx, '블록 방향을 배치에 일치시키겠습니까?', false)"],
      ['util2-blocks.ts', 'askYesNo(ctx, `ATTSYNC 블록 ${ft(name)}?`, true)'],
      ['wblockcmd.ts', `ctx.getPoint('${WBLOCK}'`],
      ['blkcmds-xref.ts', 'askWord(ctx, `종속 ${SYM_LABEL[kind]} 이름 입력:`)'],
    ])
      expect(src(f!), s).toContain(s);
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

  it('통째 프롬프트(기록 줄·휴대폰 카드)와 XATTACH·XBIND·-XREF·BATTMAN·BURST·WBLOCK·ATTIN·BCOUNT 결과 줄, 부착 상자 글이 네 언어 모두 한국어 없이 보인다', () => {
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    for (const [f, s] of [
      ['blkcmds-xref.ts', "ctx.print(`외부 참조 \"${ft(r.insert.block)}\"을(를) ${overlay ? '중첩' : '부착'}했습니다(${ft(file.name)}).`);"],
      ['blkcmds-xref.ts', 'ctx.print(`${SYM_LABEL[b.kind]} ${ft(b.from)} → ${ft(b.to)}`);'],
      ['blkcmds-xref.ts', "ctx.print(`${SYM_LABEL[f.kind]} ${ft(f.name)}은(는) 결합할 수 없습니다${f.kind === 'block' && !x.xdoc ? '(참조 파일이 연결되지 않음)' : ''}.`, 'err');"],
      ['blkcmds-xref.ts', 'ctx.print(`종속 ${SYM_LABEL[kind]} "${ft(u)}"을(를) 찾을 수 없습니다.`, \'err\');'],
      ['blkcmds-xref.ts', "ctx.print(`기본 이미지 크기: 폭: ${fmt4(scale)}, 높이: ${fmt4((scale * hgt) / w)}${defaultWidth === 1 ? ', 단위 없음' : ''}`);"],
      ['blkcmds-xref.ts', "note: `축척 1 = 실제 용지 크기(도면 단위 INSUNITS ${insunits || '없음'}${insunits ? '' : ' — 1인치 = 1 단위'}). 삽입점은 화면에서 지정합니다.`,"],
      ['blkcmds-xref.ts', "`${ft(x.name)}${x.xdoc ? '' : ' (파일 연결 안 됨)'}`"],
      ['blkcmds-xref.ts', "note: `저장 경로: ${ft(file.name)}(상대 경로). 삽입점은 화면에서 지정합니다.${scale !== 1 ? ` 블록 단위 환산 축척 ${+scale.toPrecision(6)}을(를) 넣었습니다.` : ''}`,"],
      ['util2-blocks.ts', "ctx.print(`블록 ${names}의 속성 정의를 고쳤습니다${sync ? `(참조 ${refs}개 동기화)` : ''}.`);"],
      ['util2-blocks.ts', "ctx.print(`블록 ${results.length}개를 분해해 객체 ${a.added.length}개를 만들었습니다(속성은 값 문자로).${notBlock ? ` 블록이 아닌 객체 ${notBlock}개는 건너뛰었습니다.` : ''}${fail ? ` ${fail}개는 분해할 수 없습니다.` : ''}`);"],
      ['wblockcmd.ts', "ctx.print(`${ft(target.fileName)}을(를) 썼습니다(객체 ${built.entities}개, ${(out.data.byteLength / 1024).toFixed(0)} KB).${built.skipped ? ` 옮길 수 없는 객체 ${built.skipped}개는 뺐습니다.` : ''}`);"],
      ['blkcmds-att.ts', "ctx.print(`블록 ${r.updated}개의 속성 값을 바꿨습니다${r.unchanged ? `(그대로인 블록 ${r.unchanged}개)` : ''}.`);"],
      ['util2-blocks.ts', 'ctx.print(`${scope}에 블록 참조가 없습니다.`);'],
      ['dashcmds-misc.ts', "ctx.print(`외부 참조 \"${ft(b.name)}\"을(를) 결합했습니다(객체 ${r.entities}개${r.skipped ? `, 옮기지 못한 객체 ${r.skipped}개` : ''}${r.nested ? `, 중첩 참조 ${r.nested}개는 빠짐` : ''}).`);"],
    ])
      expect(src(f!), s).toContain(s);
    expect(src('util2-blocks.ts')).toContain("let scope = '선택한 객체';");
    expect(src('util2-blocks.ts')).toContain("scope = '지금 공간 전체';");
    const [a, b, part, file] = [ft('X|A'), ft('X$0$A'), ft('PART'), ft('part.dwg')];
    const burst = '블록 2개를 분해해 객체 9개를 만들었습니다(속성은 값 문자로).';
    const bound = `외부 참조 "${part}"을(를) 결합했습니다(객체 5개`;
    /** 명령행 결과 줄(도면 이름은 ft)과 부착 대화 상자 글 */
    const LOG = [
      `외부 참조 "${part}"을(를) 부착했습니다(${file}).`,
      `외부 참조 "${part}"을(를) 중첩했습니다(${file}).`,
      ...LABELS.flatMap((n) => [`${n} ${a} → ${b}`, `${n} ${a}은(는) 결합할 수 없습니다.`, `종속 ${n} "${a}"을(를) 찾을 수 없습니다.`]),
      `블록 ${a}은(는) 결합할 수 없습니다(참조 파일이 연결되지 않음).`,
      '기본 이미지 크기: 폭: 1.0000, 높이: 0.7500, 단위 없음',
      `블록 ${ft('DOOR')}의 속성 정의를 고쳤습니다(참조 3개 동기화).`,
      `${burst} 블록이 아닌 객체 2개는 건너뛰었습니다.`,
      `${burst} 3개는 분해할 수 없습니다.`,
      `${burst} 블록이 아닌 객체 2개는 건너뛰었습니다. 3개는 분해할 수 없습니다.`,
      `${file}을(를) 썼습니다(객체 12개, 4 KB). 옮길 수 없는 객체 2개는 뺐습니다.`,
      '블록 3개의 속성 값을 바꿨습니다(그대로인 블록 1개).',
      '선택한 객체에 블록 참조가 없습니다.',
      '지금 공간 전체에 블록 참조가 없습니다.',
      `${bound}, 옮기지 못한 객체 1개).`,
      `${bound}, 중첩 참조 2개는 빠짐).`,
      `${bound}, 옮기지 못한 객체 1개, 중첩 참조 2개는 빠짐).`,
      '축척 1 = 실제 용지 크기(도면 단위 INSUNITS 없음 — 1인치 = 1 단위). 삽입점은 화면에서 지정합니다.',
      `${part} (파일 연결 안 됨)`,
      `저장 경로: ${file}(상대 경로). 삽입점은 화면에서 지정합니다. 블록 단위 환산 축척 25.4을(를) 넣었습니다.`,
    ];
    const left: string[] = [];
    for (const l of LANGS) {
      // 기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 기록 줄 꼴도
      for (const p of PROMPTS) for (const s of p.endsWith('>:') ? [p, `${p} Y`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of LOG) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show(PROMPTS[0]!, 'en')).toBe('Edit attributes one at a time? [Yes (Y)/No (N)] <Yes>:');
    expect(show(PROMPTS[3]!, 'de')).toBe('Block „DOOR“ existiert bereits. Möchten Sie ihn neu definieren? [Ja (Y)/Nein (N)] <Nein>:');
    expect(show(PROMPTS[5]!, 'ja')).toBe('ATTSYNCブロックDOOR？[はい(Y)/いいえ(N)] <はい>:');
    expect(tr('en')(LOG[2]!)).toBe('Block X|A → X$0$A');
    expect(tr('zh-CN')(`종속 도면층 "${a}"을(를) 찾을 수 없습니다.`)).toBe('找不到依赖图层“X|A”。');
    expect(tr('de')(LOG[1]!)).toBe('Externe Referenz „PART“ verschachtelt angehängt (part.dwg).');
    expect(tr('en')(`${burst} 블록이 아닌 객체 2개는 건너뛰었습니다. 3개는 분해할 수 없습니다.`)).toBe(
      'Exploded 2 blocks into 9 objects (attributes become text of their values). Skipped 2 objects that are not blocks. 3 could not be exploded.',
    );
    expect(tr('ja')(`${bound}, 옮기지 못한 객체 1개, 중첩 참조 2개는 빠짐).`)).toBe(
      '外部参照「PART」をバインドしました（オブジェクト 5 個、移せなかったオブジェクト 1 個、ネストされた参照 2 個は除外）。',
    );
    expect(tr('en')(LOG[LOG.length - 3]!)).toBe('Scale 1 = actual paper size (drawing units INSUNITS none — 1 inch = 1 unit). Specify the insertion point on the screen.');
    expect(tr('zh-CN')('선택한 객체에 블록 참조가 없습니다.')).toBe('选定对象中没有块参照。');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 속성 attribute·Attribut, 중첩 overlay, 결합 bind, 분해 explode, 소거 bereinigen, 새 통째 = 앞 조각 + 예/아니오', () => {
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 속성(attribute) — 특성(property·Eigenschaft·プロパティ)이 아니다
    for (const k of [
      '속성 정의',
      '{0}개의 속성이 선택됨.',
      '고른 객체 중에 속성이 있는 블록이 없습니다.',
      '분해(속성 값 유지)',
      '블록 "{0}"을(를) 다시 정의했습니다(객체 {1}개). 참조 {2}개의 속성을 새 정의에 맞췄습니다.',
      '속성 {0}개를 바꿨습니다.',
      '속성 가져오기(탭 구분 파일)',
      '속성 값 입력',
      '속성 값 확인',
      '속성 내보내기(탭 구분 파일)',
      '속성 추출(명령행)',
      '속성 편집',
      '속성 편집 — {0}',
      '속성 편집 옵션 입력 [',
      '속성 편집 옵션 입력 [값(V)/위치(P)/높이(H)/각도(A)/스타일(S)/도면층(L)/색상(C)/다음(N)] <다음>:',
      '속성 편집(명령행)',
      '속성을 유지하며 블록 재정의',
      '잠긴 도면층의 참조 {0}개는 속성을 맞추지 않았습니다.',
      '화면에 보이는 속성만 편집하시겠습니까?',
    ]) {
      expect(en[k], k).toMatch(/attribut/i);
      expect(en[k], k).not.toMatch(/propert/i);
    }
    for (const k of ['속성 정의', '속성 편집', '속성 편집(명령행)', '속성 편집 — {0}', '향상된 속성 편집기 — 블록: {0}', '속성 편집 옵션 입력 [', '이전 속성 정의 아래에 정렬', '이전 속성 정의 아래에 정렬(A)']) {
      expect(de[k], k).toContain('Attribut');
      expect(de[k], k).not.toMatch(/Eigenschaft/);
    }
    expect(row('속성 정의')).toEqual(['Attribute definition', 'Attributdefinition', '属性定義', '属性定义']);
    expect(ja['잠긴 도면층의 참조 {0}개는 속성을 맞추지 않았습니다.']).toContain('属性を同期しませんでした');
    // 중첩(overlay — 겹침·네스트가 아니다)·결합(bind — 합치기가 아니다): -XREF·XATTACH·XBIND
    expect([en['중첩'], ja['중첩'], en['중첩(O)'], ja['중첩(O)'], en['(중첩)'], ja['(중첩)']]).toEqual(['Overlay', 'オーバーレイ', 'Overlay (O)', 'オーバーレイ(O)', '(overlay)', '(オーバーレイ)']);
    expect([en['결합(B)'], ja['결합(B)'], zh['결합(B)']]).toEqual(['Bind (B)', 'バインド(B)', '绑定 (B)']);
    const XREF = '옵션 입력 [?/결합(B)/분리(D)/경로(P)/언로드(U)/다시 로드(R)/중첩(O)/부착(A)] <부착>:';
    expect(ja[XREF]).toBe('オプションを入力 [?/バインド(B)/分離(D)/パス(P)/アンロード(U)/再ロード(R)/オーバーレイ(O)/アタッチ(A)] <アタッチ>:');
    expect(zh[XREF]).toContain('[?/绑定(B)/');
    for (const k of ['외부 참조 기호 결합', '외부 참조 기호 결합(명령행)', '결합됨: {0}.', '결합한 기호가 없습니다.', '결합할 의존 기호를 고르십시오. 결합하면 "참조$0$이름"의 보통 기호가 됩니다.', '참조 파일을 연결하면(XR) 블록도 결합할 수 있습니다.']) {
      expect(ja[k], k).toContain('バインド');
      expect(zh[k], k).toContain('绑定');
      expect(`${ja[k]}${zh[k]}`, k).not.toMatch(/結合|合并|参考文献/);
    }
    expect([en['결합한 기호가 없습니다.'], en['결합할 의존 기호를 고르십시오. 결합하면 "참조$0$이름"의 보통 기호가 됩니다.']]).toEqual([
      'No symbols were bound.',
      'Select the dependent symbols to bind. Once bound, they become regular symbols named "reference$0$name".',
    ]);
    // 분해(explode — 붕괴·뜯어내기·모듈이 아니다)
    expect(row('분해(D)')).toEqual(['Explode (D)', 'Zerlegen (D)', '分解(D)', '分解 (D)']);
    for (const k of ['분해 허용', '분해 허용(P)', '분해(속성 값 유지)', '분해할 수 없는 블록입니다.', '분해할 수 있는 블록이 없습니다.']) expect(zh[k], k).not.toMatch(/拆卸|模块/);
    // 중국어: 참조 参照(참고 문헌 参考文献이 아니다), 고른 객체 选定对象, 다중 삽입 多重插入, 종류 类型, 화면상에 지정, 재정의, 전체 도면, 선택된 객체가 없습니다(덧붙은 문장 없음)
    expect([zh['참조 유형'], zh['참조 이름'], zh['다중 삽입'], zh['종류'], zh['전체 도면'], zh['선택된 객체가 없습니다.']]).toEqual(['参照类型', '参照名称', '多重插入', '类型', '整个图形', '未选择任何对象。']);
    for (const k of ['고른 객체 중 동적 블록 참조가 없습니다.', '고른 객체 중에 속성이 있는 블록이 없습니다.']) expect(zh[k], k).toMatch(/^选定对象/);
    for (const k of ['화면상에 지정', '화면상에 지정(C)', '화면상에 지정(E)', '화면상에 지정(O)', '화면상에 지정(S)']) expect(zh[k], k).toMatch(/^在屏幕上指定/);
    expect([zh['재정의할 블록의 이름 입력:'], zh['블록 {0}의 참조 {1}개를 동기화했습니다.']]).toEqual(['输入要重新定义的块名称：', '已同步块 {0} 的 {1} 个参照。']);
    // 일본어: 외부 참조 外部参照, 참조 参照(ノート가 아니다), 부착 アタッチ(付き·添付·付ける가 아니다)
    expect([ja['"{0}" 외부 참조: {1}'], ja['DWG 참조'], ja['PDF 참고'], ja['PDF 언더레이 부착']]).toEqual(['"{0}" 外部参照: {1}', 'DWG参照', 'PDF参照', 'PDFアンダーレイのアタッチ']);
    for (const k of ['{0}: DWG·DXF 파일만 외부 참조로 부착할 수 있습니다.', '{0}은(는) 지금 도면이라 자신에게 부착할 수 없습니다(순환 참조).']) expect(ja[k], k).toContain('アタッチ');
    // 영어 그 밖: 순환 참조, 쪽(page), 재정의(redefine — override가 아니다), 깨진 문장
    expect(en['{0}은(는) 지금 도면이라 자신에게 부착할 수 없습니다(순환 참조).']).toBe('{0} is the current drawing and cannot be attached to itself (circular reference).');
    expect(en['PDF 언더레이 {0}({1}쪽)을(를) 부착했습니다.']).toBe('Attached PDF underlay {0} (page {1}).');
    expect([en['블록 "{0}"이(가) 이미 있습니다. 재정의하시겠습니까?'], en['이름을 입력하십시오.']]).toEqual(['Block "{0}" already exists. Redefine it?', 'Please enter a name.']);
    // 독일어 소거(PURGE)는 bereinigen — 지우기(löschen·Löschung·Entfernen)가 아니다(291차 보고 (4))
    for (const k of [
      'Defpoints 도면층은 소거할 수 없습니다.',
      '{0} "{1}"을(를) 소거하시겠습니까?',
      '객체가 있는 도면층은 소거할 수 없습니다.',
      '고른 도면층 가운데 소거할 수 있는(참조되지 않은) 도면층이 없습니다.',
      '끝나면 참조되지 않는 블록 정의 소거',
      '끝나면 참조되지 않는 항목을 소거하시겠습니까?',
      '도면층 0은 소거할 수 없습니다.',
      '소거할 각 이름을 확인하시겠습니까?',
      '소거할 사용하지 않는 객체 유형 입력 [',
      '소거할 이름 입력 <*>:',
      '소거할 항목이 없습니다.',
      '외부 참조 종속 도면층은 소거할 수 없습니다.',
      '참조되지 않은 블록 소거',
    ]) {
      expect(de[k], k).toMatch(/bereinig/i);
      expect(de[k], k).not.toMatch(/lösch|Löschung|entfern/i);
    }
    expect([de['블록 {0}개를 재설정했습니다.'], de['블록 "{0}"이(가) 이미 있습니다. 재정의하시겠습니까?']]).toEqual(['{0} Blöcke zurückgesetzt.', 'Block „{0}“ existiert bereits. Möchten Sie ihn neu definieren?']);
    // 새 통째 = 명령행 앞 조각 + 예/아니오 번역(286차 꼴), 앞 조각 = 대괄호 없는 물음 + 「[」(291차 독일어 소거 물음 둘도 같은 꼴)
    const asks: [string, string][] = [
      ['속성을 한 번에 하나씩 편집하시겠습니까?', '{0}'],
      ['화면에 보이는 속성만 편집하시겠습니까?', '{0}'],
      ['외부 참조를 중첩으로 부착하시겠습니까?', '{0}'],
      ['블록 "{0}"이(가) 이미 있습니다. 재정의하시겠습니까?', '{1}'],
      ['블록 방향을 배치에 일치시키겠습니까?', '{0}'],
      ['ATTSYNC 블록 {0}?', '{1}'],
      ['소거할 각 이름을 확인하시겠습니까?', '{0}'],
      ['끝나면 참조되지 않는 항목을 소거하시겠습니까?', '{0}'],
    ];
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      for (const [q, slot] of asks) {
        expect(squash(d[`${q} [`]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[`${q} [예(Y)/아니오(N)] <${slot}>:`]), `${l}: ${q}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <${slot}>`) + colon);
      }
    }
    expect(row('외부 참조를 중첩으로 부착하시겠습니까? [')).toEqual([
      'Do you want to attach the external reference as an overlay? [',
      'Soll die externe Referenz verschachtelt angehängt werden? [',
      '外部参照を「オーバーレイ」としてアタッチしますか？[',
      '是否要将外部参照作为嵌套参照附加？[',
    ]);
  });
});
