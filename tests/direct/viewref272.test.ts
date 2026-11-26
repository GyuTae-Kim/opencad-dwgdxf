/**
 * 휴대폰 보기 「참조 파일 고르기」의 결과 알림(272차 — 270차 보고 (2)): 고른 파일의 경우마다 맞는 알림 하나.
 * ① 형식이 하나도 맞지 않으면 「연결할 수 있는 파일이 없습니다(…)」(그대로), ② 형식은 맞으나 열린 도면이 찾지 않는 이름뿐이면 「이 도면이 찾는 이름의 파일이 없습니다.」
 * (데스크톱 참조 관리자의 글 — 파일은 지금처럼 이어 둔다), ③ 모두 열지 못하면 형식 알림 없이 파일마다 오류 줄(보기 모드는 오류 알림 — 270차),
 * ④ 일부만 이으면 「파일 N개를 연결했습니다(M개는 열지 못했습니다).」, ⑤ 모두 이으면 「파일 N개를 연결했습니다.」(그대로).
 * 전에는 이은 수만 세어 ③에도 「연결할 수 있는 파일이 없습니다」가 함께 떴고, ②는 「연결했습니다」, 깨진 이미지·PDF·SHX는 아무 줄도 없었다.
 * 진짜 App·MobileView·참조 연결 함수(jsdom), 화면·명령행·엔진·글꼴·PDF 읽기·파일 고르기 창은 가짜(viewerr270.test.ts 꼴)
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, ImageDefObject, UnderlayDefObject } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { ft } from '../../src/app/filetext';
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
// 암호가 걸렸거나 손상된 PDF(읽기 모듈은 pdf.js — 시험에서는 늘 실패)
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
  // jsdom에는 그림 풀기가 없다: 4×4 그림, badImages는 풀지 못함
  vi.stubGlobal('createImageBitmap', async (f: { name: string }) => {
    if (next.badImages.has(f.name)) throw new Error('bad image');
    return { width: 4, height: 4, close() {} };
  });
  // 파일 고르기 창: 열리자마자 사용자가 next.files를 고른 것처럼(change)
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

const file = (name: string, bytes = new Uint8Array([1, 2, 3, 4])) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer }) as unknown as File;
const NO_FORMAT = '연결할 수 있는 파일이 없습니다(DWG·DXF·이미지·PDF·SHX).';
const NOT_NAMED = '이 도면이 찾는 이름의 파일이 없습니다.';
const XREF_ERR = `${ft('base.dwg')}: 외부 참조를 열지 못했습니다(손상된 파일).`;
const PARTIAL = '파일 {0}개를 연결했습니다({1}개는 열지 못했습니다).';

/** 도면이 외부 참조 base.dwg·이미지 site.png·PDF Plan.PDF(1쪽)·SHX romans.shx를 쓴다(경로는 이 기기에 없는 다른 컴퓨터 경로) */
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
  // 그림을 올릴 그래픽 문맥과 엔진: 외부 참조 열기는 늘 실패(깨진 DWG)
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
  /** 보기 모드 「참조 파일 고르기」(더 보기 메뉴·빠진 참조 안내 카드가 부르는 것)로 files를 고른다 */
  const pick = async (...files: File[]) => {
    next.files = files;
    await (mv as unknown as { pickRefFiles(): Promise<void> }).pickRefFiles();
    await settle();
  };
  return { ...h, mv, pick };
}
const calls = () => vi.mocked(toast).mock.calls;

describe('참조 파일 고르기의 결과 알림(272차)', () => {
  it('① 형식이 하나도 맞지 않으면 「연결할 수 있는 파일이 없습니다」 그대로', async () => {
    const h = setup();
    await settle();
    // TIFF 같은 풀지 못하는 그림 형식은 273차부터 이 글 대신 데스크톱과 같은 참고 글(viewref273.test.ts) — 여기는 연결 함수가 받지 않는 파일만
    await h.pick(file('notes.txt'), file('plan.zip'));
    expect(calls()).toEqual([[NO_FORMAT, 'warn']]);
  });

  it('② 형식은 맞으나 도면이 찾지 않는 이름뿐이면 「이 도면이 찾는 이름의 파일이 없습니다」 — 파일은 지금처럼 이어 둔다', async () => {
    const h = setup();
    await settle();
    await h.pick(file('other.png'), file('other.pdf'));
    // 전에는 [「파일 2개를 연결했습니다.」, 'info'](이 도면은 쓰지 않는 파일)
    expect(calls()).toEqual([[NOT_NAMED, 'warn']]);
    expect(h.app.imageKeys.has('other.png')).toBe(true);
  });

  it('③ 도면이 찾는 DWG를 열지 못하면 그 오류 알림만 — 형식 알림을 겹쳐 띄우지 않는다', async () => {
    const h = setup();
    await settle();
    await h.pick(file('base.dwg'));
    // 명령행은 도면 글 표시(ft)를 빼고 모은다(가짜 명령행도 진짜처럼) — 알림에는 표시를 둔 글
    expect(h.out()).toContain('base.dwg: 외부 참조를 열지 못했습니다(손상된 파일).');
    // 전에는 오류 알림 뒤에 [「연결할 수 있는 파일이 없습니다(…)」, 'warn']도 떴다
    expect(calls()).toEqual([[XREF_ERR, 'error', 9000]]);
  });

  it('③ 깨진 이미지·PDF(대문자 이름)·SHX도 파일마다 오류 알림, 형식 알림 없음', async () => {
    const h = setup();
    await settle();
    next.badImages.add('site.png');
    await h.pick(file('site.png'), file('Plan.PDF'), file('romans.shx'));
    // 전에는 [「파일 1개를 연결했습니다.」, 'info'] 하나 — PDF 읽기 실패를 이은 것으로 셌고(대문자 이름), 이미지·SHX는 줄이 없었다
    expect(calls()).toEqual([
      [`${ft('site.png')}: 이미지를 연결하지 못했습니다.`, 'error', 9000],
      [`참고: ${ft('Plan.PDF')}은(는) 읽을 수 없는 PDF입니다(암호가 걸렸거나 손상됨).`, 'error', 9000],
      ['SHX 글꼴로 읽을 수 있는 파일이 없습니다.', 'error', 9000],
    ]);
    expect(h.app.imageKeys.has('site.png')).toBe(false);
  });

  it('④ 일부만 이으면 「파일 N개를 연결했습니다(M개는 열지 못했습니다).」', async () => {
    const h = setup();
    await settle();
    await h.pick(file('site.png'), file('base.dwg'));
    // 전에는 [「파일 1개를 연결했습니다.」, 'info']
    expect(calls()).toEqual([
      [XREF_ERR, 'error', 9000],
      ['파일 1개를 연결했습니다(1개는 열지 못했습니다).', 'info'],
    ]);
    expect(h.app.imageKeys.has('site.png')).toBe(true);
  });

  it('⑤ 모두 이으면(도면이 찾는 이름이 하나라도 있으면) 「파일 N개를 연결했습니다.」 그대로', async () => {
    const h = setup();
    await settle();
    await h.pick(file('site.png'), file('other.pdf'));
    expect(calls()).toEqual([['파일 2개를 연결했습니다.', 'info']]);
  });

  it('새 글은 네 언어 사전에(개수 자리 그대로)', () => {
    expect((['en', 'de', 'ja', 'zh-CN'] as const).map((l) => catalogs[l]?.[PARTIAL])).toEqual([
      'Linked {0} file(s) ({1} could not be opened).',
      '{0} Datei(en) verknüpft ({1} konnten nicht geöffnet werden).',
      'ファイルを {0} 個関連付けました（{1} 個は開けませんでした）。',
      '已关联 {0} 个文件（{1} 个无法打开）。',
    ]);
    expect(translate('파일 2개를 연결했습니다(1개는 열지 못했습니다).', 'en')).toBe('Linked 2 file(s) (1 could not be opened).');
  });
});
