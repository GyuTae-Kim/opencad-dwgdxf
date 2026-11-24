/**
 * 181차: TRIM·EXTEND 표준 모드의 절단 모서리(T)·경계 모서리(B).
 * Autodesk TRIM·EXTEND 도움말(2026)은 표준 모드 옵션 목록에도 절단(경계) 모서리를 적고, 설명은 빠른 작업과 같은 글이다
 * (더 고른 객체로 자르기·연장의 경계 모서리를 정한다). 이 앱은 빠른 작업에서만 받아 표준 모드에서 T·B는 잘못된 입력이었다.
 * 이제 표준 모드도 빠른 작업처럼 절단(경계) 모서리를 새로 고른다(Enter = 모두). 명령 취소(U)·Esc·잘못된 입력은 전과 같은 꼴이다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import type { Command, CommandContext, Keyword } from '../../src/app/app';
import { CancelError } from '../../src/app/app';
import { parsePointInput } from '../../src/app/commandline';
import { unmark } from '../../src/app/filetext';
import { registerModifyCommands } from '../../src/app/modify';
import { line as line0 } from '../edit/make';
import { type Harness, makeHarness, modelEntities } from '../cmds2/harness';
import { perCommandGroups } from './groups';

const line = (x0: number, y0: number, x1: number, y1: number): Entity => ({ ...line0(x0, y0, x1, y1), handle: '' });

function harness() {
  const h = perCommandGroups(makeHarness());
  registerModifyCommands(h.app);
  return h;
}

const TRIM_STD = '자를 객체 선택 또는 Shift 키를 누른 채 선택하여 연장 또는 [절단 모서리(T)/울타리(F)/걸치기(C)/모드(O)/프로젝트(P)/모서리(E)/지우기(R)/명령 취소(U)]:';
const TRIM_QUICK = '자를 객체 선택 또는 Shift 키를 누른 채 선택하여 연장 또는 [절단 모서리(T)/걸치기(C)/모드(O)/프로젝트(P)/지우기(R)]:';
const EXTEND_STD = '연장할 객체 선택 또는 Shift 키를 누른 채 선택하여 자르기 또는 [경계 모서리(B)/울타리(F)/걸치기(C)/모드(O)/프로젝트(P)/모서리(E)/명령 취소(U)]:';
const SELECT_EDGES = '객체 선택 또는 <모두 선택>:';

type In = string | { pick: string; at: [number, number] } | { sel: string[] } | { esc: true };

/**
 * 명령 실행기: '' = Enter, 키워드, "x,y" 점, { pick, at }, { sel }(Enter = 빈 선택), { esc }(그 프롬프트에서 Esc — CancelError).
 * 객체 프롬프트에 옵션이 아닌 글을 넣으면 진짜 명령행(App.onInput)처럼 알리고 같은 프롬프트를 다시 묻는다.
 */
async function drive(h: Harness, name: string, inputs: In[]): Promise<{ prompts: string[]; cancelled: boolean }> {
  const queue = [...inputs];
  const prompts: string[] = [];
  const next = (p: string): Exclude<In, { esc: true }> => {
    prompts.push(p);
    if (!queue.length) throw new Error(`입력이 모자랍니다: ${p}`);
    const x = queue.shift()!;
    if (typeof x === 'object' && 'esc' in x) throw new CancelError();
    return x;
  };
  const kwOf = (t: string, kws: Keyword[]) => kws.find((k) => k.key.toUpperCase() === t.trim().toUpperCase());
  const ctx = {
    app: h.app,
    group: 77,
    print: (t: string) => h.printed.push(unmark(t)),
    async getPoint(prompt: string, opt: { keywords?: Keyword[]; base?: { x: number; y: number } | null } = {}) {
      const x = next(prompt);
      if (typeof x !== 'string') throw new Error(`점 프롬프트에 맞지 않는 입력 (${prompt})`);
      const t = x.trim();
      if (!t) return { enter: true };
      const kw = kwOf(t, opt.keywords ?? []);
      if (kw) return { keyword: kw.key };
      const p = parsePointInput(t, opt.base ?? null, null);
      if (p) return { point: p, snap: null };
      return { text: t };
    },
    async getEntity(prompt: string, kws: Keyword[] = []) {
      for (;;) {
        const x = next(prompt);
        if (typeof x === 'string') {
          if (!x.trim()) return { enter: true };
          const kw = kwOf(x, kws);
          if (kw) return { keyword: kw.key };
          h.printed.push('객체를 선택하거나 옵션을 입력하십시오.');
          continue;
        }
        if ('pick' in x) return { handle: x.pick, point: { x: x.at[0], y: x.at[1] } };
        throw new Error(`객체 프롬프트에 맞지 않는 입력 (${prompt})`);
      }
    },
    async getSelection(prompt = '객체 선택:') {
      const x = next(prompt);
      if (typeof x === 'string') return [];
      if ('sel' in x) return x.sel;
      throw new Error(`선택 프롬프트에 맞지 않는 입력 (${prompt})`);
    },
  } as unknown as CommandContext;
  const c = (h.app as unknown as { commands: Map<string, Command> }).commands.get(name);
  if (!c) throw new Error(`명령 없음: ${name}`);
  let cancelled = false;
  try {
    await c.run(ctx);
  } catch (e) {
    if (!(e instanceof CancelError)) throw e;
    cancelled = true;
  }
  if (queue.length) throw new Error(`남은 입력 ${queue.length}개: ${JSON.stringify(queue)}`);
  return { prompts, cancelled };
}

/** 가로 절단선 둘(y 0·2)과 세로선 셋(x −2·0·2, y −5~5) */
function comb(h: Harness) {
  const a = h.add(line(-10, 0, 10, 0));
  const b = h.add(line(-10, 2, 10, 2));
  const [v1, v2, v3] = [-2, 0, 2].map((x) => h.add(line(x, -5, x, 5)));
  return { a, b, v1: v1!, v2: v2!, v3: v3! };
}

/** x 자리의 세로선들(아래 끝 y 차례): [아래 y, 위 y] */
const spans = (h: Harness, x: number) =>
  (modelEntities(h.doc, 'LINE') as LineEntity[])
    .filter((l) => Math.abs(l.start.x - x) < 1e-9 && Math.abs(l.end.x - x) < 1e-9)
    .map((l) => [Math.min(l.start.y, l.end.y), Math.max(l.start.y, l.end.y)])
    .sort((p, q) => p[0]! - q[0]!);

describe('TRIM 표준 모드의 절단 모서리(T)', () => {
  it('표준 모드에서 T를 고르면 절단 모서리를 새로 고른다(앞 모서리를 빼고 새로 고른 것만)', async () => {
    const h = harness();
    const { a, b, v1, v3 } = comb(h);
    const { prompts } = await drive(h, 'TRIM', ['O', 'S', { sel: [a.handle] }, { pick: v1.handle, at: [-2, 3] }, 'T', { sel: [b.handle] }, { pick: v3.handle, at: [2, 1] }, '']);
    expect(prompts).toContain(TRIM_STD);
    expect(h.printed.filter((t) => t === '절단 모서리 선택 ...')).toHaveLength(2);
    expect(prompts.filter((p) => p === SELECT_EDGES)).toHaveLength(2);
    // 첫 모서리(y 0)로 자른 선
    expect(spans(h, -2)).toEqual([[-5, 0]]);
    // 새 모서리(y 2)만: 고른 점(y 1) 아래로 교점이 없어 끝까지 지운다(y 0 선이 남아 있었다면 0~2만 지워 둘로 나뉜다)
    expect(spans(h, 2)).toEqual([[2, 5]]);
    expect(h.printed).not.toContain('객체를 선택하거나 옵션을 입력하십시오.');
  });

  it('T 뒤의 명령 취소(U)는 자르기를 하나씩 되돌리고, 더 없으면 전처럼 알린다', async () => {
    const h = harness();
    const { a, b, v1, v3 } = comb(h);
    await drive(h, 'TRIM', ['O', 'S', { sel: [a.handle] }, { pick: v1.handle, at: [-2, 3] }, 'T', { sel: [b.handle] }, { pick: v3.handle, at: [2, 1] }, 'U', 'U', 'U', '']);
    expect(spans(h, 2)).toEqual([[-5, 5]]);
    expect(spans(h, -2)).toEqual([[-5, 5]]);
    expect(h.printed.filter((t) => t === '명령 취소할 것이 없습니다.')).toHaveLength(1);
  });

  it('T로 모서리를 고르다 Esc를 누르면 명령이 끝나고 앞서 자른 것은 남는다(주 프롬프트에서 Esc와 같다)', async () => {
    const h = harness();
    const { a, v1 } = comb(h);
    const r = await drive(h, 'TRIM', ['O', 'S', { sel: [a.handle] }, { pick: v1.handle, at: [-2, 3] }, 'T', { esc: true }]);
    expect(r.cancelled).toBe(true);
    expect(r.prompts[r.prompts.length - 1]).toBe(SELECT_EDGES);
    expect(spans(h, -2)).toEqual([[-5, 0]]);
    const h2 = harness();
    const c2 = comb(h2);
    const r2 = await drive(h2, 'TRIM', ['O', 'S', { sel: [c2.a.handle] }, { pick: c2.v1.handle, at: [-2, 3] }, { esc: true }]);
    expect(r2.cancelled).toBe(true);
    expect(spans(h2, -2)).toEqual([[-5, 0]]);
  });

  it('잘못된 입력은 전처럼 알리고 같은 프롬프트를 다시 묻는다, T 뒤 Enter는 모든 객체가 절단 모서리', async () => {
    const h = harness();
    const { a, v3 } = comb(h);
    const { prompts } = await drive(h, 'TRIM', ['O', 'S', { sel: [a.handle] }, 'Z', 'T', '', { pick: v3.handle, at: [2, 1] }, '']);
    const i = prompts.indexOf(TRIM_STD);
    expect(prompts[i + 1]).toBe(TRIM_STD);
    expect(h.printed.filter((t) => t === '객체를 선택하거나 옵션을 입력하십시오.')).toHaveLength(1);
    // 모든 객체: y 0과 y 2 사이를 지워 둘로
    expect(spans(h, 2)).toEqual([
      [-5, 0],
      [2, 5],
    ]);
  });

  it('빠른 작업의 프롬프트와 T(표준으로 바꿔 모서리 고르기)는 전과 같다', async () => {
    const h = harness();
    const { a, v1 } = comb(h);
    const { prompts } = await drive(h, 'TRIM', ['T', { sel: [a.handle] }, { pick: v1.handle, at: [-2, 3] }, '']);
    expect(prompts[0]).toBe(TRIM_QUICK);
    expect(prompts[1]).toBe(SELECT_EDGES);
    expect(spans(h, -2)).toEqual([[-5, 0]]);
  });
});

describe('EXTEND 표준 모드의 경계 모서리(B)', () => {
  it('표준 모드에서 B를 고르면 경계 모서리를 새로 고른다', async () => {
    const h = harness();
    const b7 = h.add(line(-10, 7, 10, 7));
    const b10 = h.add(line(-10, 10, 10, 10));
    const l1 = h.add(line(-2, 0, -2, 5));
    const l2 = h.add(line(2, 0, 2, 5));
    const { prompts } = await drive(h, 'EXTEND', ['O', 'S', { sel: [b7.handle] }, { pick: l1.handle, at: [-2, 4] }, 'B', { sel: [b10.handle] }, { pick: l2.handle, at: [2, 4] }, '']);
    expect(prompts).toContain(EXTEND_STD);
    expect(h.printed.filter((t) => t === '경계 모서리 선택 ...')).toHaveLength(2);
    expect(spans(h, -2)).toEqual([[0, 7]]);
    // 새 경계(y 10)만: y 7 선이 남아 있었다면 가까운 7까지만 늘인다
    expect(spans(h, 2)).toEqual([[0, 10]]);
  });
});
