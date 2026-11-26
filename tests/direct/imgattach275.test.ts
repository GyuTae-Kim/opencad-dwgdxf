// @vitest-environment jsdom
/**
 * IMAGEATTACH·PASTESPEC(그림 붙여넣기)이 깨진 그림 파일을 「이 브라우저가 읽을 수 없는 이미지 형식」으로 알리던 것(275차 — 274차 보고 (1)).
 * 두 명령이 함께 쓰는 attachImageFile은 잇기 전에 그림을 한 번 풀어 크기를 읽고, 실패하면 파일 이름·형식을 보지 않고
 * 「{이름}: 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).」을 적었다 — 깨진 PNG에도 「PNG만 된다」는 뜻의 글이 떴다.
 * 이제 받는 형식(IMAGE_EXT — 그림 연결 함수와 같은 이름 기준)인데 풀지 못한 파일은 274차 참조 관리자·휴대폰 보기와 같은 오류 줄
 * 「{이름}: 이미지를 연결하지 못했습니다.」(네 언어 사전에 있는 글 — 새 글 없음), 받지 않는 형식(TIFF·SVG 등)은 지금 글 그대로다.
 * PASTESPEC은 파일 이름의 확장자를 클립보드 형식(file.type)에서 짓는다(image/png → .png) — 이름으로 가른 것이 형식으로 가른 것과 같다.
 * 진짜 App·IMAGEATTACH·PASTESPEC·attachImageFile·그림 연결 함수(jsdom), 화면·명령행·엔진·글꼴·그림 풀기·파일 고르기·시스템 클립보드는 가짜
 * (refmgr274·attach-field-elev210 꼴)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE } from '../../src/core/model';
import { registerBlkMiscCommands } from '../../src/app/blkcmds-misc';
import { registerBlkXrefCommands } from '../../src/app/blkcmds-xref';
import { makeApp, settle } from '../polish/real-app';

/** 다음 파일 고르기가 돌려줄 파일 */
const picked = vi.hoisted(() => ({ file: null as File | null }));

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/blkcmds-io', async (orig) => ({ ...(await orig<object>()), pickOneFile: async () => picked.file }));

/** 그림 풀기: 4×4 그림. bad면 풀지 못함, failFrom번째 풀기부터 실패(풀기는 되고 연결 함수의 두 번째 풀기만 실패하는 꼴) */
const decode = { bad: false, calls: 0, failFrom: Infinity };
/** 시스템 클립보드에 든 그림의 형식 */
const clip = { type: 'image/png' };

beforeAll(() => {
  vi.stubGlobal('createImageBitmap', async () => {
    decode.calls++;
    if (decode.bad || decode.calls >= decode.failFrom) throw new Error('bad image');
    return { width: 4, height: 4, close() {} };
  });
  // jsdom에는 비동기 클립보드가 없다: 그림 하나(clip.type)만 든 클립보드
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { read: async () => [{ types: [clip.type], getType: async (t: string) => new Blob([new Uint8Array([1, 2, 3, 4])], { type: t }) }] },
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});
beforeEach(() => {
  decode.bad = false;
  decode.calls = 0;
  decode.failFrom = Infinity;
  clip.type = 'image/png';
  picked.file = null;
});
afterEach(() => document.body.replaceChildren());

const file = (name: string) => ({ name, size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }) as unknown as File;
/** 명령행은 도면 글 표시(ft)를 빼고 모은다 — 두 글 모두 네 언어 사전에 있는 열쇠 그대로 */
const FORMAT = (name: string) => ({ text: `${name}: 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).`, cls: 'err' });
const FAIL = (name: string) => ({ text: `${name}: 이미지를 연결하지 못했습니다.`, cls: 'err' });
const CMD = (name: string) => ({ text: `명령: ${name}`, cls: undefined });

function setup() {
  const h = makeApp();
  registerBlkXrefCommands(h.app);
  registerBlkMiscCommands(h.app);
  // 그림 연결 함수가 읽는 화면 그리기 틀(최대 질감 크기·그림 올리기)과 엔진
  (h.view as unknown as { renderer: unknown }).renderer = { gl: { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => 4096 }, setImage() {} };
  Object.assign(h.app.engine, { images() {} });
  /** IMAGEATTACH로 f를 고른다 — 그 뒤 명령행 줄 */
  const imageattach = async (f: File) => {
    picked.file = f;
    const from = h.cmd.lines.length;
    void h.app.run('IMAGEATTACH');
    await settle();
    return h.cmd.lines.slice(from);
  };
  /** PASTESPEC 「선택하여 붙여넣기」 상자를 기본값(이미지 개체 — 시스템 클립보드 그림)으로 확인한다 — 그 뒤 명령행 줄 */
  const pastespec = async () => {
    const from = h.cmd.lines.length;
    void h.app.run('PASTESPEC');
    await vi.waitFor(() => expect(document.querySelector('.dialog footer .btn.primary')).not.toBeNull());
    (document.querySelector('.dialog footer .btn.primary') as HTMLButtonElement).click();
    await settle();
    return h.cmd.lines.slice(from);
  };
  const images = () => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'IMAGE').length;
  return { ...h, imageattach, pastespec, images };
}

describe('IMAGEATTACH·PASTESPEC — 깨진 그림과 받지 않는 형식(275차)', () => {
  it.each([
    // 전에는 둘 다 형식 글 「…: 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).」
    ['site.png', FAIL],
    ['PHOTO.JPG', FAIL],
    // 받지 않는 형식(고르기 창의 「모든 파일」·FILEDIA 0 이름 찾기로 닿음)은 그대로
    ['scan.tif', FORMAT],
    ['logo.svg', FORMAT],
  ] as const)('IMAGEATTACH: 풀지 못한 %s', async (name, line) => {
    const h = setup();
    decode.bad = true;
    expect(await h.imageattach(file(name))).toEqual([CMD('IMAGEATTACH'), line(name)]);
    expect([h.images(), h.app.imageKeys.size]).toEqual([0, 0]);
  });

  it('IMAGEATTACH: 풀기는 되고 잇기(연결 함수의 풀기)가 실패하면 연결 실패 줄 한 번 — 그대로(같은 글이 두 번 나오지 않는다)', async () => {
    const h = setup();
    decode.failFrom = 2;
    expect(await h.imageattach(file('site.png'))).toEqual([CMD('IMAGEATTACH'), FAIL('site.png')]);
    expect(decode.calls).toBe(2);
    expect(h.images()).toBe(0);
  });

  it('PASTESPEC: 클립보드의 깨진 PNG는 연결 실패 줄(형식 글이 아님), 「그림은 파일 …(으)로 연결했습니다」 참고 줄 없음', async () => {
    const h = setup();
    decode.bad = true;
    const lines = await h.pastespec();
    // 전에는 둘째 줄이 「t_붙여넣기_{시각}.png: 이 브라우저가 읽을 수 없는 이미지 형식입니다(…)」
    expect(lines.map((l) => l.cls)).toEqual([undefined, 'err']);
    expect(lines[0]).toEqual(CMD('PASTESPEC'));
    expect(lines[1]!.text).toMatch(/^t_붙여넣기_\d{8}_\d{6}\.png: 이미지를 연결하지 못했습니다\.$/);
    expect(h.images()).toBe(0);
  });

  it('PASTESPEC: 클립보드 형식이 받지 않는 것(image/tiff → .tiff)이면 형식 글 그대로', async () => {
    const h = setup();
    clip.type = 'image/tiff';
    decode.bad = true;
    const lines = await h.pastespec();
    expect(lines.map((l) => l.cls)).toEqual([undefined, 'err']);
    expect(lines[1]!.text).toMatch(/^t_붙여넣기_\d{8}_\d{6}\.tiff: 이 브라우저가 읽을 수 없는 이미지 형식입니다\(PNG·JPEG·GIF·BMP·WebP만\)\.$/);
    expect(h.images()).toBe(0);
  });
});
