/**
 * 시험용 아주 작은 IndexedDB(열기·판 올리기·put/get/getAll/delete/clear·트랜잭션 완료). 값은 structuredClone으로 담는다.
 * 앱(recent.ts)과 서비스 워커(sw-template.js)가 같은 저장소 꼴을 쓰는지 함께 돌려 본다.
 */
type Req<T = unknown> = { result?: T; error?: unknown; onsuccess?: (() => void) | null; onerror?: (() => void) | null; onupgradeneeded?: ((e: { oldVersion: number }) => void) | null; onblocked?: (() => void) | null };

interface StoreData {
  keyPath?: string;
  rows: Map<unknown, unknown>;
}

export function createFakeIndexedDB() {
  const dbs = new Map<string, { version: number; stores: Map<string, StoreData> }>();
  let opened = 0;
  const later = (fn: () => void) => setTimeout(fn, 0);
  function makeDb(name: string) {
    const data = dbs.get(name)!;
    return {
      objectStoreNames: { contains: (n: string) => data.stores.has(n) },
      createObjectStore(n: string, opts: { keyPath?: string } = {}) {
        data.stores.set(n, { keyPath: opts.keyPath, rows: new Map() });
      },
      deleteObjectStore(n: string) {
        data.stores.delete(n);
      },
      transaction(names: string | string[]) {
        let pending = 0;
        let finished = false;
        const tx: Record<string, unknown> & { oncomplete?: (() => void) | null; onerror?: (() => void) | null; onabort?: (() => void) | null } = {};
        const settle = () => {
          if (pending === 0 && !finished) {
            finished = true;
            later(() => tx.oncomplete?.());
          }
        };
        const request = <T>(fn: () => T): Req<T> => {
          const r: Req<T> = {};
          pending++;
          later(() => {
            try {
              r.result = fn();
              r.onsuccess?.();
            } catch (e) {
              r.error = e;
              r.onerror?.();
            }
            pending--;
            settle();
          });
          return r;
        };
        const allowed = new Set(Array.isArray(names) ? names : [names]);
        tx.objectStore = (n: string) => {
          if (!allowed.has(n)) throw new Error(`store ${n} not in transaction`);
          const s = data.stores.get(n);
          if (!s) throw new Error(`no store ${n}`);
          const keyOf = (v: unknown, k?: unknown) => k ?? (s.keyPath ? (v as Record<string, unknown>)[s.keyPath] : undefined);
          return {
            put: (v: unknown, k?: unknown) => request(() => (s.rows.set(keyOf(v, k), structuredClone(v)), keyOf(v, k))),
            get: (k: unknown) => request(() => (s.rows.has(k) ? structuredClone(s.rows.get(k)) : undefined)),
            getAll: () => request(() => [...s.rows.values()].map((v) => structuredClone(v))),
            delete: (k: unknown) => request(() => void s.rows.delete(k)),
            clear: () => request(() => void s.rows.clear()),
          };
        };
        later(settle);
        return tx;
      },
      close() {
        opened--;
      },
    };
  }
  const indexedDB = {
    open(name: string, version = 1) {
      const req: Req = {};
      later(() => {
        const old = dbs.get(name)?.version ?? 0;
        if (!dbs.has(name)) dbs.set(name, { version, stores: new Map() });
        const db = makeDb(name);
        req.result = db;
        opened++;
        if (version > old) {
          dbs.get(name)!.version = version;
          req.onupgradeneeded?.({ oldVersion: old });
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { indexedDB, dbs, openConnections: () => opened };
}
