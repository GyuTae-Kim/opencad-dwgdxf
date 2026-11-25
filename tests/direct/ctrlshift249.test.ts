// @vitest-environment jsdom
/**
 * 키 바로 가기 Ctrl+Shift+C·Ctrl+Shift+V(249차 — 247차 보고 (8)): AutoCAD처럼 Ctrl+Shift+C = 기준점을 사용하여 복사(COPYBASE),
 * Ctrl+Shift+V = 블록으로 붙여넣기(PASTEBLOCK). 오른쪽 클릭 메뉴가 두 키를 적어 두었는데, 키 처리의 두 갈래가 Shift를 거르는
 * Ctrl+C·X·V 갈래 안에 있어 어느 화면(데스크톱 포함)에서도 닿지 않았다(앱은 아무것도 하지 않고 브라우저 기본 동작으로 넘어갔다).
 * - 조건은 Ctrl+C·Ctrl+V와 같다: 복사는 고른 객체가 있을 때(보기 모드도), 붙여넣기는 보기 모드가 아닐 때, 글 칸에서는 그 칸의 키.
 * - Ctrl+C·X·V(Shift 없음)와 다른 Shift 조합(Ctrl+Shift+Z·L·X)은 그대로. F1 도움말 조작 표에 두 줄(메뉴와 같은 글 — 네 언어 사전).
 * 진짜 App, 화면·명령행·엔진·글꼴은 가짜(viewmode248.test.ts와 같은 틀). 명령은 이름만 적는 가짜.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

/** 선 하나(도면층 0)와 이름만 적는 가짜 명령, 도면(또는 target)에서 누른 키 */
function setup() {
  const h = makeApp();
  const e = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
  e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  h.st.session.commit({ label: 'LINE', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
  const ran: string[] = [];
  for (const n of ['COPYCLIP', 'CUTCLIP', 'COPYBASE', 'PASTECLIP', 'PASTEBLOCK', 'REDO', 'LAYERSTATE']) h.app.register({ name: n, title: n, run: () => void ran.push(n) });
  const onKey = (h.app as unknown as { onKey(ev: KeyboardEvent): void }).onKey.bind(h.app);
  /** Ctrl(meta면 ⌘)+키를 누른다. 기본 동작을 막았는지 돌려준다 */
  const press = async (key: string, o: { shift?: boolean; meta?: boolean; target?: EventTarget | null } = {}) => {
    let prevented = false;
    onKey({
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: !o.meta,
      metaKey: !!o.meta,
      shiftKey: !!o.shift,
      altKey: false,
      target: o.target ?? null,
      defaultPrevented: false,
      preventDefault() {
        prevented = true;
      },
    } as unknown as KeyboardEvent);
    await settle();
    return prevented;
  };
  return { ...h, line: e.handle, ran, press };
}

describe('Ctrl+Shift+C·Ctrl+Shift+V(249차 — 247차 보고 (8))', () => {
  it('편집 화면: Ctrl+Shift+C는 COPYBASE, Ctrl+Shift+V는 PASTEBLOCK(맥 ⌘도), Ctrl+C·X·V와 다른 Shift 조합은 그대로', async () => {
    const h = setup();
    h.app.setSelection([h.line], 'replace');
    const prevented = [
      await h.press('C', { shift: true }),
      await h.press('V', { shift: true }),
      await h.press('c', { shift: true, meta: true }),
      await h.press('v', { shift: true, meta: true }),
      // 그대로인 갈래
      await h.press('c'),
      await h.press('x'),
      await h.press('v'),
      await h.press('Z', { shift: true }),
      await h.press('L', { shift: true }),
      await h.press('X', { shift: true }),
    ];
    expect(h.ran).toEqual(['COPYBASE', 'PASTEBLOCK', 'COPYBASE', 'PASTEBLOCK', 'COPYCLIP', 'CUTCLIP', 'PASTECLIP', 'REDO', 'LAYERSTATE']);
    // Ctrl+Shift+X는 AutoCAD 단축키가 아니다: 앱은 아무것도 하지 않고 기본 동작도 막지 않는다
    expect(prevented).toEqual([true, true, true, true, true, true, true, true, true, false]);
  });

  it('고른 객체 없음·글 칸: Ctrl+Shift+C는 Ctrl+C처럼 고른 객체가 있을 때만, Ctrl+Shift+V는 Ctrl+V처럼 선택 없이도, 글 칸에서는 둘 다 그 칸의 키(막지 않음)', async () => {
    const h = setup();
    const none = [await h.press('C', { shift: true }), await h.press('c'), await h.press('V', { shift: true })];
    h.app.setSelection([h.line], 'replace');
    const input = document.createElement('input');
    document.body.append(input);
    const typing = [
      await h.press('C', { shift: true, target: input }),
      await h.press('V', { shift: true, target: input }),
      await h.press('c', { target: input }),
      await h.press('v', { target: input }),
    ];
    input.remove();
    expect(h.ran).toEqual(['PASTEBLOCK']);
    expect([...none, ...typing]).toEqual([false, false, true, false, false, false, false]);
  });

  it('보기 모드: Ctrl+Shift+C는 복사라 Ctrl+C처럼 되고, Ctrl+Shift+V는 붙여넣기라 Ctrl+V처럼 아무것도 하지 않는다(편집 화면으로 돌아오면 다시 됨)', async () => {
    const h = setup();
    h.app.setSelection([h.line], 'replace');
    h.app.setViewOnly(true);
    const prevented = [await h.press('C', { shift: true }), await h.press('V', { shift: true }), await h.press('c'), await h.press('v')];
    expect(h.ran).toEqual(['COPYBASE', 'COPYCLIP']);
    expect(prevented).toEqual([true, false, true, false]);
    h.app.setViewOnly(false);
    expect(await h.press('V', { shift: true })).toBe(true);
    expect(h.ran).toEqual(['COPYBASE', 'COPYCLIP', 'PASTEBLOCK']);
  });
});

describe('단축키 표(249차)', () => {
  it('F1 도움말 조작 표에 두 줄 — 오른쪽 클릭 메뉴와 같은 키·글이고 네 언어 사전에 있다', () => {
    const editor = readFileSync('src/editor.ts', 'utf8');
    const menu = readFileSync('src/app/ctxmenu.ts', 'utf8');
    const rows: [string, string, string][] = [
      ['Ctrl+Shift+C', '기준점을 사용하여 복사', 'COPYBASE'],
      ['Ctrl+Shift+V', '블록으로 붙여넣기', 'PASTEBLOCK'],
    ];
    for (const [key, label, cmd] of rows) {
      expect(editor).toContain(`['${key}', '${label}']`);
      expect(menu).toContain(`'${label}', '${cmd}', { kbd: '${key}'`);
      for (const lang of ['en', 'de', 'ja', 'zh-CN']) {
        const t = translate(label, lang);
        expect(t, lang).not.toBe(label);
        expect(t, lang).not.toMatch(/[가-힣]/);
      }
    }
  });
});
