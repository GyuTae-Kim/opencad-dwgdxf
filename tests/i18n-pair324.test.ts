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
  "LAYERP 모드 입력 [": "ja1",
  "PDF 언더레이 옵션 입력 [": "en1 ja1 de1",
  "UCS의 원점 지정 또는 [": "ja1 zh-CN1 de1",
  "UNDO 자동 모드 입력 [": "en1 ja1 zh-CN1 de1",
  "X 축척 비율 입력, 반대 구석 지정, 또는 [": "de2",
  "각도 정점 지정 또는 [": "ja1 zh-CN1",
  "간격 유형 입력 [": "en1 ja1",
  "간격띄우기 객체에 대한 도면층 옵션 입력 [": "en1 ja1 de1",
  "간격띄우기 거리 지정 또는 [": "ja3",
  "간격띄우기할 객체 선택 또는 [": "en1 ja2 zh-CN2",
  "값 수정 유형 입력 [": "ja1 de1",
  "값 입력 또는 [": "ja1",
  "객체 선택 또는 [": "ja1",
  "객체 순서 옵션 입력 [": "de1",
  "검사 데이터 추가 또는 [": "ja1",
  "검출된 오류를 수정하시겠습니까? [": "de1",
  "경계 객체 유형 입력 [": "de1",
  "경계 세트 지정 [": "ja1 de1",
  "경로 방법 입력 [": "ja1 zh-CN1",
  "경로를 따라 항목 사이의 거리 지정 또는 [": "en1 ja1 zh-CN1",
  "경로를 따라 항목 수 지정 또는 [": "en1 ja1 zh-CN1",
  "구성 입력 [": "ja2",
  "그라데이션 패턴 이름 입력 또는 [": "en1 ja1 de1",
  "그룹의 새 이름 입력 또는 [": "en1 zh-CN1 de1",
  "그리기 순서 옵션 입력 [": "de1",
  "그립을 선택하여 배열을 편집하거나 [": "de4",
  "기본점 지정 또는 [": "ja1 de1",
  "기존 블록 이름 입력 또는 [": "en1 de1",
  "기준점 지정 또는 [": "zh-CN1",
  "나선 높이 지정 또는 [": "ja1 zh-CN1 de1",
  "나선의 비틀기 방향 입력 [": "en1 zh-CN1 de1",
  "내용 유형 선택 [": "ja1 de1",
  "네 번째 점 지정 또는 [": "en1 ja1 zh-CN1",
  "다음 점 지정 또는 [": "en2 zh-CN2",
  "다중 지시선 배치 지정 또는 [": "en1 ja1 zh-CN1 de1",
  "대체 객체의 기준점 선택 또는 [": "en1 de1",
  "도면층 \"{0}\"이(가) 없습니다. 만드시겠습니까? [": "en1 ja1",
  "도면층 이름 입력 또는 도면층 이름을 지정할 객체 선택 또는 [": "de2",
  "두 번째 그라데이션 색상 지정 또는 [": "ja1 zh-CN1 de1",
  "두 번째 치수보조선 원점 지정 또는 [": "en1 zh-CN1 de1",
  "등각평면 설정 입력 [": "en1 de1",
  "레벨 사이의 거리 지정 또는 [": "en1",
  "레벨 수 입력 또는 [": "en1 de1",
  "로드된 선종류 이름 입력 또는 [": "en1 ja1 zh-CN1 de1",
  "맞춤 데이터 옵션 입력 [": "ja1",
  "매듭 매개변수화 입력 [": "ja1",
  "명령 취소 조정 옵션 입력 [": "en1 zh-CN1 de1",
  "무시할 특성 지정 [": "de1",
  "문자 스타일 옵션 [": "en1 de1",
  "문자 편집 모드 옵션 입력 [": "en1",
  "문자를 둘러쌀 객체 [": "en1 zh-CN1",
  "문자에 번호 배치 [": "zh-CN1",
  "바꿀 객체 유형 켜고 끄기 [": "en1 ja1 zh-CN1",
  "배열 유형 입력 [": "de3",
  "배열 편집 상태에 대한 변경 내용을 저장하시겠습니까? [": "en1 zh-CN1 de1",
  "배열의 항목 수 입력 또는 [": "en1 ja1 zh-CN1 de1",
  "배치 옵션 입력 [": "en1",
  "배치 이름 입력 또는 [": "de1",
  "변경할 옵션 입력 [": "en1 de1",
  "변환할 연관 치수 선택 또는 [": "en1 ja1 de1",
  "복사 모드 옵션 입력 [": "de1",
  "복사할 중첩된 객체 선택 또는 [": "de1",
  "분산 유형 입력 [": "de1",
  "뷰포트 구석 지정 또는 [": "ja1 de1",
  "뷰포트 지정 [": "ja1 de1",
  "뷰포트의 축척 비율 설정. [": "ja1",
  "블록 이름 입력 또는 [": "de1",
  "블록의 삽입점 지정 또는 [": "en1 zh-CN1 de1",
  "새 값 입력 [": "zh-CN1",
  "새 객체 색상 입력 [": "zh-CN1",
  "새 맞춤점 지정 또는 [": "zh-CN1 de1",
  "새 뷰포트의 기본 가시성 [": "de1",
  "새 색상 입력 [": "de1",
  "새 원점 선택 [": "zh-CN1",
  "새 투명도 값 입력 [": "zh-CN1 de1",
  "선 간격두기 유형 입력 [": "ja1 zh-CN1 de1",
  "선종류 이름 지정 또는 [": "de1",
  "설정할 항목 [": "en1 zh-CN1 de1",
  "세 번째 점 지정 또는 [": "ja1",
  "셀 {0} 옵션 입력 [": "ja1 de1",
  "셀 병합 [": "ja1 de1",
  "속성 가시성 설정 입력 [": "en1 de1",
  "속성 편집 옵션 입력 [": "ja1",
  "쉐이프 옵션 입력 [": "ja1 de1",
  "스냅 간격두기 지정 또는 [": "ja2",
  "스냅 그리드 스타일 입력 [": "ja1 de1",
  "스냅 유형 입력 [": "de1",
  "스케치 유형 입력 [": "ja1 zh-CN1 de1",
  "시작 레벨과 끝 레벨 사이의 전체 거리 지정 또는 [": "en1",
  "시작 열과 끝 열 사이의 전체 거리 지정 또는 [": "en1 ja1 zh-CN1 de1",
  "시작 행과 끝 행 사이의 전체 거리 지정 또는 [": "en1 ja1 zh-CN1 de1",
  "시작점 지정 또는 [": "en1 ja1",
  "암시적 모서리 연장 모드 입력 [": "ja1",
  "연관 치수 우선순위 [": "ja1",
  "연속성 입력 [": "de1",
  "열 사이의 거리 지정 또는 [": "de2",
  "열 수 입력 또는 [": "ja1",
  "영역 치수 계산 기준 [": "ja1 de1",
  "옵션 입력 [": "en7 ja19 zh-CN10 de20",
  "옵션 지정 [": "de1",
  "옵션을 입력 [": "de1",
  "왼쪽 아래 구석 지정 또는 [": "en1 ja1 de1",
  "용지 공간 단위 유형 입력 [": "ja1 de1",
  "용지 단위 입력 [": "ja1 de1",
  "용지 방향 입력 [": "de1",
  "원점 옵션 입력 [": "ja1 de1",
  "윈도우 구석 지정, 축척 비율(nX 또는 nXP) 입력, 또는 [": "de2",
  "이미지 품질 설정 입력 [": "ja1",
  "이전 경계를 삭제하시겠습니까? [": "en1 zh-CN1",
  "일정한 크기 또는 가변 크기로 만들기 [": "en1 ja1",
  "자르기 객체 선택 또는 [": "de1",
  "자르기 경계 지정 또는 [": "de1",
  "자르기 옵션 입력 [": "de2",
  "재료 이름 입력 또는 [": "zh-CN1",
  "점 선택 또는 [": "ja1",
  "제거할 치수 점을 표시하거나 [": "en1",
  "제목 블록 삽입 후 한계를 재설정하시겠습니까? [": "en1 zh-CN1",
  "제목 블록을 넣을 도면층 이름 입력 또는 [": "en1 ja1 zh-CN1 de1",
  "제목 블록을 외부 참조하시겠습니까? [": "en1",
  "중첩된 객체 복사 설정 입력 [": "en1 de1",
  "지시선 연결선 사용 [": "de1",
  "지시선 유형 선택 [": "de1",
  "지시선 형식 옵션 입력 [": "en1 de1",
  "지시선의 최대 점 수 입력 또는 [": "zh-CN1",
  "참조 편집 작업 세트에 객체 추가 또는 제거 [": "zh-CN1 de1",
  "참조에 대한 변경 사항 [": "en1",
  "채울 각도 지정(+=ccw, -=cw) 또는 [": "ja1",
  "첫 번째 객체 선택 또는 [": "ja1",
  "첫 번째 구석 지정 또는 [": "ja1",
  "첫 번째 구석점 지정 또는 [": "ja2",
  "첫 번째 그라데이션 색상 지정 또는 [": "ja1 de1",
  "첫 번째 선 또는 호 선택 또는 [": "ja1",
  "첫 번째 점 선택 또는 [": "ja1",
  "첫 번째 점 지정 또는 [": "ja2 de1",
  "첫 번째 지시선 점 지정 또는 [": "ja1",
  "첫 번째 치수보조선 원점 지정 또는 [": "en1 de1",
  "추가할 치수 점을 표시하거나 [": "en1 ja1 zh-CN1 de1",
  "추출 유형 입력 또는 객체 선택 사용 [": "en1 ja1 zh-CN1 de1",
  "축척에 대한 기준점 옵션 입력 [": "ja1 zh-CN1 de1",
  "측정할 객체 선택 또는 [": "ja1 de1",
  "치수 편집의 유형 입력 [": "en1",
  "치수선의 위치 지정 또는 [": "en1 de1",
  "켜거나 끌 복원 특성 입력 [": "en1 zh-CN1 de1",
  "투명 모드 입력 [": "ja1 de1",
  "폴리선 선종류 생성 옵션 입력 [": "de2",
  "플롯 기본 설정 입력 [": "en1 zh-CN1 de1",
  "플롯 축척 입력 (출력 {0}=도면 단위)또는 [": "ja1",
  "하이퍼링크 커서, 바로 가기 메뉴 및 툴팁 표시? [": "de1",
  "항목 사이의 각도 지정 또는 [": "zh-CN1 de1",
  "항목 수 지정 또는 [": "zh-CN1 de1",
  "해치 배경색 입력 또는 [": "en1 de1",
  "해치 색상 입력 또는 [": "en2",
  "해치 스타일 입력 [": "en2",
  "해치 영역을 이중 해치하시겠습니까? [": "zh-CN1 de1",
  "해치 옵션 입력 [": "en1 ja1",
  "해치 작성에 사용할 도면층 입력 또는 [": "en1",
  "해치 투명도 값 입력 또는 [": "en1 de1",
  "행 사이의 거리 지정 또는 [": "en1 ja1 de1",
  "행 사이의 증분 고도 지정 또는 [": "en1",
  "행 수 입력 또는 [": "en1",
  "회전 각도 지정 또는 [": "de1",
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
});
