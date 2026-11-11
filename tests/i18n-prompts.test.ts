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

/** 115차: 동음이의 "자르기"(TRIM·CLIP·CUTCLIP·다중선 절단)와 명령 취소(UNDO). 값은 Autodesk 언어별 도움말의 명령·옵션 이름이다 */
describe('언어 사전 동음이의(자르기·명령 취소)', () => {
  const [en, de, ja, zh] = ['en', 'de', 'ja', 'zh-CN'].map(load) as [Record<string, string>, Record<string, string>, Record<string, string>, Record<string, string>];
  const tr = (d: Record<string, string>, keys: string[]) => keys.map((k) => d[k]);

  it('MLEDIT 도구 이름(Multilines Edit Tools 대화 상자)', () => {
    const tools = ['단일 자르기', '전체 자르기', '전체 용접'];
    expect(tr(en, tools)).toEqual(['Cut Single', 'Cut All', 'Weld All']);
    expect(tr(de, tools)).toEqual(['Einfach schneiden', 'Alles schneiden', 'Alles verbinden']);
    expect(tr(ja, tools)).toEqual(['1 つを切断', 'すべてを切断', 'すべてを接続']);
    expect(tr(zh, tools)).toEqual(['单个剪切', '全部剪切', '全部接合']);
    expect(en['병합된 십자형']).toBe('Merged Cross');
    expect(de['병합된 십자형']).toBe('Integriertes Kreuz');
    expect(de['열린 T자형']).toBe('Offenes T');
    expect(zh['열린 십자형']).toBe('十字打开');
    expect(zh['여러 줄 편집 도구']).toBe('多线编辑工具');
  });

  it('EXTRIM은 경계의 한쪽을 자른다("양쪽"이 아니다)', () => {
    const k = '경계 한쪽 모두 자르기';
    expect(en[k]).toMatch(/one side/i);
    expect(de[k]).toContain('einer Seite');
    expect(ja[k]).toContain('片側');
    expect(zh[k]).toContain('一侧');
    for (const d of [en, ja, zh]) expect(d[k]).not.toMatch(/both|両方|两侧/);
    expect(en['닫힌 경계 안·밖을 자름 (EXTRIM)']).toContain('inside or outside');
    expect(de['닫힌 경계 안·밖을 자름 (EXTRIM)']).toContain('oder');
  });

  it('TRIM은 Trim·Stutzen·トリム·修剪(FILLET·CHAMFER의 자르기 옵션 포함)', () => {
    expect(tr(en, ['자르기 (TR)'])).toEqual(['Trim (TR)']);
    expect(tr(de, ['자르기 (TR)', '자르기(T)'])).toEqual(['Stutzen (TR)', 'Stutzen (T)']);
    expect(tr(ja, ['자르기 (TR)', '자르기(T)'])).toEqual(['トリム (TR)', 'トリム(T)']);
    expect(zh['자르기(T)']).toBe('修剪(T)');
  });

  it('CLIP 리본 단추·명령 이름: 한국어 글은 TRIM과 같은 "자르기", 다른 언어는 CLIP 이름(116차)', async () => {
    const { registerImageClipCommands } = await import('../src/app/imageclip');
    const { translate } = await import('../site/i18n.mjs');
    const titles = new Map<string, string>();
    registerImageClipCommands({ register: (c: { name: string; title: string }) => titles.set(c.name, c.title) } as never);
    const clip = titles.get('CLIP')!;
    const ribbon = readFileSync(new URL('../src/app/ui/shell.ts', import.meta.url), 'utf8').match(/cmd: 'CLIP', label: '([^']*)'/)?.[1];
    // 소스의 이스케이프(⁠)를 글자로
    expect(ribbon && JSON.parse(`"${ribbon}"`)).toBe(clip);
    // 화면 글은 보이지 않는 글자(U+2060) 하나만 다르다
    expect(clip).not.toBe('자르기');
    expect(clip.replace(/⁠/g, '')).toBe('자르기');
    expect(translate(clip, 'ko')).toBe(clip);
    // Autodesk 도움말: en "Use the generic CLIP command to clip …", de ZUSCHNEIDEN (Befehl), ja CLIP[クリップ] (コマンド), zh 可使用常规 CLIP 命令剪裁…
    expect(['en', 'de', 'ja', 'zh-CN'].map((l) => translate(clip, l))).toEqual(['Clip', 'Zuschneiden', 'クリップ', '剪裁']);
    expect(['en', 'de', 'ja', 'zh-CN'].map((l) => translate('자르기', l))).toEqual(['Trim', 'Stutzen', 'トリム', '修剪']);
    expect([en, de, ja, zh].map((d) => d[clip])).toEqual(['Clip', 'Zuschneiden', 'クリップ', '剪裁']);
  });

  it('쓰다: 소스에서 "사용"인 줄은 write로, "파일에 씀"인 줄은 use로 옮기지 않는다(116차)', () => {
    const write = [/writ|wrote/i, /schreib|geschrieben/i, /書/, /写/];
    const used = [/\bused?\b/i, /verwend/i, /使用/, /使用|改用|用作/];
    const dicts = [en, de, ja, zh];
    // 이름·명령·옵션·파일을 "쓰는"(사용) 줄 — 각 줄의 소스 자리: 계산기 단위, 필터·별칭·함수 이름 검사, 파일 이름 찾기, TEXTMASK, 이미지 부착 안내,
    // SELECT 안내, 주석 축척 삭제, REFEDIT, LAYVPI, WBLOCK 블록 이름, 색상표, SELECTIONCYCLING, 외부 참조 목록, 블록 편집기 안 막기
    const use = [
      '"{0}"은(는) 기본 필터 이름이라 쓸 수 없습니다.',
      '"{0}"은(는) 명령 이름이라 별칭으로 쓸 수 없습니다.',
      '"{0}"은(는) 함수·상수·단위 이름이라 쓸 수 없습니다.',
      '3D 면 가리기는 숨기기(HIDE) 표시가 필요해 이 웹 버전에서 쓸 수 없습니다. 가리기(W)나 솔리드(S)를 쓰십시오.',
      '{0} × {1} 화소. 해상도 정보를 쓰지 않으므로 축척 1 = 폭 1 도면 단위입니다(AutoCAD와 같다).',
      '{0}개를 선택했습니다. 다음 명령에서 이전(P)으로 쓸 수 있습니다.',
      '{0}은(는) 주석 객체가 쓰고 있어 삭제할 수 없습니다.',
      '{0}은(는) 주석 객체나 뷰포트가 쓰고 있어 삭제할 수 없습니다.',
      '{0}을(를) 내부 편집합니다. 작업 세트 {1}개(나머지는 XFADECTL {2}%로 흐리게). 끝내려면 REFCLOSE 또는 띠의 "변경 사항 저장"·"변경 사항 취소"를 쓰십시오.',
      '뷰포트에 들어간 모형 공간(MSPACE)에서 쓰십시오.',
      '블록 이름 "{0}"을(를) 쓸 수 없거나 이미 있어 객체를 그대로 두었습니다.',
      '블록 편집기에서는 쓸 수 없습니다.',
      '색상표(색상 책)는 이 웹 버전에서 쓸 수 없습니다. 색 번호나 트루 컬러(T)를 쓰십시오.',
      '선택 순환 목록을 쓰지 않습니다.',
      '이 도면은 외부 파일을 쓰지 않습니다.',
    ];
    const bad: string[] = [];
    for (const k of use) dicts.forEach((d, i) => {
      if (!d[k]) bad.push(`${i}: 없음 ${k}`);
      else if (write[i]!.test(d[k]!)) bad.push(`${i}: ${k} => ${d[k]}`);
    });
    // 저장(DWG·DXF 쓰기)의 경고 — 버전·ACIS 자료를 "쓸 수 없어 …로 썼다"
    for (const k of ['ACIS 자료를 쓸 수 없어 ACIS 객체를 와이어(3D 폴리선)로 썼습니다.', '{0}은 쓸 수 없어 AC1015(R2000)로 썼습니다.', '{0}은 쓸 수 없어 AC1032(R2018)로 썼습니다.'])
      dicts.forEach((d, i) => {
        if (used[i]!.test(d[k]!) || !write[i]!.test(d[k]!)) bad.push(`${i}: ${k} => ${d[k]}`);
      });
    expect(bad).toEqual([]);
    // 면(face)·띠(bar)·작업 세트 개수
    expect(de['3D 면 가리기는 숨기기(HIDE) 표시가 필요해 이 웹 버전에서 쓸 수 없습니다. 가리기(W)나 솔리드(S)를 쓰십시오.']).toContain('3D-Flächen');
    expect(zh['3D 면 가리기는 숨기기(HIDE) 표시가 필요해 이 웹 버전에서 쓸 수 없습니다. 가리기(W)나 솔리드(S)를 쓰십시오.']).toContain('三维面');
    expect(zh['ACIS 자료를 쓸 수 없어 ACIS 객체를 와이어(3D 폴리선)로 썼습니다.']).not.toContain('电线');
    const ref = use[8]!;
    expect(en[ref]).toContain('{1} objects in the working set');
    expect(zh[ref]).not.toContain('波段');
    // REFSET 도움말: de Arbeitssatz·abgeblendet, ja 作業セット·暗く表示, zh 工作集·在位编辑·淡入显示
    expect([de['작업 세트'], ja['작업 세트'], zh['작업 세트']]).toEqual(['Arbeitssatz', '作業セット', '工作集']);
    expect(de[ref]).toContain('Arbeitssatz');
    expect(zh[ref]).toContain('在位编辑');
  });

  it('XCLIP·IMAGECLIP의 자르기는 클립(Crop·Cut·トリミング이 아니다)', () => {
    const keys = ['반전 자르기', '반전 자르기(I)', '블록 자르기', '선택한 블록에 자르기 경계가 없습니다.'];
    expect(en['반전 자르기(I)']).toBe('Invert clip (I)');
    expect(de['반전 자르기(I)']).toBe('Schnitt invertieren (I)');
    expect(ja['반전 자르기(I)']).toBe('クリップを反転(I)');
    expect(zh['반전 자르기(I)']).toBe('反向剪裁(I)');
    for (const k of keys) {
      expect(en[k]).not.toMatch(/crop|cut/i);
      expect(ja[k]).not.toMatch(/トリミング|切り取り/);
    }
    const jaClip = Object.entries(ja).filter(([k, v]) => /^자르기 (옵션|객체|경계)|^이미지 자르기$|^PDF (언더레이 )?자르기$/.test(k) && /トリミング|切り取り/.test(v)).map(([k, v]) => `${k} => ${v}`);
    expect(jaClip).toEqual([]);
  });

  it('CUTCLIP의 잘라내기는 Cut·Ausschneiden·切り取り·剪切', () => {
    expect(tr(en, ['잘라내기'])).toEqual(['Cut']);
    expect(tr(de, ['잘라내기'])).toEqual(['Ausschneiden']);
    expect(tr(ja, ['잘라내기'])).toEqual(['切り取り']);
    expect(tr(zh, ['잘라내기'])).toEqual(['剪切']);
  });

  it('명령 취소는 UNDO다: 영어 Cancel·독일어 Abbrechen으로 옮기지 않는다(Esc 안내는 진짜 취소라 뺀다)', () => {
    const undo = (d: Record<string, string>, bad: RegExp) =>
      Object.entries(d)
        .filter(([k, v]) => k.includes('명령 취소') && k !== '명령 취소, 선택 해제' && bad.test(v))
        .map(([k, v]) => `${k} => ${v}`);
    expect(undo(en, /cancel/i)).toEqual([]);
    expect(undo(de, /abbrechen/i)).toEqual([]);
    expect(en['명령 취소']).toBe('Undo');
    expect(de['명령 취소']).toBe('Rückgängig');
    expect(en['명령 취소, 선택 해제']).toMatch(/cancel/i);
  });
});
