// @vitest-environment jsdom
/**
 * 데스크톱 참조 관리자(EXTERNALREFERENCES — XR 「파일 고르기…」)가 깨진 그림 파일을 「이 브라우저가 읽을 수 없는 이미지 형식」으로 알리던 것(274차 — 273차 보고 (2)).
 * 그림 연결 함수(linkImageFiles)가 돌려주던 unsupported에는 두 갈래가 섞였다 — TIFF·JP2·ECW·MrSID처럼 이 브라우저가 풀지 못해 **풀어 보지 않은** 파일과,
 * PNG 등 받는 확장자인데 풀어 보다 실패한 파일(깨진·잘린 파일). 참조 관리자는 둘을 한 참고 줄 「참고: …은(는) 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).」로
 * 적어, 깨진 PNG에 「PNG만 된다」는 글이 떴다. 이제 연결 함수가 뒤쪽을 failed로 따로 돌려주고, 참조 관리자는 그 파일마다 휴대폰 보기(272차)·IMAGEATTACH의 연결 실패와 같은
 * 오류 줄 「{이름}: 이미지를 연결하지 못했습니다.」를 적는다(네 언어 사전에 있는 글 — 새 글 없음). TIFF 등의 참고 줄은 그대로.
 * 진짜 App·참조 관리자 대화 상자·연결 함수(jsdom), 화면·명령행·엔진·글꼴·그림 풀기·파일 고르기 창은 가짜(viewedit250·viewref273 꼴)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, ImageDefObject } from '../../src/core/model';
import { ft, unmark } from '../../src/app/filetext';
import { linkImageFiles, registerRefCommands } from '../../src/app/refs';
import { toast } from '../../src/app/ui/dom';
import { catalogs, translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

/** 이번 파일 고르기 창이 돌려줄 파일과, 풀지 못하는(깨진) 그림 이름 */
const next = { files: [] as File[], bad: new Set<string>() };

beforeAll(() => {
  // jsdom에는 그림 풀기가 없다: 4×4 그림, bad는 풀지 못함(TIFF 등은 연결 함수가 풀어 보지도 않는다)
  vi.stubGlobal('createImageBitmap', async (f: { name: string }) => {
    if (next.bad.has(f.name)) throw new Error('bad image');
    return { width: 4, height: 4, close() {} };
  });
  // 파일 고르기 창: 열리자마자 사용자가 next.files를 고른 것처럼(change)
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, 'files', { value: next.files, configurable: true });
    this.dispatchEvent(new Event('change'));
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.mocked(toast).mockClear();
  next.files = [];
  next.bad.clear();
});
afterEach(() => document.body.replaceChildren());

const file = (name: string) => ({ name, size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }) as unknown as File;
/** 형식 참고 줄(사전 열쇠 그대로)·그림 연결 실패 줄(휴대폰 보기·IMAGEATTACH와 같은 글) — 명령행은 도면 글 표시(ft)를 빼고 모은다 */
const NOTE_KEY = '참고: {0}은(는) 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).';
const FAIL_KEY = '{0}: 이미지를 연결하지 못했습니다.';
const NOTE = (...names: string[]) => ({ text: NOTE_KEY.replace('{0}', names.join(', ')), cls: undefined });
const FAIL = (name: string) => ({ text: FAIL_KEY.replace('{0}', name), cls: 'err' });
const LINKED = (name: string) => ({ text: `파일 1개를 연결했습니다: ${name}`, cls: undefined });

/** 도면이 이미지 site.png·logo.png·scan.tif(TIFF — 이 브라우저가 풀지 못함)를 쓴다 */
function prep(doc: CadDocument): void {
  const def = (handle: string, name: string) => ({ type: 'IMAGEDEF', handle, fileName: `C:\\도면\\${name}`, imageSize: { x: 4, y: 4 }, pixelSize: { x: 1, y: 1 }, loaded: true, resolutionUnits: 0 }) as ImageDefObject;
  doc.objects.set('E1', def('E1', 'site.png'));
  doc.objects.set('E2', def('E2', 'logo.png'));
  doc.objects.set('E3', def('E3', 'scan.tif'));
}

function setup() {
  const h = makeApp(prep);
  registerRefCommands(h.app);
  (h.view as unknown as { renderer: unknown }).renderer = { gl: { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => 4096 }, setImage() {} };
  Object.assign(h.app.engine, { images() {} });
  /** 참조 관리자를 열고 「파일 고르기…」로 files를 고른다 — 그 뒤 명령행 줄 */
  const pick = async (...files: File[]) => {
    void h.app.run('XR');
    await settle();
    next.files = files;
    const from = h.cmd.lines.length;
    [...document.querySelectorAll<HTMLButtonElement>('.dialog footer button')].find((b) => b.textContent === '파일 고르기…')!.click();
    await settle();
    return h.cmd.lines.slice(from);
  };
  return { ...h, pick };
}
const calls = () => vi.mocked(toast).mock.calls;

describe('데스크톱 참조 관리자 — 깨진 그림과 풀지 못하는 형식(274차)', () => {
  it('깨진 PNG + 열리는 PNG: 깨진 것은 연결 실패 오류 줄(형식 참고 줄이 아님)', async () => {
    const h = setup();
    next.bad.add('site.png');
    const lines = await h.pick(file('site.png'), file('logo.png'));
    // 전에는 둘째 줄이 보통 줄 「참고: site.png은(는) 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).」
    expect(lines).toEqual([LINKED('logo.png'), FAIL('site.png')]);
    expect(calls()).toEqual([['외부 파일 1개를 연결했습니다.', 'info', 3000]]);
    expect([h.app.imageKeys.has('logo.png'), h.app.imageKeys.has('site.png')]).toEqual([true, false]);
  });

  it('깨진 PNG만: 연결 실패 오류 줄(요약 줄은 지금 그대로 — 274차에 보고 두 것)', async () => {
    const h = setup();
    next.bad.add('site.png');
    const lines = await h.pick(file('site.png'));
    // 전에는 [찾는 이름 없음 오류, 형식 참고 보통 줄]
    expect(lines).toEqual([{ text: '이 도면이 찾는 이름의 파일이 없습니다.', cls: 'err' }, FAIL('site.png')]);
    expect(calls()).toEqual([]);
  });

  it('TIFF + 열리는 PNG: 형식 참고 줄 그대로', async () => {
    const h = setup();
    const lines = await h.pick(file('scan.tif'), file('logo.png'));
    expect(lines).toEqual([LINKED('logo.png'), NOTE('scan.tif')]);
  });

  it('TIFF + 깨진 PNG + 열리는 PNG: 깨진 것은 오류 줄, TIFF만 형식 참고 줄 — 서로 겹치지 않는다', async () => {
    const h = setup();
    next.bad.add('site.png');
    const lines = await h.pick(file('scan.tif'), file('site.png'), file('logo.png'));
    // 전에는 [요약, 「참고: scan.tif, site.png은(는) … 이미지 형식입니다(…)」]
    expect(lines).toEqual([LINKED('logo.png'), FAIL('site.png'), NOTE('scan.tif')]);
  });

  it('연결 함수는 풀어 보지 않은 형식(unsupported)과 풀다 실패한 파일(failed)을 나눠 돌려준다', async () => {
    const h = setup();
    next.bad.add('site.png');
    const r = await linkImageFiles(h.app, [file('scan.tif'), file('site.png'), file('logo.png'), file('notes.txt')]);
    // 전에는 { linked: ['logo.png'], unsupported: ['scan.tif', 'site.png'] }
    expect(r).toEqual({ linked: ['logo.png'], unsupported: ['scan.tif'], failed: ['site.png'] });
  });

  it('연결 실패 글은 네 언어 사전의 기존 글(새 글 없음 — 파일 이름은 그대로 끼운다)', () => {
    expect((['en', 'de', 'ja', 'zh-CN'] as const).map((l) => typeof catalogs[l]?.[FAIL_KEY])).toEqual(['string', 'string', 'string', 'string']);
    expect(translate(FAIL_KEY.replace('{0}', ft('site.png')), 'en')).toBe(`${ft('site.png')}: Failed to link image.`);
    expect(unmark(FAIL_KEY.replace('{0}', ft('site.png')))).toBe(FAIL('site.png').text);
  });
});
