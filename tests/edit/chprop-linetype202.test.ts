/**
 * 202차: CHPROP·CHANGE 특성(P)의 선종류(LT)가 로드되지 않은 표준 선종류 이름을 받는다.
 * 근거 — Autodesk CHPROP·CHANGE 도움말(2026) 「선종류」: 새 선종류가 로드되어 있지 않으면 표준 선종류 라이브러리 파일에서
 * 로드를 시도하고, 실패하면 LINETYPE으로 로드하라고 한다. 표준 파일은 MEASUREMENT 도움말대로 영국식(0)이면 ANSI, 미터법(1)이면 ISO 쪽 —
 * 이 앱의 -LINETYPE 로드·CENTERMARK와 같은 내장 정의(`STANDARD_LINETYPES`)와 `$MEASUREMENT` 규칙(없으면 미터법)을 쓴다.
 * 전에는 「…먼저 로드하십시오.」만 알리고 특성 프롬프트로 돌아갔다. 로드된 이름·ByLayer·표준 정의에 없는 이름은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { Linetype } from '../../src/core/model';
import { registerPropCommands } from '../../src/app/propcmds';
import { makeHarness } from '../cmds2/harness';
import { line } from './make';

const NOT_LOADED = (n: string) => `선종류 "${n}"을(를) 찾을 수 없습니다. 선종류 관리자(LINETYPE)에서 먼저 로드하십시오.`;

function harness(measurement?: number, setup?: (doc: ReturnType<typeof makeHarness>['doc']) => void) {
  const h = makeHarness((doc) => {
    if (measurement !== undefined) doc.header.set('$MEASUREMENT', measurement);
    setup?.(doc);
  });
  registerPropCommands(h.app);
  const a = h.add(line(0, 0, 10, 0));
  const b = h.add(line(0, 5, 10, 5));
  return { h, a: a.handle, b: b.handle };
}
type H = ReturnType<typeof harness>['h'];

const ltOf = (h: H, handle: string) => h.doc.entityIndex.get(handle)!.linetype;
const dashes = (l: Linetype | undefined) => l?.elements.map((x) => +x.length.toFixed(6));

describe('CHPROP·CHANGE 특성의 선종류 — 로드되지 않은 표준 선종류(202차)', () => {
  it('미터법 도면: 표준 정의를 mm 꼴로 올리고 고른 객체에 준다 — 로드와 바꾸기는 명령 취소 한 단계', async () => {
    const { h, a, b } = harness(1);
    const depth = h.st.session.depth;
    await h.run('CHPROP', [{ sel: [a, b] }, 'LT', 'DASHED', '']);
    expect(h.printed).not.toContain(NOT_LOADED('DASHED'));
    const rec = h.doc.linetypes.get('DASHED');
    expect(rec?.name).toBe('DASHED');
    expect(dashes(rec)).toEqual([12.7, -6.35]);
    expect(ltOf(h, a)).toBe('DASHED');
    expect(ltOf(h, b)).toBe('DASHED');
    expect(h.st.session.depth).toBe(depth + 1);
    h.st.session.undo();
    expect(h.doc.linetypes.has('DASHED')).toBe(false);
    expect(ltOf(h, a)).toBe('ByLayer');
  });

  it('영국식 도면($MEASUREMENT 0)은 인치 꼴, 소문자 이름도 표준 이름으로 — $MEASUREMENT가 없으면 미터법', async () => {
    const im = harness(0);
    await im.h.run('CHPROP', [{ sel: [im.a] }, 'LT', 'hidden', '']);
    expect(dashes(im.h.doc.linetypes.get('HIDDEN'))).toEqual([0.25, -0.125]);
    expect(ltOf(im.h, im.a)).toBe('HIDDEN');
    expect(ltOf(im.h, im.b)).toBe('ByLayer');
    const none = harness();
    await none.h.run('CHPROP', [{ sel: [none.a] }, 'LT', 'ACAD_ISO02W100', '']);
    expect(dashes(none.h.doc.linetypes.get('ACAD_ISO02W100'))).toEqual([12, -3]);
    expect(ltOf(none.h, none.a)).toBe('ACAD_ISO02W100');
  });

  it('CHANGE 특성(P)의 선종류도 같은 공통 함수로 올린다', async () => {
    const { h, a } = harness(1);
    await h.run('CHANGE', [{ sel: [a] }, 'P', 'LT', 'CENTER', '']);
    expect(h.printed).not.toContain(NOT_LOADED('CENTER'));
    expect(dashes(h.doc.linetypes.get('CENTER'))).toEqual([31.75, -6.35, 6.35, -6.35]);
    expect(ltOf(h, a)).toBe('CENTER');
  });

  it('전과 같은 값: 표준 정의에 없는 이름은 같은 알림, 로드된 선종류는 그 레코드 그대로, Enter는 ByLayer', async () => {
    const { h, a } = harness(1);
    await h.run('CHPROP', [{ sel: [a] }, 'LT', 'NOSUCH', '']);
    expect(h.printed).toContain(NOT_LOADED('NOSUCH'));
    expect(ltOf(h, a)).toBe('ByLayer');
    expect(h.doc.linetypes.size).toBe(0);
    // 이미 있는 DASHED(사용자 정의 무늬)는 다시 올리지 않는다
    const own: Linetype = { name: 'Dashed', handle: 'E1', flags: 0, description: '', patternLength: 3, elements: [{ length: 2, flags: 0, scale: 1, rotation: 0, offset: { x: 0, y: 0 } }, { length: -1, flags: 0, scale: 1, rotation: 0, offset: { x: 0, y: 0 } }] };
    const k = harness(1, (doc) => doc.linetypes.set('DASHED', own));
    await k.h.run('CHPROP', [{ sel: [k.a] }, 'LT', 'DASHED', '']);
    expect(k.h.doc.linetypes.get('DASHED')).toEqual(own);
    expect(ltOf(k.h, k.a)).toBe('Dashed');
    await k.h.run('CHPROP', [{ sel: [k.a] }, 'LT', '', '']);
    expect(ltOf(k.h, k.a)).toBe('ByLayer');
  });
});
