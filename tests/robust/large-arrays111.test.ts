// @vitest-environment jsdom
/**
 * 111차: 110차가 펼침 호출을 고친 42곳 가운데 20만 개 꼴 시험이 없던 곳(large-arrays110.test.ts는 19곳만 시험했다)과
 * 그 차수에 남긴 ACIS 곡선 조정점 z 모으기, 쌓기 글자 풀기(decodeStack).
 * 고치기 전 꼴(push(...)·unshift(...)·Math.max(...)·String.fromCharCode(...))이면 인자가 Node 한도(약 15만 개)를 넘어 모두 RangeError로 죽는다.
 * 실제 길로 닿으면 실제 길로 재고, 앞 단계가 값비싼 곳(연관 치수 20만 개를 푸는 생성기, 조각 20만 개인 스플라인의 베지어 분해)만 그 앞 함수를 가짜로 바꾼다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { fake, formAnswers } = vi.hoisted(() => ({
  formAnswers: [] as (Record<string, boolean> | null)[],
  fake: {
    extra: null as unknown[] | null,
    follow: null as { ops: unknown[]; patched: Map<string, unknown> } | null,
    dimBlock: null as unknown[] | null,
    bezier: null as number[][][] | null,
  },
}));
vi.mock('../../src/app/ui/dom', async (orig) => ({
  ...(await orig<object>()),
  form: vi.fn(async () => formAnswers.shift() ?? null),
}));
vi.mock('../../src/app/constraints-hook', async (orig) => {
  const m = await orig<typeof import('../../src/app/constraints-hook')>();
  return { ...m, afterEditSolve: ((...a: Parameters<typeof m.afterEditSolve>) => (fake.extra ? { ok: true, extra: fake.extra } : m.afterEditSolve(...a))) as typeof m.afterEditSolve };
});
vi.mock('../../src/app/dimassoc', async (orig) => {
  const m = await orig<typeof import('../../src/app/dimassoc')>();
  return { ...m, followOps: ((...a: Parameters<typeof m.followOps>) => fake.follow ?? m.followOps(...a)) as typeof m.followOps };
});
vi.mock('../../src/app/dimcmds', async (orig) => {
  const m = await orig<typeof import('../../src/app/dimcmds')>();
  return { ...m, dimensionBlockOps: ((...a: Parameters<typeof m.dimensionBlockOps>) => fake.dimBlock ?? m.dimensionBlockOps(...a)) as typeof m.dimensionBlockOps };
});
vi.mock('../../src/edit/geom/nurbs', async (orig) => {
  const m = await orig<typeof import('../../src/edit/geom/nurbs')>();
  return { ...m, toBezier: ((c: Parameters<typeof m.toBezier>[0]) => fake.bezier ?? m.toBezier(c)) as typeof m.toBezier };
});

import type { AttribEntity, CadDocument, DictionaryObject, DimensionEntity, Entity, GenericObject, InsertEntity, LineEntity, RawTag, TableEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { packEdges } from '../../src/core/hatchedges';
import { namedDictionary } from '../../src/edit/layertools/clone';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerDashTableCommands } from '../../src/app/dashcmds-tables';
import { registerDimAssocCommands, followOps } from '../../src/app/dimassoc';
import { applyField } from '../../src/app/propedit';
import { registerExpressDrawCommands } from '../../src/app/express-draw';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { createLinearDimension } from '../../src/edit/dim';
import { DIMASSOC_KEY, type DimAssocData, OSNAP, dimAssocRaw } from '../../src/edit/dim/assoc';
import { DEFAULT_OPTIONS, entitySignature } from '../../src/edit/compare/signature';
import { type Nurbs, joinNurbs } from '../../src/edit/geom/nurbs';
import { piecesNurbs } from '../../src/edit/geom/path';
import { explodeEntity } from '../../src/edit/geom/explode';
import { decodeStack, mtextMeaning } from '../../src/text/mtextedit';
import { readFieldValue } from '../../src/io/dwg/objects/field';
import { decodeRawTags } from '../../src/io/dwg/objects/rawtags';
import { readTableCellsOld } from '../../src/io/dwg/objects/table';
import { ObjectReader, type ObjHeader } from '../../src/io/dwg/objects/reader';
import { readIO } from '../../src/io/dwg/tablecodec';
import { R2000, R2007 } from '../../src/io/dwg/version';
import { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { encoderFor } from '../../src/io/dwg/writer/codepage';
import { makeHarness } from '../cmds2/harness';
import { makeLispApp } from '../lisp/app';

/** Node 한도(약 15만 개)보다 많은 수 */
const N = 200_000;
const hx = (n: number) => n.toString(16).toUpperCase();
const P = (x: number, y: number, z = 0) => ({ x, y, z });
const line = (handle: string, o: Partial<LineEntity> = {}): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: P(0, 0), end: P(1, 0), ...o });
const put = (doc: CadDocument, e: Entity, block = MODEL_SPACE) => {
  doc.blocks.get(block)!.entities.push(e);
  doc.entityIndex.set(e.handle, e);
};

afterEach(() => {
  fake.extra = fake.follow = fake.dimBlock = fake.bezier = null;
  document.body.replaceChildren();
});

/** 화면에 열린 대화 상자의 단추를 글로 찾아 누른다(열릴 때까지 기다린다) */
async function press(label: string): Promise<void> {
  await vi.waitFor(
    () => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.startsWith(label));
      expect(b, label).toBeTruthy();
      b!.click();
    },
    { timeout: 60_000, interval: 5 },
  );
}

describe('PURGE 이름 있는 객체(111차)', () => {
  function withGroups(n: number) {
    const h = makeHarness((doc) => {
      Object.assign(doc, createNewDocument('metric'));
      const d = namedDictionary(doc, 'ACAD_GROUP')!;
      for (let i = 0; i < n; i++) {
        const k = hx(0x100000 + i);
        doc.objects.set(k, { type: 'GROUP', handle: k, owner: d.handle, description: '', unnamed: false, selectable: true, entities: ['DEAD'] } as never);
        d.entries.set(`G${i}`, k);
      }
    });
    registerEditCommands(h.app);
    registerDashTableCommands(h.app);
    return h;
  }
  const groupCount = (doc: CadDocument) => namedDictionary(doc, 'ACAD_GROUP')!.entries.size;

  it('-PURGE 빈 그룹 20만 개', async () => {
    const h = withGroups(N);
    await h.run('-PURGE', ['G', '*', 'N']);
    expect(groupCount(h.doc)).toBe(0);
    h.st.session.undo();
    expect(groupCount(h.doc)).toBe(N);
  });

  it('PURGE 대화 상자: 빈 그룹 20만 개', async () => {
    const h = withGroups(N);
    formAnswers.push({ groups: true });
    await h.run('PURGE', []);
    expect(groupCount(h.doc)).toBe(0);
  });
});

describe('연관 치수(111차)', () => {
  /** 치수 n개, 치수마다 확장 사전·DIMASSOC 하나와 제 선 하나. 참조는 선의 끝점(기록된 점은 어긋나 DIMREGEN이 기록만 고친다) */
  function assocDoc(n: number) {
    const h = makeHarness((doc) => {
      Object.assign(doc, createNewDocument('metric'));
      const d0 = createLinearDimension(doc, P(0, 0), P(1, 0), P(0.5, 2), { rotation: 0 });
      for (let i = 0; i < n; i++) {
        const dh = hx(0x100000 + i);
        const xh = hx(0x200000 + i);
        const ah = hx(0x300000 + i);
        const lh = hx(0x400000 + i);
        put(doc, line(lh));
        const data: DimAssocData = {
          dimension: dh,
          transSpace: false,
          rotatedType: 0,
          refs: [{ osnap: OSNAP.END, ids: [lh], subent: 0, gsMarker: 0, param: 0, point: P(9, 9), lastPointRef: false }, null, null, null],
        };
        put(doc, { ...d0, handle: dh, xdict: xh, block: '' } as DimensionEntity);
        doc.objects.set(xh, { type: 'DICTIONARY', handle: xh, owner: dh, entries: new Map([[DIMASSOC_KEY, ah]]) } as DictionaryObject);
        doc.objects.set(ah, { type: 'DIMASSOC', handle: ah, owner: xh, raw: dimAssocRaw(data) } as GenericObject);
      }
    });
    registerDimAssocCommands(h.app);
    return h;
  }

  it('followOps: 지운 연관 치수 10만 개의 사전·기록 변경 20만 개', () => {
    const h = assocDoc(N / 2);
    const changes = new Map<string, Entity | null>();
    for (let i = 0; i < N / 2; i++) changes.set(hx(0x100000 + i), null);
    const { ops } = followOps(h.st, changes);
    expect(ops.filter((o) => o.kind === 'object').length).toBe(N);
  });

  it('DIMREGEN: 기록만 고칠 연관 치수 20만 개', async () => {
    const h = assocDoc(N);
    await h.run('DIMREGEN', []);
    const a = h.doc.objects.get(hx(0x300000)) as GenericObject;
    expect((a.raw as RawTag[]).some((t) => t.code === 10 && t.value === 9)).toBe(false);
    h.st.session.undo();
    expect(((h.doc.objects.get(hx(0x300000)) as GenericObject).raw as RawTag[]).some((t) => t.code === 10 && t.value === 9)).toBe(true);
  });
});

describe('특성 팔레트(111차)', () => {
  const noopField = (key: keyof Entity, regen: boolean) => ({ key, label: key, kind: 'text', regen, get: () => '', set: (c: Entity, v: unknown) => Object.assign(c, { [key]: v }) }) as never;

  it('따라오는 객체 20만 개·연관 치수 변경 20만 개', () => {
    const h = makeHarness((doc) => put(doc, line('A1')));
    const extra = Array.from({ length: N }, (_, i) => ({ kind: 'object', key: `X${i}`, before: null, after: null }));
    const follow = Array.from({ length: N }, (_, i) => ({ kind: 'object', key: `Y${i}`, before: null, after: null }));
    fake.extra = extra;
    fake.follow = { ops: follow, patched: new Map() };
    const commit = vi.spyOn(h.st.session, 'commit').mockImplementation(() => undefined as never);
    applyField(h.app, ['A1'], noopField('layer', false), 'L2');
    const ops = commit.mock.calls[0]![0].ops as { key?: string }[];
    expect([ops.length, ops[1]!.key, ops[N]!.key, ops[N + 1]!.key, ops.at(-1)!.key]).toEqual([2 * N + 1, 'X0', `X${N - 1}`, 'Y0', `Y${N - 1}`]);
  });

  it('치수 20만 개의 블록 변경은 앞에 붙는다', () => {
    const dims: DimensionEntity[] = [];
    const h = makeHarness((doc) => {
      Object.assign(doc, createNewDocument('metric'));
      const d0 = createLinearDimension(doc, P(0, 0), P(1, 0), P(0.5, 2), { rotation: 0 });
      for (let i = 0; i < N; i++) {
        const d = { ...d0, handle: hx(0x100000 + i) } as DimensionEntity;
        put(doc, d);
        dims.push(d);
      }
    });
    fake.extra = [];
    fake.follow = { ops: [], patched: new Map() };
    fake.dimBlock = [{ kind: 'blockDef', key: 'B', before: null, after: null }];
    const commit = vi.spyOn(h.st.session, 'commit').mockImplementation(() => undefined as never);
    applyField(h.app, dims.map((d) => d.handle), noopField('layer', true), 'L2');
    const ops = commit.mock.calls[0]![0].ops;
    expect([ops.length, ops[0]!.kind, ops[N - 1]!.kind, ops[N]!.kind, ops.at(-1)!.kind]).toEqual([2 * N, 'blockDef', 'blockDef', 'modify', 'modify']);
  });
});

describe('대화 상자 명령(111차)', () => {
  it('CDORDER: 고른 객체 12만 개(지우기·넣기 24만 개)', async () => {
    const n = 120_000;
    const hs: string[] = [];
    const h = makeHarness((doc) => {
      Object.assign(doc, createNewDocument('metric'));
      for (let i = 0; i < n; i++) {
        const k = hx(0x100000 + i);
        put(doc, line(k, { color: { aci: i % 2 ? 1 : 3 } }));
        hs.push(k);
      }
    });
    registerExpressDrawCommands(h.app);
    const run = h.run('CDORDER', [{ sel: hs }]);
    await press('확인');
    await run;
    const list = h.doc.blocks.get(MODEL_SPACE)!.entities;
    expect(list.length).toBe(n);
    // 색별로 모였다(같은 색은 원래 순서)
    expect(new Set(list.slice(0, n / 2).map((e) => e.color.aci)).size).toBe(1);
    expect(h.printed.some((t) => t.includes(`${n}개`))).toBe(true);
  });

  it('BATTMAN 동기화: 참조 20만 개', async () => {
    const h = makeHarness((doc) => {
      Object.assign(doc, createNewDocument('metric'));
      const att = { ...entityDefaults(), type: 'ATTDEF', handle: 'B03', insert: P(0, 0), height: 1, text: 'v', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag: 'T', prompt: 'p', attFlags: 0 } as AttribEntity;
      doc.blocks.set('B', { name: 'B', handle: 'B01', recordHandle: 'B02', basePoint: P(0, 0), flags: 0, entities: [att as unknown as Entity], endHandle: 'B04' });
      doc.blockRecords.set('B', { name: 'B', handle: 'B02', flags: 0, insertUnits: 0, explodable: true, scalable: true });
      for (let i = 0; i < N; i++)
        put(doc, { ...entityDefaults(), type: 'INSERT', handle: hx(0x100000 + i), block: 'B', insert: P(i, 0), scale: P(1, 1, 1), rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as InsertEntity);
    });
    registerUtil2BlockCommands(h.app);
    const run = h.run('BATTMAN', []);
    await press('동기화(Y)');
    await press('취소');
    await run;
    expect(h.printed.some((t) => t.includes(`참조 ${N}개`))).toBe(true);
    expect((h.doc.entityIndex.get(hx(0x100000)) as InsertEntity).attribs.length).toBe(1);
  });
});

describe('비교 서명·곡선(111차)', () => {
  it('COMPARE 서명: 해치 스플라인 경계의 매듭·가중치 20만 개', () => {
    const knots = Array.from({ length: N }, (_, i) => i);
    const hatch = {
      ...entityDefaults(),
      type: 'HATCH',
      handle: 'H1',
      patternName: 'SOLID',
      solid: true,
      hatchStyle: 0,
      patternType: 1,
      patternDouble: false,
      paths: [{ flags: 1, edgeData: packEdges([{ type: 'spline', degree: 3, rational: true, periodic: false, knots, controlPoints: [P(0, 0), P(1, 0)], weights: knots }] as never) }],
    } as unknown as Entity;
    expect(entitySignature(hatch, DEFAULT_OPTIONS)).toBeTruthy();
  });

  it('COMPARE 서명: 표의 행 높이·열 폭 20만 개', () => {
    const table = {
      ...entityDefaults(),
      type: 'ACAD_TABLE',
      handle: 'T1',
      block: '*T1',
      tableStyle: '0',
      insert: P(0, 0),
      direction: P(1, 0),
      scale: P(1, 1, 1),
      rotation: 0,
      rows: N,
      columns: N,
      rowHeights: new Array<number>(N).fill(1),
      columnWidths: new Array<number>(N).fill(2),
    } as unknown as TableEntity;
    expect(entitySignature(table, DEFAULT_OPTIONS)).toBeTruthy();
  });

  it('joinNurbs: 곡선 20만 개', () => {
    const list: Nurbs[] = Array.from({ length: N }, (_, i) => ({ degree: 1, knots: [0, 0, 1, 1], ctrl: [P(i, 0), P(i + 1, 0)] }));
    const n = joinNurbs(list)!;
    expect(n.ctrl.length).toBe(N + 1);
  });

  it('piecesNurbs: 조각 하나의 베지어 조각 20만 개', () => {
    fake.bezier = Array.from({ length: N }, (_, i) => [
      [i, 0, 0, 1],
      [i + 1, 0, 0, 1],
    ]);
    expect(piecesNurbs([{ k: 'line', a: { x: 0, y: 0 }, b: { x: N, y: 0 } }])!.ctrl.length).toBe(N + 1);
  });

  it('EXPLODE REGION: 조정점 20만 개인 곡선 모서리(z 모으기)', () => {
    const doc = createNewDocument('metric');
    const ctrl = Array.from({ length: N }, (_, i) => P(i, Math.sin(i)));
    const knots = [0, 0, 0, 0, ...Array.from({ length: N - 4 }, (_, i) => i + 1), N - 3, N - 3, N - 3, N - 3];
    const region = { ...entityDefaults(), type: 'REGION', handle: 'R1', sat: 'x', wires: [[P(0, 0), P(1, 0)]], acisCurves: [{ k: 'nurbs', degree: 3, knots, ctrl, s0: 0, s1: N - 3 }] } as unknown as Entity;
    const r = explodeEntity(region, doc);
    expect(r.add!.map((e) => e.type)).toEqual(['SPLINE']);
  });
});

describe('LISP(111차)', () => {
  it('entget: 해석하지 않은 객체의 원본 태그 20만 개', async () => {
    const h = makeLispApp((doc) => {
      const raw = Array.from({ length: N }, (_, i) => ({ code: 1, value: `v${i}` }));
      doc.objects.set('ABC02', { type: 'SOMETHINGELSE', handle: 'ABC02', owner: '0', raw } as GenericObject);
    });
    await h.lisp('(length (entget (handent "ABC02")))');
    expect(h.errors()).toEqual([]);
    expect(Number(h.printed.at(-1)?.text)).toBeGreaterThan(N);
  });
});

describe('DWG 읽기(111차)', () => {
  const enc = encoderFor('ANSI_1252');
  /** 자료 흐름·핸들 흐름을 쓴 객체 리더 */
  function reader(ver: number, f: (d: BitWriter, hd: BitWriter) => void): ObjectReader {
    const d = new BitWriter(ver, enc, 1 << 20);
    const hd = new BitWriter(ver, enc, 1 << 20);
    f(d, hd);
    const dat = d.bytes();
    const hnd = hd.bytes();
    const buf = new Uint8Array(dat.length + hnd.length);
    buf.set(dat);
    buf.set(hnd, dat.length);
    const or = new ObjectReader(buf, ver, new TextDecoder(), []);
    or.dat.pos = 0;
    or.dat.end = d.pos;
    or.hdl.pos = dat.length * 8;
    or.hdl.end = dat.length * 8 + hd.pos;
    or.h = { handle: 1 } as ObjHeader;
    return or;
  }
  /** R2007+ 글자: 바이트 수(BL) + UTF-16 */
  const wide = (d: BitWriter) => {
    d.BL(2 * N);
    for (let i = 0; i < N; i++) d.RS(0x41 + (i % 26));
  };

  it('필드 값: R2007+ 글자 20만 개', () => {
    const or = reader(R2007, (d) => {
      d.BL(0);
      d.BL(4);
      wide(d);
      d.BL(0);
      d.TV('');
      d.TV('');
    });
    expect(String(readFieldValue(or).value).length).toBe(N);
  });

  it('표 셀 값: R2007 글자 20만 개', () => {
    const or = reader(R2007, (d, hd) => {
      d.BS(0);
      d.BD3(P(1, 0));
      d.BL(1);
      d.BL(1);
      d.BD(1);
      d.BD(1);
      hd.H(5, 0);
      d.BS(1);
      d.RC(0);
      d.B(0);
      d.B(0);
      d.BL(0);
      d.BL(0);
      d.BD(0);
      hd.H(3, 0);
      d.TV('');
      d.B(0);
      d.BL(0);
      d.BL(0);
      d.BL(4);
      wide(d);
    });
    const e = {} as TableEntity;
    readTableCellsOld(or, e);
    expect(e.cells![0]!.text.length).toBe(N);
  });

  it('표 코덱 넓은 글자: 20만 개', () => {
    const or = reader(R2007, (d) => wide(d));
    const s = readIO(or.dat, or.hdl, 1, R2007).WSTR!('' as never, 0 as never) as unknown as { s: string; zeros: number };
    expect([s.s.length, s.zeros]).toEqual([N, 0]);
  });

  it('DIMASSOC 교차 객체 20만 개', () => {
    const or = reader(R2000, (d, hd) => {
      hd.H(5, 0x10);
      d.BL(1);
      d.B(0);
      d.RC(0);
      d.TV('AcDbOsnapPointRef');
      d.RC(1);
      d.BL(0);
      d.BS(0);
      d.BL(0);
      d.BL(N);
      for (let i = 0; i < N; i++) hd.H(5, 0x20 + i);
      d.BS(0);
      d.BL(0);
      d.BD(0);
      d.BD3(P(0, 0));
      d.B(0);
    });
    const res = decodeRawTags(or, 'DIMASSOC')!;
    expect(res.raw.filter((t) => t.code === 332).length).toBe(N);
  });
});

describe('여러 줄 문자(111차)', () => {
  const big = 'A'.repeat(N);

  it('쌓기 위·아래 글자 20만 개(뜻 비교)', () => {
    const m = mtextMeaning(`{\\S${big}^${big};}`) as { runs: { kind: string; text: string }[] }[];
    const stack = m.flatMap((p) => p.runs).find((r) => r.kind === 'stack');
    expect(stack?.text.length).toBe(2 * N + 1);
  });

  it('쌓기 원문 풀기 20만 개', () => {
    expect(decodeStack(big).length).toBe(N);
  });
});
