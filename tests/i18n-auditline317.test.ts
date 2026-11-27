/**
 * 317차: 틀이 통째로 잡아 네 언어 모두 한국어로 남던 앱 글(316차 「보고 두 것」 (1)).
 * 번역층(opencad-site-kit translate)은 틀 열쇠({0})가 잡은 값을 옮기지 않는다(문서 자료·이름·수일 수 있다 — data-i18n-ui-copy 자리만 옮긴다).
 * 명령행 기록 줄은 CommandLine.print가 글 하나로 넣어 그 표시가 없고,
 *  (a) AUDIT 줄 「  {대상}  {글}  → {고침}」·「… 수정 안 함」은 틀 열쇠조차 없어 줄 전체가,
 *  (b) 도면 정보 대화 상자 「· {경고} ({개수})」는 「· {0}」 열쇠가 없어 줄 전체가,
 *  (c) 저장·WBLOCK 「참고: {경고} ({개수})」는 「참고: {0}」이 「글 (개수)」를 통째로 잡아(잡은 값은 옮기지 않는다) 경고 글이 한국어로 남았다.
 * 고침: 줄을 만드는 자리에서 끼울 앱 글을 먼저 화면 언어로 옮긴다(MATCHPROP 「현재 활성 설정: {0}」 꼴 — editcmds.ts uiText).
 * AUDIT 글은 번역층의 data-i18n-ui-copy 길(fileguard guardedTranslate ui)처럼 자리 글(「현재 도면층」·「(없음)」)까지 옮기고 도면 이름(ft)은 지킨다.
 * 한국어 화면은 그대로(옮기지 않는다). 열 때 「참고:」 줄(app.ts)은 316차 통째 열쇠 그대로 — 새 길과 같은 글이다.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../src/core/model';
import { MODEL_SPACE, entityDefaults, normalizeHandle } from '../src/core/model';
import { createNewDocument } from '../src/core/newdoc';
import { AUDIT_PHASES, auditDocument, maxHandle, type AuditReport } from '../src/edit/util/audit';
import { createGroupOps } from '../src/edit/util/groups';
import { unmark } from '../src/app/filetext';
import { guardedTranslate, translateTail } from '../src/app/fileguard';
import { uiText } from '../src/app/i18n-text';
import { registerUtil2MiscCommands } from '../src/app/util2-misc';
import { translate } from '../site/i18n.mjs';
import { makeHarness } from './cmds2/harness';
import { addBlock, circle, insert, line, put, text } from './util2/helpers';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
/** 명령행에 보이는 꼴(번역층 — fileguard 통째 번역 + 기록 줄 꼬리) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));
const fill = (m: string) => m.replace(/\{(\d+)\}/g, (_s, i: string) => String(7 + Number(i)));
const url = (l: string) => `https://gyutae-kim.github.io/opencad-dwgdxf/${l === 'ko' ? '' : `${l}/`}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 감사 20 종류(헤더 — 현재 도면층·선종류·문자 스타일·치수 스타일·핸들 시드, 표, 객체 열하나, 블록, 그룹 둘)가 모두 나오는 도면 */
function build(seed: boolean) {
  const h = makeHarness((doc) => Object.assign(doc, createNewDocument('metric')));
  (h.app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (name: string) => h.app.commands.get(name.toUpperCase());
  registerUtil2MiscCommands(h.app);
  const doc = h.doc;
  const ms = doc.blocks.get(MODEL_SPACE)!;
  const nh = () => h.st.session.newHandle();
  // 그룹: EMPTY(구성원을 모두 지움)·HALF(없는 구성원 하나)
  const gone = line(nh(), 0, 0, 1, 1);
  const kept = line(nh(), 0, 0, 2, 2);
  put(doc, gone, kept);
  h.st.session.commit({ label: 'GROUP', ops: createGroupOps(doc, 'EMPTY', '', [gone.handle], nh)!.ops });
  h.st.session.commit({ label: 'GROUP', ops: createGroupOps(doc, 'HALF', '', [kept.handle, 'FFFF'], nh)!.ops });
  ms.entities.splice(
    ms.entities.findIndex((e) => e.handle === gone.handle),
    1,
  );
  doc.entityIndex.delete(gone.handle);
  // 객체: 수가 아닌 좌표·0 반지름·정의 없는 블록·같은 핸들·소유자·없는 도면층과 선종류·문자 스타일·치수 스타일·0 축척·핸들 없음
  addBlock(doc, nh, 'OK', [circle(nh(), 0, 0, 1)]);
  const dup = circle(nh(), 0, 0, 1);
  const owned = line(nh(), 0, 0, 3, 3);
  const tol = { ...entityDefaults(), handle: nh(), type: 'TOLERANCE', dimStyle: 'NODIM' } as unknown as Entity;
  put(
    doc,
    line(nh(), 0, 0, Number.NaN, 0),
    circle(nh(), 5, 5, 0),
    insert(nh(), 'MISSING', 0, 0),
    dup,
    circle(dup.handle, 9, 9, 2),
    owned,
    line(nh(), 0, 0, 4, 4, { layer: 'GHOST', linetype: 'NOPE' }),
    text(nh(), 0, 0, 'A', { style: 'NOSTYLE' }),
    tol,
    insert(nh(), 'OK', 0, 0, { scale: { x: 0, y: 1, z: 1 } }),
  );
  owned.owner = 'ABCDE';
  ms.entities.push({ ...line('', 6, 6, 7, 7), owner: ms.recordHandle });
  // 블록: 자기 자신을 품는 LOOP
  addBlock(doc, nh, 'LOOP', [circle(nh(), 0, 0, 1)]).entities.push(insert(nh(), 'LOOP', 1, 1));
  // 표: 선종류가 없는 도면층
  doc.layers.set('BADLT', { ...doc.layers.get('0')!, name: 'BADLT', handle: nh(), linetype: 'NOLT2' });
  // 헤더(핸들 시드가 없으면 「(없음)」)
  doc.header.set('$CLAYER', 'GONE');
  doc.header.set('$CELTYPE', 'NOLT');
  doc.header.set('$TEXTSTYLE', 'NOTS');
  doc.header.set('$DIMSTYLE', 'NODS');
  doc.header.set('$HANDSEED', '1');
  if (!seed) doc.header.delete('$HANDSEED');
  return h;
}

/** 화면 언어 lang에서 AUDIT(고침 예·아니오)이 찍는 감사 줄(대상·글·고침 — 단계 이름·결과 줄은 번역층이 통째 열쇠로 옮긴다) */
async function auditLines(lang: string, fix: 'Y' | 'N') {
  vi.stubGlobal('location', { href: url(lang) });
  const h = build(fix === 'Y');
  // 고침 적용(편집 세션)은 audit-select-wblock 시험이 본다 — 여기서는 찍는 줄만
  (h.st.session as unknown as { commit: () => void }).commit = () => {};
  const rep = auditDocument(h.doc);
  const max = normalizeHandle(maxHandle(h.doc).toString(16));
  await h.run('AUDIT', [], fix);
  return { lines: h.printed.filter((s) => s.startsWith('  ') && !s.startsWith('  …')), rep, max };
}

/** 고치기 전(316차까지) 한국어 줄 꼴 */
const koLines = (rep: AuditReport, fix: boolean) =>
  AUDIT_PHASES.flatMap((ph) => rep.issues.filter((i) => i.phase === ph.phase)).map((i) => `  ${unmark(i.target)}  ${unmark(i.message)}  ${fix ? `→ ${unmark(i.fix)}` : '수정 안 함'}`);

/** 20 종류(audit.ts의 issues.push 17 자리 — 헤더 자리는 넷) */
const KINDS = [
  /^ {2}CLAYER {2}현재 도면층 "GONE"이\(가\) 없습니다\. {2}/,
  /^ {2}CELTYPE {2}현재 선종류 "NOLT"이\(가\) 없습니다\. {2}/,
  /^ {2}TEXTSTYLE {2}현재 문자 스타일 "NOTS"이\(가\) 없습니다\. {2}/,
  /^ {2}DIMSTYLE {2}현재 치수 스타일 "NODS"이\(가\) 없습니다\. {2}/,
  /^ {2}HANDSEED {2}핸들 시드 (1|\(없음\))이\(가\) 가장 큰 핸들 [0-9A-F]+보다 작습니다\. {2}/i,
  /^ {2}도면층 BADLT {2}선종류 "NOLT2"이\(가\) 없습니다\. {2}/,
  /^ {2}LINE\([0-9A-F]+\) {2}좌표나 값이 수가 아닙니다\. {2}/i,
  /^ {2}CIRCLE\([0-9A-F]+\) {2}반지름이 0입니다\. {2}/i,
  /^ {2}INSERT\([0-9A-F]+\) {2}블록 "MISSING"의 정의가 없습니다\. {2}/i,
  /^ {2}블록 LOOP {2}블록 "LOOP" 참조가 자기 자신을 품습니다\. {2}/,
  /^ {2}LINE\(핸들 없음\) {2}핸들이 없습니다\. {2}/,
  /^ {2}CIRCLE\([0-9A-F]+\) {2}같은 핸들을 가진 객체가 있습니다\. {2}/i,
  /^ {2}LINE\([0-9A-F]+\) {2}소유자가 들어 있는 블록과 다릅니다\. {2}/i,
  /^ {2}LINE\([0-9A-F]+\) {2}도면층 "GHOST"이\(가\) 없습니다\. {2}/i,
  /^ {2}LINE\([0-9A-F]+\) {2}선종류 "NOPE"이\(가\) 없습니다\. {2}/i,
  /^ {2}TEXT\([0-9A-F]+\) {2}문자 스타일이 없습니다\. {2}/i,
  /^ {2}TOLERANCE\([0-9A-F]+\) {2}치수 스타일 "NODIM"이\(가\) 없습니다\. {2}/i,
  /^ {2}INSERT\([0-9A-F]+\) {2}축척이 0입니다\. {2}/i,
  /^ {2}그룹 EMPTY {2}구성원이 없습니다\. {2}/,
  /^ {2}그룹 HALF {2}없는 구성원 1개 {2}/,
];

/** 맨 글 열쇠가 없던 읽기 경고 넷(316차는 「참고:」 통째 열쇠에만 두었다) */
const BARE4 = [
  '경계 고리가 너무 많이 겹쳐 든 채우기 해치는 채우지 않고 경계만 그렸습니다.',
  '블록 목록이 이미 넣은 도형을 다시 가리킨 {0}곳은 건너뛰었습니다.',
  '알 수 없는 R12 객체 {0}개를 건너뛰었습니다.',
  'R12 객체 {0}개를 읽지 못해 건너뛰었습니다.',
];
/** 읽기·그리기 경고 표본(316차 45 가운데 — 도면 정보 대화 상자에 같은 글이 보인다) */
const READ_SAMPLE = [
  '일부 객체를 그리지 못했습니다.',
  '외부 참조 파일은 열지 않았습니다.',
  '표시하지 않는 객체 종류가 있습니다.',
  '객체가 너무 많아 {0}개를 읽지 않았습니다.',
  '도형이 {0}개를 넘어 나머지는 읽지 않았습니다.',
  '{0} 섹션의 페이지를 찾지 못했습니다.',
];
/** 쓰기 경고 표본(DWG·DXF 쓰기·원호 정렬 문자) */
const WRITE_SAMPLE = [
  '없는 선종류를 ByLayer로 썼습니다.',
  '도형을 쓰지 못해 뺐습니다.',
  '배치할 수 없는 원호 정렬 문자를 쓰지 않았습니다.',
  '내용을 알 수 없는 사용자 객체 {0}개를 그 그림(선·호·문자)으로 바꿔 썼습니다.',
  '이 버전으로 쓸 수 없는 도형 {0}개를 뺐습니다(원본 자료가 없거나 다른 버전).',
  '{0}로는 쓸 수 없어 {1}로 썼습니다.',
  '코드 페이지에 없는 문자를 \\U+XXXX로 썼습니다.',
];
const COUNT = "${w.count ? ` (${w.count})` : ''}";

describe('틀이 잡은 경고 글을 화면 언어로(317차)', () => {
  it('(a) AUDIT 줄: 네 언어에서 대상·글·고침에 한국어가 남지 않는다(20 종류, 고침 예·아니오)', async () => {
    const ko = (await auditLines('ko', 'N')).lines;
    expect(ko.length).toBeGreaterThanOrEqual(KINDS.length);
    for (const l of LANGS)
      for (const fix of ['Y', 'N'] as const) {
        const { lines } = await auditLines(l, fix);
        expect(lines, `${l} ${fix}`).toHaveLength(ko.length);
        for (const s of lines) {
          expect(s, `${l} ${fix}`).not.toMatch(HANGUL);
          // 이미 옮긴 줄은 번역층이 그대로 둔다
          expect(show(l)(s), `${l} ${fix}`).toBe(s);
        }
      }
    // 표본: 자리 글(현재 도면층·(없음))·도면 이름(GONE·LOOP)·고침 「{0}(으)로 설정」·핸들 없는 대상
    const en = (await auditLines('en', 'Y')).lines;
    expect(en).toContain('  CLAYER  Current layer "GONE" does not exist.  → Set to 0');
    expect(en).toContain('  LINE(No handle)  No handle exists.  → New handle');
    expect(en).toContain('  block LOOP  Block "LOOP" reference contains self.  → Delete object');
    const no = await auditLines('en', 'N');
    expect(no.lines).toContain(`  HANDSEED  The handle seed (none) is smaller than the largest handle ${no.max}.  Not fixed`);
    expect((await auditLines('de', 'Y')).lines).toContain('  CLAYER  Aktueller Layer „GONE“ existiert nicht.  → Auf 0 setzen');
    expect((await auditLines('zh-CN', 'Y')).lines).toContain('  CLAYER  当前图层“GONE”不存在。  → 设置为0');
    expect((await auditLines('ja', 'Y')).lines).toContain('  CLAYER  現在の画層 "GONE"が見つかりません。  → 0に設定');
  });

  it('(a) 한국어 화면(원문)은 그대로 — 감사 줄은 고치기 전 꼴, 20 종류가 모두 나온다', async () => {
    for (const fix of ['Y', 'N'] as const) {
      const { lines, rep } = await auditLines('ko', fix);
      expect(lines).toEqual(koLines(rep, fix === 'Y'));
      for (const re of KINDS) expect(lines.some((s) => re.test(s)), `${fix} ${re}`).toBe(true);
    }
  });

  it('(b)(c) 도면 정보 「· {경고} ({개수})」·저장·WBLOCK 「참고: {경고} ({개수})」도 경고 글을 먼저 화면 언어로 — 맨 글 열쇠가 없던 넷은 316차 통째 열쇠의 글', () => {
    expect(src('app/ui/shell.ts')).toContain(`\`· \${uiText(w.message)}${COUNT}\``);
    for (const f of ['app/save.ts', 'app/wblockcmd.ts', 'app/util2-blocks.ts']) expect(src(f), f).toContain(`ctx.print(\`참고: \${uiText(w.message)}${COUNT}\`);`);
    // 열 때 줄(app.ts)은 316차 통째 열쇠 그대로
    expect(src('app/app.ts')).toContain("this.cmd.print(`참고: ${x.message}${x.count ? ` (${x.count})` : ''}`);");
    for (const l of LANGS) {
      const d = dict[l];
      for (const m of BARE4) {
        const n = (m.match(/\{\d+\}/g) ?? []).length;
        expect(d[m], `${l}: ${m}`).toBeDefined();
        expect(d[`참고: ${m} ({${n}})`], `${l}: ${m}`).toBe(d['참고: {0}']!.replace('{0}', d[m]!) + ` ({${n}})`);
      }
      for (const m of [...BARE4, ...READ_SAMPLE, ...WRITE_SAMPLE]) {
        const msg = translate(fill(m), l);
        // 대화 상자 줄(번역층이 통째로 보지만 이미 옮긴 글이라 그대로)
        const dlg = `· ${msg} (3)`;
        expect(dlg, `${l}: ${m}`).not.toMatch(HANGUL);
        expect(translate(dlg, l), `${l}: ${m}`).toBe(dlg);
        // 명령행 줄(「참고: {0}」 틀이 머리만 옮긴다)
        const note = show(l)(`참고: ${msg} (3)`);
        expect(note, `${l}: ${m}`).not.toMatch(HANGUL);
        expect(note, `${l}: ${m}`).toBe(`${d['참고: {0}']!.replace('{0}', msg)} (3)`);
      }
    }
    // 한국어 화면은 옮기지 않는다
    vi.stubGlobal('location', { href: url('ko') });
    for (const m of [...BARE4, ...WRITE_SAMPLE]) expect(uiText(m)).toBe(m);
  });

  it('「참고:」 통째 열쇠(316차 — 열 때 줄)와 새 길(경고 글을 먼저 옮겨 「참고: {0}」에 끼움)은 같은 글이다', () => {
    for (const l of LANGS)
      for (const m of [...BARE4, ...READ_SAMPLE]) {
        const msg = fill(m);
        expect(show(l)(`참고: ${translate(msg, l)} (3)`), `${l}: ${m}`).toBe(show(l)(`참고: ${msg} (3)`));
      }
  });
});
