// @vitest-environment jsdom
/**
 * 346차: 도면 머리말 율리우스일의 시간대. TDCREATE·TDUPDATE는 저장한 곳의 현지 시각(벽시계 값), TDUCREATE·TDUUPDATE는 UTC 시각이다
 * (AutoCAD 시스템 변수 정의). 고치기 전 DWGPROPS 통계·TIME은 현지 시각 값에 보는 사람의 시간대를 또 더해(한국 시간이면 9시간 뒤)
 * 그대로 보이던 도면 비교 정보와 같은 변수가 다른 때로 보였다 — 이제 셋이 src/app/datetext.ts drawingTimeText 한 길.
 * 시간대를 바꿔(process.env.TZ — Node는 바꾸면 곧 Date·Intl 기본 시간대에 반영; 바뀌었는지 getTimezoneOffset으로 먼저 본다) 같은 도면의
 * TDCREATE(현지)와 TDUCREATE(UTC)가 같은 때로 보이는지, 도면에 쓰는 값(DWGPROPS XRECORD 시간 태그)은 머리말 값 그대로인지 본다.
 * DWGPROPS 통계 이름표 「작성」「수정」은 다른 자리와 함께 쓰는 공유 열쇠(Author·Edit — 표제란·옵션·리본 탭)라, 같은 변수의 다른 화면 이름표
 * 「작성 날짜」(FIELD CreateDate — $TDCREATE)·「마지막 수정」(도면 비교 정보 — $TDUPDATE)로 갈랐다(사전 바꿈 없음 — 이미 있는 열쇠).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { drawingTimeText } from '../src/app/datetext';
import { registerDwgProps } from '../src/app/dwgprops';
import { installLocalization } from '../src/app/i18n';
import { getSysVar } from '../src/app/lisp-host';
import { registerPropCommands } from '../src/app/propcmds';
import { sysvarInfo } from '../src/app/sysvars';
import type { CadDocument } from '../src/core/model';
import { createNewDocument } from '../src/core/newdoc';
import { julianToLocal } from '../src/edit/field/evaluate';
import type { Real } from '../src/edit/lisp/types';
import { readDwg } from '../src/io/dwg/index';
import { writeDwg } from '../src/io/dwg/writer/index';
import { readDxf } from '../src/io/dxf/reader';
import { writeDxf } from '../src/io/dxf/writer';
import { drawingProps, propTimes, tagsFromProps } from '../src/io/dwgprops';
import { makeHarness } from './cmds2/harness';

/** 2026-11-28 15:00 UTC의 율리우스일(0.125는 2진수로 딱 떨어져 ms가 정수) */
const JD = 2461373.125;
const AT = new Date((JD - 2440587.5) * 86400000);
/** 시간대마다 그 순간(11월 — 뉴욕은 겨울 시간)의 getTimezoneOffset(분) */
const ZONES: Record<string, number> = { 'Asia/Seoul': -540, UTC: 0, 'America/New_York': 300 };
const TZ0 = process.env.TZ;
const LANGS = ['ko', 'en', 'de', 'ja', 'zh-CN'] as const;
/** 통계 탭 날짜 이름표 둘(작성 날짜·마지막 수정)의 다섯 언어 글 — 같은 사전의 이미 있는 열쇠 값 */
const LABELS: Record<string, [string, string]> = {
  ko: ['작성 날짜', '마지막 수정'],
  en: ['Creation date', 'Last modified'],
  de: ['Datum der Erstellung', 'Zuletzt geändert'],
  ja: ['作成日', '最終修正'],
  'zh-CN': ['创建日期', '上次修改时间'],
};
/** 고치기 전 공유 열쇠 「작성」「수정」의 값(지은이·편집 뜻 — 날짜가 아니다) */
const OLD: Record<string, [string, string]> = { en: ['Author', 'Edit'], de: ['Autor', 'Bearbeiten'], ja: ['作成者', '修正'], 'zh-CN': ['作者', '修订'] };

const SRC = join(process.cwd(), 'src/');
const src = (f: string) => readFileSync(join(SRC, f), 'utf8');
const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? files(p) : n.endsWith('.ts') ? [p] : [];
  });
const dict = (l: string) => JSON.parse(readFileSync(join(process.cwd(), `site/locales/${l}.json`), 'utf8')) as Record<string, string>;

const setZone = (z: string | undefined) => {
  if (z === undefined) delete process.env.TZ;
  else process.env.TZ = z;
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  document.documentElement.lang = '';
  history.replaceState(null, '', '/');
  setZone(TZ0);
});
afterAll(() => setZone(TZ0));

const dlg = () => document.querySelector<HTMLElement>('.dialog');
/** DWGPROPS를 열어 통계 탭 줄([이름표, 값])을 want가 맞을 때까지(마감 3초) 읽고 확인으로 닫는다 */
async function propsRows(setup: (d: CadDocument) => void, want: (rows: [string, string][]) => boolean): Promise<{ rows: [string, string][]; doc: CadDocument }> {
  const h = makeHarness(setup);
  registerDwgProps(h.app);
  const run = h.run('DWGPROPS', []);
  await vi.waitFor(() => expect(dlg()?.getAttribute('aria-label')).toBeTruthy(), { timeout: 3000 });
  const rows = () => [...dlg()!.querySelectorAll('.mgr-row')].map((r) => [r.querySelector(':scope > span')?.textContent ?? '', r.querySelector(':scope > div')?.textContent ?? ''] as [string, string]);
  await vi.waitFor(() => expect(want(rows()), rows().join(' | ')).toBe(true), { timeout: 3000 });
  const out = rows();
  (dlg()!.querySelector('footer .btn.primary') as HTMLButtonElement).click();
  await run;
  return { rows: out, doc: h.app.active!.doc };
}

describe('도면 머리말 율리우스일의 시간대(346차)', () => {
  it('(가) 시간대 셋에서 같은 순간의 TDCREATE(현지)·TDUCREATE(UTC)가 DWGPROPS·TIME·공용 함수에서 같은 때(보는 곳의 현지 시각), 쓰는 값은 머리말 그대로', async () => {
    for (const [zone, offset] of Object.entries(ZONES)) {
      setZone(zone);
      // 시간대가 정말 바뀌었는지 — 안 바뀌면 시험이 헛돈다
      expect(AT.getTimezoneOffset(), zone).toBe(offset);
      const local = JD - offset / 1440; // 그 시간대의 벽시계 값(현지 시각 변수)
      const want = AT.toLocaleString('ko'); // 그 시간대의 현지 시각 글
      const setup = (d: CadDocument) => {
        d.header.set('$TDCREATE', local);
        d.header.set('$TDUPDATE', local);
        d.header.set('$TDUCREATE', JD);
        d.header.set('$TDUUPDATE', JD);
        d.header.set('$TDINDWG', 1.5);
      };
      // DWGPROPS 통계 — 고치기 전 서울은 하루 다음 오전 9시(+9시간 더), 뉴욕은 오전 5시(−5시간 더)
      const { rows, doc } = await propsRows(setup, (r) => r.some(([, v]) => v === want));
      expect(rows.filter(([, v]) => v === want), `${zone} ${rows.join(' | ')}`).toHaveLength(2);
      // TIME 결과 줄 — 「작성」「마지막 업데이트」
      const h = makeHarness(setup);
      registerPropCommands(h.app);
      await h.run('TIME', []);
      expect(h.printed[2], zone).toContain(want);
      expect(h.printed[3], zone).toContain(want);
      // 공용 함수: 현지 변수는 그대로, UTC 변수는 보는 곳의 현지 시각으로 — 같은 때
      const H = doc.header;
      for (const n of ['$TDCREATE', '$TDUCREATE', '$TDUPDATE', '$TDUUPDATE']) expect(drawingTimeText(H, n), `${zone} ${n}`).toBe(want);
      expect(drawingTimeText(H, '$TDUCREATE')).toBe(drawingTimeText(H, '$TDCREATE'));
      // 쓰는 값: 머리말 그대로·XRECORD 시간 태그(41 만든 때·42 고친 때)도 머리말 값 그대로(시간대를 더하지 않음)
      expect(H.get('$TDCREATE')).toBe(local);
      expect(H.get('$TDUCREATE')).toBe(JD);
      expect(propTimes(doc)).toEqual({ editTime: 1.5, created: local, modified: local });
      // DWGPROPS가 쓰는 XRECORD 태그(drawingPropsOps가 tagsFromProps(…, propTimes(doc))로 만든다 — 시험 도면에는 루트 사전이 없어 태그를 바로)
      const tags = tagsFromProps({ ...drawingProps(doc), title: 'T' }, propTimes(doc));
      expect(tags.filter((t) => t.code === 41 || t.code === 42).map((t) => t.value)).toEqual([local, local]);
      document.body.replaceChildren();
    }
    // 값이 없거나 날짜가 아니면 빈 글(부르는 곳이 「-」로)
    const H = new Map<string, unknown>([['$TDCREATE', 0], ['$TDUPDATE', 'x'], ['$TDUCREATE', 1e12]]);
    expect(['$TDCREATE', '$TDUPDATE', '$TDUCREATE', '$TDUUPDATE'].map((n) => drawingTimeText(H, n))).toEqual(['', '', '', '']);
  });

  it('(나) 도면 비교·DWGPROPS·TIME이 같은 길 — 율리우스일을 글로 바꾸는 자리는 datetext.ts 하나(새로 생기면 실패)', () => {
    for (const [f, s] of [
      ['app/compare.ts', "['마지막 수정', drawingTimeText(d.header, '$TDUPDATE') || '-']"],
      ['app/dwgprops.ts', "kv('작성 날짜', drawingTimeText(H, '$TDCREATE'))"],
      ['app/dwgprops.ts', "kv('마지막 수정', drawingTimeText(H, '$TDUPDATE'))"],
      ['app/propcmds.ts', "${drawingTimeText(hd, '$TDCREATE') || '-'}"],
      ['app/propcmds.ts', "${drawingTimeText(hd, '$TDUPDATE') || '-'}"],
      ['app/fieldcmds.ts', "{ id: 'CreateDate', cat: 'date', label: '작성 날짜', kind: 'date' }"],
    ])
      expect(src(f!), `${f} ${s}`).toContain(s);
    // 「(jd − 2440587.5)」 꼴(율리우스일 → 1970 기준 ms)을 쓰는 화면 길: datetext.ts 하나 — 필드(도면 글)·io는 이 시험 밖
    const conv = files(join(SRC, 'app')).filter((f) => /-\s*2440587\.5/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length));
    expect(conv).toEqual(['app/datetext.ts']);
  });

  it('(다) DWGPROPS 통계 날짜 이름표 — 다섯 언어 「작성 날짜」「마지막 수정」 값(지은이·편집 뜻 공유 열쇠 값이 아님)', async () => {
    for (const l of LANGS) {
      if (l !== 'ko') {
        const d = dict(l);
        expect([d['작성 날짜'], d['마지막 수정']], l).toEqual(LABELS[l]);
        expect([d['작성'], d['수정']], l).toEqual(OLD[l]);
      }
      history.replaceState(null, '', l === 'ko' ? '/' : `/${l}/`);
      const root = document.createElement('div');
      root.append(Object.assign(document.createElement('header'), { className: 'titlebar' }));
      document.body.append(root);
      dispose = await installLocalization(root);
      expect(document.documentElement.lang).toBe(l);
      const [made, saved] = LABELS[l]!;
      const { rows } = await propsRows(
        (d) => {
          d.header.set('$TDCREATE', JD);
          d.header.set('$TDUPDATE', JD);
        },
        (r) => r.some(([k]) => k === made) && r.some(([k]) => k === saved),
      );
      const date = AT.toLocaleString(l, { timeZone: 'UTC' });
      expect(rows.find(([k]) => k === made)?.[1], l).toBe(date);
      expect(rows.find(([k]) => k === saved)?.[1], l).toBe(date);
      if (l !== 'ko') for (const old of OLD[l]!) expect(rows.some(([k]) => k === old), `${l} ${old}`).toBe(false);
      dispose?.();
      dispose = undefined;
      document.body.replaceChildren();
    }
  });

  it('(라) 작성기 — 시간대 셋에서 새 도면·DXF·DWG 저장의 빈 때 값: TDCREATE·TDUPDATE는 그 순간의 현지 벽시계, TDUCREATE·TDUUPDATE는 UTC(src/core/julian.ts 한 곳)', () => {
    // 고치기 전 작성기 넷(새 도면·템플릿 새 도면·DWG·DXF 작성기 빈 값)은 모두 UTC 율리우스일 — 위 (가)의 길로 보이면 서울에서 9시간 앞
    const FOUR = ['$TDCREATE', '$TDUPDATE', '$TDUCREATE', '$TDUUPDATE'];
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (const [zone, offset] of Object.entries(ZONES)) {
        setZone(zone);
        vi.setSystemTime(AT);
        expect(new Date().getTimezoneOffset(), zone).toBe(offset);
        const local = JD - offset / 1440;
        const want = AT.toLocaleString('ko');
        const check = (H: { get(n: string): unknown }, what: string, names = FOUR) => {
          for (const n of names) {
            expect(H.get(n), `${zone} ${what} ${n}`).toBeCloseTo(n === '$TDUCREATE' || n === '$TDUUPDATE' ? JD : local, 7);
            expect(drawingTimeText(H, n), `${zone} ${what} ${n}`).toBe(want);
          }
        };
        const doc = createNewDocument('metric');
        check(doc.header, '새 도면');
        for (const n of FOUR) doc.header.delete(n);
        check(readDxf(writeDxf(doc).data).header, 'DXF 빈 값');
        // DWG 머리말에는 현지 시각 둘만 있다(TDCREATE·TDUPDATE)
        check(readDwg(writeDwg(doc).data).header, 'DWG 빈 값', ['$TDCREATE', '$TDUPDATE']);
        // FIELD CreateDate·SaveDate(julianToLocal)도 같은 뜻 — 현지 시각 변수의 칸 그대로(시간대를 더하지 않음)
        const f = julianToLocal(local)!;
        expect([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes()], zone).toEqual([AT.getFullYear(), AT.getMonth(), AT.getDate(), AT.getHours(), AT.getMinutes()]);
      }
    } finally {
      vi.useRealTimers();
    }
    // 템플릿 새 도면도 같은 함수, 지금을 율리우스일로 바꾸는 자리는 core/julian.ts 하나
    // (346차까지 LISP DATE(app/lisp-host.ts)가 따로 UTC 율리우스일을 만들었다 — 347차부터 julianLocal을 불러 빠짐, 아래 (마))
    expect(src('app/save.ts')).toContain("for (const k of ['$TDCREATE', '$TDUPDATE']) fresh.header.set(k, julianLocal(at));");
    const nowJd = files(SRC).filter((f) => /86400000\s*\+\s*2440587\.5/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length));
    expect(nowJd.sort()).toEqual(['core/julian.ts']);
  });

  it('(마) 347차 — 시간대 셋에서 시스템 변수 DATE·CDATE(LISP getvar·명령줄 보기·SETVAR 목록이 함께 쓰는 getSysVar)는 그 순간의 현지 벽시계, 같은 순간 새 도면의 TDUCREATE(UTC)와는 시간대 차이만큼 갈림', () => {
    // AutoCAD DATE(율리우스일)·CDATE(YYYYMMDD.HHMMSSmsec)는 그 컴퓨터의 현지 시계(TDCREATE와 같은 뜻). 고치기 전 DATE는 UTC 율리우스일 —
    // 같은 now의 CDATE는 현지라 서울에서 둘이 9시간 갈렸다
    /** 그 시간대에서 AT(15:00 UTC)의 CDATE — 손셈: 서울 11-29 00:00, UTC 11-28 15:00, 뉴욕(겨울) 11-28 10:00 */
    const CDATE: Record<string, number> = { 'Asia/Seoul': 20261129, UTC: 20261128.15, 'America/New_York': 20261128.1 };
    const FOUR = ['$TDCREATE', '$TDUPDATE', '$TDUCREATE', '$TDUUPDATE'];
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (const [zone, offset] of Object.entries(ZONES)) {
        setZone(zone);
        vi.setSystemTime(AT);
        expect(new Date().getTimezoneOffset(), zone).toBe(offset);
        const local = JD - offset / 1440;
        // 같은 순간에 만든 새 도면의 때 넷(346차 작성기 — TDCREATE 현지, TDUCREATE UTC)
        const fresh = createNewDocument('metric');
        const h = makeHarness((d) => {
          for (const n of FOUR) d.header.set(n, fresh.header.get(n)!);
        });
        const num = (n: string) => (getSysVar(h.app, n) as Real).v;
        const date = num('DATE');
        expect(date, `${zone} DATE`).toBeCloseTo(local, 7);
        expect(num('CDATE'), `${zone} CDATE`).toBeCloseTo(CDATE[zone]!, 7);
        // DATE를 칸으로 풀면 CDATE와 같은 벽시계(같은 now — 날짜와 시·분)
        const w = new Date(Math.round((date - 2440587.5) * 86400000));
        const wall = w.getUTCFullYear() * 10000 + (w.getUTCMonth() + 1) * 100 + w.getUTCDate() + (w.getUTCHours() * 100 + w.getUTCMinutes()) / 10000;
        expect(wall, `${zone} DATE 칸`).toBeCloseTo(CDATE[zone]!, 7);
        // 같은 순간의 TDCREATE(현지)와 같은 값, TDUCREATE(UTC)와는 시간대 차이(분 / 1440)만큼
        expect(num('TDCREATE'), `${zone} TDCREATE`).toBeCloseTo(date, 7);
        expect(num('TDUCREATE'), `${zone} TDUCREATE`).toBeCloseTo(JD, 7);
        expect(date - num('TDUCREATE'), `${zone} DATE − TDUCREATE`).toBeCloseTo(-offset / 1440, 7);
        // 명령줄 시스템 변수 보기·SETVAR 목록·SYSVDLG(sysvarInfo — 세션 변수는 getSysVar 값)
        expect(sysvarInfo(h.app, 'DATE')?.value as number, `${zone} sysvarInfo DATE`).toBeCloseTo(local, 7);
        expect(sysvarInfo(h.app, 'CDATE')?.value as number, `${zone} sysvarInfo CDATE`).toBeCloseTo(CDATE[zone]!, 7);
      }
    } finally {
      vi.useRealTimers();
    }
    // 율리우스일 → 1970 기준 ms(「- 2440587.5」) 꼴은 src 전체에서 화면 길(app/datetext.ts)·FIELD(edit/field/evaluate.ts julianToLocal) 둘.
    // 부르는 곳이 없던 edit/field/format.ts julianToDate(UTC 순간으로 읽음 — 현지 시각 변수에 쓰면 시간대를 또 더하는 꼴)는 347차에 지움
    const conv = files(SRC).filter((f) => /-\s*2440587\.5/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length));
    expect(conv.sort()).toEqual(['app/datetext.ts', 'edit/field/evaluate.ts']);
  });
});
