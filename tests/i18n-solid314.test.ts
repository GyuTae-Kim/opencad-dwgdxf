/**
 * 314차: 3D 객체·두께·고도·영역 묶음의 번역 대조와 빠진 번역.
 * - 종류 이름(inquiry.ts TYPE_NAMES — 특성 팔레트·LIST·정보 카드): 3D 솔리드 독일어 3D-Volumenkörper·중국어 三维实体(같은 사전의 다른 3D 솔리드 글 — 3D-Körper·3D立体가 아니다),
 *   본체(BODY) 일본어 ボディ·중국어 体(「3D 솔리드·바디는 분해할 수 없습니다」 — 实体는 「솔리드」), 폴리페이스 메시 중국어 多面体网格(「폴리곤 메시」 多边形网格과 같은 이름이던 것)·독일어 Polyface-Mesh.
 * - ACIS·평면화: 영역(REGION) region·Region·面域(넓이 area·Fläche·区域가 아니다), 곡면 surface·Oberfläche, FLATTEN 숨은선 안내는 앱이 평면화한다(명령꼴·请이 아니다 — 독일어 Glätten은 「부드럽게」),
 *   결과 줄 중국어 고도 标高(高度는 「높이」).
 * - 두께·고도·돌출 방향: 영어 고도 Elevation(Altitude가 아니다 — 298차 꼴), 중국어 두께 厚度(粗细·线粗가 아니다 — 298차 꼴), 돌출 방향 拉伸方向.
 * - -PLOT 음영 플롯: 숨김(H)은 숨은선 보기(Verdeckt·隠線処理·消隐 — 숨기기 Ausgeblendet·非表示·已隐藏가 아니다), 통째 기록 줄 = 앞 조각 + 옵션 조각 + 「] <기본값>:」.
 * - 빠진 번역: DWG 다른 버전 저장 경고 「ACIS 자료를 이 버전으로 쓸 수 없어 …」(DXF 쓰기 경고 열쇠 + 「이 버전으로」).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guardedTranslate, translateTail } from '../src/app/fileguard';
import { sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
/** 명령행·패널에 보이는 꼴(통째 번역 + 기록 줄의 프롬프트·기본값 꼬리 — fileguard translateTail) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));

/** 같은 사전의 3D 솔리드·바디·영역 글 */
const EXPL = '3D 솔리드·바디는 분해할 수 없습니다. AutoCAD는 면을 영역·바디로 나누지만, 그러려면 ACIS 형상을 새로 만들어야 해서 이 웹 버전에서는 할 수 없습니다(원본은 그대로 둡니다).';
const AREA_SKIP = '영역이나 닫힌 객체가 아닌 {0}개는 뺐습니다(3D 솔리드는 2D에서 잴 수 없습니다).';
const DRAWN = '형상 자료를 풀 수 없는 3D 솔리드·영역과 그림이 없는 사용자 객체는 그리지 않았습니다.';
const MESHW = '이 버전에 없는 MESH를 폴리페이스 메시로 썼습니다.';
const SURF = '3D 솔리드·표면·메시';
const ACIS = 'ACIS 객체(영역·3D 솔리드·곡면)는 변환할 수 없습니다.';
const ACIS_NO = 'ACIS 자료가 없거나 이 버전으로 바꿀 수 없어 ACIS 객체(REGION·3DSOLID 등)를 쓰지 않았습니다.';
/** FLATTEN */
const HIDE = '숨은선 제거는 3D 뷰가 없는 이 웹 버전에서 쓸 수 없습니다. 숨은선을 남긴 채 평면화합니다.';
const FLAT = '객체 {0}개를 평면화했습니다(Z·고도·두께 = 0).';
const RIBBON = 'Z·고도·두께를 0으로 (FLATTEN)';
/** 두께 옵션이 든 통째 프롬프트(FILTER·무시할 특성), SSX 돌출 방향 */
const FILTER = '필터 옵션 입력 [블록 이름(B)/색상(C)/객체(E)/플래그(F)/도면층(LA)/선종류(LT)/선택(P)/스타일(S)/두께(T)/벡터(V)]:';
const IGNORE = '무시할 특성 지정 [없음(N)/모두(A)/색상(C)/도면층(LA)/선종류(LT)/선종류 축척(S)/선가중치(LW)/두께(TH)/투명도(TR)/플롯 스타일(PL)/재료(M)] <없음>:';
const EXTR = '돌출 방향을 x y z로 입력하십시오(예: 0 0 1).';
/** -PLOT 음영 플롯 */
const PSHIDE = '도면 공간 객체 숨기기는 3D 숨은선 제거라 2D 플롯에서는 쓰지 않습니다.';
const FRONT = '음영 플롯 설정 입력 [';
const SHADE = ['화면표시대로(A)', '와이어프레임(W)', '숨김(H)', '비주얼 스타일(V)', '렌더(R)'];
const FULL = `${FRONT}${SHADE.join('/')}] <화면표시대로>:`;
/** DWG·DXF 쓰기의 ACIS 와이어 경고 */
const NEW = 'ACIS 자료를 이 버전으로 쓸 수 없어 ACIS 객체를 와이어(3D 폴리선)로 썼습니다.';
const SIB = 'ACIS 자료를 쓸 수 없어 ACIS 객체를 와이어(3D 폴리선)로 썼습니다.';

describe('3D 객체·두께·고도·영역 묶음의 번역(314차)', () => {
  it('3D 객체 종류 이름은 같은 사전의 낱말이다(3D-Volumenkörper·三维实体, ボディ·体, 多面体网格·Polyface-Mesh)', () => {
    const [de, ja, zh] = [dict.de, dict.ja, dict['zh-CN']];
    const inq = src('app/inquiry.ts');
    for (const s of ["'3DSOLID': '3D 솔리드',", "BODY: '본체',", "mesh: '폴리곤 메시', polyface: '폴리페이스 메시'"]) expect(inq, s).toContain(s);
    expect(src('app/docstate.ts')).toContain(`return '${DRAWN}';`);
    // 3D 솔리드 = 같은 사전의 3D 솔리드 글 낱말(Körper는 「본체」 BODY, 立体는 입체)
    expect([de['3D 솔리드'], zh['3D 솔리드']]).toEqual(['3D-Volumenkörper', '三维实体']);
    for (const k of [EXPL, AREA_SKIP, DRAWN]) {
      expect(de[k], k).toContain(de['3D 솔리드']!);
      expect(zh[k], k).toContain(zh['3D 솔리드']!);
    }
    expect(de['3D 솔리드']).not.toBe(de['본체']);
    // 본체(BODY) = 「3D 솔리드·바디」의 바디(实体는 「솔리드」와 같은 이름)
    expect([ja['본체'], zh['본체']]).toEqual(['ボディ', '体']);
    expect(ja[EXPL]).toContain(`ソリッドと${ja['본체']}`);
    expect(zh[EXPL]).toContain(`${zh['3D 솔리드']}和${zh['본체']}`);
    expect(zh['본체']).not.toBe(zh['솔리드']);
    // 같은 종류 여럿의 제목(304·305차 틀)도 바탕 낱말을 따른다
    for (const l of LANGS) for (const k of ['3D 솔리드', '본체']) expect(dict[l][`${k} ({0})`], `${l}: ${k}`).toBe(`${dict[l][k]} ({0})`);
    // 폴리페이스 메시 = MESH 쓰기 경고의 낱말, 폴리선 종류 넷은 언어마다 서로 다른 이름
    expect(zh['폴리페이스 메시']).toBe('多面体网格');
    expect(zh[MESHW]).toContain(zh['폴리페이스 메시']!);
    expect(zh['폴리곤 메시']).toBe('多边形网格');
    expect(de['폴리페이스 메시']).toBe('Polyface-Mesh');
    expect(de[MESHW]).toContain(de['폴리페이스 메시']!);
    const KINDS = ['2D 폴리선', '3D 폴리선', '폴리곤 메시', '폴리페이스 메시'];
    for (const l of LANGS) expect(new Set(KINDS.map((k) => dict[l][k])).size, l).toBe(4);
    // 거꾸로 찾기
    for (const [l, k] of [['de', '3D 솔리드'], ['zh-CN', '3D 솔리드 ({0})'], ['ja', '본체'], ['zh-CN', '본체'], ['zh-CN', '폴리페이스 메시'], ['de', '폴리페이스 메시']] as const)
      expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('ACIS·평면화·두께·고도·돌출 방향 글은 같은 사전의 낱말이다(region·面域, 앱이 평면화, Elevation, 厚度·标高·拉伸方向)', () => {
    const [en, de, zh] = [dict.en, dict.de, dict['zh-CN']];
    expect(src('edit/geom/types.ts')).toContain(`acis: '${ACIS}',`);
    const fl = src('app/express-draw.ts');
    expect(fl).toContain(`if (hide) ctx.print('${HIDE}', 'err');`);
    expect(fl).toContain('`객체 ${replace.length}개를 평면화했습니다(Z·고도·두께 = 0).`');
    const sv = src('app/sysvars.ts');
    for (const s of ["ELEVATION: '새 객체의 고도',", "THICKNESS: '새 객체의 두께',"]) expect(sv, s).toContain(s);
    expect(src('app/editcmds2-query.ts')).toContain('askReal(ctx, `새 기본 고도 지정 <${show(e0)}>:`, e0)');
    expect(src('app/express-select.ts')).toContain(FILTER);
    expect(src('app/dashcmds-misc.ts')).toContain(IGNORE);
    expect(src('edit/express/ssx.ts')).toContain(`return '${EXTR}';`);
    // ACIS 객체(영역·3D 솔리드·곡면): 영역 = REGION(「영역이나 닫힌 객체가 아닌」 regions·Regionen·面域), 곡면 = 「3D 솔리드·표면·메시」 surface·Oberfläche
    expect(en[ACIS]).toBe('ACIS objects (region, 3D solid, surface) cannot be converted.');
    expect(de[ACIS]).toBe('ACIS-Objekte (Region, 3D-Volumenkörper, Oberfläche) können nicht konvertiert werden.');
    expect(zh[ACIS]).toBe('ACIS 对象（面域、三维实体、曲面）无法转换。');
    expect([en[AREA_SKIP], de[AREA_SKIP], zh[AREA_SKIP]].map((v, i) => v!.includes(['regions', 'Regionen', '面域'][i]!))).toEqual([true, true, true]);
    expect(en[SURF]).toContain('surface');
    expect(de[SURF]).toContain('Oberfläche');
    expect(`${en[ACIS]} ${de[ACIS]} ${zh[ACIS]}`).not.toMatch(/\barea\b|curved|Fläche,|gekrümmt|区域/);
    // FLATTEN 숨은선 안내: 앱이 숨은선을 남긴 채 평면화한다(사용자에게 시키는 꼴·Glätten 「부드럽게」·请이 아니다)
    expect(en[HIDE]).toBe('Hidden line removal is not available in this web version without 3D view. Objects are flattened with hidden lines kept.');
    expect(de[HIDE]).toBe('Das Entfernen verdeckter Linien ist in dieser Webversion ohne 3D-Ansicht nicht verfügbar. Die Objekte werden mit verdeckten Linien abgeflacht.');
    expect(zh[HIDE]).toBe('此网页版没有 3D 视图，无法移除隐藏线。将保留隐藏线并展平。');
    expect(de[HIDE]).not.toMatch(/Glätten|Sie es|versteckt/);
    expect(de[FLAT]).toMatch(/^Abgeflacht/);
    expect(zh[HIDE]).not.toContain('请');
    // 평면화 결과 줄: 중국어 고도 = 리본 풍선 标高(高度는 「높이」), 「已… {0} 个」
    expect(zh[RIBBON]).toContain('标高');
    expect(zh['높이']).toBe('高度');
    expect(zh[FLAT]).toBe('已展平 {0} 个对象（Z·标高·厚度 = 0）。');
    expect(zh[FLAT]).not.toContain(zh['높이']!);
    // 영어 고도 = Elevation(298차 — Altitude가 아니다): 짝 열쇠 두께 줄과 같은 꼴
    expect(en['새 객체의 고도']).toBe('Elevation of new object');
    expect(en['새 객체의 고도']).toBe(en['새 객체의 두께']!.replace(en['두께']!, en['고도']!));
    expect(en['새 기본 고도 지정 <{0}>:']).toBe(en['새 기본 두께 지정 <{0}>:']!.replace('thickness', 'elevation'));
    for (const k of ['새 객체의 고도', '새 기본 고도 지정 <{0}>:']) expect(en[k], k).not.toMatch(/altitude/i);
    // 중국어 두께 = 厚度(298차 — 粗细·线粗가 아니다): 통째 프롬프트는 옵션 조각과 같은 낱말
    expect(zh['두께']).toBe('厚度');
    expect(zh['새 객체의 두께']).toBe('新建对象厚度');
    expect(zh['새 객체의 선종류 축척']).toMatch(/^新建对象/);
    expect(zh[FILTER]).toContain(`/${zh['두께(T)']}/`);
    expect(zh[IGNORE]).toContain(`/${zh['두께(TH)']}/`);
    for (const k of ['새 객체의 두께', FILTER, IGNORE]) expect(zh[k], k).not.toMatch(/粗细|线粗/);
    // 돌출 방향 = 특성 칸 「돌출 방향」 拉伸方向
    expect(zh[EXTR]).toContain(zh['돌출 방향']!);
    expect(zh[EXTR]).not.toContain('挤出');
    // 거꾸로 찾기
    for (const [l, k] of [['en', ACIS], ['de', HIDE], ['zh-CN', FLAT], ['en', '새 객체의 고도'], ['zh-CN', '새 객체의 두께'], ['zh-CN', FILTER]] as const)
      expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('-PLOT 음영 플롯의 숨김(H)은 숨은선 보기이고 통째 기록 줄은 조각과 같은 글이며, DWG 쓰기의 ACIS 와이어 경고가 네 언어로 보인다', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const plot = src('app/dashcmds-plot.ts');
    expect(plot).toContain(`'${FULL}',`);
    expect(plot).toContain("{ key: 'H', label: '숨김' },");
    // 숨김(H) = 숨은선 보기(「도면 공간 객체 숨기기는 3D 숨은선 제거라」 3D-Verdeckung·隠線処理·三维消隐)
    expect(LANGS.map((l) => dict[l]['숨김(H)'])).toEqual(['Hidden (H)', 'Verdeckt (H)', '隠線処理(H)', '消隐(H)']);
    expect(de[PSHIDE]).toContain('3D-Verdeckung');
    expect(ja[PSHIDE]).toContain('隠線処理');
    expect(zh[PSHIDE]).toContain('消隐');
    // 통째 기록 줄 = 앞 조각 + 옵션 조각 + 「] <기본값>:」(기본값은 옵션 번역에서 고를 글자를 뗀 것 — fileguard defaultWord)
    for (const l of LANGS) {
      const d = dict[l];
      const def = d['화면표시대로(A)']!.replace(/\s*\([A-Z]\)$/, '');
      expect(d[FULL], l).toBe(`${d[FRONT]}${SHADE.map((o) => d[o]).join('/')}] <${def}>:`);
      expect(HANGUL.test(show(l)(`${FULL} A`)), l).toBe(false);
    }
    expect([en['화면표시대로(A)'], de['와이어프레임(W)']]).toEqual(['As Displayed (A)', 'Drahtgittermodell (W)']);
    // 독일어 화면표시대로 ≠ 플롯 영역 「화면표시(D)」의 Anzeige
    expect(de[FULL]).not.toContain('Anzeige');
    // DWG 쓰기 경고(새 열쇠) = DXF 쓰기 경고 + 「이 버전으로」(「ACIS 자료가 없거나 이 버전으로 바꿀 수 없어」 낱말)
    expect(src('io/dwg/writer/context.ts')).toContain(`this.warn('entity.acis_as_wires', '${NEW}'`);
    expect(src('io/dxf/wconvert.ts')).toContain(`'${SIB}'`);
    const VER: Record<Lang, [string, string]> = {
      en: ['could not be written', 'could not be written in this version'],
      de: ['nicht geschrieben', 'nicht in dieser Version geschrieben'],
      ja: ['ACISデータを書き込めない', 'ACISデータをこのバージョンで書き込めない'],
      'zh-CN': ['由于无法写入', '由于无法以此版本写入'],
    };
    const THIS: Record<Lang, string> = { en: 'this version', de: 'Version', ja: 'このバージョン', 'zh-CN': '此版本' };
    for (const l of LANGS) {
      const d = dict[l];
      expect(d[ACIS_NO], l).toContain(THIS[l]);
      expect(d[NEW], l).toBe(d[SIB]!.replace(VER[l][0], VER[l][1]));
      expect(HANGUL.test(show(l)(NEW)), l).toBe(false);
    }
    // 거꾸로 찾기
    for (const [l, k] of [['ja', '숨김(H)'], ['zh-CN', FULL], ['de', NEW], ['en', '화면표시대로(A)']] as const) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });
});
