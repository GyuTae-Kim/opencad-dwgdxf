/**
 * 350차: 글 간격(WCAG 2.2 1.4.12 Text Spacing — 줄 높이 글자 크기의 1.5배·문단 뒤 간격 2배·글자 간격 0.12em·낱말 간격 0.16em)을
 * 넓혀도 글이 잘려 읽을 수 없게 되는 칸이 없게 한다. src/styles.css를 규칙으로 읽어 글을 자를 수 있는 규칙을 모두 찾고,
 * 선택자마다 표(CLIP)의 판정과 맞는지 본다. 표 밖 새 규칙이 생기면 실패한다 — 넓힌 간격에서 잘리지 않는지, 온 글을 얻는 다른 길이 있는지 보고 표에 더한다.
 *  (가) 말줄임: text-overflow: ellipsis · line-clamp
 *  (나) 같은 선택자에 고정 높이(height·max-height — px·em·rem, 또는 그것만 든 calc)와 넘침 숨김(overflow·overflow-y: hidden·clip)
 *  (다) 고정 줄 높이: line-height(또는 font 줄임 꼴의 「/줄 높이」)가 px·em·rem — 글자 크기를 따라 넓어지지 않는다
 * 판정: fits(고정 높이 안에 넓힌 줄 높이가 든다 — 셈) · other(말줄임이지만 온 글을 얻는 다른 길 — 소스 근거) · unused(src·index.html에 쓰는 곳 0) · notext(글 없음).
 * 350차가 고친 셋(명령행 물음 줄·선종류 설명·제도 설정 추가 각도 목록)은 줄바꿈을 허용해 이제 (가)(나)(다)에 걸리지 않는다(FIXED350).
 * 덧붙여 넘침 숨김은 없지만 넘치면 이웃과 겹치는 고정 높이 한 줄 글 칸(FITS)의 높이도 셈한다.
 * jsdom은 배치를 하지 않아, 실제 화면에서 간격을 넓혀 보는 것은 이 시험 밖이다(셈과 소스 근거만 — 표는 CHANGELOG 350차 절).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** 넓힌 줄 높이(글자 크기의 배수) */
const LH = 1.5;

interface Rule {
  sel: string;
  media: string;
  decls: Map<string, string>;
}

/** 맨 위 쉼표로만 선택자를 가른다(:is(…)·[…] 안 쉼표는 그대로) */
function splitSelectors(head: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of head) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseCss(src: string): Rule[] {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
    } else if (ch === '}') {
      const head = stack.pop() ?? '';
      if (!head.startsWith('@')) {
        const decls = new Map<string, string>();
        for (const d of buf.split(';')) {
          const i = d.indexOf(':');
          if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
        }
        const media = stack.filter((s) => s.startsWith('@')).join(' ');
        for (const sel of splitSelectors(head)) out.push({ sel, media, decls });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}

/** 글자 크기를 따라 넓어지지 않는 고정 길이(px·em·rem, 또는 그것만 든 calc — %·화면 단위·변수가 들면 아님) */
const fixedLen = (v: string | undefined): boolean =>
  !!v && (/^-?[\d.]+(?:px|em|rem)$/.test(v) || (v.startsWith('calc(') && /\d(?:px|em|rem)\b/.test(v) && !/%|v[hw]|vmin|vmax|var\(/.test(v)));
const firstPx = (v: string): number => Number(/-?[\d.]+(?=px)/.exec(v)?.[0] ?? NaN);

const clipsY = (r: Rule): boolean => {
  const o = r.decls.get('overflow');
  const y = r.decls.get('overflow-y') ?? (o ? (o.split(/\s+/)[1] ?? o) : undefined);
  return y === 'hidden' || y === 'clip';
};

type Kind = 'ellipsis' | 'clipbox' | 'pxlh';

const RULES = parseCss(read('src/styles.css'));
const BY_SEL = new Map<string, Rule[]>();
for (const r of RULES) BY_SEL.set(r.sel, [...(BY_SEL.get(r.sel) ?? []), r]);

/** 선택자마다 걸린 꼴 — (가) ellipsis · (나) clipbox · (다) pxlh */
function detect(): Map<string, Kind[]> {
  const out = new Map<string, Kind[]>();
  for (const [sel, rs] of BY_SEL) {
    const k: Kind[] = [];
    if (rs.some((r) => /ellipsis/.test(r.decls.get('text-overflow') ?? '') || [...r.decls.keys()].some((p) => p.endsWith('line-clamp')))) k.push('ellipsis');
    if (rs.some(clipsY) && rs.some((r) => fixedLen(r.decls.get('height')) || fixedLen(r.decls.get('max-height')))) k.push('clipbox');
    if (rs.some((r) => fixedLen(r.decls.get('line-height')) || /\/\s*[\d.]+(?:px|em|rem)\b/.test(r.decls.get('font') ?? ''))) k.push('pxlh');
    if (k.length) out.set(sel, k);
  }
  return out;
}

/** 고정 높이 셈 한 줄: 그 매체 규칙의 height(px) h 안에, 넓힌 줄 높이(글자 font px × 1.5)와 위아래 안쪽 여백·테두리 less가 든다 */
interface Fit {
  media: string;
  h: number;
  less: number;
  font: number;
}
type Verdict =
  | { v: 'fits'; cases: Fit[] }
  | { v: 'other'; why: string; evidence: { file: string; re: RegExp }[] }
  | { v: 'unused'; cls: string }
  | { v: 'notext' };
interface Entry {
  kinds: Kind[];
  text: string;
  verdict: Verdict;
  /** (다) 고정 줄 높이 칸의 글자 크기(px) — 그 줄 높이가 넓힌 줄 높이(1.5배) 이상이면 넓혀도 같다 */
  lhFont?: number;
}

const COARSE = '@media (pointer: coarse)';
const SHELL = 'src/app/ui/shell.ts';

/** 글을 자를 수 있는 규칙의 표(선택자 15 — progress·CHANGELOG 350차 표와 같은 차례) */
const CLIP: Record<string, Entry> = {
  '.title': {
    kinds: ['ellipsis'],
    text: '제목 막대 앱 이름(좁은 휴대폰에서 잘림)',
    verdict: {
      v: 'other',
      why: '같은 이름이 문서 제목(사이트 이름)에 있다',
      evidence: [
        { file: SHELL, re: /h\('div', \{ class: 'title' \}, h\('b', \{\}, 'OpenCAD'\), ' DWG·DXF'\)/ },
        { file: 'site/metadata.json', re: /"siteName": "OpenCAD DWG·DXF/ },
      ],
    },
  },
  '.filetab span': {
    kinds: ['ellipsis'],
    text: '파일 탭 도면 이름',
    verdict: { v: 'other', why: '탭 단추 title(이름 (크기))', evidence: [{ file: SHELL, re: /class: 'filetab-open', title,/ }] },
  },
  'table.grid td.layer-name': {
    kinds: ['ellipsis'],
    text: '도면층 팔레트 이름 칸',
    verdict: { v: 'other', why: 'td title(이름 — 설명)', evidence: [{ file: 'src/app/ui/palettes.ts', re: /class: 'layer-name', title: `\$\{lay\.name\}/ }] },
  },
  '.rbtn-lg.folded span:last-child': {
    kinds: ['ellipsis'],
    text: '접힌 리본 패널 단추의 패널 이름',
    verdict: { v: 'other', why: '단추 title(… 패널 펼치기)·누르면 팝업', evidence: [{ file: SHELL, re: /class: 'rbtn-lg folded'[^\n]*title: `\$\{p\.title\} 패널 펼치기`/ }] },
  },
  '.titlebar .brand': {
    kinds: ['ellipsis'],
    text: '(쓰는 곳 없음)',
    verdict: { v: 'unused', cls: 'brand' },
  },
  '.titlebar .portfolio-link': {
    kinds: ['ellipsis', 'pxlh'],
    text: '「← 포트폴리오」 링크(480px 아래 80px)',
    verdict: { v: 'other', why: '링크 title(… 포트폴리오로 돌아가기)', evidence: [{ file: SHELL, re: /class: 'portfolio-link', href: '[^']+', title: '[^']+' \}, '← 포트폴리오'/ }] },
    lhFont: 12,
  },
  '.mv-layer': {
    kinds: ['ellipsis'],
    text: '휴대폰 보기 정보 카드 머리의 도면층 이름',
    verdict: {
      v: 'other',
      why: '같은 카드의 「특성 전체」 칩 → 특성 팔레트 도면층 줄(값은 줄을 바꿈)',
      evidence: [
        { file: 'src/app/ui/mobileview.ts', re: /<span>특성 전체<\/span>`, onclick: \(\) => this\.host\.openPalette\('props'\)/ },
        { file: 'src/styles.css', re: /\.prop-row \.v \{[^}]*word-break: break-all;/ },
      ],
    },
  },
  '.layer-combo': {
    kinds: ['clipbox'],
    text: '(쓰는 곳 없음)',
    verdict: { v: 'unused', cls: 'layer-combo' },
  },
  '.filetabs': {
    kinds: ['clipbox'],
    text: '파일 탭 줄(탭 12px — 위 여백 3 + 아래 테두리 1 + 탭 위 테두리 1)',
    verdict: { v: 'fits', cases: [{ media: '', h: 30, less: 5, font: 12 }, { media: COARSE, h: 40, less: 5, font: 12 }] },
  },
  '.layouttabs': {
    kinds: ['clipbox'],
    text: '배치 탭 줄(탭 12px — 위 테두리 1 + 탭 위아래 여백 3·3 / 손가락 7·7)',
    verdict: { v: 'fits', cases: [{ media: '', h: 26, less: 7, font: 12 }, { media: COARSE, h: 36, less: 15, font: 12 }] },
  },
  '.statusbar': {
    kinds: ['clipbox'],
    text: '상태 막대(좌표·글 12px — 위 테두리 1, 넘친 항목은 「⋯」 메뉴)',
    verdict: { v: 'fits', cases: [{ media: '', h: 28, less: 1, font: 12 }, { media: COARSE, h: 38, less: 1, font: 12 }] },
  },
  '.bar': {
    kinds: ['clipbox'],
    text: '진행 막대',
    verdict: { v: 'notext' },
  },
};

/** 350차가 줄바꿈을 허용해 고친 칸 — 이제 (가)(나)(다)에 걸리지 않고, 줄을 바꿔 온 글을 보인다 */
const FIXED350: Record<string, string> = {
  '.cmd-prompt': '명령행 물음 줄(데스크톱 — 뒤 옵션 낱말이 잘려 읽을 수도 누를 수도 없었다)',
  '.lt-row span': '선종류 관리자 표준 선종류 설명(title 없음)',
  '.polar-add-item': '제도 설정 추가 각도 목록(가장 긴 각도 글 — 측량 방위 정밀도 8 — 이 넓힌 간격에서 잘렸다)',
};

/** 넘침 숨김은 없지만 넘치면 이웃과 겹치는 고정 높이 한 줄 글 칸 — 선택자의 고정 height가 모두 표에 있어야 한다 */
const FITS: Record<string, Fit[]> = {
  // 제목 막대(앱 이름 12px, 아래 테두리 1)
  '.titlebar': [{ media: '', h: 34, less: 1, font: 12 }, { media: COARSE, h: 40, less: 1, font: 12 }, { media: '@media (max-width: 767px)', h: 44, less: 1, font: 12 }],
  // 팔레트 탭(12px, 탭 위아래 여백 4·4 / 손가락 8·8, 휴대폰 시트는 위아래 테두리 둘)
  '.palette-head': [{ media: '', h: 30, less: 10, font: 12 }, { media: COARSE, h: 40, less: 18, font: 12 }],
  // 작은 리본 단추 이름(11.5px, 위아래 여백 2·2)
  '.rbtn-sm': [{ media: '', h: 22, less: 4, font: 11.5 }, { media: COARSE, h: 28, less: 4, font: 11.5 }],
  '#app.ribbon-overlay > .ribbon .rbtn-sm': [{ media: COARSE, h: 34, less: 4, font: 11.5 }],
  // 단추(12px, 테두리 둘)
  '.btn': [{ media: '', h: 32, less: 2, font: 12 }],
  // 찾기 칸(손가락 16px 글이 가장 큼, 테두리 둘)
  '.search': [{ media: '', h: 26, less: 2, font: 16 }],
  // 대화 상자 입력 칸(브라우저 기본 글자 13.33px)
  '.form-row input': [{ media: '', h: 28, less: 2, font: 13.33 }],
  // 입력 대화 상자 칸(손가락 16px)
  '.form .form-row input': [{ media: '', h: 26, less: 2, font: 16 }],
  // 특성 팔레트 입력(11.5px / 손가락 16px)
  '.prop-row.edit input': [{ media: '', h: 22, less: 2, font: 11.5 }, { media: COARSE, h: 30, less: 2, font: 16 }],
  '.prop-color': [{ media: '', h: 22, less: 2, font: 11.5 }],
  // 도면층 표 고르기 칸(11px)·이름 고치기 칸(표 11.5px)
  '.cell-select': [{ media: '', h: 20, less: 2, font: 11 }],
  '.cell-input': [{ media: '', h: 20, less: 2, font: 11.5 }],
  // 리본 속성 고르기(11.5px / 손가락 16px)
  '.rprop select': [{ media: '', h: 22, less: 2, font: 11.5 }, { media: COARSE, h: 32, less: 2, font: 16 }],
  // 색 고르기 글 칸(브라우저 기본 13.33px)
  ".colorpick input[type='text']": [{ media: '', h: 24, less: 2, font: 13.33 }],
  // 휴대폰 카드 칩(카드 13px)
  '.mv-chip': [{ media: '', h: 36, less: 2, font: 13 }],
  // 응용프로그램 메뉴 단추 「A」(13px, 손가락은 투명 테두리 5px)
  '.app-button': [{ media: '', h: 26, less: 0, font: 13 }, { media: COARSE, h: 36, less: 10, font: 13 }],
};

/** 고정 height 선언(매체마다) */
const heights = (sel: string): { media: string; h: number }[] =>
  (BY_SEL.get(sel) ?? []).filter((r) => fixedLen(r.decls.get('height'))).map((r) => ({ media: r.media, h: firstPx(r.decls.get('height')!) }));
const byMedia = (a: { media: string }, b: { media: string }) => a.media.localeCompare(b.media);

const SRC_FILES = (() => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  return [...walk(join(ROOT, 'src')).map((p) => readFileSync(p, 'utf8')), read('index.html')];
})();

describe('350차 글 간격(WCAG 1.4.12) — 글을 자를 수 있는 규칙', () => {
  it('셈이 비지 않는다(규칙을 읽음)', () => {
    expect(RULES.length).toBeGreaterThan(500);
    expect(BY_SEL.get('.cmdline')?.[0]?.decls.get('position')).toBe('absolute');
  });

  it('글을 자를 수 있는 규칙이 모두 표에 있다 — 표 밖 새 규칙이면 넓힌 간격에서 잘리지 않는지·다른 길이 있는지 보고 표에 더한다', () => {
    const found = Object.fromEntries([...detect()].sort(([a], [b]) => a.localeCompare(b)));
    const table = Object.fromEntries(Object.entries(CLIP).map(([s, e]) => [s, e.kinds] as const).sort(([a], [b]) => a.localeCompare(b)));
    expect(found).toEqual(table);
  });

  it('표의 판정: 높이 셈·다른 길(소스 근거)·쓰는 곳 0', () => {
    for (const [sel, e] of Object.entries(CLIP)) {
      const v = e.verdict;
      if (v.v === 'fits') {
        expect(heights(sel).sort(byMedia), sel).toEqual(v.cases.map(({ media, h }) => ({ media, h })).sort(byMedia));
        for (const c of v.cases) expect(LH * c.font + c.less, `${sel} ${c.media}`).toBeLessThanOrEqual(c.h);
      } else if (v.v === 'other') {
        for (const ev of v.evidence) expect(read(ev.file), `${sel}: ${v.why}`).toMatch(ev.re);
      } else if (v.v === 'unused') {
        const re = new RegExp(`['"\` ]${v.cls}['"\` ]`);
        expect(SRC_FILES.some((t) => re.test(t)), `${sel} — 쓰는 곳이 생기면 판정을 다시`).toBe(false);
      }
      if (e.kinds.includes('pxlh')) {
        const lh = (BY_SEL.get(sel) ?? []).map((r) => r.decls.get('line-height')).filter(fixedLen);
        expect(lh.length, sel).toBeGreaterThan(0);
        for (const x of lh) expect(firstPx(x!), `${sel} 줄 높이 ≥ 글자 ${e.lhFont}px × 1.5`).toBeGreaterThanOrEqual(LH * e.lhFont!);
      }
    }
  });

  it('350차가 고친 셋은 줄을 바꿔 자르지 않는다', () => {
    const found = detect();
    for (const [sel, what] of Object.entries(FIXED350)) {
      const rs = BY_SEL.get(sel) ?? [];
      expect(rs.length, sel).toBeGreaterThan(0);
      expect(found.get(sel), `${sel} — ${what}`).toBeUndefined();
      for (const r of rs) expect(r.decls.get('white-space') ?? 'normal', `${sel} ${r.media}`).not.toMatch(/nowrap|pre$/);
      const base = rs.find((r) => r.media === '')!;
      expect(base.decls.get('overflow-wrap'), sel).toBe('anywhere');
      expect(base.decls.get('overflow') ?? 'visible', sel).toBe('visible');
    }
  });

  it('고정 높이 한 줄 글 칸이 넓힌 줄 높이를 받는다', () => {
    for (const [sel, cases] of Object.entries(FITS)) {
      expect(heights(sel).sort(byMedia), sel).toEqual(cases.map(({ media, h }) => ({ media, h })).sort(byMedia));
      for (const c of cases) expect(LH * c.font + c.less, `${sel} ${c.media}`).toBeLessThanOrEqual(c.h);
    }
  });
});
