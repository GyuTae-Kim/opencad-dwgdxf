/**
 * 명령행 버전 명령(-INSERT 등)이 함께 쓰는 프롬프트 도우미.
 * 공백은 Enter(스크립트와 같다)이고, 숫자는 직접 거리 입력이 아니라 값으로 받는다(preferNumber).
 * 잘못된 입력은 오류(err)로 알리고 다시 묻는다 — 스크립트는 오류에서 멈춘다.
 */
import { parseBearing, parseUnitAngle, unitAngleDegrees } from '../core/units';
import type { CommandContext, Keyword } from './app';
import type { Pt } from './view';

/** 낱말 입력(공백 = Enter). Enter면 null. 점으로 읽힌 입력은 "x,y" 글로, 키워드는 키로 돌린다 */
export async function askWord(ctx: CommandContext, prompt: string, keywords: Keyword[] = []): Promise<string | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { allowText: true, preferNumber: true, keywords });
    if ('text' in r) return r.text.trim().replace(/^"(.*)"$/, '$1');
    if ('enter' in r) return null;
    if ('keyword' in r) return r.keyword;
    if ('point' in r) return `${+r.point.x.toPrecision(12)},${+r.point.y.toPrecision(12)}`;
  }
}

/** 글 입력(공백 포함, 줄 끝까지). Enter면 def */
export async function askLine(ctx: CommandContext, prompt: string, def: string): Promise<string> {
  const app = ctx.app;
  const prev = app.cmd.acceptSpaces;
  app.cmd.acceptSpaces = true;
  try {
    const r = await ctx.getPoint(prompt, { allowText: true, preferNumber: true });
    if ('text' in r) return r.text;
    if ('point' in r) return `${+r.point.x.toPrecision(12)},${+r.point.y.toPrecision(12)}`;
    return def;
  } finally {
    app.cmd.acceptSpaces = prev;
  }
}

/** 키워드 고르기(열쇠·한국어 이름, 대소문자 무시). Enter면 def(null이면 null) */
export async function askOption(ctx: CommandContext, prompt: string, keywords: Keyword[], def: string | null): Promise<string | null> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { keywords, allowText: true });
    if ('keyword' in r) return r.keyword;
    if ('enter' in r) return def;
    if ('text' in r) {
      const k = matchKeyword(r.text, keywords);
      if (k) return k;
    }
    ctx.print('옵션 키워드가 필요합니다.', 'err');
  }
}

/**
 * 친 글이 옵션 이름인지(120차): 언어 사전 열쇠를 가르려고 이름 끝에 붙인 보이지 않는 U+2060(MVIEW 맞춤 등 — 한국어 화면 글은 그대로)은
 * 빼고 견준다. 한국어로 "맞춤"을 쳐도 그 옵션을 고른다
 */
export function keywordLabelIs(label: string, text: string): boolean {
  return label === text || (label.includes('\u{2060}') && label.replace(/\u{2060}/gu, '') === text);
}

/** 입력 → 키워드 열쇠(열쇠·이름, 앞의 _는 뗀다) */
export function matchKeyword(text: string, keywords: readonly Keyword[]): string | null {
  const t = text.trim().replace(/^_/, '');
  const up = t.toUpperCase();
  return keywords.find((k) => k.key.toUpperCase() === up || keywordLabelIs(k.label, t))?.key ?? null;
}

/** 예/아니오(Enter = def) */
export async function askYN(ctx: CommandContext, prompt: string, def: boolean): Promise<boolean> {
  const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');
  return k === 'Y';
}

export const YES_NO: Keyword[] = [
  { key: 'Y', label: '예' },
  { key: 'N', label: '아니오' },
];

/**
 * 실수 입력. Enter면 def(null이면 다시 묻는다). check가 글을 돌려주면 오류로 알리고 다시.
 * base가 있으면 점도 받아 base까지의 평면 거리를 값으로 본다(201차 — -ATTEDIT 높이: 점이면 그 점과 문자 시작점의 거리, TEXT 높이와 같은 꼴).
 * 숫자는 base가 있어도 거리 입력이 아니라 값이다. read: 글 → 수(기본 parseReal — 각도는 askRealAngle, 227차)
 */
export async function askReal(
  ctx: CommandContext,
  prompt: string,
  def: number | null,
  check: (v: number) => string | null = () => null,
  base: Pt | null = null,
  read: (text: string) => number | null = parseReal,
): Promise<number> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { ...(base ? { base } : {}), preferNumber: true, allowText: true });
    if ('enter' in r && def !== null) return def;
    const v = 'point' in r && base ? Math.hypot(r.point.x - base.x, r.point.y - base.y) : 'text' in r ? read(r.text) : null;
    if (v !== null) {
      const e = check(v);
      if (!e) return v;
      ctx.print(e, 'err');
      continue;
    }
    ctx.print('숫자 값이 필요합니다.', 'err');
  }
}

/**
 * 각(도) 값 입력(227차): askReal과 같은 프롬프트·Enter·검사·오류이고 글은 parseRealAngle로 읽는다(-STYLE 기울기, -ARRAY 채울 각도·항목 사이 각도,
 * XATTACH·PDFATTACH·TINSERT 회전). check는 도로 바꾼 값을 본다(-STYLE −85~85는 `100g`도 90도로 잰다)
 */
export function askRealAngle(ctx: CommandContext, prompt: string, def: number | null, check: (v: number) => string | null = () => null): Promise<number> {
  return askReal(ctx, prompt, def, check, null, parseRealAngle);
}

/** 정수 입력(min~max). Enter면 def(null이면 다시 묻는다) */
export async function askInteger(ctx: CommandContext, prompt: string, def: number | null, min: number, max: number): Promise<number> {
  return askReal(ctx, prompt, def, (v) => (Number.isInteger(v) && v >= min && v <= max ? null : `${min}에서 ${max} 사이의 정수가 필요합니다.`));
}

/**
 * 각도(도) 입력 또는 기준점에서 찍은 점의 방향. 라디안을 돌려준다. Enter면 def(라디안).
 * 수가 아니면 측량 방위(N45d0'0"E·정방위 글자 — parseBearing)와 단위 글자 꼴(45d30'·50g·0.7854r — parseUnitAngle)도 받는다(224차 — 수와 같은
 * 동쪽 0·반시계 각. 이 프롬프트에는 키워드가 없어 방위 글자와 겹치지 않는다)
 */
export async function askAngleDeg(ctx: CommandContext, prompt: string, base: Pt | null, def: number): Promise<number> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base, preferNumber: true, allowText: true });
    if ('enter' in r) return def;
    if ('point' in r && base) return Math.atan2(r.point.y - base.y, r.point.x - base.x);
    if ('text' in r) {
      const v = parseReal(r.text);
      if (v !== null) return (v * Math.PI) / 180;
      const a = parseBearing(r.text) ?? parseUnitAngle(r.text);
      if (a !== null) return a;
    }
    ctx.print('각도 또는 점이 필요합니다.', 'err');
  }
}

/** 숫자 글 → 수(지수 표기 허용). 아니면 null */
export function parseReal(text: string): number | null {
  const t = text.trim();
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/**
 * askReal로 각(도)을 읽던 프롬프트의 글 읽기(227차): parseReal이 읽는 글은 그 값 그대로(같은 parseReal — 수·지수 표기), 못 읽은 글이 단위 글자 꼴
 * (`45d30'`·`50g`·`0.7854r` — core/units unitAngleDegrees, 224·226차)이면 그 각을 도로, 그 밖은 전처럼 null(식·16진·피트-인치·`45x` — 오류 뒤 다시).
 * parseReal이 읽는 글에는 단위 글자(d·°·g·r)가 없어 두 갈래가 겹치지 않는다. Autodesk 도움말 "About Unit Format Conventions": 각도는 현재 단위와
 * 상관없이 다른 꼴로도 넣는다. 전에는 이 꼴을 「숫자 값이 필요합니다.」로 거절했다
 */
export function parseRealAngle(text: string): number | null {
  return parseReal(text) ?? unitAngleDegrees(text);
}

/** 숫자를 프롬프트 기본값 꼴로(소수 네 자리, AutoCAD처럼) */
export function fmt4(v: number): string {
  return v.toFixed(4);
}
