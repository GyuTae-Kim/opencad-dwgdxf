/**
 * 98차: newHandle이 지난번에 적은 $HANDSEED 글자를 다시 16진으로 바꾸지 않고 쓴다. 97차까지의 방법(아래 oldNewHandle — 부를 때마다
 * normalizeHandle 세 번)과 핸들·$HANDSEED가 늘 같은지 여러 경우(씨앗 그대로·밖에서 바꿈·겹침·0·잘못된 값)로 견준다.
 */
import { describe, expect, it } from 'vitest';
import { type CadDocument, createDocument, entityDefaults, normalizeHandle } from '../../src/core/model';
import { finalizeDocument } from '../../src/core/finalize';
import { EditSession } from '../../src/edit/session';

/** 97차 EditSession.newHandle 그대로(비교용) */
function oldAllocator(doc: CadDocument): () => string {
  let seedMemo: { seed: string; next: bigint } | null = null;
  return () => {
    const seed = doc.header.get('$HANDSEED');
    let next = 0n;
    if (seedMemo && seedMemo.seed === seed) next = seedMemo.next;
    else
      try {
        next = BigInt('0x' + (typeof seed === 'string' && seed ? seed : '0'));
      } catch {
        next = 0n;
      }
    const h0 = normalizeHandle(next);
    if (next === 0n || doc.entityIndex.has(h0) || doc.objects.has(h0)) {
      let max = 0n;
      const see = (h: string) => {
        if (!h) return;
        try {
          const v = BigInt('0x' + h);
          if (v > max) max = v;
        } catch {
          /* 무시 */
        }
      };
      for (const h of doc.entityIndex.keys()) see(h);
      for (const h of doc.objects.keys()) see(h);
      for (const b of doc.blocks.values()) for (const h of [b.handle, b.recordHandle, b.endHandle ?? '']) see(h);
      if (next <= max) next = max + 1n;
    }
    const h = normalizeHandle(next);
    const seed2 = normalizeHandle(next + 1n);
    doc.header.set('$HANDSEED', seed2);
    seedMemo = { seed: seed2, next: next + 1n };
    return h;
  };
}

/** 같은 문서 둘(옛 방법·새 방법)에 같은 일을 하며 핸들과 씨앗을 모은다 */
function pair(seed: string | number | undefined) {
  const make = () => {
    const doc = finalizeDocument(createDocument());
    if (seed === undefined) doc.header.delete('$HANDSEED');
    else doc.header.set('$HANDSEED', seed as string);
    return doc;
  };
  const a = make();
  const b = make();
  const oldNew = oldAllocator(a);
  const s = new EditSession(b, () => {});
  const log: [string, unknown][][] = [[], []];
  return {
    docs: [a, b] as const,
    take(n: number) {
      for (let i = 0; i < n; i++) {
        log[0]!.push([oldNew(), a.header.get('$HANDSEED')]);
        log[1]!.push([s.newHandle(), b.header.get('$HANDSEED')]);
      }
    },
    /** 두 문서에 같은 일을 한다 */
    both(f: (doc: CadDocument) => void) {
      f(a);
      f(b);
    },
    log,
  };
}

const point = (h: string) => ({ ...entityDefaults(), type: 'POINT', handle: h }) as never;

describe('newHandle(98차 — 씨앗 글자 다시 쓰기)', () => {
  it('씨앗이 그대로면 이어 주고, 밖에서 바꾸거나 쓰인 핸들과 겹치면 97차와 같은 핸들을 준다', () => {
    const p = pair('FE');
    p.take(5);
    // 쓰인 핸들과 겹침(색인·사전 객체)
    p.both((d) => d.entityIndex.set('104', point('104')));
    p.both((d) => d.objects.set('10A', { type: 'DICTIONARY', handle: '10A', owner: '0', entries: new Map() } as never));
    p.take(10);
    // 밖에서 씨앗을 바꿈(소문자·앞 0) — 다시 푼다
    p.both((d) => d.header.set('$HANDSEED', '00ff'));
    p.take(3);
    p.both((d) => d.header.set('$HANDSEED', '2000'));
    p.take(3);
    // 머리말 값이 같은 글자로 다시 놓여도(다른 문자열 객체) 같은 결과
    p.both((d) => d.header.set('$HANDSEED', String(d.header.get('$HANDSEED'))));
    p.take(3);
    expect(p.log[1]).toEqual(p.log[0]);
    // 씨앗 그대로 FE부터, 104와 겹치면 쓰인 가장 큰 핸들(10A) 다음부터, 밖에서 바꾼 씨앗(00ff → FF, 2000)부터 다시
    expect(p.log[1]!.map((x) => x[0])).toEqual(['FE', 'FF', '100', '101', '102', '103', '10B', '10C', '10D', '10E', '10F', '110', '111', '112', '113', 'FF', '100', '101', '2000', '2001', '2002', '2003', '2004', '2005']);
  });

  it('씨앗이 없거나 0이거나 잘못된 값이면 쓰인 가장 큰 핸들 다음부터(97차와 같다)', () => {
    for (const seed of [undefined, '', '0', 'XYZ', 7]) {
      const p = pair(seed);
      p.both((d) => d.entityIndex.set('3F', point('3F')));
      p.take(4);
      expect(p.log[1]).toEqual(p.log[0]);
    }
  });

  it('99차: 다음 씨앗을 글자로 하나 늘려도(BigInt를 16진 글자로 바꾸지 않음) 자리 올림마다 97차와 같다', () => {
    for (const seed of ['1', '9', 'F', 'FE', '9F', 'A9', 'FFF0', 'ABCDEF9', '19FFF', 'FFFFFFFFFFFFFFF0']) {
      const p = pair(seed);
      p.take(40);
      // 쓰인 핸들과 겹쳐 건너뛴 다음에도
      p.both((d) => d.entityIndex.set(String(d.header.get('$HANDSEED')), point(String(d.header.get('$HANDSEED')))));
      p.take(40);
      expect(p.log[1], seed).toEqual(p.log[0]);
    }
    const p = pair('EFFE');
    p.take(4096 + 32);
    expect(p.log[1]).toEqual(p.log[0]);
    expect(p.log[1]![p.log[1]!.length - 1]).toEqual(['1001D', '1001E']);
  });

  it('16진 자리가 늘어나는 곳(FFFF → 10000)과 큰 핸들도 같다', () => {
    const p = pair('FFFE');
    p.take(4);
    p.both((d) => d.header.set('$HANDSEED', '1FFFFFFFFFFFFE'));
    p.take(4);
    expect(p.log[1]).toEqual(p.log[0]);
    expect(p.log[1]!.map((x) => x[0])).toEqual(['FFFE', 'FFFF', '10000', '10001', '1FFFFFFFFFFFFE', '1FFFFFFFFFFFFF', '20000000000000', '20000000000001']);
  });
});
