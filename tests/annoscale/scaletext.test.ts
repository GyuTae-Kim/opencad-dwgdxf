/**
 * SCALETEXT의 주석 문자(118차, Autodesk SCALETEXT 도움말): 모형 높이는 주석이 아닌 객체에만, 도면 높이(P)는 주석 객체에만
 * (그려지는 높이 = 용지 높이 × 보이는 축척 배율), 객체 일치(M)는 같은 꼴에만, 축척 비율은 모두.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, MTextEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { ScaleIndex, makeAnnotative, textAnnoFactor, textScaleFactor, withAnnotativeFlag } from '../../src/edit/annoscale';
import { transformEntity } from '../../src/edit/geom';
import { affScale } from '../../src/edit/geom/math';
import { scaleBasePoint, textHeightOf } from '../../src/edit/geom/textjust';
import { registerModify2Commands } from '../../src/app/modify2';
import { makeHarness } from '../cmds2/harness';
import { addModel, commit, envOf, mtext, newDoc, text } from './helpers';

function annotate<T extends Entity>(doc: Parameters<typeof envOf>[0], session: Parameters<typeof envOf>[1], e: T, scale: string): T {
  const r = makeAnnotative(envOf(doc, session), e, scale);
  commit(session, [...r.ops, { kind: 'modify', block: MODEL_SPACE, before: e, after: r.entity }]);
  return doc.entityIndex.get(e.handle) as T;
}

/** 축척을 실제로 적용한 뒤의 그려지는 높이(건너뛰면 null) */
function scaled(doc: ReturnType<typeof newDoc>['doc'], e: Entity, mode: Parameters<typeof textScaleFactor>[3]): number | null {
  const idx = new ScaleIndex(doc);
  const h = textHeightOf(e, doc)!;
  const r = textScaleFactor(doc, e, h, mode, idx);
  if ('skip' in r) return null;
  const out = transformEntity(e, affScale(r.k, r.k, scaleBasePoint(e, 'E', doc)!), doc).replace![0]!;
  return textHeightOf(out, doc);
}

function setup() {
  const { doc, session } = newDoc();
  const plain = addModel(doc, session, text(0, 0, 2.5));
  const a50 = annotate(doc, session, addModel(doc, session, text(0, 10, 2.5)), '1:50');
  const a100 = annotate(doc, session, addModel(doc, session, text(0, 20, 2)), '1:100');
  const m50 = annotate(doc, session, addModel(doc, session, mtext(0, 30, 2.5, 40)), '1:50');
  return { doc, session, plain, a50, a100, m50 };
}

describe('SCALETEXT 높이 옵션과 주석 문자', () => {
  it('주석 꼴과 보이는 축척 배율', () => {
    const { doc, plain, a50, a100 } = setup();
    const idx = new ScaleIndex(doc);
    expect(textAnnoFactor(doc, plain, idx)).toEqual({ annotative: false });
    expect(a50.height).toBeCloseTo(125);
    expect(textAnnoFactor(doc, a50, idx)).toEqual({ annotative: true, factor: 50 });
    expect(textAnnoFactor(doc, a100, idx)).toEqual({ annotative: true, factor: 100 });
  });

  it('도면 높이(P): 주석 객체만 용지 높이 × 축척 배율로, 주석이 아닌 객체는 건너뜀', () => {
    const { doc, plain, a50, a100, m50 } = setup();
    const mode = { kind: 'paper', height: 3 } as const;
    expect(scaled(doc, a50, mode)).toBeCloseTo(150);
    expect(scaled(doc, a100, mode)).toBeCloseTo(300);
    expect((m50 as MTextEntity).height).toBeCloseTo(125);
    expect(scaled(doc, m50, mode)).toBeCloseTo(150);
    expect(textScaleFactor(doc, plain, 2.5, mode, new ScaleIndex(doc))).toEqual({ skip: 'nonAnnotative' });
  });

  it('새 모형 높이: 주석이 아닌 객체만, 주석 객체는 건너뜀', () => {
    const { doc, plain, a50 } = setup();
    const mode = { kind: 'model', height: 5 } as const;
    expect(scaled(doc, plain, mode)).toBeCloseTo(5);
    expect(textScaleFactor(doc, a50, 125, mode, new ScaleIndex(doc))).toEqual({ skip: 'annotative' });
  });

  it('객체 일치(M): 주석 객체에 맞추면 주석 객체끼리 용지 높이를, 주석이 아닌 객체에 맞추면 그것끼리 모형 높이를', () => {
    const { doc, session, plain, a50, a100 } = setup();
    const idx = new ScaleIndex(doc);
    // 1:50 주석(용지 2.5)에 맞춘 1:100 주석: 용지 2 → 2.5, 그려지는 높이 200 → 250
    const byAnno = { kind: 'match', source: a50, height: 125 } as const;
    expect(scaled(doc, a100, byAnno)).toBeCloseTo(250);
    expect(textScaleFactor(doc, plain, 2.5, byAnno, idx)).toEqual({ skip: 'nonAnnotative' });
    const other = addModel(doc, session, text(50, 0, 4));
    const byPlain = { kind: 'match', source: other, height: 4 } as const;
    expect(scaled(doc, plain, byPlain)).toBeCloseTo(4);
    expect(textScaleFactor(doc, a50, 125, byPlain, idx)).toEqual({ skip: 'annotative' });
  });

  it('축척 비율: 주석 여부와 상관없이 모두', () => {
    const { doc, plain, a50 } = setup();
    const mode = { kind: 'factor', factor: 2 } as const;
    expect(scaled(doc, plain, mode)).toBeCloseTo(5);
    expect(scaled(doc, a50, mode)).toBeCloseTo(250);
  });

  it('축척을 읽을 수 없는 주석 객체(표지만 있음)는 도면 높이로 축척하지 않고, 모형 높이에서도 주석 객체로 건너뜀', () => {
    const { doc, session } = newDoc();
    const t = text(0, 0, 2.5);
    t.xdata = withAnnotativeFlag(undefined, true);
    const f = addModel(doc, session, t);
    const idx = new ScaleIndex(doc);
    expect(textAnnoFactor(doc, f, idx)).toEqual({ annotative: true, factor: null });
    expect(textScaleFactor(doc, f, 2.5, { kind: 'paper', height: 3 }, idx)).toEqual({ skip: 'unknownScale' });
    expect(textScaleFactor(doc, f, 2.5, { kind: 'model', height: 3 }, idx)).toEqual({ skip: 'annotative' });
  });
});

describe('SCALETEXT 명령', () => {
  const plainText = (y: number, h: number): TextEntity => ({ type: 'TEXT', ...entityDefaults(), handle: '', insert: { x: 0, y, z: 0 }, height: h, text: 'A', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 });

  it('도면 높이(P)는 주석이 아닌 문자를 건너뛰고 까닭을 알린다', async () => {
    const h = makeHarness();
    registerModify2Commands(h.app);
    const t = h.add(plainText(0, 2.5));
    await h.run('SCALETEXT', [{ sel: [t.handle] }, '', 'P', '3']);
    expect((h.doc.entityIndex.get(t.handle) as TextEntity).height).toBeCloseTo(2.5);
    expect(h.printed).toContain('주석이 아닌 객체 1개는 도면 높이로 축척하지 않았습니다(도면 높이는 주석 객체에만).');
    expect(h.printed).toContain('문자 객체 0개를 축척했습니다.');
  });

  it('새 모형 높이는 주석이 아닌 문자에 주고, 주석 표지가 있는 문자는 건너뛴다', async () => {
    const h = makeHarness();
    registerModify2Commands(h.app);
    const t = h.add(plainText(0, 2.5));
    const a = plainText(10, 2.5);
    a.xdata = withAnnotativeFlag(undefined, true);
    const ah = h.add(a);
    await h.run('SCALETEXT', [{ sel: [t.handle, ah.handle] }, '', '5']);
    expect((h.doc.entityIndex.get(t.handle) as TextEntity).height).toBeCloseTo(5);
    expect((h.doc.entityIndex.get(ah.handle) as TextEntity).height).toBeCloseTo(2.5);
    expect(h.printed).toContain('주석 객체 1개는 모형 높이로 축척하지 않았습니다(주석 객체는 도면 높이(P)).');
    expect(h.printed).toContain('문자 객체 1개를 축척했습니다.');
  });
});
