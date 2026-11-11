/**
 * 113차: 언어 사전의 명령 프롬프트. 명령행은 번역한 글의 [ ]·< >를 읽어 고르기 항목을 만들므로 괄호 짝이 깨진 번역은 항목이 틀어진다
 * (예: "<冻结>解锁>:", "[First]点(F)]", "[Vertikal] Koordinaten (O)/…]"). 중국어는 옵션 이름이 영어로 남거나("Smelt(M)") 플롯을 그리기(绘图)로 옮기지 않는다.
 */
import { readdirSync, readFileSync } from 'node:fs';
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

  it('프롬프트 앞 조각("… [")의 번역은 "["로 끝난다 — 괄호에 싸여 "(…[)"로 깨지지 않는다(117차)', () => {
    // 명령행(setPrompt)은 "앞 글 [" · 옵션 · "] 뒤 글"을 조각마다 옮긴다. 조각 열쇠 = 다른 프롬프트 열쇠의 "[" 앞까지인 것
    for (const lang of ['en', 'de', 'ja', 'zh-CN']) {
      const d = load(lang);
      const keys = Object.keys(d);
      const frags = keys.filter((k) => k.endsWith('[') && keys.some((f) => f !== k && f.startsWith(k) && /\][^[\]]*:\s*$/.test(f)));
      expect(frags.length).toBeGreaterThan(300);
      expect(frags.filter((k) => !/\[\s*$/.test(d[k]!)).map((k) => `${lang}: ${k} => ${d[k]}`)).toEqual([]);
    }
  });

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
    // 소스는 보이는 이스케이프로 쓴다(보이지 않는 글자를 그대로 두지 않는다) — 이스케이프를 글자로 풀어 견준다
    const WJ = String.fromCodePoint(0x2060);
    expect(ribbon).toBe(String.raw`자르기\u{2060}`);
    expect(ribbon!.replace(String.raw`\u{2060}`, WJ)).toBe(clip);
    // 화면 글은 보이지 않는 글자(U+2060) 하나만 다르다
    expect(clip).not.toBe('자르기');
    expect(clip).toBe('자르기' + WJ);
    expect(readFileSync(new URL('../src/app/imageclip.ts', import.meta.url), 'utf8')).not.toContain(String.fromCharCode(0x2060));
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
    // 117차: 네 언어가 함께 use로 옮겼던 쓰기 경로 줄(dxf/wcontext layout.duplicate, dwg/writer write_object·entity_dropped와 던지는 오류, refedit 형식 바꿈, write_table_as_insert)
    for (const k of [
      'ACIS 자료를 쓸 수 없어 ACIS 객체를 와이어(3D 폴리선)로 썼습니다.',
      '{0}은 쓸 수 없어 AC1015(R2000)로 썼습니다.',
      '{0}은 쓸 수 없어 AC1032(R2018)로 썼습니다.',
      '이 버전으로 쓸 수 없는 객체 {0}개를 뺐습니다(원본 자료가 없거나 다른 버전).',
      '이 버전으로 쓸 수 없는 도형 {0}개를 뺐습니다(원본 자료가 없거나 다른 버전).',
      '쓸 수 없는 객체 {0}',
      '쓸 수 없는 도형 {0}',
      '참고: {0} 형식은 쓸 수 없어 {1} 형식으로 저장했습니다.',
      '행·열이 없는 표(ACAD_TABLE)를 그림 블록의 블록 참조로 썼습니다.',
    ])
      dicts.forEach((d, i) => {
        if (used[i]!.test(d[k]!) || !write[i]!.test(d[k]!)) bad.push(`${i}: ${k} => ${d[k]}`);
      });
    // 앞 절의 "쓰는"(사용)은 use 그대로, 뒤 절 "하나만 썼습니다"는 write
    dicts.forEach((d, i) => {
      const k = '같은 블록을 쓰는 배치가 둘 이상이라 하나만 썼습니다.';
      if (!write[i]!.test(d[k]!)) bad.push(`${i}: ${k} => ${d[k]}`);
    });
    // 한두 언어만 use로 옮겼던 쓰기 경로 줄(그 언어만 본다 — 다른 언어의 converted·represented·改用도 뜻이 맞다)
    const partly: [string, number[]][] = [
      ['이 버전에 없는 MESH를 폴리페이스 메시로 썼습니다.', [1, 3]],
      ['이 버전에 없는 치수 종류를 치수 그림 블록의 삽입으로 썼습니다.', [1]],
      ['이 버전에 없는 표(ACAD_TABLE)를 표 그림 블록의 삽입으로 썼습니다.', [1]],
      ['없는 선종류를 ByLayer로 썼습니다.', [1, 2]],
      ['셀 서식을 알 수 없는 표(ACAD_TABLE)를 기본 셀로 썼습니다(그림 블록은 그대로).', [2, 3]],
      ['쓸 객체가 없는 그룹을 뺐습니다.', [2, 3]],
      ['코드 페이지에 없는 문자를 \\U+XXXX로 썼습니다.', [3]],
    ];
    for (const [k, ls] of partly)
      for (const i of ls) if (used[i]!.test(dicts[i]![k]!) || !write[i]!.test(dicts[i]![k]!)) bad.push(`${i}: ${k} => ${dicts[i]![k]}`);
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
    // SELECTIONCYCLING 도움말: en Selection Cycling, de Auswahlwechsel, zh 选择循环
    const cyc = ['선택 순환', '선택 순환 — {0}개 겹침', '선택 순환 목록을 쓰지 않습니다.'];
    for (const k of cyc) {
      expect(en[k]).toMatch(/selection cycling/i);
      expect(de[k]).toContain('Auswahlwechsel');
      expect(zh[k]).toContain('选择循环');
    }
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

  it('TEXTMASK·WIPEOUT의 가리기는 Wipeout 객체다(Hide·Ausblenden·隠す·隐藏가 아니다 — 117차)', () => {
    // Autodesk 도움말: TEXTMASK 옵션 Wipeout/3dface/Solid(de Abdeckung·3D-Fläche, ja ワイプアウト·3D 面, zh 区域覆盖·三维面),
    // WIPEOUT(de ABDECKEN·Abdeckungsobjekt, ja WIPEOUT[ワイプアウト], zh 区域覆盖对象), WIPEOUTFRAME(frames for wipeout objects·Rahmen für Abdeckungsobjekte·
    // ワイプアウト オブジェクトのフレーム·区域覆盖对象的框架), TEXTUNMASK(removes the mask·Maske entfernen·マスクを除去·删除遮罩)
    expect(tr(en, ['가리기', '가리기(W)', '3D 면(3)', '가리기 테두리', '가리기 유형', '가리기 해제'])).toEqual(['Wipeout', 'Wipeout (W)', '3D Face (3)', 'Wipeout frames', 'Mask type', 'Remove mask']);
    expect(tr(de, ['가리기', '가리기(W)', '3D 면(3)', '가리기 테두리', '가리기 유형', '가리기 해제'])).toEqual(['Abdeckung', 'Abdeckung (W)', '3D-Fläche (3)', 'Abdeckungsrahmen', 'Maskentyp', 'Maske entfernen']);
    expect(tr(ja, ['가리기', '가리기(W)', '3D 면(3)', '가리기 테두리', '가리기 유형', '가리기 해제'])).toEqual(['ワイプアウト', 'ワイプアウト(W)', '3D 面(3)', 'ワイプアウト フレーム', 'マスクタイプ', 'マスク除去']);
    expect(tr(zh, ['가리기', '가리기(W)', '3D 면(3)', '가리기 테두리', '가리기 유형', '가리기 해제'])).toEqual(['区域覆盖', '区域覆盖(W)', '三维面(3)', '区域覆盖框架', '遮罩类型', '删除遮罩']);
    // 가리기·가리개가 든 줄에 숨기기 낱말이 없다(HIDE 명령 이름·일본어 隠線処理는 뺀다)
    const hide = [/\b(?:[Uu]n)?[Hh]id(?:e|es|ing|den)\b/, /ausblend|einblend/i, /隠す|隠し|隠蔽/, /隐藏|屏蔽|蒙版|掩码/];
    const bad: string[] = [];
    for (const k of Object.keys(en).filter((s) => /가리기|가리개|가릴|가린|가렸/.test(s)))
      [en, de, ja, zh].forEach((d, i) => {
        if (hide[i]!.test(d[k]!)) bad.push(`${i}: ${k} => ${d[k]}`);
      });
    expect(bad).toEqual([]);
  });

  it('TEXTMASK·TEXTUNMASK 명령행 글은 네 언어에서 한국어 없이 옮겨진다(유형 이름을 끼운 줄 포함 — 117차)', async () => {
    const { MASK_LABEL } = await import('../src/edit/express/textmask');
    const { translate } = await import('../site/i18n.mjs');
    // express-text.ts가 찍는 꼴 그대로(명령행은 [ 앞 글·옵션·] 뒤 글 조각과 통째 프롬프트를 함께 옮긴다)
    const lines: string[] = [];
    for (const t of ['wipeout', 'solid'] as const) {
      const label = MASK_LABEL[t];
      lines.push(`현재 설정: 간격띄우기 비율 = 0.35, 가리기 유형 = ${label}${t === 'solid' ? ' (색상 1)' : ''}`);
      lines.push(`가리기에 사용할 객체 유형 지정 [가리기(W)/3D 면(3)/솔리드(S)] <${label}>:`, `] <${label}>:`, `문자 3개를 ${label}(으)로 가렸습니다.`);
    }
    lines.push(
      '가릴 문자 객체 선택 또는 [가리기 유형(M)/간격띄우기(O)]:',
      '가릴 문자 객체 선택 또는 [',
      '가리기 유형(M)',
      '가리기에 사용할 객체 유형 지정 [',
      '가리기(W)',
      '3D 면(3)',
      '솔리드(S)',
      '3D 면 가리기는 숨기기(HIDE) 표시가 필요해 이 웹 버전에서 쓸 수 없습니다. 가리기(W)나 솔리드(S)를 쓰십시오.',
      '배경 가리기 색상 번호 입력 <1>:',
      '문자 높이에 대한 간격띄우기 비율 입력',
      '가릴 수 있는 문자가 없습니다(빈 문자).',
      '이 도면에는 이름 있는 객체 사전이 없어 문자와 가리개를 그룹으로 묶지 못했습니다.',
      '가리기를 지울 문자 또는 여러 줄 문자 객체 선택:',
      '가린 문자를 고르지 않았습니다.',
      '문자 3개의 가리기를 지웠습니다.',
      '문자 가리기',
      '문자 가리기 지우기',
      '문자 뒤에 가리개 (TEXTMASK)',
      '문자 가리개 지우기 (TEXTUNMASK)',
    );
    const left = ['en', 'de', 'ja', 'zh-CN'].flatMap((l) => lines.map((s) => `${l}: ${translate(s, l)}`)).filter((s) => /[가-힣]/.test(s));
    expect(left).toEqual([]);
    expect(translate('현재 설정: 간격띄우기 비율 = 0.35, 가리기 유형 = 솔리드 (색상 1)', 'de')).toBe('Aktuelle Einstellungen: Versatzverhältnis = 0.35, Maskentyp = Vollflächig (Farbe 1)');
    expect(translate('가리기에 사용할 객체 유형 지정 [가리기(W)/3D 면(3)/솔리드(S)] <가리기>:', 'ja')).toBe('マスクに使用するオブジェクトタイプを指定 [ワイプアウト(W)/3D 面(3)/ソリッド(S)] <ワイプアウト>:');
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

/**
 * 117차: 도우미(getDistance·askNumber 등)가 프롬프트에 " <기본값>:"을 붙이면 그 꼴의 사전 열쇠가 없어 일반 틀("{0} 입력 <{1}>:")에 걸리거나
 * 통째로 한국어로 남았다(소스 96개 중 명령행 79개). 화면 번역 고리(fileguard.ts translateTail)는 본문만 옮기고 기본값을 그대로 붙인다.
 */
describe('기본값을 붙인 프롬프트(117차)', () => {
  const langs = ['en', 'de', 'ja', 'zh-CN'];
  const dicts = langs.map(load);
  const helperPrompts = (): string[] => {
    const out = new Set<string>();
    const walk = (dir: URL) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
        else if (e.name.endsWith('.ts'))
          for (const m of readFileSync(new URL(e.name, dir), 'utf8').matchAll(/\b(?:getDistance|getAngle|askNumber|askInt|askAngle|askPositive|askNum|askLength|getInt|chooseLayout)\((?:ctx, )?'([^']+)'/g))
            if (/[가-힣]/.test(m[1]!)) out.add(m[1]!);
      }
    };
    walk(new URL('../src/', import.meta.url));
    return [...out].sort();
  };

  it('명령행·휴대폰 카드에서 기본값 붙은 프롬프트가 네 언어 모두 한국어 없이 보인다', async () => {
    const { translateTail } = await import('../src/app/fileguard');
    const { translate } = await import('../site/i18n.mjs');
    const prompts = helperPrompts();
    expect(prompts.length).toBeGreaterThan(90);
    const show = (s: string, l: string) => translateTail(s, translate(s, l), (x) => translate(x, l));
    const left: string[] = [];
    for (const p of prompts)
      for (const l of langs) {
        // 기본값 없이 묻는 곳("{프롬프트}:")만 있는 프롬프트는 그 꼴로 본다(방향 전환 Ctrl 안내가 붙은 호·현)
        const forms = [`${p} <1.5>:`, `${p}:`].map((s) => show(s, l));
        if (forms.every((s) => /[가-힣]/.test(s))) left.push(`${l}: ${forms[0]}`);
      }
    expect(left).toEqual([]);
    // 본문 번역이 콜론·마침표로 끝나 "…: <1>:"·"…. <1>:"이 되지 않는다(원문에 콜론이 있는 줄은 뺀다)
    const ends = prompts.flatMap((p) => dicts.map((d, i) => (d[p] !== undefined && !/:\s*$/.test(p) && /[:：.。]\s*$/.test(d[p]!) ? `${langs[i]}: ${p} => ${d[p]}` : ''))).filter(Boolean);
    expect(ends).toEqual([]);
    expect(show('도넛의 내부 지름 지정 <0.5>:', 'zh-CN')).toBe('指定圆环的内径 <0.5>:');
    expect(show('면의 수 입력 <4>:', 'ja')).toBe('エッジの数を入力 <4>:');
    expect(show('새 순서 입력 <5>:', 'de')).toBe('Neue Ordnung (Grad plus eins) eingeben <5>:');
    // 한국어 화면과 사전에 통째 열쇠가 있는 프롬프트는 그대로
    expect(show('간격 거리 지정 <1>:', 'ko')).toBe('간격 거리 지정 <1>:');
    expect(show('모든 축에 대한 축척 비율 지정 <1>:', 'en')).toBe('Specify scale factor for all axes <1>:');
  });

  it('맞춤 공차·스플라인 차수 올리기·다각형 면의 수·도넛·여러 줄 문자 단 간격은 Autodesk 도움말 낱말', () => {
    const [en, de, ja, zh] = dicts as [Record<string, string>, Record<string, string>, Record<string, string>, Record<string, string>];
    // SPLINE·SPLINEDIT 도움말: Fit Tolerance·Toleranz·許容差·公差/容差, Elevate Order(Höherer Grad·次数上昇·提高阶数)
    expect([en, de, ja, zh].map((d) => d['맞춤 공차 지정'])).toEqual(['Specify fit tolerance', 'Toleranz angeben', '許容差を指定', '指定公差']);
    expect([en, de, ja, zh].map((d) => d['맞춤 공차 입력'])).toEqual(['Enter fit tolerance', 'Toleranz eingeben', '許容差を入力', '输入容差']);
    expect([de, ja, zh].map((d) => d['새 순서 입력'])).toEqual(['Neue Ordnung (Grad plus eins) eingeben', '新しい次数を入力', '输入新阶数']);
    // POLYGON 도움말: エッジの数·边数, DONUT 도움말: 圆环의 内径·外径, 단 설정 대화 상자: Bundstegbreite·栏间距·間隔
    expect([ja['면의 수 입력'], zh['면의 수 입력']]).toEqual(['エッジの数を入力', '输入边数']);
    expect([zh['도넛의 내부 지름 지정'], zh['도넛의 외부 지름 지정']]).toEqual(['指定圆环的内径', '指定圆环的外径']);
    expect([de['거터 폭 지정'], ja['거터 폭 지정'], zh['거터 폭 지정']]).toEqual(['Bundstegbreite angeben', '段の間隔を指定', '指定栏间距']);
  });

  it('DIMPOST·DIMAPOST의 머리말·꼬리말은 접두·접미(prefix·suffix — 머리글·바닥글이 아니다)', () => {
    // DIMPOST 도움말: text prefix or suffix·Textpräfix und/oder -suffix·接頭/接尾表記·文字前缀或后缀
    const keys = ['머리말·꼬리말(<>가 값 자리)', '대체 단위 머리말·꼬리말([]가 값 자리)', '대체 단위 머리말·꼬리말(['];
    const bad = [/header|footer/i, /Kopf|Fuß/, /ヘッダー|フッター/, /页眉|页脚/];
    for (const k of keys) dicts.forEach((d, i) => expect(d[k], `${langs[i]} ${k}`).not.toMatch(bad[i]!));
    expect(dicts.map((d) => d['머리말·꼬리말(<>가 값 자리)'])).toEqual(['Prefix/suffix (<> is the value placeholder)', 'Präfix/Suffix (<> ist die Stelle des Werts)', '接頭/接尾表記（<>は値が入る箇所）', '前缀/后缀（<> 表示值位置）']);
  });
});
