/**
 * 108차: 대화 상자 알림 글에 끼우는 파일·도면 이름도 표시(ft — app/filetext.ts)로 감싼다(105·107차 꼴, 값은 그대로).
 * - PLOTSTAMP 대화 상자의 미리보기(스탬프에 찍힐 도면·배치 이름 그대로)와 명령행 알림
 * - 도면층 필터 이름 검사 글(대화 상자·명령행 오류)
 * 보이는 글(표시를 뺀 글)은 전과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ft, unmark } from '../src/app/filetext';
import { registerPlotStampCommand } from '../src/app/filecmds-stamp';
import { filterNameProblem } from '../src/edit/layerfilter/model';
import { makeHarness } from './cmds2/harness';
import { runWith } from './drawmod/ctx';

const forms: { title: string; note?: string }[] = [];
vi.mock('../src/app/ui/dom', async (orig) => ({
  ...(await orig<object>()),
  form: vi.fn(async (title: string, _fields: unknown, opt: { note?: string } = {}) => {
    forms.push({ title, note: opt.note });
    return null;
  }),
}));

afterEach(() => {
  forms.length = 0;
});

describe('대화 상자 알림 글의 파일·도면 이름(108차)', () => {
  it('PLOTSTAMP 미리보기는 스탬프 줄(도면·배치 이름)을 표시로 감싸고, 보이는 글은 그대로', async () => {
    const h = makeHarness();
    registerPlotStampCommand(h.app, (c) => h.app.register(c));
    await runWith(h, 'PLOTSTAMP', []);
    expect(forms.length).toBe(1);
    const note = forms[0]!.note!;
    // 기본 설정은 한 줄(도면 이름, 배치, 날짜, 장치) — 줄 전체가 표시 안, 앱 글(앞뒤 안내)은 표시 밖
    expect(note).toMatch(/^미리보기: ⁨t\.dxf, 모형, [^⁨⁩]+, DWG To PDF\.pc3⁩ — 스탬프는 화면에 그리지 않고 PLOT·PUBLISH의 PDF·SVG에만 넣습니다\.$/);
    expect(unmark(note)).toMatch(/^미리보기: t\.dxf, 모형, .+, DWG To PDF\.pc3 — 스탬프는/);
  });

  it('도면층 필터 이름 검사 글은 이름을 감싸고, 보이는 글은 그대로', () => {
    expect(filterNameProblem('벽', ['벽'])).toBe(`필터 "${ft('벽')}"이(가) 이미 있습니다.`);
    expect(unmark(filterNameProblem('wall', ['WALL'])!)).toBe('필터 "wall"이(가) 이미 있습니다.');
    expect(filterNameProblem('All Used Layers')).toBe(`"${ft('All Used Layers')}"은(는) 기본 필터 이름이라 쓸 수 없습니다.`);
  });
});
