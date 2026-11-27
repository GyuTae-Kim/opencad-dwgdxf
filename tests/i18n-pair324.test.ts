/**
 * 324차: 명령행 물음의 앞 조각과 통째가 같은 문장인지 사전 전체에서 본다(323차가 REVERT·XCLIP에서 고친 꼴을 막기).
 * - 명령행 입력 줄은 앞 조각 열쇠 「물음 [」(뒤에 고를 것·기본값 조각이 붙음)로, 기록 줄·휴대폰 카드·커서 옆은 통째 열쇠
 *   「물음 [고를 것] <기본>:」로 옮긴다. 두 값의 물음 부분이 다른 문장이면 같은 물음이 입력 줄과 기록 줄에서 다르게 읽힌다.
 * - 짝: 열쇠가 「 [」로 끝나는 앞 조각마다, 그 열쇠로 시작하고 「] <…>:」로 끝나는 통째.
 * - 같음: 앞 조각 값의 끝 「[」 앞과 통째 값의 같은 수 「[」 앞이 빈칸을 모두 지우고 같다(전각 ［만 [로 — 전각 ？：·「、」·대소문자는 다르게 본다).
 * - 324차 전 어긋난 짝: en 106·ja 145·zh-CN 95·de 171. 324차가 언어마다 40곳 이하로 고침(en 30·ja 31·zh-CN 32·de 38 값) —
 *   낱말 차례가 깨진 앞 조각(「{0} Specify or」·「{0} 输入」·「(Abstandstyp) Eingabe」), 잘리거나 명사꼴·3인칭인 통째(「Select object or」·
 *   「尺寸线位置或」·「Configuration input」·「Legt … fest」), 독일어 동사가 고를 것 뒤로 간 통째(「Punkt oder […] auswählen:」),
 *   같은 사전 낱말과 다른 쪽(ja 플롯 영역 印刷範囲·등각평면 アイソメトリック平面·중첩 ネスト, de 제목 블록 Titelblock, zh 배열 阵列·해치 填充·참조 参考),
 *   대소문자만(en)·전각 ？만(ja) 다른 짝, 323차가 보고 둔 IMAGECLIP·REFCLOSE·AUDIT 짝.
 * - 325차: 「옵션 입력 [」 통째 26 갈래를 언어마다 같은 사전 다수 꼴로(en 「Enter option [」·ja 「オプションを入力 [」·zh-CN 「输入选项 [」·
 *   de 「Option eingeben [」 — 동사가 고를 것 뒤로 간 「Option […] auswählen <」 포함), 자주 쓰는 명령(치수·해치·간격띄우기·COPY·ROTATE·
 *   -LAYER·문자)의 짝을 같은 사전 낱말·앞 조각 꼴로(en 20·ja 21·zh-CN 20·de 40 값). 앞 조각 161 → 141.
 * - 326차: 뜻이 틀린 짝 먼저(de 「도면층 이름을 지정할 객체」 — 고른 객체의 도면층을 쓴다, 그라데이션 패턴 이름, 경계 세트 Umgrenzungssatz, 이중 해치 Möchten,
 *   플롯 기본 설정 en preference·de Ploteinstellung), 「옵션 입력 [」 기본값 없는 꼴(en 1·zh-CN 3·de 8)과 같은 앞 조각의 기본값 없는 꼴·꼬리,
 *   남은 짝은 앞 조각으로 시작하는 열쇠 갈래를 통째로 맞춤(en 22·ja 39·zh-CN 31·de 39 값). 짝 261 → 168, 앞 조각 141 → 120.
 * - 아직 둔 것(PENDING): 앞 조각마다 언어별 어긋난 통째 수 — 고쳐서 줄면 이 목록도 줄여야 통과한다(목록에 있는데 이제 같으면 실패).
 *   새로 어긋난 짝이 생겨도 실패한다(재발 막기).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const squash = (s: string) => s.replace(/\s/g, '');
const WHOLE = /\]\s*<[^<>]*>\s*:$/;
/** 앞 조각 값의 물음 부분(끝 「[」와 둘레 빈칸을 뗌) */
const headQ = (v: string) => v.replace(/［/g, '[').replace(/\s*\[\s*$/, '');
/** 통째 값에서 앞 조각 물음과 같은 수의 「[」 앞까지 */
const wholeQ = (v: string, q: string) => v.replace(/［/g, '[').split('[').slice(0, q.split('[').length).join('[');
const keys = Object.keys(dict.en);
const HEADS = keys.filter((k) => k.endsWith(' ['));
const PAIRS = HEADS.flatMap((h) => keys.filter((w) => w.startsWith(h) && WHOLE.test(w)).map((w) => [h, w] as const));
const differs = (l: Lang, h: string, w: string) => {
  const q = headQ(dict[l][h]!);
  return squash(q) !== squash(wholeQ(dict[l][w]!, q));
};

/** 아직 둔 것: 앞 조각 → 언어별 어긋난 통째 수(언어 차례 en·ja·zh-CN·de) */
const PENDING: Record<string, string> = {
  "PDF 언더레이 옵션 입력 [": "en1 de1",
  "UCS의 원점 지정 또는 [": "zh-CN1 de1",
  "UNDO 자동 모드 입력 [": "de1",
  "X 축척 비율 입력, 반대 구석 지정, 또는 [": "de2",
  "간격띄우기 객체에 대한 도면층 옵션 입력 [": "en1",
  "간격띄우기할 객체 선택 또는 [": "en1 zh-CN2",
  "값 수정 유형 입력 [": "de1",
  "객체 선택 또는 [": "ja1",
  "객체 순서 옵션 입력 [": "de1",
  "검사 데이터 추가 또는 [": "ja1",
  "검출된 오류를 수정하시겠습니까? [": "de1",
  "경로 방법 입력 [": "zh-CN1",
  "경로를 따라 항목 사이의 거리 지정 또는 [": "en1",
  "경로를 따라 항목 수 지정 또는 [": "en1",
  "그라데이션 패턴 이름 입력 또는 [": "en1",
  "그룹의 새 이름 입력 또는 [": "en1 de1",
  "그립을 선택하여 배열을 편집하거나 [": "de4",
  "기본점 지정 또는 [": "ja1",
  "기존 블록 이름 입력 또는 [": "de1",
  "나선의 비틀기 방향 입력 [": "en1 de1",
  "내용 유형 선택 [": "de1",
  "네 번째 점 지정 또는 [": "en1",
  "다음 점 지정 또는 [": "en2 zh-CN2",
  "다중 지시선 배치 지정 또는 [": "ja1 de1",
  "대체 객체의 기준점 선택 또는 [": "de1",
  "두 번째 그라데이션 색상 지정 또는 [": "ja1",
  "두 번째 치수보조선 원점 지정 또는 [": "en1",
  "등각평면 설정 입력 [": "de1",
  "레벨 사이의 거리 지정 또는 [": "en1",
  "레벨 수 입력 또는 [": "en1 de1",
  "명령 취소 조정 옵션 입력 [": "de1",
  "무시할 특성 지정 [": "de1",
  "문자 스타일 옵션 [": "en1 de1",
  "문자를 둘러쌀 객체 [": "en1 zh-CN1",
  "문자에 번호 배치 [": "zh-CN1",
  "배열 편집 상태에 대한 변경 내용을 저장하시겠습니까? [": "de1",
  "배열의 항목 수 입력 또는 [": "en1 de1",
  "배치 옵션 입력 [": "en1",
  "배치 이름 입력 또는 [": "de1",
  "변경할 옵션 입력 [": "en1",
  "변환할 연관 치수 선택 또는 [": "ja1 de1",
  "복사할 중첩된 객체 선택 또는 [": "de1",
  "뷰포트 구석 지정 또는 [": "de1",
  "뷰포트 지정 [": "de1",
  "뷰포트의 축척 비율 설정. [": "ja1",
  "블록의 삽입점 지정 또는 [": "zh-CN1",
  "새 값 입력 [": "zh-CN1",
  "새 객체 색상 입력 [": "zh-CN1",
  "새 맞춤점 지정 또는 [": "zh-CN1 de1",
  "새 뷰포트의 기본 가시성 [": "de1",
  "새 색상 입력 [": "de1",
  "새 원점 선택 [": "zh-CN1",
  "새 투명도 값 입력 [": "zh-CN1 de1",
  "선 간격두기 유형 입력 [": "ja1",
  "설정할 항목 [": "en1",
  "셀 {0} 옵션 입력 [": "ja1 de1",
  "셀 병합 [": "de1",
  "속성 가시성 설정 입력 [": "en1 de1",
  "쉐이프 옵션 입력 [": "de1",
  "스냅 간격두기 지정 또는 [": "ja2",
  "스냅 그리드 스타일 입력 [": "ja1 de1",
  "스케치 유형 입력 [": "ja1",
  "시작 열과 끝 열 사이의 전체 거리 지정 또는 [": "de1",
  "시작 행과 끝 행 사이의 전체 거리 지정 또는 [": "de1",
  "시작점 지정 또는 [": "en1 ja1",
  "연관 치수 우선순위 [": "ja1",
  "연속성 입력 [": "de1",
  "열 사이의 거리 지정 또는 [": "de2",
  "영역 치수 계산 기준 [": "ja1 de1",
  "옵션 지정 [": "de1",
  "옵션을 입력 [": "de1",
  "왼쪽 아래 구석 지정 또는 [": "de1",
  "용지 공간 단위 유형 입력 [": "de1",
  "용지 단위 입력 [": "ja1 de1",
  "용지 방향 입력 [": "de1",
  "원점 옵션 입력 [": "de1",
  "윈도우 구석 지정, 축척 비율(nX 또는 nXP) 입력, 또는 [": "de2",
  "이전 경계를 삭제하시겠습니까? [": "en1",
  "일정한 크기 또는 가변 크기로 만들기 [": "ja1",
  "자르기 객체 선택 또는 [": "de1",
  "자르기 경계 지정 또는 [": "de1",
  "자르기 옵션 입력 [": "de2",
  "제목 블록 삽입 후 한계를 재설정하시겠습니까? [": "en1",
  "제목 블록을 넣을 도면층 이름 입력 또는 [": "en1 de1",
  "중첩된 객체 복사 설정 입력 [": "en1 de1",
  "지시선 연결선 사용 [": "de1",
  "지시선 유형 선택 [": "de1",
  "지시선 형식 옵션 입력 [": "en1 de1",
  "지시선의 최대 점 수 입력 또는 [": "zh-CN1",
  "참조 편집 작업 세트에 객체 추가 또는 제거 [": "de1",
  "참조에 대한 변경 사항 [": "en1",
  "채울 각도 지정(+=ccw, -=cw) 또는 [": "ja1",
  "첫 번째 객체 선택 또는 [": "ja1",
  "첫 번째 구석 지정 또는 [": "ja1",
  "첫 번째 구석점 지정 또는 [": "ja2",
  "첫 번째 그라데이션 색상 지정 또는 [": "ja1",
  "첫 번째 선 또는 호 선택 또는 [": "ja1",
  "첫 번째 점 선택 또는 [": "ja1",
  "첫 번째 점 지정 또는 [": "ja2",
  "첫 번째 지시선 점 지정 또는 [": "ja1",
  "추가할 치수 점을 표시하거나 [": "ja1",
  "추출 유형 입력 또는 객체 선택 사용 [": "en1 ja1 de1",
  "축척에 대한 기준점 옵션 입력 [": "ja1 zh-CN1 de1",
  "측정할 객체 선택 또는 [": "de1",
  "켜거나 끌 복원 특성 입력 [": "de1",
  "투명 모드 입력 [": "de1",
  "폴리선 선종류 생성 옵션 입력 [": "de2",
  "플롯 축척 입력 (출력 {0}=도면 단위)또는 [": "ja1",
  "하이퍼링크 커서, 바로 가기 메뉴 및 툴팁 표시? [": "de1",
  "항목 사이의 각도 지정 또는 [": "zh-CN1 de1",
  "항목 수 지정 또는 [": "zh-CN1 de1",
  "해치 배경색 입력 또는 [": "en1",
  "해치 색상 입력 또는 [": "en2",
  "해치 스타일 입력 [": "en2",
  "해치 영역을 이중 해치하시겠습니까? [": "zh-CN1",
  "해치 옵션 입력 [": "en1 ja1",
  "해치 투명도 값 입력 또는 [": "en1 de1",
  "행 사이의 거리 지정 또는 [": "en1 de1",
  "행 사이의 증분 고도 지정 또는 [": "en1",
  "행 수 입력 또는 [": "en1",
};

/** 입력 줄과 기록 줄을 진짜 번역층으로 견줄 물음(324차가 맞춘 언어) */
const SHOWN: [Lang, string][] = [
  ['en', '대소문자 선택 [문장(S)/소문자(L)/대문자(U)/제목(T)/대소문자 전환(G)] <문장>:'],
  ['en', '도면 공간을 사용하시겠습니까? [아니오(N)/예(Y)] <예>:'],
  ['ja', '플롯 영역 입력 [화면표시(D)/범위(E)/배치(L)/뷰(V)/윈도우(W)] <배치>:'],
  ['ja', '이전 경계를 삭제하시겠습니까? [예(Y)/아니오(N)] <예>:'],
  ['zh-CN', '두 번째 점 지정 또는 [배열(A)/종료(E)/명령 취소(U)] <종료>:'],
  ['zh-CN', '그립을 선택하여 배열을 편집하거나 [연관(AS)/기준점(B)/개수(COU)/간격두기(S)/열(COL)/행(R)/레벨(L)/종료(X)] <종료>:'],
  ['de', '두 번째 점 지정 또는 [배열(A)/종료(E)/명령 취소(U)] <종료>:'],
  ['de', '점 선택 또는 [객체(O)] <객체>:'],
  ['de', '이전 경계를 삭제하시겠습니까? [예(Y)/아니오(N)] <예>:'],
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('명령행 물음의 앞 조각과 통째가 같은 문장이다(324차)', () => {
  it('사전 전체의 앞 조각·통째 짝에서 어긋난 것은 「아직 둔 것」 목록과 똑같다(새로 어긋나거나 고쳐서 줄면 알린다)', () => {
    // 짝을 찾는 꼴이 무너지지 않았는지만 본다(324차 셈: 짝 390 — 열쇠를 더하면 늘 수 있어 정확한 수는 고정하지 않는다)
    expect(PAIRS.length).toBeGreaterThan(300);
    const left: Record<string, string> = {};
    for (const h of HEADS) {
      const ws = PAIRS.filter(([x]) => x === h).map(([, w]) => w);
      const s = LANGS.map((l) => [l, ws.filter((w) => differs(l, h, w)).length] as const)
        .filter(([, n]) => n > 0)
        .map(([l, n]) => `${l}${n}`)
        .join(' ');
      if (s) left[h] = s;
    }
    expect(left).toEqual(PENDING);
  });

  it('명령행 입력 줄(앞 조각 + 고를 것 + 뒤 조각)과 기록 줄(통째)의 물음 부분이 같다 — 진짜 번역층', async () => {
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const bad: string[] = [];
    for (const l of LANGS) {
      const mine = SHOWN.filter(([x]) => x === l).map(([, p]) => p);
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      for (const p of mine) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const shown = document.querySelector('.cmd-prompt')!.textContent!;
        const record = translateTail(p, tr(l)(p), tr(l));
        if (HANGUL.test(shown) || HANGUL.test(record) || squash(shown.split('[')[0]!) !== squash(record.split('[')[0]!)) bad.push(`${l}: ${shown} ≠ ${record}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(bad).toEqual([]);
  });

  it('맞춘 쪽은 깨지지 않은 문장·같은 사전 낱말이다', () => {
    const [en, ja, zh, de] = [dict.en, dict.ja, dict['zh-CN'], dict.de];
    // 영어: 낱말 차례({0} 앞에 홀로)·명사꼴 「… input」·3인칭 「Sets」·대소문자만 다른 앞 조각/통째
    expect([en['{0} 지정 또는 ['], en['셀 {0} 옵션 입력 ['], en['{0} 입력 [{1}] <{2}>:']]).toEqual(['Specify {0} or [', 'Enter option for cell {0} [', 'Enter {0} [{1}] <{2}>:']);
    expect([en['새 색상 ['], en['점 선택 또는 ['], en['연관 치수 우선순위 ['], en['대소문자 선택 [']]).toEqual(['New color [', 'Select point or [', 'Associative dimension priority [', 'Select case [']);
    for (const k of ['구성 입력 [수평(H)/수직(V)] <수직>:', '뷰포트 배열 입력 [수평(H)/수직(V)] <수직>:', '매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <{0}>:', '모드 입력 [켜기(ON)/끄기(OFF)] <{0}>:'])
      expect(en[k], k).toMatch(/^Enter /);
    expect(en['뷰포트의 축척 비율 설정. [대화식(I)/균일(U)] <균일>:']).toMatch(/^Set the /);
    expect(en['대상 도면층을 지정하기 위해 객체 선택 또는 [이름(N)] <이름>:']).toBe('Select an object to specify the target layer or [name(N)] <name>:');
    // 일본어: 같은 사전의 「플롯 영역」 印刷範囲·「등각평면」 アイソメトリック平面, 중첩 ネスト(겹침 重なった가 아니다), 도면 공간 ペーパー空間, 물음표 반각(320·323차)
    expect(ja['플롯 영역 입력 [']).toBe(`${ja['플롯 영역']}を入力 [`);
    expect(ja['등각평면 설정 입력 [']!.startsWith(ja['등각평면']!)).toBe(true);
    expect(ja['중첩된 객체 복사 설정 입력 [']).toContain('ネスト');
    expect(ja['중첩된 객체 복사 설정 입력 [']).not.toContain('重な');
    expect(ja['도면 공간을 사용하시겠습니까? [아니오(N)/예(Y)] <예>:']).toMatch(/^ペーパー空間を使用しますか\? \[/);
    for (const k of ['이전 경계를 삭제하시겠습니까? [예(Y)/아니오(N)] <예>:', '검출된 오류를 수정하시겠습니까? [예(Y)/아니오(N)] <N>:', '제목 블록을 외부 참조하시겠습니까? [', '배열 편집 상태에 대한 변경 내용을 저장하시겠습니까? ['])
      expect(ja[k]!.split('[')[0], k).not.toContain('？');
    // 중국어: 배열 阵列(排列가 아니다)·「또는」 或가 빠지지 않음, 해치 填充(같은 사전 다수), 참조 参考(같은 사전 「참조 편집」 编辑参考 — 引用이 아니다), 낱말 차례
    const grip = PAIRS.filter(([h]) => h === '그립을 선택하여 배열을 편집하거나 [').map(([, w]) => w);
    for (const k of ['그립을 선택하여 배열을 편집하거나 [', ...grip]) {
      expect(zh[k], k).toContain('选择夹点以编辑阵列或');
      expect(zh[k], k).not.toContain('排列');
    }
    expect(zh['해치 투명도 값 입력 또는 [ByLayer(L)/ByBlock(B)/현재 사용(.)] <{0}>:']).toMatch(/^输入填充透明度值或 \[/);
    expect(zh['참조 편집']).toContain('参考');
    for (const k of ['참조에 대한 변경 사항 [', '참조에 대한 변경 사항 [저장(S)/취소(D)] <저장>:']) expect(zh[k], k).toMatch(/^对参考的更改 \[/);
    expect([zh['{0} 입력 ['], zh['{0} 지정 또는 ['], zh['간격 유형 입력 ['], zh['구속조건 유형 입력 [']]).toEqual(['输入{0} [', '指定 {0} 或 [', '输入间距类型 [', '输入约束类型 [']);
    expect(zh['{0}할 명명된 축척 입력 또는 [?] <{1}>:']).toBe('输入要{0}的命名比例或 [?] <{1}>：');
    // 독일어: 같은 사전 「제목 블록」 Titelblock(Schriftfeld가 아니다), 고를 것 뒤로 간 동사·꼬리가 없다(입력 줄과 같은 문장), 바꿀 객체 유형 켜고 끄기
    for (const k of ['제목 블록 삽입 후 한계를 재설정하시겠습니까? [', '제목 블록을 외부 참조하시겠습니까? [']) {
      expect(de[k], k).toContain(de['제목 블록']!);
      expect(de[k], k).not.toContain('Schriftfeld');
    }
    for (const k of [
      '점 선택 또는 [객체(O)] <객체>:',
      '행 수 입력 또는 [표현식(E)] <{0}>:',
      '기준점 지정 또는 [키 점(K)] <중심>:',
      '두 번째 점 지정 또는 [배열(A)] <첫 번째 점을 변위로 사용>:',
      '간격띄우기 거리 지정 또는 [통과점(T)] <{0}>:',
      '선택한 객체 정렬 기준 [X/Y/선택 순서(S)] <{0}>:',
      '스냅 간격두기 지정 또는 [종횡비(A)] <{0}>:',
      '{0}할 명명된 축척 입력 또는 [?] <{1}>:',
      '대상 도면층을 지정하기 위해 객체 선택 또는 [이름(N)] <이름>:',
      '바꿀 객체 유형 켜고 끄기 [스타일(S)/외부 참조(X)/이미지(I)/RTEXT(R)/목록(L)] <완료>:',
    ])
      expect(de[k], k).toMatch(/\] <[^<>]*>:$/);
    expect(de['바꿀 객체 유형 켜고 끄기 [']).toBe('Zu ersetzende Objekttypen ein- oder ausschalten [');
    expect(de['간격 유형 입력 [']).toContain('Lückentyp');
    expect(de['간격띄우기 거리 지정 또는 [통과점(T)/지우기(E)/도면층(L)/간격 유형(G)/결합(J)/틈 허용(F)] <{0}>:']).toContain('Lückentyp (G)');
    // 모든 언어: 바꾼 값에 한국어가 남지 않는다
    for (const l of LANGS) for (const [h, w] of PAIRS) for (const k of [h, w]) expect(HANGUL.test(dict[l][k]!), `${l}: ${k}`).toBe(false);
  });

  it('325차: 「옵션 입력 [」 통째 갈래는 언어마다 한 꼴이고, 자주 쓰는 명령의 짝은 같은 사전 낱말·앞 조각 꼴이다', () => {
    const [en, ja, zh, de] = [dict.en, dict.ja, dict['zh-CN'], dict.de];
    // 「옵션 입력 [」: 앞 조각(입력 줄)과 통째 26(기록 줄)이 같은 사전 다수 꼴 — ja는 「옵션을 입력 [」과 같은 꼴, de는 동사가 고를 것 뒤로 가지 않는다
    const opt = PAIRS.filter(([h]) => h === '옵션 입력 [').map(([, w]) => w);
    expect(opt.length).toBeGreaterThan(20);
    expect([en['옵션 입력 ['], ja['옵션 입력 ['], de['옵션 입력 [']]).toEqual(['Enter option [', ja['옵션을 입력 ['], 'Option eingeben [']);
    for (const w of opt) {
      expect(en[w], w).toMatch(/^Enter option \[/);
      expect(ja[w], w).toMatch(/^オプションを入力 \[/);
      expect(zh[w], w).toMatch(/^输入选项 ?\[/);
      expect(de[w], w).toMatch(/^Option eingeben \[/);
      expect(de[w], w).not.toMatch(/\] (auswählen|eingeben) </);
    }
    // 치수: zh 두 번째 치수보조선 第二个(같은 원문 열쇠 다수), 치수 점 추가는 제거 쪽 앞 조각 꼴, de 지정 angeben·분산 Verteilen
    expect(zh['두 번째 치수보조선 원점 지정 또는 [']).toBe(zh['두 번째 치수보조선 원점 지정:']!.replace(/：$/, '或 ['));
    expect(zh['추가할 치수 점을 표시하거나 [']).toBe(zh['제거할 치수 점을 표시하거나 [']!.replace('移除', '添加'));
    expect(de['추가할 치수 점을 표시하거나 [']).toBe(de['제거할 치수 점을 표시하거나 [']!.replace('Entfernen', 'Hinzufügen'));
    expect(de['첫 번째 치수보조선 원점 지정 또는 [']).toBe('Ursprung der ersten Hilfslinie angeben oder [');
    expect(de['분산 유형 입력 [']).toBe('Verteilungstyp eingeben [');
    expect(de['분산(D)']).toMatch(/^Verteil/);
    // en 치수선 위치: 287차가 고정한 「for」 꼴로 기본값 있는·없는 꼴이 모두 같다
    for (const k of keys.filter((x) => x.startsWith('치수선의 위치 지정 또는 [') && x !== '치수선의 위치 지정 또는 ['))
      expect(squash(en[k]!.split('[')[0]!), k).toBe('Specifylocationfordimensionlineor');
    // 간격띄우기·해치·TRIM: ja 모깎기 フィレット(같은 사전 「모깎기(F)」), 명사꼴(…の入力·…の指定·…の選択) 없음
    expect(ja['간격 유형 입력 [보통(N)/모깎기(F)/모따기(C)] <{0}>:']).toContain(ja['모깎기(F)']!);
    for (const h of ['간격띄우기 거리 지정 또는 [', '간격띄우기할 객체 선택 또는 [', '간격띄우기 객체에 대한 도면층 옵션 입력 [', '원점 옵션 입력 [', '쉐이프 옵션 입력 [', '암시적 모서리 연장 모드 입력 [', '각도 정점 지정 또는 [', '그라데이션 패턴 이름 입력 또는 ['])
      for (const [, w] of PAIRS.filter(([x]) => x === h)) expect(ja[w]!.split('[')[0], w).not.toMatch(/の(入力|指定|選択)/);
    // 독일어 통째: 동사·꼬리가 고를 것 뒤로 가지 않는다(입력 줄과 같은 문장), 「점 선택(P)」은 같은 사전 꼴
    for (const k of [
      '분산 유형 입력 [동일(E)/간격띄우기(O)] <동일>:',
      '경계 객체 유형 입력 [영역(R)/폴리선(P)] <폴리선>:',
      '간격띄우기 객체에 대한 도면층 옵션 입력 [현재(C)/원본(S)] <{0}>:',
      '두 번째 그라데이션 색상 지정 또는 [트루 컬러(T)/색상표(CO)/.] <{0}>:',
      '복사 모드 옵션 입력 [단일(S)/다중(M)] <{0}>:',
      '회전 각도 지정 또는 [점 선택(P)] <{0}>:',
    ])
      expect(de[k], k).toMatch(/\] <[^<>]*>:$/);
    expect(de['회전 각도 지정 또는 [점 선택(P)] <{0}>:']).toContain(de['점 선택(P)']!);
    expect(de['선 간격두기 유형 입력 [']).toBe(`${de['선 간격두기']}styp eingeben [`);
    // COPY 기준점 zh 指定基点(设置가 아니다), zh 재료 材质(같은 사전 다수), -LAYER 선종류 이름 Continuous는 옮기지 않는다
    expect(zh['기준점 지정 또는 [변위(D)/모드(O)] <변위>:']).toMatch(/^指定基点或/);
    expect(zh['재료 이름 입력 또는 [']).toContain('材质');
    expect(de['로드된 선종류 이름 입력 또는 [?] <Continuous>:']).toMatch(/<Continuous>:$/);
    // -LAYER 로드된 선종류: 앞 조각(en은 296차 고정)과 기본값 없는 꼴 「[?]」의 물음이 같다
    for (const l of ['en', 'ja', 'zh-CN'] as const)
      expect(squash(dict[l]['로드된 선종류 이름 입력 또는 [?]']!.split('[')[0]!), l).toBe(squash(headQ(dict[l]['로드된 선종류 이름 입력 또는 [']!)));
  });

  it('326차: 뜻이 틀린 짝·「옵션 입력 [」 기본값 없는 꼴·남은 짝은 앞 조각으로 시작하는 갈래가 모두 앞 조각과 같은 문장이고, 같은 사전 낱말이다', () => {
    const [en, ja, zh, de] = [dict.en, dict.ja, dict['zh-CN'], dict.de];
    /** 앞 조각 h로 시작하는 열쇠(통째·기본값 없는 꼴) 가운데 물음 부분이 앞 조각과 다른 것 */
    const famBad = (l: Lang, h: string) => {
      const q = headQ(dict[l][h]!);
      return keys.filter((k) => k !== h && k.startsWith(h)).filter((k) => squash(q) !== squash(wholeQ(dict[l][k]!, q)));
    };
    const FAM: Record<Lang, string[]> = {
      en: ['옵션 입력 [', '명령 취소 조정 옵션 입력 [', '바꿀 객체 유형 켜고 끄기 [', '켜거나 끌 복원 특성 입력 [', '등각평면 설정 입력 [', '일정한 크기 또는 가변 크기로 만들기 [',
        '제목 블록을 외부 참조하시겠습니까? [', '도면층 "{0}"이(가) 없습니다. 만드시겠습니까? [', '변환할 연관 치수 선택 또는 [', '배열 편집 상태에 대한 변경 내용을 저장하시겠습니까? [',
        '왼쪽 아래 구석 지정 또는 [', 'UNDO 자동 모드 입력 [', '기존 블록 이름 입력 또는 [', '블록의 삽입점 지정 또는 [', '시작 레벨과 끝 레벨 사이의 전체 거리 지정 또는 [',
        '시작 열과 끝 열 사이의 전체 거리 지정 또는 [', '시작 행과 끝 행 사이의 전체 거리 지정 또는 [', '다중 지시선 배치 지정 또는 [', '대체 객체의 기준점 선택 또는 ['],
      ja: ['경계 세트 지정 [', 'LAYERP 모드 입력 [', 'PDF 언더레이 옵션 입력 [', 'UCS의 원점 지정 또는 [', 'UNDO 자동 모드 입력 [', '값 수정 유형 입력 [', '값 입력 또는 [', '경로 방법 입력 [',
        '경로를 따라 항목 사이의 거리 지정 또는 [', '경로를 따라 항목 수 지정 또는 [', '구성 입력 [', '나선 높이 지정 또는 [', '내용 유형 선택 [', '네 번째 점 지정 또는 [', '세 번째 점 지정 또는 [',
        '도면층 "{0}"이(가) 없습니다. 만드시겠습니까? [', '맞춤 데이터 옵션 입력 [', '매듭 매개변수화 입력 [', '바꿀 객체 유형 켜고 끄기 [', '배열의 항목 수 입력 또는 [', '뷰포트 구석 지정 또는 [',
        '뷰포트 지정 [', '셀 병합 [', '속성 편집 옵션 입력 [', '시작 열과 끝 열 사이의 전체 거리 지정 또는 [', '시작 행과 끝 행 사이의 전체 거리 지정 또는 [', '열 수 입력 또는 [',
        '왼쪽 아래 구석 지정 또는 [', '용지 공간 단위 유형 입력 [', '이미지 품질 설정 입력 [', '점 선택 또는 [', '제목 블록을 넣을 도면층 이름 입력 또는 [', '측정할 객체 선택 또는 [',
        '투명 모드 입력 [', '행 사이의 거리 지정 또는 ['],
      'zh-CN': ['옵션 입력 [', '치수선의 위치 지정 또는 [', '첫 번째 점 지정 또는 [', 'UNDO 자동 모드 입력 [', '경로를 따라 항목 사이의 거리 지정 또는 [', '경로를 따라 항목 수 지정 또는 [',
        '그룹의 새 이름 입력 또는 [', '나선 높이 지정 또는 [', '나선의 비틀기 방향 입력 [', '네 번째 점 지정 또는 [', '다중 지시선 배치 지정 또는 [', '명령 취소 조정 옵션 입력 [',
        '바꿀 객체 유형 켜고 끄기 [', '배열 편집 상태에 대한 변경 내용을 저장하시겠습니까? [', '배열의 항목 수 입력 또는 [', '설정할 항목 [', '스케치 유형 입력 [',
        '시작 열과 끝 열 사이의 전체 거리 지정 또는 [', '시작 행과 끝 행 사이의 전체 거리 지정 또는 [', '이전 경계를 삭제하시겠습니까? [', '제목 블록 삽입 후 한계를 재설정하시겠습니까? [',
        '제목 블록을 넣을 도면층 이름 입력 또는 [', '참조 편집 작업 세트에 객체 추가 또는 제거 [', '추출 유형 입력 또는 객체 선택 사용 [', '켜거나 끌 복원 특성 입력 ['],
      de: ['도면층 이름 입력 또는 도면층 이름을 지정할 객체 선택 또는 [', '그라데이션 패턴 이름 입력 또는 [', '경계 세트 지정 [', '해치 영역을 이중 해치하시겠습니까? [', '플롯 기본 설정 입력 [',
        '옵션 입력 [', '두 번째 치수보조선 원점 지정 또는 [', '치수선의 위치 지정 또는 [', '첫 번째 점 지정 또는 [', '로드된 선종류 이름 입력 또는 [', '블록 이름 입력 또는 [',
        '선종류 이름 지정 또는 [', '배열 유형 입력 [', '스냅 유형 입력 [', '스케치 유형 입력 [', '나선 높이 지정 또는 [', '변경할 옵션 입력 [', '설정할 항목 [', '블록의 삽입점 지정 또는 [',
        '기본점 지정 또는 ['],
    };
    for (const l of LANGS) for (const h of FAM[l]) expect(famBad(l, h), `${l}: ${h}`).toEqual([]);
    // (가) de: 고른 객체의 도면층을 쓴다(도면층 이름을 「줄」 객체가 아니다 — dimsmart.ts 도면층(L)), 그라데이션 패턴 이름·경계 세트·이중 해치·플롯 기본 설정은 같은 사전 낱말·꼴
    expect(de['도면층 이름 입력 또는 도면층 이름을 지정할 객체 선택 또는 [']).toBe('Layernamen eingeben oder Objekt auswählen, um dessen Layer zu verwenden, oder [');
    expect(de['그라데이션 패턴 이름 입력 또는 [?] <{0}>:']).toBe('Farbverlaufsmusternamen eingeben oder [?] <{0}>:');
    expect(de['경계 세트 지정 [']).toBe(`${de['경계 세트']} angeben [`);
    expect(de['옵션 입력 [경계 세트(B)/섬 검출(I)/객체 유형(O)]:']).toContain(`[${de['경계 세트(B)']}/`);
    expect(de['해치 영역을 이중 해치하시겠습니까? [']).toMatch(/^Möchten Sie /);
    for (const k of ['이 플롯 기본 설정에 대한', '이 플롯 기본 설정에 대한 도면층 이름 입력']) {
      expect(en[k], k).toContain('plot preference');
      expect(de[k], k).toContain('Ploteinstellung');
    }
    expect([en['플롯 기본 설정 입력 ['], de['플롯 기본 설정 입력 [']]).toEqual(['Enter plot preference [', 'Ploteinstellung eingeben [']);
    expect(ja['경계 세트 지정 [']).toBe(`${ja['경계 세트']}を指定 [`);
    // (나) 「옵션 입력 [」 기본값 없는 꼴도 앞 조각 꼴 — 독일어는 고를 것 뒤 동사가 없다, 독일어 선종류는 Linientyp(Zeilentyp 줄 유형이 아니다)·선종류 이름 Continuous는 옮기지 않는다
    for (const k of keys.filter((x) => x.startsWith('옵션 입력 [') && x !== '옵션 입력 [')) {
      expect(en[k], k).toMatch(/^Enter option \[/);
      expect(zh[k], k).toMatch(/^输入选项 ?\[/);
      expect(de[k], k).toMatch(/^Option eingeben \[/);
      expect(de[k], k).not.toMatch(/\] (auswählen|eingeben):$/);
    }
    for (const k of ['로드된 선종류 이름 입력', '로드된 선종류 이름 입력 <Continuous>:', '로드된 선종류 이름 입력 또는 [?]', '로드된 선종류 이름 입력 또는 [?] <Continuous>:', '로드된 선종류: Continuous']) {
      expect(de[k], k).toContain('Linientyp');
      expect(de[k], k).not.toMatch(/Zeilentyp|Kontinuierlich/);
    }
    // (다) 같은 사전 낱말: en isoplane·bottom-left·replace, ja らせん·番目の点·コーナー·測定·選択과 명사꼴 아님, zh 多重引线·撤销·界限·扭转·项目, de 동사 꼬리 없음
    expect(en['등각평면 설정 입력 [왼쪽(L)/위(T)/오른쪽(R)] <{0}>:']).toMatch(/^Enter isoplane /);
    expect(en['왼쪽 아래 구석 지정 또는 [']).toBe('Specify bottom-left corner or [');
    expect(en['바꿀 객체 유형 켜고 끄기 [']).toContain('replace');
    expect([ja['나선 높이 지정 또는 ['], ja['세 번째 점 지정 또는 ['], ja['뷰포트 구석 지정 또는 ['], ja['측정할 객체 선택 또는 [']].map((v, i) => v!.includes(['らせん', '番目の点', 'コーナー', '測定'][i]!))).toEqual([true, true, true, true]);
    expect(ja['점 선택 또는 [']).toBe('点を選択、または [');
    for (const h of ['LAYERP 모드 입력 [', '값 수정 유형 입력 [', '구성 입력 [', '맞춤 데이터 옵션 입력 [', '매듭 매개변수화 입력 [', '속성 편집 옵션 입력 [', '투명 모드 입력 [', '셀 병합 [', '뷰포트 지정 ['])
      for (const k of keys.filter((x) => x.startsWith(h))) expect(ja[k]!.split('[')[0], k).toMatch(/を(入力|指定|選択|結合)\s*$/);
    expect(zh['다중 지시선 배치 지정 또는 [']).toContain('多重引线');
    expect(zh['명령 취소 조정 옵션 입력 [']).toContain('撤销');
    expect(zh['제목 블록 삽입 후 한계를 재설정하시겠습니까? [']).toContain(zh['한계(LI)']!.replace('(LI)', ''));
    expect(zh['나선의 비틀기 방향 입력 [시계 방향(CW)/시계 반대 방향(CCW)] <{0}>:']).toContain(zh['비틀기']!);
    expect(zh['경로를 따라 항목 수 지정 또는 [표현식(E)] <{0}>:']).toContain('项目');
    for (const k of ['블록 이름 입력 또는 [?] <{0}>:', '선종류 이름 지정 또는 [?] <{0}>:', '배열 유형 입력 [직사각형(R)/원형(P)] <{0}>:', '스냅 유형 입력 [극좌표(P)/그리드(G)] <그리드>:', '스케치 유형 입력 [선(L)/폴리선(P)/스플라인(S)] <{0}>:', '나선 높이 지정 또는 [축 끝점(A)/회전(T)/회전 높이(H)/비틀기(W)] <{0}>:'])
      expect(de[k], k).toMatch(/\] <[^<>]*>:$/);
    expect(de['선종류 이름 지정 또는 [']).toBe('Linientypnamen angeben oder [');
  });
});
