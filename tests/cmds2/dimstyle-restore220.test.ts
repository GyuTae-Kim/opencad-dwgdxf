/**
 * 220차: -DIMSTYLE 복원(R)에서 ~이름은 차이를 보인 뒤 앞 프롬프트로 돌아간다.
 * 근거 — Autodesk AutoCAD LT 2026 -DIMSTYLE 도움말 「복원」: ~ 뒤에 스타일 이름을 넣으면 그 스타일과 현재 설정의 차이를 보이고,
 * 차이를 보인 뒤 앞 프롬프트가 다시 나온다(명령이 끝나지 않는다).
 * 전에는 차이를 보인 뒤 명령을 끝내 스크립트의 다음 낱말이 새 명령으로 갔다.
 * 이름(현재로)·?(나열 뒤 다시 묻기)·Enter(치수 선택)·변수(V)의 ~이름(도움말이 그 뒤를 적지 않음)은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { registerDashTableCommands } from '../../src/app/dashcmds-tables';
import { registerDashCommands } from '../../src/app/dashcmds';
import { makeScriptApp } from '../script/app';
import { makeHarness } from './harness';

const NAME_PROMPT = '치수 스타일 이름 입력, [?] 또는 <치수 선택>:';

function harness() {
  const h = makeHarness((doc) => {
    doc.dimStyles.set('STANDARD', { name: 'Standard', handle: 'D1', flags: 0, vars: { DIMASZ: 0.18, DIMTXT: 0.18 } });
    doc.dimStyles.set('ISO-25', { name: 'ISO-25', handle: 'D2', flags: 0, vars: { DIMASZ: 2.5, DIMTXT: 2.5 } });
    doc.dimStyles.set('ARCH', { name: 'Arch', handle: 'D3', flags: 0, vars: { DIMASZ: 3, DIMTXT: 3.5 } });
    doc.header.set('$DIMSTYLE', 'Standard');
  });
  registerDashTableCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const cur = (h: H) => h.doc.header.get('$DIMSTYLE');

describe('-DIMSTYLE 복원(R)의 ~이름 뒤 앞 프롬프트(220차)', () => {
  it('~이름은 차이를 보인 뒤 이름을 다시 묻고, 이어 준 이름을 현재로 — 명령 취소 한 단계', async () => {
    const h = harness();
    const depth = h.st.session.depth;
    await h.run('-DIMSTYLE', ['R', '~ISO-25', 'Arch']);
    expect(h.printed).toContain('"ISO-25"과(와) 현재 설정의 차이:');
    expect(h.printed.some((t) => t.startsWith('DIMASZ'))).toBe(true);
    expect(h.prompts.filter((p) => p === NAME_PROMPT)).toHaveLength(2);
    expect(cur(h)).toBe('Arch');
    expect(h.st.session.depth).toBe(depth + 1);
    h.st.session.undo();
    expect(cur(h)).toBe('Standard');
  });

  it('~이름 뒤 다시 ~이름·?도 같은 프롬프트로 돌아오고, Enter는 치수 선택 — 치수를 고르지 않으면 바꾸지 않음', async () => {
    const h = harness();
    const depth = h.st.session.depth;
    await h.run('-DIMSTYLE', ['R', '~Arch', '~ISO-25', '?', '', '', '']);
    expect(h.printed).toContain('"Arch"과(와) 현재 설정의 차이:');
    expect(h.printed).toContain('"ISO-25"과(와) 현재 설정의 차이:');
    expect(h.printed).toContain('명명된 치수 스타일:');
    expect(h.prompts.filter((p) => p === NAME_PROMPT)).toHaveLength(4);
    expect(h.prompts.at(-1)).toBe('치수 선택:');
    expect(cur(h)).toBe('Standard');
    expect(h.st.session.depth).toBe(depth);
  });

  it('스크립트: 「-DIMSTYLE R ~Standard Standard」는 차이를 보인 뒤 다음 낱말을 이름으로 받아 현재로 한다', async () => {
    const h = makeScriptApp();
    registerDashCommands(h.app);
    expect(h.doc.header.get('$DIMSTYLE')).toBe('ISO-25');
    expect(await h.script('-DIMSTYLE R ~Standard Standard\n')).toBe('idle');
    expect(h.out()).toContain('"Standard"과(와) 현재 설정의 차이:');
    expect(h.doc.header.get('$DIMSTYLE')).toBe('Standard');
  });

  it('~ 뒤 복원한 현재 치수 스타일을 DWG(AC1018·AC1032)·DXF에 쓰고 읽어도 같다', async () => {
    const h = harness();
    await h.run('-DIMSTYLE', ['R', '~ISO-25', 'Arch']);
    const doc = createNewDocument('metric');
    doc.dimStyles.set('ARCH', { ...doc.dimStyles.get('ISO-25')!, name: 'Arch', handle: '' });
    doc.header.set('$DIMSTYLE', cur(h)!);
    for (const version of ['AC1018', 'AC1032'] as const) {
      expect([version, readDwg(writeDwg(doc, { version }).data).header.get('$DIMSTYLE')]).toEqual([version, 'Arch']);
    }
    expect(readDxf(writeDxf(doc).data).header.get('$DIMSTYLE')).toBe('Arch');
  });

  it('전과 같은 값: 이름은 곧바로 현재로 하고 끝, 변수(V)의 ~이름은 차이를 보인 뒤 끝', async () => {
    const h = harness();
    await h.run('-DIMSTYLE', ['R', 'ISO-25']);
    expect(cur(h)).toBe('ISO-25');
    expect(h.prompts.filter((p) => p === NAME_PROMPT)).toHaveLength(1);
    const depth = h.st.session.depth;
    await h.run('-DIMSTYLE', ['V', '~Arch']);
    expect(h.printed).toContain('"Arch"과(와) 현재 설정의 차이:');
    expect(h.prompts.filter((p) => p === NAME_PROMPT)).toHaveLength(2);
    expect(cur(h)).toBe('ISO-25');
    expect(h.st.session.depth).toBe(depth);
  });
});
