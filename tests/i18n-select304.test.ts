/**
 * 304차: 특성·선택 묶음(특성 팔레트·QUICKPROPERTIES·MATCHPROP·GROUP·GROUPEDIT·PICKSTYLE·SELECT·QSELECT·SELECTSIMILAR·FILTER·SELECTIONCYCLING·옵션 › 선택 탭·SSX·GETSEL)의
 * 번역과 303차가 남긴 것.
 * - 빠진 번역: GROUP 목록 줄의 「, 선택 불가」와 이름 없는 그룹(「(이름 없음)」이 틀 자리에 들어 한국어로 남았다)의 목록·분해·수락 물음, PICKSTYLE 결과,
 *   특성 팔레트·빠른 특성의 제목 — 치수 종류(틀 「치수 ({0})」이 「선형(수평)」 등을 옮기지 않았다 — 241·242차 보고)와 같은 종류 여럿의 「종류 (개수)」.
 * - 오역: 종류 이름 메시 Messi·여러 줄(MLINE) 多行文本(= 여러 줄 문자), 수락 「Accept Enter the number」, 확인란 크기(PICKBOX — checkbox가 아니다), 핸들 控制柄·Griff, 끝 X·델타 X의 X 빠짐,
 *   303차가 남긴 독일어(감사 Danke·{0} 특성 Merkmal·-UNITS 목록·대소문자 전환 Schaltergehäuse 등)·중국어(ETRANSMIT 결합 组合·合并 등)를 같은 사전 안의 맞는 번역으로. 프롬프트·결과 줄 꼴은 소스에서 확인한다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');

const GOBJ = '객체 선택 또는 [이름(N)/설명(D)]:';
const GNAME = '그룹 이름 입력 또는 [?]:';
const GSEL = '그룹 선택 또는 [이름(N)]:';
/** GROUP·GROUPEDIT 그룹 고르기 물음(util2-select.ts groupLabel — 이름 없는 그룹은 ft(이름) + 「(이름 없음)」) */
const ACCEPT = (label: string) => `그룹 ${label} [다음(N)/수락(A)] <수락>:`;
const UNNAMED = `${ft('*A1')}(이름 없음)`;
const GEDIT = '옵션 입력 [객체 추가(A)/객체 제거(R)/이름 바꾸기(REN)/분해(E)]:';
const GNAME2 = '그룹 이름 입력:';
const SRC_P = '원본 객체 선택:';
const DST_P = '대상 객체 선택 또는 [설정(S)]:';
const PROMPTS = [GOBJ, GNAME, GSEL, ACCEPT(UNNAMED), ACCEPT(ft('A1')), GEDIT, GNAME2, SRC_P, DST_P];
/** 치수 종류(inquiry.ts dimTypeName) */
const DIMS = ['호 길이', '꺾기', '선형(수평)', '선형(수직)', '선형(회전)', '정렬', '각도', '3점 각도', '지름', '반지름', '세로좌표(X)', '세로좌표(Y)'];
/** 종류 이름(inquiry.ts TYPE_NAMES·typeName) 가운데 「종류 ({0})」 열쇠를 더한 것 */
const TYPES = [
  '선', '점', '원', '호', '타원', '폴리선', '폴리선(2D/3D)', '스플라인', '구성선', '광선', '문자', '속성 정의', '여러 줄 문자', '블록 참조',
  '지시선', '다중 지시선', '해치', '다각형 해치', '2D 솔리드', '래스터 이미지', '가리기', '뷰포트', '여러 줄', '공차', '영역', '나선', '3D 솔리드',
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('특성·선택 묶음의 번역과 303차가 남긴 것(304차)', () => {
  it('명령행 입력 줄(GROUP·GROUPEDIT·MATCHPROP — 이름 없는 그룹의 수락 물음 포함)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/util2-select.ts', `'${GOBJ}'`],
      ['app/util2-select.ts', `askText(ctx, '${GNAME}')`],
      ['app/util2-select.ts', `ctx.getEntity('${GSEL}'`],
      ['app/util2-select.ts', 'return g.group.unnamed ? `${ft(g.name)}(이름 없음)` : ft(g.name);'],
      ['app/util2-select.ts', 'askKeyword(ctx, `그룹 ${groupLabel(gs[i]!)} [다음(N)/수락(A)] <수락>:`'],
      ['app/editcmds2-query.ts', `'${GEDIT}'`],
      ['app/app.ts', `'${GNAME2}'`],
      ['app/editcmds.ts', `ctx.getEntity('${SRC_P}')`],
      ['app/editcmds.ts', `'${DST_P}'`],
    ])
      expect(src(f!), s).toContain(s);
    const left: string[] = [];
    const shown: Record<string, string[]> = {};
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      shown[l] = [];
      for (const p of PROMPTS) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const text = document.querySelector('.cmd-prompt')!.textContent!;
        shown[l]!.push(text);
        if (HANGUL.test(text)) left.push(`${l}: ${text}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(left).toEqual([]);
    const at = (l: Lang, p: string) => shown[l]![PROMPTS.indexOf(p)]!;
    // 이름 없는 그룹: 「(이름 없음)」까지 그 언어로(틀 「그룹 {0} [」은 잡은 「*A1(이름 없음)」을 옮기지 않았다)
    for (const l of LANGS) {
      const d = dict[l];
      expect(at(l, ACCEPT(UNNAMED)), l).toContain(`${d['그룹 {0}(이름 없음) [']!.replace('{0}', '*A1')}${d['다음(N)']}/${d['수락(A)']}]`);
    }
    expect(at('en', ACCEPT(UNNAMED))).toContain('Group *A1(unnamed) [');
    expect(at('ja', ACCEPT(UNNAMED))).toContain('グループ *A1（名前なし） [');
    // MATCHPROP 원본 객체 = 「고른 특성만 원본에서 대상 객체로 옮깁니다.」의 source·コピー元(original·元のが 아니다), 중국어 그룹 이름 입력(组名名称 겹침이 아니다)
    expect(at('en', SRC_P)).toBe('Select source object:');
    expect(at('ja', SRC_P)).toBe('コピー元オブジェクトを選択：');
    expect(at('zh-CN', GNAME2)).toBe('输入组名称：');
  });

  it('결과·제목 줄(GROUP 목록·분해·PICKSTYLE·특성 팔레트·빠른 특성 제목)과 기록 줄(이름 없는 그룹 수락)이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/util2-select.ts', "ctx.print(`${groupLabel(g).padEnd(22)} 객체 ${g.group.entities.length}개${g.group.selectable ? '' : ', 선택 불가'}"],
      ['app/util2-select.ts', 'ctx.print(`그룹 ${groupLabel(g)}이(가) 분해되었습니다.`)'],
      ['app/util2-select.ts', "ctx.print(`PICKSTYLE = ${v} (${v & 1 ? '그룹 선택 켜기' : '그룹 선택 끄기'})`);"],
      ['app/ui/palettes.ts', '`${typeName(sel[0]!)} (${sel.length.toLocaleString()})`'],
      ['app/editcmds2-qp.ts', '`${typeName(l[0]!)} (${l.length})`'],
      ['app/inquiry.ts', "if (e.type === 'DIMENSION') return `치수 (${dimTypeName(e)})`;"],
      ['app/inquiry.ts', 'return `${TYPE_NAMES.UNKNOWN} (${e.originalType})`;'],
      ...[...DIMS, ...TYPES, '사용자 객체'].map((x) => ['app/inquiry.ts', `'${x}'`]),
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const LINES = [
      `${ft('A1').padEnd(22)} 객체 3개, 선택 불가`,
      `${UNNAMED.padEnd(22)} 객체 3개`,
      `${UNNAMED.padEnd(22)} 객체 3개, 선택 불가`,
      `그룹 ${UNNAMED}이(가) 분해되었습니다.`,
      'PICKSTYLE = 1 (그룹 선택 켜기)',
      'PICKSTYLE = 0 (그룹 선택 끄기)',
      ...DIMS.flatMap((x) => [`치수 (${x})`, `치수 (${x}) (3)`]),
      ...TYPES.map((x) => `${x} (3)`),
      '사용자 객체 (ACAD_PROXY_ENTITY)',
      '사용자 객체 (ACAD_PROXY_ENTITY) (2)',
    ];
    const RECORDS = [`${ACCEPT(UNNAMED)} N`];
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of RECORDS) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')(LINES[2]!)).toBe('*A1(unnamed) 3 objects, not selectable');
    expect(tr('zh-CN')(LINES[3]!)).toBe('组 *A1（未命名） 已被拆解。');
    expect(tr('de')(LINES[4]!)).toBe('PICKSTYLE = 1 (Gruppenauswahl aktivieren)');
    expect(tr('de')('치수 (선형(수평))')).toBe('Bemaßung (Linear (horizontal))');
    expect(tr('en')('치수 (세로좌표(X))')).toBe('Dimension (Ordinate (X))');
    expect(tr('zh-CN')('치수 (반지름) (3)')).toBe('标注 (半径) (3)');
    expect(tr('en')('선 (3)')).toBe('Line (3)');
    expect(tr('ja')('여러 줄 (3)')).toBe('マルチライン (3)');
    expect(tr('ja')('사용자 객체 (ACAD_PROXY_ENTITY)')).toBe('ユーザーオブジェクト (ACAD_PROXY_ENTITY)');
    expect(show(RECORDS[0]!, 'en')).toBe('Group *A1(unnamed) [Next(N)/Accept(A)] <Accept>: N');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 새 열쇠는 조각·틀 번역에서 만든 꼴', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 종류 이름: 메시 Mesh·Netz(「폴리곤 메시」의 낱말 — Messi가 아니다), 모양 Shape(「쉐이프」), 여러 줄(MLINE) = 「여러 줄 편집 도구」·「여러 줄 스타일」의 낱말(여러 줄 문자 MTEXT와 다른 이름)
    expect(en['폴리곤 메시']!.toLowerCase()).toContain(en['메시']!.toLowerCase());
    expect(de['폴리곤 메시']!.toLowerCase()).toContain(de['메시']!.toLowerCase());
    for (const d of Object.values(dict)) expect(Object.values(d).filter((v) => /\bMessi\b/.test(v))).toEqual([]);
    expect(en['모양']).toBe(en['쉐이프']);
    for (const d of [en, zh, de]) expect(d['여러 줄 편집 도구']).toContain(d['여러 줄']!);
    expect(ja['여러 줄 스타일']).toContain(ja['여러 줄']!);
    for (const l of LANGS) expect(dict[l]['여러 줄'], l).not.toBe(dict[l]['여러 줄 문자']);
    expect([en['여러 줄 (ML)'], ja['여러 줄 (ML)']]).toEqual([`${en['여러 줄']} (ML)`, `${ja['여러 줄']}（ML）`]);
    // 속성(attribute 제목) = 「속성 정의」의 낱말(영어 소문자 attribute·독일어 -Attribut이 아니다)
    expect(en['속성']).toBe(en['속성 정의']!.split(' ')[0]);
    expect(de['속성']).toBe('Attribut');
    expect(de['속성 정의']).toMatch(new RegExp(`^${de['속성']}`));
    // 수락: GROUP 「수락(A)」 키워드의 이름(영어 「Accept Enter the number」·독일어 「Akzeptieren Geben Sie die Nummer」가 아니다)
    for (const l of LANGS) expect(dict[l]['수락'], l).toBe(strip(dict[l]['수락(A)']));
    // 끝 X·델타 X: 「끝 Y」·「델타 Y」 꼴(X 빠짐)
    for (const d of [en, de]) {
      expect(d['끝 X']).toBe(d['끝 Y']!.replace('Y', 'X'));
      expect(d['델타 X']).toBe(d['델타 Y']!.replace('Y', 'X'));
    }
    // 확인란 크기(옵션 › 선택 — PICKBOX): 「선택 상자 크기(픽셀)」의 낱말(checkbox·チェックボックス·复选框·Kontrollkästchen이 아니다)
    for (const l of LANGS) {
      const d = dict[l];
      expect(d['확인란 크기'], l).toBe(d['선택 상자 크기(픽셀)']!.split(/\s*[(（]/)[0]);
      expect(d['확인란 크기(P)'], l).toMatch(new RegExp(`^${d['확인란 크기']}\\s?\\(P\\)$`));
    }
    // 핸들(객체 핸들 — 그립 Griff·控制柄이 아니다) = 「… 핸들 = {3}」의 낱말
    expect(zh['{0} 도면층: "{1}" 공간: {2} 핸들 = {3}']).toContain(`${zh['핸들']} =`);
    expect(de['{0} 도면층: "{1}" 공간: {2} 핸들 = {3}']).toContain(`${de['핸들']} =`);
    // 선종류 생성(PLINEGEN): 「폴리선 선종류 생성 옵션 입력 [」의 낱말(Create linetype·创建线型 만들기가 아니다)
    expect(en['폴리선 선종류 생성 옵션 입력 [']).toContain(en['선종류 생성']!.toLowerCase());
    expect(zh['폴리선 선종류 생성 옵션 입력 [']).toContain(zh['선종류 생성']);
    // 특성(property — 속성 Attribut가 아니다): 독일어 특성 일치(MATCHPROP 제목)·특성을 고르십시오(QSELECT)
    expect(de['특성 일치']).toBe(`${de['특성']} anpassen`);
    expect(de['특성을 고르십시오.']).toContain(de['특성']!.replace(/en$/, ''));
    // MATCHPROP 원본 객체: 「고른 특성만 원본에서 대상 객체로 옮깁니다.」의 source object·コピー元オブジェクト
    expect(en['고른 특성만 원본에서 대상 객체로 옮깁니다.']).toContain(en['원본 객체 선택:']!.replace('Select ', '').replace(':', ''));
    expect(ja['고른 특성만 원본에서 대상 객체로 옮깁니다.']).toContain(ja['원본 객체 선택:']!.replace('を選択：', ''));
    // 영어 묶음 나머지: 세로좌표 Ordinate(「세로좌표(O)」), 선택 탭 Selection, 이름 바꾸기(REN), 되돌릴 선택, 경계 수 = 「지시선 수」 꼴, QPMODE 2 안내, 중첩 nested, 특성 properties, 속성 attribute, 이전(P)
    expect([en['세로좌표(X)'], en['세로좌표(Y)']]).toEqual([en['세로좌표(O)']!.replace('(O)', '(X)'), en['세로좌표(O)']!.replace('(O)', '(Y)')]);
    for (const k of ['선택 설정(옵션 › 선택)', '그립 설정(옵션 › 선택)']) expect(en[k], k).toContain(`(Options › ${en['선택']})`);
    expect(en[GEDIT]).toContain(`/${en['이름 바꾸기(REN)']}/`);
    expect(en['되돌릴 선택이 없습니다.']).toMatch(/selection/);
    expect(en['경계 수']).toMatch(new RegExp(`^${en['지시선 수']!.split(' ').slice(0, 2).join(' ')} `));
    expect(en['빠른 특성 창을 저절로 띄우지 않습니다(QUICKPROPERTIES로 부를 수 있습니다).']).toContain('open it with QUICKPROPERTIES');
    expect(zh['빠른 특성 창을 저절로 띄우지 않습니다(QUICKPROPERTIES로 부를 수 있습니다).']).not.toContain('也称为');
    for (const k of ['중첩 객체 정보', '중첩된 객체 {0}개를 복사했습니다.']) {
      expect(en[k], k).toMatch(/nested/i);
      expect(ja[k], k).toContain(ja['중첩된 객체 복사']!.slice(0, 6));
      expect(`${en[k]}${ja[k]}`, k).not.toMatch(/overlapping|重なっている/i);
    }
    for (const k of ['같은 특성으로 선택 집합 만들기', '기준 객체와 같은 특성으로 선택 (SSX)']) expect(en[k], k).toContain(en['특성']!.toLowerCase());
    expect(en['속성 선택 또는 속성 이름 입력:']).toBe(`Select ${en['속성']!.toLowerCase()} or enter ${en['속성']!.toLowerCase()} name:`);
    expect(en['{0}개를 선택했습니다. 다음 명령에서 이전(P)으로 쓸 수 있습니다.']).toContain(en['이전(P)']);
    // 결합(bind — 합치기 combine·結合·组合·合并·连接이 아니다): ETRANSMIT 요약·설정 상자·보고서 줄·메모(303차가 남긴 중국어, 303차 묶음의 영어·일본어 나머지)
    const BIND = [', 결합 {0}', '결합한 외부 참조 ({0})', '— 결합한 참조 안의 참조라 결합 블록에 넣지 않았습니다'];
    for (const k of BIND) expect(en[k], k).toMatch(/\b[Bb]ound\b/);
    for (const k of [...BIND, '결합으로 바꿈(외부 참조 파일은 넣지 않음)']) {
      expect(ja[k], k).toContain('バインド');
      expect(ja[k], k).not.toContain('結合');
    }
    for (const k of [
      ...BIND,
      '결합으로 바꿈(외부 참조 파일은 넣지 않음)',
      '외부 참조를 결합으로 바꾸기',
      '외부 참조 "{0}"은(는) 로드되지 않아 결합하지 못했습니다(경로만 남은 외부 참조).',
      '"{0}" 안의 중첩 외부 참조 {1}개는 결합 블록에 넣지 않았습니다.',
      '"{0}"을(를) 결합할 때 옮길 수 없는 객체 {1}개(다중 지시선·이미지·표 등)를 뺐습니다.',
      '패키지의 지금 도면 사본에서 외부 참조를 블록으로 결합하고 외부 참조 파일은 넣지 않습니다.',
    ]) {
      expect(zh[k], k).toContain(strip(zh['결합(B)']));
      expect(zh[k], k).not.toMatch(/组合|合并|连接|外部参考/);
    }
    // 일본어 SSX·GETSEL 찾음 결과(探します 찾겠습니다가 아니다) = 「{0}개를 찾음」, 이전(P) 前(P), 필터 옵션 두께(T) 厚さ(T)
    for (const k of ['{0}개를 찾음. 선택된 객체로 남겨 두었습니다(다음 명령에서 이전(P)으로도 고를 수 있습니다).', '{0}개를 찾음(도면층 {1}, 유형 {2}). 다음 명령에서 이전(P)으로 고를 수 있습니다.']) {
      expect(ja[k], k).toMatch(new RegExp(`^${ja['{0}개를 찾음']!.replace(/[{}]/g, '\\$&')}`));
      expect(ja[k], k).toContain(ja['이전(P)']);
    }
    expect(ja['1개 찾음, 총 {0}개']).toBe(`${ja['{0}개를 찾음']!.replace('{0}', '1')}、合計{0}個`);
    expect(ja['필터 옵션 입력 [블록 이름(B)/색상(C)/객체(E)/플래그(F)/도면층(LA)/선종류(LT)/선택(P)/스타일(S)/두께(T)/벡터(V)]:']).toContain(`/${ja['두께(T)']}/`);
    // 중국어 묶음: 고른 객체 所选对象(相等对象 같은 객체가 아니다) = 「선택한 객체는 …」, 그룹 이름 프롬프트 꺾쇠·组名称, 필터 리스트·현재(U)·전체 도면, (W) 칸, 선택 세트
    expect(zh['고른 객체']).toBe(zh['선택한 객체는 그룹에 들어 있지 않습니다.']!.slice(0, 4));
    expect(zh['고른 객체 중 그룹의 구성원이 없습니다.']).toMatch(new RegExp(`^${zh['고른 객체']}`));
    expect(Object.values(zh).filter((v) => v.includes('相等对象'))).toEqual([]);
    expect(zh[GNAME]).toBe(`${zh[GNAME2]!.replace('：', '')}或 [?]：`);
    expect(zh[GSEL]).toContain(`[${zh['이름(N)']}]`);
    expect(zh['필터 리스트(모든 줄을 통과한 객체만 고릅니다)']).not.toContain('遍历');
    expect(zh['현재(U):']).not.toContain(zh['도면층']!);
    expect(zh['전체 도면(지금 공간)']).toContain(zh['모형 공간']!.slice(2));
    expect(zh['명령이 활성화되어 있지 않을 때(W)']).toBe(`${zh['명령이 활성화되어 있지 않을 때']}(W)`);
    expect(zh['{0}개 항목이 선택되었습니다.']).toBe(zh['{0}개를 찾음']!.replace('找到', '选择'));
    expect(zh['현재 선택 세트에 추가']).toContain(zh['선택 세트 만들기']!.slice(2));
    // 303차가 남긴 중국어: 옵션 「파일 저장」(正在保存 저장하는 중이 아니다), 초점 이동할 점 平移(焦点移动이 아니다), 헤더 감사(「错误。」가 붙지 않는다), 자동 저장본 안내
    expect(zh['파일 저장']).toBe(`文件${zh['저장']}`);
    expect(zh['초점 이동할 점 지정:']).toContain(zh['초점이동']);
    expect(zh['헤더 감사']).toMatch(new RegExp(`${zh['감사']}$`));
    expect(zh['자동 저장본은 이 브라우저(IndexedDB)에 두고 DRAWINGRECOVERY로 엽니다.']).toMatch(new RegExp(`^${zh['자동 저장']}`));
    // 303차가 남긴 독일어: 감사 Prüfung(Danke가 아니다), {0} 특성, -UNITS 목록 = 낱말 열쇠, 측량 Vermessung, 방향 남·서, 넣기 einfügen, 저장했습니다 gespeichert, 저장 안 함 단추,
    // 대소문자 전환(Schaltergehäuse 스위치 상자가 아니다), 줄바꿈(W), 위치도, 데이텀 Bezug(Datum 날짜가 아니다)
    expect(de['객체 감사']!.toLowerCase()).toContain(de['감사']!.toLowerCase());
    expect(de['헤더 감사']).toContain(de['감사']);
    expect(de['{0}의 모든 특성']).toContain(de['{0} 특성']);
    expect([de['1. 과학 1.55E+01'], de['4. 건축 1\'-3 1/2"'], de['5. 분수 15 1/2'], de['5. 측량 단위 N 45d0\'0" E']]).toEqual([
      `1. ${de['과학']} 1.55E+01`,
      `4. ${de['건축']} 1'-3 1/2"`,
      `5. ${de['분수']} 15 1/2`,
      `5. ${de['측량 단위']} N 45d0'0" E`,
    ]);
    expect(de['측량 단위']).toContain(de['미국 측량 피트']!.replace('US-', '').slice(0, 10));
    expect([de['동 3 시 = 0'], de['남 6 시 = 270'], de['서 9 시 = 180']]).toEqual(['Ost 3:00 = 0', 'Süd 6:00 = 270', 'West 9:00 = 180']);
    expect(de['"{0}"을(를) 넣지 못했습니다: {1}']).toMatch(/^Einfügen /);
    expect(de['전송 보고서를 패키지에 넣기']).toContain('einfügen');
    expect(de['지금 화면을 {0}로 저장했습니다.']).toMatch(/gespeichert\.$/);
    expect(de['저장 안 함']).toBe(`Nicht ${de['저장']!.toLowerCase()}`);
    expect(de['대소문자 전환']).toBe(strip(de['대소문자 전환(G)']));
    expect(de['줄바꿈(W)']).toBe(`${de['줄바꿈']} (W)`);
    expect(de['위치도']).toBe(de['위치']);
    expect([de['X데이텀'], de['{0}행 데이텀 {1}'], de['{0}행 데이텀 {1} 재료 조건']]).toEqual([
      `X-${de['데이텀 1']!.split(' ')[0]}`,
      '{0} Zeilenbezug {1}',
      '{0} Zeilenbezug {1} Materialzustand',
    ]);
    // 독일어 묶음: 그룹 이름 입력 또는 [?](깨진 문장 「Gruppennamen oder [?] ein:」이 아니다) = 「그룹 이름 입력 또는 [」 + 「?]:」
    expect(de[GNAME]).toBe(`${de['그룹 이름 입력 또는 [']}?]:`);
    // 새 열쇠: GROUP 목록·이름 없는 그룹 = 틀 + 조각, PICKSTYLE = 그룹 선택 켜기·끄기, 치수 제목 = 「치수 ({0})」 + 종류 낱말, 「종류 ({0})」 = 종류 이름 + 「 ({0})」
    for (const l of LANGS) {
      const d = dict[l];
      const list = d['{0} 객체 {1}개{2}']!;
      const un = d['{0}(이름 없음)']!;
      expect(d['{0} 객체 {1}개, 선택 불가'], l).toBe(list.replace('{2}', d[', 선택 불가']!));
      expect(d['{0}(이름 없음) 객체 {1}개'], l).toBe(list.replace('{0}', un).replace('{2}', ''));
      expect(d['{0}(이름 없음) 객체 {1}개, 선택 불가'], l).toBe(list.replace('{0}', un).replace('{2}', d[', 선택 불가']!));
      expect(d['그룹 {0}(이름 없음)이(가) 분해되었습니다.'], l).toBe(d['그룹 {0}이(가) 분해되었습니다.']!.replace('{0}', un));
      expect(d['그룹 {0}(이름 없음) ['], l).toBe(d['그룹 {0} [']!.replace('{0}', un));
      expect(d['그룹 {0}(이름 없음) [다음(N)/수락(A)] <수락>:'], l).toBe(d['그룹 {0} [다음(N)/수락(A)] <수락>:']!.replace('{0}', un));
      for (const on of ['켜기', '끄기']) expect(d[`PICKSTYLE = {0} (그룹 선택 ${on})`], l).toBe(`PICKSTYLE = {0} (${d[`그룹 선택 ${on}`]})`);
      for (const x of DIMS) {
        expect(d[`치수 (${x})`], `${l}: ${x}`).toBe(d['치수 ({0})']!.replace('{0}', d[x]!));
        expect(d[`치수 (${x}) ({0})`], `${l}: ${x}`).toBe(`${d[`치수 (${x})`]} ({0})`);
      }
      for (const x of [...TYPES, '사용자 객체']) expect(d[`${x} ({0})`], `${l}: ${x}`).toBe(`${d[x]} ({0})`);
    }
  });
});
