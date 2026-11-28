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
import { registerPropCommands } from '../src/app/propcmds';
import type { CadDocument } from '../src/core/model';
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
});
