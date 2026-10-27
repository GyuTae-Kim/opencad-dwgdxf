/**
 * 홈 화면 앱(PWA) 연결. 브라우저 기능은 인자로 받아 시험에서 가짜를 넘긴다.
 * - 서비스 워커(dist/sw.js — tools/sw-plugin.mjs·sw-template.js) 등록과 "새 버전" 알림: 새 판이 설치되어 기다리면 onUpdate(적용 함수)를 부른다.
 *   적용하면 기다리는 워커에 SKIP_WAITING을 보내고, 바뀐 뒤 한 번만 다시 읽는다(처음 설치 때의 넘겨받기는 다시 읽지 않는다).
 * - 서비스 워커가 맡기 전에 받은 파일(첫 방문의 언어 사전·글꼴)을 알려 담게 한다(CACHE_URLS).
 * - 데스크톱 파일 열기(file_handlers + launchQueue): 설치한 앱으로 .dwg·.dxf 등을 열면 그 파일들을 넘긴다.
 * - 공유 받기(share_target)는 서비스 워커가 파일을 최근 문서에 넣고 ?recent=<id>(실패하면 ?share-error=<까닭>)로 보낸다.
 */

export interface SwWorker {
  readonly state: string;
  postMessage(msg: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}

export interface SwRegistration {
  readonly waiting: SwWorker | null;
  readonly installing: SwWorker | null;
  readonly active?: SwWorker | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
  update?(): Promise<unknown>;
}

export interface SwContainer {
  readonly controller: unknown;
  register(url: string | URL, opts?: { scope?: string }): Promise<SwRegistration>;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}

/** 서비스 워커를 쓸 수 있는 곳인지(보안 맥락 — https 또는 이 컴퓨터) */
export function canUseServiceWorker(loc: Pick<Location, 'protocol' | 'hostname'>, nav: { serviceWorker?: unknown }): boolean {
  if (!nav.serviceWorker) return false;
  return loc.protocol === 'https:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '[::1]';
}

/**
 * 서비스 워커를 등록한다(범위 = sw.js가 있는 앱 뿌리). 이미 앞 판이 이 쪽을 맡고 있을 때 새 판이 기다리면 onUpdate(apply)를 부른다.
 * apply는 새 판으로 바꾸고, 바뀌면 reload를 한 번 부른다. 등록하지 못하면(비공개 창 등) 조용히 null
 */
export async function registerServiceWorker(
  sw: SwContainer | undefined,
  url: string | URL,
  onUpdate: (apply: () => void) => void,
  reload: () => void = () => location.reload(),
): Promise<SwRegistration | null> {
  if (!sw) return null;
  let reg: SwRegistration;
  try {
    reg = await sw.register(url, { scope: new URL('./', url).href });
  } catch {
    return null;
  }
  let applied = false;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    // 처음 설치(clients.claim)나 다른 창이 고른 새 판으로 바뀐 것은 다시 읽지 않는다
    if (!applied || reloading) return;
    reloading = true;
    reload();
  });
  let offered: SwWorker | null = null;
  const offer = (w: SwWorker | null): void => {
    if (!w || !sw.controller || offered === w) return;
    offered = w;
    onUpdate(() => {
      applied = true;
      w.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  if (reg.waiting) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') offer(reg.waiting ?? w);
    });
  });
  return reg;
}

/** 이 페이지가 받은 파일 주소 가운데 앱 범위 안의 것(서비스 워커가 담을지 다시 거른다) */
export function usedResourceUrls(entries: readonly { name: string }[], scope: string): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    try {
      const u = new URL(e.name);
      u.hash = '';
      if (u.href.startsWith(scope)) out.add(u.href);
    } catch {
      /* 주소가 아닌 항목 */
    }
  }
  return [...out];
}

interface LaunchFileHandle {
  getFile(): Promise<File>;
}
interface LaunchParamsLike {
  files?: readonly LaunchFileHandle[];
  targetURL?: string;
}
interface LaunchQueueLike {
  setConsumer(fn: (p: LaunchParamsLike) => void): void;
}

/**
 * 데스크톱 설치 앱의 파일 열기(launchQueue). 넘겨받은 파일을 한꺼번에 open에 넘긴다(못 읽은 것은 뺀다).
 * 공유 받기처럼 시작 주소에 ?recent=가 붙어 오면(이미 열린 창을 쓰는 경우) onUrl로 넘긴다.
 */
export function consumeLaunchFiles(open: (files: File[]) => void, onUrl?: (url: string) => void, w: { launchQueue?: LaunchQueueLike } = globalThis as never): boolean {
  const q = w.launchQueue;
  if (!q || typeof q.setConsumer !== 'function') return false;
  q.setConsumer((params) => {
    const handles = params.files ?? [];
    if (!handles.length) {
      if (params.targetURL && onUrl) onUrl(params.targetURL);
      return;
    }
    void Promise.allSettled(handles.map((h) => h.getFile())).then((rs) => {
      const files = rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (files.length) open(files);
    });
  });
  return true;
}

/** 공유 받기의 시작 인자 */
export interface LaunchQuery {
  /** 서비스 워커가 최근 문서에 넣은 파일 id */
  recent: string | null;
  /** 공유 받기 실패 까닭(no-file·too-big·store) */
  shareError: string | null;
}

export function parseLaunchQuery(search: string): LaunchQuery {
  const q = new URLSearchParams(search);
  return { recent: q.get('recent') || null, shareError: q.get('share-error') || null };
}

/** 한 번 쓰고 지울 시작 인자(?recent·?share-error)를 뺀 주소(다시 읽어도 또 열지 않게) */
export function withoutLaunchQuery(href: string): string {
  const u = new URL(href);
  // URLSearchParams로 다시 쓰면 ?sample이 ?sample=로 바뀌므로 조각만 걸러 잇는다
  const rest = u.search.slice(1).split('&').filter((p) => p && !/^(?:recent|share-error)(?:=|$)/.test(p));
  return u.pathname + (rest.length ? `?${rest.join('&')}` : '') + u.hash;
}

/** 공유 받기 실패 안내 */
export function shareErrorMessage(code: string): string {
  if (code === 'too-big') return '공유한 파일이 60MB보다 커서 받지 못했습니다. 파일 열기로 여십시오.';
  if (code === 'no-file') return '공유한 내용에 도면 파일이 없습니다. DWG·DXF 파일을 공유하십시오.';
  return '공유한 파일을 이 브라우저에 저장하지 못했습니다. 파일 열기로 여십시오.';
}
