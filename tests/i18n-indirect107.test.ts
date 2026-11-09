/**
 * 107차: 105차에 남은 간접 출력의 도면·파일 글 표시(ft — app/filetext.ts).
 * - 스크립트 실행기가 다시 찍는 줄: 선택 점·구석·폴리곤 점 되풀이와 "…에 객체가 없습니다"의 스크립트 토큰,
 *   멈춘 까닭으로 다시 찍는 명령 오류 글(명령행 출력 고리의 표시를 둔 글 — CommandLine.print의 shown)
 * - 파일 읽기 오류·알림: ATTEXT 템플릿 오류·필드 넘침·숫자가 아닌 값, ATTIN 핸들, 치수 스타일 파일(.dim)의 없는 레코드
 * 보이는 글(표시를 뺀 글)은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { Command, CommandContext } from '../src/app/app';
import { MODEL_SPACE, entityDefaults, type Entity, type LineEntity } from '../src/core/model';
import { ft, unmark } from '../src/app/filetext';
import { registerDrawCommands } from '../src/app/draw';
import { registerModifyCommands } from '../src/app/modify';
import { collectBlocks, formatRecords, parseTemplate, templateTags } from '../src/edit/blkcmds/attext';
import { parseAttIn } from '../src/edit/blkcmds/attout';
import { parseDimFile } from '../src/edit/blkcmds/dimfile';
import { makeScriptApp, type ScriptApp } from './script/app';
import { addBlock, attdef, insert, put, setup as utilSetup } from './util2/helpers';

const line = (x1: number, y1: number, x2: number, y2: number): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 } });

/** 스크립트 시험 틀 + 명령행에 찍힌 날 글(표시 그대로) */
function scriptApp(): { h: ScriptApp; raw: string[] } {
  const h = makeScriptApp();
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  h.add(line(10, 10, 20, 10));
  h.add(line(100, 100, 110, 100));
  const raw: string[] = [];
  const cmd = h.app.cmd as unknown as { print: (t: string, c?: 'err' | 'res') => void };
  const print = cmd.print;
  cmd.print = (t, c) => {
    raw.push(t);
    print(t, c);
  };
  return { h, raw };
}

describe('스크립트 실행기가 다시 찍는 줄', () => {
  it('구석·폴리곤 점 되풀이 줄의 토큰은 표시로 감싸고, 보이는 글은 그대로', async () => {
    const { h, raw } = scriptApp();
    expect(await h.script('ERASE\nW\n0,0\n50,50\n\n')).toBe('idle');
    expect(raw).toContain(`첫 번째 구석 지정: ${ft('0,0')}`);
    expect(raw).toContain(`반대 구석 지정: ${ft('50,50')}`);
    expect(h.out()).toContain('첫 번째 구석 지정: 0,0');
    const g = scriptApp();
    expect(await g.h.script('ERASE\nCP\n0,0\n50,0\n99,99\nU\n50,50\n0,50\n\n\n')).toBe('idle');
    expect(g.raw).toContain(`첫 번째 폴리곤 점: ${ft('0,0')}`);
    expect(g.raw).toContain(`선의 끝점 지정 또는 [명령 취소(U)]: ${ft('U')}`);
    expect(g.h.out()).toContain('선의 끝점 지정 또는 [명령 취소(U)]: 50,0');
    // 빈 곳의 점은 암시적 창의 첫 구석
    const k = scriptApp();
    expect(await k.h.script('ERASE\n500,500\n600,600\n\n')).toBe('idle');
    expect(k.raw).toContain(`첫 번째 구석 지정: ${ft('500,500')}`);
  });

  it('객체 고르기 토큰 자리에 객체가 없으면 그 토큰을 감싸 멈춘다', async () => {
    const { h, raw } = scriptApp();
    expect(await h.script('OFFSET\n5\n500,500\n')).toBe('paused');
    expect(raw.some((t) => t.includes(`${ft('500,500')}에 객체가 없습니다.`))).toBe(true);
    expect(h.errors().join('\n')).toContain('500,500에 객체가 없습니다.');
  });

  it('멈춘 까닭으로 다시 찍는 명령 오류 글은 도면 글 표시를 둔 글이다(보이는 글은 그대로)', async () => {
    const { h, raw } = scriptApp();
    const msg = `도면층 ${ft('치수 · 표')}이(가) 잠겨 있습니다.`;
    h.app.register({
      name: 'BAD107',
      title: '시험',
      async run(ctx: CommandContext) {
        ctx.print(msg, 'err');
      },
    } as Command);
    expect(await h.script('BAD107\n')).toBe('paused');
    const stop = raw.find((t) => t.includes('에서 멈췄습니다:'))!;
    expect(stop).toContain(msg);
    expect(unmark(stop)).toContain(`멈췄습니다: ${unmark(msg)}`);
    expect(h.errors().find((t) => t.includes('에서 멈췄습니다:'))).toBe(unmark(stop));
  });
});

describe('파일 읽기 오류·알림', () => {
  it('ATTEXT 템플릿 오류의 줄·필드 이름', () => {
    const t = parseTemplate('TAG X10\nBL:FOO C010000\nBL:NAME N010000\nBL:X C010000\nC:QUOTE\n');
    expect(t.errors).toEqual([
      `1번째 줄: 필드 사양이 올바르지 않습니다: ${ft('TAG X10')}`,
      `2번째 줄: 알 수 없는 블록 필드 ${ft('BL:FOO')}`,
      `3번째 줄: ${ft('BL:NAME')}은(는) 문자 필드(C)여야 합니다.`,
      `4번째 줄: ${ft('BL:X')}은(는) 숫자 필드(N)여야 합니다.`,
      `5번째 줄: ${ft('C:QUOTE')}의 기호가 없습니다.`,
    ]);
    expect(t.errors.map(unmark)[0]).toBe('1번째 줄: 필드 사양이 올바르지 않습니다: TAG X10');
  });

  it('ATTEXT 숫자가 아닌 값·필드 넘침의 필드 이름과 값', () => {
    const u = utilSetup();
    addBlock(u.doc, u.h, 'PART', [attdef(u.h(), 'NO', '0', 0, 0), attdef(u.h(), 'PRICE', '0', 0, 1)]);
    const attrib = (h: string, owner: string, tag: string, value: string) => ({ ...attdef(h, tag, value, 0, 0), type: 'ATTRIB' as const, owner, prompt: undefined });
    put(u.doc, insert('A1', 'PART', 0, 0, { attribs: [attrib('B1', 'A1', 'NO', '치수-긴 번호'), attrib('B2', 'A1', 'PRICE', '없음')] }));
    const tpl = parseTemplate('NO C004000\nPRICE N006002\n');
    const blocks = collectBlocks(u.doc, u.doc.blocks.get(MODEL_SPACE)!.entities as Entity[], templateTags(tpl));
    const out = formatRecords(blocks, tpl, 'CDF');
    expect(out.warnings).toEqual([`레코드 1: ${ft('NO')} 필드 넘침(${ft('치수-긴 번호')})`, `레코드 1: ${ft('PRICE')}의 값 "${ft('없음')}"이(가) 숫자가 아니어서 0으로 썼습니다.`]);
    // 추출한 글(파일)에는 표시가 없다
    expect(out.text).not.toMatch(/[⁨⁩]/);
  });

  it('ATTIN 읽을 수 없는 핸들, 치수 스타일 파일의 없는 레코드', () => {
    const p = parseAttIn('HANDLE\tBLOCKNAME\tNO\nzz 치수\tTAG\t1\n');
    expect(p.errors).toEqual([`2번째 줄: 핸들 "${ft('zz 치수')}"을(를) 읽을 수 없습니다.`]);
    const dim = parseDimFile(['  0', 'SECTION', '  2', 'TABLES', '  0', 'TABLE', '  2', 'DIMSTYLE', '  0', 'DIMSTYLE', '  2', '치수 · A', ' 70', '0', '340', 'FFF', '  0', 'ENDTAB', '  0', 'ENDSEC', '  0', 'EOF', ''].join('\n'));
    expect(dim.errors).toContain(`치수 스타일 ${ft('치수 · A')}: DIMTXSTY이(가) 가리키는 레코드(${ft('FFF')})가 파일에 없습니다.`);
  });
});
