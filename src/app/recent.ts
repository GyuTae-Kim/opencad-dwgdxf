/**
 * 최근 문서: 이 브라우저의 IndexedDB(opencad-2d, recent)에만 저장한다(서버로 보내지 않는다).
 * 항목 꼴 { id: '이름:크기', name, size, time, data: ArrayBuffer }은 서비스 워커의 공유 받기(tools/sw-template.js)도 같이 쓴다.
 */
export interface RecentEntry {
  id: string;
  name: string;
  size: number;
  time: number;
}

/** 저장해 둔 파일 읽기 결과: 있음 / 없음(지워짐) / 지금 못 읽음(저장소 오류) */
export type RecentRead = { kind: 'ok'; name: string; data: ArrayBuffer } | { kind: 'missing' } | { kind: 'error' };

const DB = 'opencad-2d';
const STORE = 'recent';
export const RECENT_MAX = 8;
export const RECENT_MAX_SIZE = 60 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        // 연결은 일이 끝나면 닫는다(서비스 워커·다른 창이 같은 저장소를 연다)
        t.oncomplete = t.onabort = t.onerror = () => db.close();
      }),
  );
}

/** 최근 문서의 때: 오늘이면 시각, 올해면 월·일·시각, 그 전이면 연·월·일(지금 언어로) */
export function recentTimeLabel(time: number, now: number, locale = 'ko'): string {
  const t = new Date(time);
  const n = new Date(now);
  const sameYear = t.getFullYear() === n.getFullYear();
  const sameDay = sameYear && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
  const opts: Intl.DateTimeFormatOptions = sameDay ? { hour: 'numeric', minute: '2-digit' } : sameYear ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { year: 'numeric', month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(t);
  } catch {
    return new Intl.DateTimeFormat('ko', opts).format(t);
  }
}

export class RecentStore {
  async list(): Promise<RecentEntry[]> {
    try {
      const all = (await tx('readonly', (s) => s.getAll())) as (RecentEntry & { data?: ArrayBuffer })[];
      return all
        .filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string')
        .map(({ id, name, size, time }) => ({ id, name, size, time }))
        .sort((a, b) => b.time - a.time);
    } catch {
      return [];
    }
  }

  /** 남겼으면 true(60MB보다 크거나 저장소를 못 쓰면 false) */
  async add(name: string, data: ArrayBuffer): Promise<boolean> {
    if (data.byteLength > RECENT_MAX_SIZE) return false;
    try {
      const id = `${name}:${data.byteLength}`;
      await tx('readwrite', (s) => s.put({ id, name, size: data.byteLength, time: Date.now(), data }));
      const list = await this.list();
      for (const old of list.slice(RECENT_MAX)) await tx('readwrite', (s) => s.delete(old.id));
      return true;
    } catch {
      /* 저장 공간을 쓸 수 없는 환경(비공개 창 등) */
      return false;
    }
  }

  /** 파일 바이트(순서를 맨 앞으로 올린다). 없거나 못 읽으면 null */
  async get(id: string): Promise<ArrayBuffer | null> {
    const r = await this.read(id);
    return r.kind === 'ok' ? r.data : null;
  }

  /** 파일 이름과 바이트(순서를 맨 앞으로 올린다) */
  async read(id: string): Promise<RecentRead> {
    let r: (RecentEntry & { data?: ArrayBuffer }) | undefined;
    try {
      r = (await tx('readonly', (s) => s.get(id))) as (RecentEntry & { data?: ArrayBuffer }) | undefined;
    } catch {
      return { kind: 'error' };
    }
    if (!r?.data) return { kind: 'missing' };
    try {
      await tx('readwrite', (s) => s.put({ ...r, time: Date.now() }));
    } catch {
      /* 순서만 못 바꿈 */
    }
    return { kind: 'ok', name: r.name, data: r.data };
  }

  async remove(id: string): Promise<void> {
    try {
      await tx('readwrite', (s) => s.delete(id));
    } catch {
      /* 저장소를 못 씀 */
    }
  }

  async clear(): Promise<void> {
    try {
      await tx('readwrite', (s) => s.clear());
    } catch {
      /* 저장소를 못 씀 */
    }
  }
}
