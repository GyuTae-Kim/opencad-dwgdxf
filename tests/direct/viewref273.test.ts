/**
 * 휴대폰 보기 「참조 파일 고르기」가 이 브라우저가 풀지 못하는 그림 형식(TIFF·JP2·ECW·MrSID)을 알리는 것(273차 — 272차 보고 (1)·(2)).
 * 그 형식 파일은 연결 함수가 풀어 보지 않고 unsupported로 돌려준다(풀어 보다 실패한 PNG 등 — 272차 「이미지를 연결하지 못했습니다」 — 와 겹치지 않음).
 * 데스크톱 참조 관리자와 같은 글 「참고: …은(는) 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).」을 명령행 보통 줄(데스크톱과 같은 종류)로 적고,
 * 보기 모드는 명령행이 숨으므로 경고 알림으로 보인다 — 그 형식만 골랐으면 형식 없음 글 대신, 다른 파일과 섞였으면 「연결했습니다」·오류 알림과 따로.
 * 전에는 그 형식만 고르면 「연결할 수 있는 파일이 없습니다(…이미지…)」, 섞이면 아무 말 없이 빠졌다.
 * 16 MB 넘는 SHX(읽지 않고 빠짐)도 형식 없음 글 대신 SHX 실패로 센다(272차 보고 (2) — 깨진 SHX와 같은 기존 글).
 * 진짜 App·MobileView·참조 연결 함수(jsdom), 화면·명령행·엔진·글꼴·PDF 읽기·파일 고르기 창은 가짜(viewref272.test.ts 꼴)
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, ImageDefObject, UnderlayDefObject } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { ft, unmark } from '../../src/app/filetext';
import { MobileView } from '../../src/app/ui/mobileview';
import { toast } from '../../src/app/ui/dom';
import { catalogs, translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));
vi.mock('../../src/app/pdfraster', () => ({
  openPdf: async () => {
    throw new Error('암호가 걸린 PDF');
  },
  rasterPage: async () => null,
}));

/** 이번 파일 고르기 창이 돌려줄 파일과, 풀지 못하는 그림 이름 */
const next = { files: [] as File[], badImages: new Set<string>() };

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  // jsdom에는 그림 풀기가 없다: 4×4 그림, badImages는 풀지 못함(TIFF 등은 연결 함수가 풀어 보지도 않는다)
  vi.stubGlobal('createImageBitmap', async (f: { name: string }) => {
    if (next.badImages.has(f.name)) throw new Error('bad image');
    return { width: 4, height: 4, close() {} };
  });
  vi.spyOn(dom.window.HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, 'files', { value: next.files, configurable: true });
    this.dispatchEvent(new dom.window.Event('change'));
  });
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  dom.window.close();
});
beforeEach(() => {
  vi.mocked(toast).mockClear();
  next.files = [];
  next.badImages.clear();
});

const file = (name: string, bytes = new Uint8Array([1, 2, 3, 4]), size = bytes.length) => ({ name, size, arrayBuffer: async () => bytes.slice().buffer }) as unknown as File;
const NO_FORMAT = '연결할 수 있는 파일이 없습니다(DWG·DXF·이미지·PDF·SHX).';
const XREF_ERR = `${ft('base.dwg')}: 외부 참조를 열지 못했습니다(손상된 파일).`;
const SHX_ERR = 'SHX 글꼴로 읽을 수 있는 파일이 없습니다.';
/** 데스크톱 참조 관리자의 참고 줄(사전 열쇠 그대로 — 새 글 없음) */
const NOTE_KEY = '참고: {0}은(는) 이 브라우저가 읽을 수 없는 이미지 형식입니다(PNG·JPEG·GIF·BMP·WebP만).';
const NOTE = (...names: string[]) => NOTE_KEY.replace('{0}', names.map(ft).join(', '));

/** 도면이 외부 참조 base.dwg·이미지 site.png·PDF Plan.PDF(1쪽)·SHX romans.shx를 쓴다(viewref272와 같음) */
function prep(doc: CadDocument): void {
  doc.objects.set('E1', { type: 'IMAGEDEF', handle: 'E1', fileName: 'C:\\도면\\site.png', imageSize: { x: 4, y: 4 }, pixelSize: { x: 1, y: 1 }, loaded: true, resolutionUnits: 0 } as ImageDefObject);
  doc.objects.set('E2', { type: 'PDFDEFINITION', handle: 'E2', fileName: 'C:\\도면\\Plan.PDF', name: '1' } as UnderlayDefObject);
  doc.blocks.set(tableKey('BASE'), { name: 'BASE', handle: 'E3', recordHandle: 'E4', basePoint: { x: 0, y: 0, z: 0 }, flags: 4, xrefPath: 'C:\\도면\\base.dwg', entities: [] });
  doc.textStyles.set('ROMANS', { name: 'ROMANS', handle: 'E5', flags: 0, height: 0, widthFactor: 1, oblique: 0, generation: 0, lastHeight: 2.5, font: 'romans.shx', bigFont: '' });
}

function setup() {
  const h = makeApp(prep);
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  // 외부 참조 열기는 늘 실패(깨진 DWG)
  (h.view as unknown as { renderer: unknown }).renderer = { gl: { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => 4096 }, setImage() {} };
  Object.assign(h.app.engine, {
    open: async () => {
      throw new Error('손상된 파일');
    },
    images() {},
  });
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  mv.apply(true);
  const pick = async (...files: File[]) => {
    next.files = files;
    await (mv as unknown as { pickRefFiles(): Promise<void> }).pickRefFiles();
    await settle();
  };
  /** 명령행의 형식 참고 줄(가짜 명령행도 진짜처럼 도면 글 표시를 빼고 모은다) */
  const notes = () => h.cmd.lines.filter((l) => l.text.includes('읽을 수 없는 이미지 형식'));
  return { ...h, mv, pick, notes };
}
const calls = () => vi.mocked(toast).mock.calls;

describe('참조 파일 고르기 — 풀지 못하는 그림 형식(273차)', () => {
  it('TIFF만 고르면 형식 없음 글 대신 데스크톱과 같은 참고 글(경고 알림), 명령행에는 보통 줄', async () => {
    const h = setup();
    await settle();
    await h.pick(file('scan.tif'));
    // 전에는 [「연결할 수 있는 파일이 없습니다(…이미지…)」, 'warn']
    expect(calls()).toEqual([[NOTE('scan.tif'), 'warn']]);
    expect(h.notes()).toEqual([{ text: unmark(NOTE('scan.tif')), cls: undefined }]);
  });

  it('그 형식 파일이 여럿이면 데스크톱처럼 넷까지 적는다(tif·jp2·ecw·sid·tiff)', async () => {
    const h = setup();
    await settle();
    await h.pick(file('scan.tif'), file('site.jp2'), file('map.ecw'), file('aerial.sid'), file('old.tiff'));
    expect(calls()).toEqual([[NOTE('scan.tif', 'site.jp2', 'map.ecw', 'aerial.sid'), 'warn']]);
  });

  it('TIFF+PNG: 「연결했습니다」와 따로 참고 알림', async () => {
    const h = setup();
    await settle();
    await h.pick(file('scan.tif'), file('site.png'));
    // 전에는 [「파일 1개를 연결했습니다.」, 'info'] 하나(TIFF는 말없이 빠짐)
    expect(calls()).toEqual([
      ['파일 1개를 연결했습니다.', 'info'],
      [NOTE('scan.tif'), 'warn'],
    ]);
    expect([h.app.imageKeys.has('site.png'), h.app.imageKeys.has('scan.tif')]).toEqual([true, false]);
  });

  it('TIFF+깨진 PNG: PNG는 그 오류 알림, TIFF는 참고 알림 — 서로 겹치지 않는다', async () => {
    const h = setup();
    await settle();
    next.badImages.add('site.png');
    await h.pick(file('scan.tif'), file('site.png'));
    // 전에는 PNG 오류 알림 하나
    expect(calls()).toEqual([
      [`${ft('site.png')}: 이미지를 연결하지 못했습니다.`, 'error', 9000],
      [NOTE('scan.tif'), 'warn'],
    ]);
  });

  it('JP2+DWG(열지 못함): 외부 참조 오류 알림과 따로 참고 알림', async () => {
    const h = setup();
    await settle();
    await h.pick(file('site.jp2'), file('base.dwg'));
    // 전에는 외부 참조 오류 알림 하나
    expect(calls()).toEqual([
      [XREF_ERR, 'error', 9000],
      [NOTE('site.jp2'), 'warn'],
    ]);
  });

  it('PNG만은 그대로 — 참고 알림·줄 없음', async () => {
    const h = setup();
    await settle();
    await h.pick(file('site.png'));
    expect(calls()).toEqual([['파일 1개를 연결했습니다.', 'info']]);
    expect(h.notes()).toEqual([]);
  });

  it('16 MB 넘는 SHX만 고르면 형식 없음 글 대신 SHX 실패(272차 보고 (2))', async () => {
    const h = setup();
    await settle();
    await h.pick(file('romans.shx', undefined, 17 * 1024 * 1024));
    // 전에는 [「연결할 수 있는 파일이 없습니다(…SHX)」, 'warn'](읽지 않고 빠진 SHX를 형식 없음으로 셈)
    expect(calls()).toEqual([[SHX_ERR, 'error', 9000]]);
    expect(calls().flat()).not.toContain(NO_FORMAT);
  });

  it('16 MB 넘는 SHX+PNG: SHX 실패 알림, 열지 못한 수에 든다', async () => {
    const h = setup();
    await settle();
    await h.pick(file('romans.shx', undefined, 17 * 1024 * 1024), file('site.png'));
    // 전에는 [「파일 1개를 연결했습니다.」, 'info'] 하나
    expect(calls()).toEqual([
      [SHX_ERR, 'error', 9000],
      ['파일 1개를 연결했습니다(1개는 열지 못했습니다).', 'info'],
    ]);
  });

  it('참고 글은 네 언어 사전의 기존 글(새 글 없음 — 파일 이름은 그대로 끼운다)', () => {
    expect((['en', 'de', 'ja', 'zh-CN'] as const).map((l) => typeof catalogs[l]?.[NOTE_KEY])).toEqual(['string', 'string', 'string', 'string']);
    expect(translate(NOTE('scan.tif'), 'en')).toBe(`Note: ${ft('scan.tif')} is an image format that this browser cannot read (only PNG, JPEG, GIF, BMP, and WebP are supported).`);
  });
});
