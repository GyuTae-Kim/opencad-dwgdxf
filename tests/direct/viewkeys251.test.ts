// @vitest-environment jsdom
/**
 * 휴대폰 보기 모드의 마지막 키 셋(251차 — 250차 보고 (1), 247차 보고 (7)·(1)): 보기 모드는 보기·치수 확인 화면이라 도면을 고치지 않는데
 * (README 휴대폰 보기 절, 245~250차), 키보드가 붙은 태블릿에서 다음 키는 보기 모드에서도 도면을 고치거나 편집 화면에 글을 남겼다.
 * - F5·Ctrl+E(등각평면 돌리기): *Active VPORT의 SNAPISOPAIR(파일에 저장되는 제도 설정)를 바꾸고 도면을 고친 것으로 표시했다(명령 취소 단계 없음).
 *   보기 모드는 바꾸지 않는다 — F5는 연 도면을 잃지 않게 새로 고침만 편집 화면처럼 막고, Ctrl+E는 아무것도 하지 않고 기본 동작도 막지 않는다(250차 Ctrl+K 꼴).
 *   앱 메모리·이 브라우저 값만 바꾸는 제도 보조 키(F3·F7·F8·F9·F12 등 — 재기에 쓰임)는 그대로.
 * - 글자: 숨은 명령행 입력란에 쌓여 편집 화면으로 바꾸면 명령행에 남았다(보기 모드에서 x, 편집 화면에서 l → 「XL」). 보기 모드는 글자를 명령행으로 보내지 않는다.
 * - Ctrl+Z·Ctrl+Y·Ctrl+Shift+Z: 편집 화면에서 한 편집까지 되돌리고 다시 했다. 보기 모드는 보기 모드에서 한 단계(도면층 시트의 켜고 끄기 등)만 되돌리고 다시 한다.
 * 편집 화면은 그대로다. 진짜 App, 화면·명령행·엔진·글꼴은 가짜(viewedit250.test.ts와 같은 틀).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { patchLayers } from '../../src/app/layers';
import { isoState } from '../../src/app/viewtools-iso';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

/** 선 하나(편집 화면에서 그린 단계)를 둔 진짜 App, 명령 취소·다시 실행(draw.ts의 U·REDO처럼 세션을 되돌림)과 키 누르기 */
function setup() {
  const h = makeApp();
  const e = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
  e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  h.st.session.commit({ label: 'LINE', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
  h.st.session.markSaved();
  const ran: string[] = [];
  h.app.register({
    name: 'U',
    title: 'U',
    run: () => {
      ran.push('U');
      h.st.session.undo();
    },
  });
  h.app.register({
    name: 'REDO',
    title: 'REDO',
    run: () => {
      ran.push('REDO');
      h.st.session.redo();
    },
  });
  // 진짜 명령행처럼 도면에서 친 글자를 입력란 끝에 붙인다
  const typed: string[] = [];
  h.cmd.typeChar = ((ch: string) => {
    typed.push(ch);
    h.cmd.input.value += ch;
  }) as typeof h.cmd.typeChar;
  const onKey = (h.app as unknown as { onKey(ev: KeyboardEvent): void }).onKey.bind(h.app);
  /** 키를 누른다(도면 위 — 글 칸 아님). 기본 동작을 막았는지 돌려준다 */
  const key = async (k: string, o: { ctrl?: boolean; shift?: boolean } = {}) => {
    let prevented = false;
    onKey({
      key: k,
      code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
      ctrlKey: !!o.ctrl,
      metaKey: false,
      shiftKey: !!o.shift,
      altKey: false,
      target: null,
      defaultPrevented: false,
      preventDefault() {
        prevented = true;
      },
    } as unknown as KeyboardEvent);
    await settle();
    return prevented;
  };
  const hasLine = () => h.doc.blocks.get(MODEL_SPACE)!.entities.some((x) => x.handle === e.handle);
  const layer0Off = () => !!h.doc.layers.get('0')!.off;
  return { ...h, ran, typed, key, hasLine, layer0Off };
}

describe('F5·Ctrl+E 등각평면과 다른 제도 보조 키(251차 — 250차 보고 (1))', () => {
  it('편집 화면은 그대로: F5·Ctrl+E가 등각평면을 돌리고 도면을 고친 것으로 표시한다', async () => {
    const h = setup();
    const prevented = [await h.key('F5')];
    expect(isoState(h.st).pair).toBe(1);
    prevented.push(await h.key('e', { ctrl: true }));
    expect(isoState(h.st).pair).toBe(2);
    expect(prevented).toEqual([true, true]);
    expect(h.st.session.dirty).toBe(true);
    expect(h.out()).toEqual(expect.arrayContaining(['<등각평면 위>', '<등각평면 오른쪽>']));
  });

  it('보기 모드: F5·Ctrl+E는 등각평면을 바꾸지 않고(F5는 새로 고침만 막음) 다른 제도 보조 키는 그대로, 편집 화면으로 돌아오면 다시 된다', async () => {
    const h = setup();
    h.app.setViewOnly(true);
    expect([await h.key('F5'), await h.key('e', { ctrl: true })]).toEqual([true, false]);
    expect(isoState(h.st).pair).toBe(0);
    expect(h.st.session.dirty).toBe(false);
    expect(h.engine.edits.some((x) => x.ops.some((o) => o.kind === 'vports'))).toBe(false);
    expect(h.out().filter((l) => l.startsWith('<등각평면'))).toEqual([]);
    // 앱 메모리·이 브라우저 값만 바꾸는 제도 보조 키(재기에 쓰임)는 그대로
    const before = { osnap: h.app.osnapOn, grid: h.app.gridOn, ortho: h.app.orthoOn, snap: h.app.snapOn, dyn: h.app.dynOn };
    expect(before).toEqual({ osnap: true, grid: false, ortho: false, snap: false, dyn: true });
    const prevented = [await h.key('F3'), await h.key('F7'), await h.key('F8'), await h.key('F9'), await h.key('F12')];
    expect(prevented).toEqual([true, true, true, true, true]);
    expect({ osnap: h.app.osnapOn, grid: h.app.gridOn, ortho: h.app.orthoOn, snap: h.app.snapOn, dyn: h.app.dynOn }).toEqual({ osnap: false, grid: true, ortho: true, snap: true, dyn: false });
    expect(h.st.session.dirty).toBe(false);
    h.app.setViewOnly(false);
    expect(await h.key('F5')).toBe(true);
    expect(isoState(h.st).pair).toBe(1);
  });
});

describe('숨은 명령행 글(251차 — 247차 보고 (7))', () => {
  it('보기 모드에서 친 글자는 명령행으로 가지 않아(기본 동작도 막지 않음) 편집 화면의 명령행에 남지 않는다', async () => {
    const h = setup();
    h.app.setViewOnly(true);
    expect(await h.key('x')).toBe(false);
    expect(h.typed).toEqual([]);
    expect(h.cmd.input.value).toBe('');
    // 편집 화면은 그대로: 도면에서 친 글자가 명령행으로(전에는 보기 모드의 x가 남아 「XL」 — 선 그리기 대신 XLINE 별칭)
    h.app.setViewOnly(false);
    expect(await h.key('l')).toBe(true);
    expect(h.typed).toEqual(['l']);
    expect(h.cmd.input.value).toBe('l');
  });
});

describe('Ctrl+Z·Ctrl+Y·Ctrl+Shift+Z(251차 — 247차 보고 (1))', () => {
  it('편집 화면은 그대로: 편집을 되돌리고 다시 한다', async () => {
    const h = setup();
    const prevented = [await h.key('z', { ctrl: true })];
    expect(h.hasLine()).toBe(false);
    prevented.push(await h.key('y', { ctrl: true }));
    expect(h.hasLine()).toBe(true);
    prevented.push(await h.key('Z', { ctrl: true, shift: true }));
    expect(h.ran).toEqual(['U', 'REDO', 'REDO']);
    expect(prevented).toEqual([true, true, true]);
  });

  it('보기 모드: 보기 모드에서 한 단계(도면층 켜고 끄기)만 되돌리고 다시 하며, 편집 화면에서 한 편집·되돌린 편집은 건드리지 않는다', async () => {
    const h = setup();
    h.app.setViewOnly(true);
    // 맨 위는 편집 화면에서 그린 선: 아무것도 하지 않고 기본 동작도 막지 않는다
    expect(await h.key('z', { ctrl: true })).toBe(false);
    expect(h.ran).toEqual([]);
    expect(h.hasLine()).toBe(true);
    // 보기 모드 도면층 시트의 켜고 끄기(명령 취소 한 단계)
    patchLayers(h.app, 'LAYER', [['0', { off: true }]]);
    expect(h.layer0Off()).toBe(true);
    expect(await h.key('z', { ctrl: true })).toBe(true);
    expect(h.layer0Off()).toBe(false);
    expect(await h.key('z', { ctrl: true })).toBe(false);
    expect(h.hasLine()).toBe(true);
    expect(await h.key('y', { ctrl: true })).toBe(true);
    expect(h.layer0Off()).toBe(true);
    expect(await h.key('Z', { ctrl: true, shift: true })).toBe(false);
    expect(h.ran).toEqual(['U', 'REDO']);
    // 편집 화면에서 둘 다 되돌린 뒤 보기 모드: 다시 실행 맨 위는 편집 화면에서 되돌린 선이라 다시 하지 않는다
    h.app.setViewOnly(false);
    await h.key('z', { ctrl: true });
    await h.key('z', { ctrl: true });
    expect([h.layer0Off(), h.hasLine()]).toEqual([false, false]);
    h.app.setViewOnly(true);
    expect([await h.key('y', { ctrl: true }), await h.key('Z', { ctrl: true, shift: true }), await h.key('z', { ctrl: true })]).toEqual([false, false, false]);
    expect(h.hasLine()).toBe(false);
    h.app.setViewOnly(false);
    await h.key('y', { ctrl: true });
    expect(h.hasLine()).toBe(true);
    expect(h.ran).toEqual(['U', 'REDO', 'U', 'U', 'REDO']);
  });
});
