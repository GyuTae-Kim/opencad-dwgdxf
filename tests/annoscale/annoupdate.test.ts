/**
 * ANNOUPDATE(119차, Autodesk ANNOUPDATE 도움말): 주석이 아닌 문자를 주석 스타일대로 주석으로 바꿀 때 스타일의 고정 용지 높이가 있으면
 * 그 높이(그려지는 높이 = 용지 높이 × 축척 배율), 0이면 크기 그대로(용지 높이 = 모형 높이 ÷ 축척 배율).
 * 예전에는 늘 지금 크기를 용지 크기로 보아 축척 배율만큼 키웠다(1:50이면 50배). 공개 실도면에서 이렇게 바뀔 문자 326개 중 325개가 고정 높이 0.
 */
import { describe, expect, it } from 'vitest';
import type { MTextEntity, TextEntity } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { registerAnnoScaleCommands } from '../../src/app/annoscale';
import { ScaleIndex, annoState, annoUpdateScale, withAnnotativeFlag } from '../../src/edit/annoscale';
import { makeHarness } from '../cmds2/harness';
import { mtext, text } from './helpers';

function setup(styleHeight: number) {
  const h = makeHarness((doc) => {
    // 축척 리스트를 둘 이름 있는 객체 사전이 있는 새 도면
    Object.assign(doc, createNewDocument('metric'));
    doc.header.set('$CLAYER', '0');
    const std = doc.textStyles.get('STANDARD')!;
    doc.textStyles.set('ANNO', { ...std, name: 'Anno', handle: 'FFF1', height: styleHeight, xdata: withAnnotativeFlag(undefined, true) });
  });
  registerAnnoScaleCommands(h.app);
  return h;
}

/** 주석 스타일인데 주석이 아닌 문자(스타일을 나중에 주석으로 바꾼 도면처럼 — 표지 없음) */
function plain<T extends TextEntity | MTextEntity>(h: ReturnType<typeof setup>, e: T): T {
  const out = h.add(e) as T;
  const after = { ...out, style: 'Anno' } as T;
  h.st.session.commit({ label: 'STYLE', ops: [{ kind: 'modify', block: '*MODEL_SPACE', before: out, after }] });
  return h.doc.entityIndex.get(out.handle) as T;
}

describe('ANNOUPDATE: 주석이 아닌 문자 → 주석', () => {
  it('스타일 용지 높이 0: 크기 그대로, 1:50 축척 하나를 지원(용지 높이 = 모형 높이 ÷ 50)', async () => {
    const h = setup(0);
    await h.run('CANNOSCALE', ['1:50']);
    const t = plain(h, text(0, 0, 2.5));
    const m = plain(h, mtext(0, 10, 2.5, 40));
    expect(annoState(h.doc, t)).toBeNull();
    await h.run('ANNOUPDATE', [{ sel: [t.handle, m.handle] }]);
    const t1 = h.doc.entityIndex.get(t.handle) as TextEntity;
    const m1 = h.doc.entityIndex.get(m.handle) as MTextEntity;
    expect(t1.height).toBeCloseTo(2.5);
    expect(m1.height).toBeCloseTo(2.5);
    expect(m1.width).toBeCloseTo(40);
    expect(annoState(h.doc, t1)?.scales).toEqual(['1:50']);
    expect(annoState(h.doc, m1)?.scales).toEqual(['1:50']);
    expect(h.printed).toContain('2개의 객체를 업데이트했습니다.');
  });

  it('스타일 고정 용지 높이 3: 그려지는 높이 = 3 × 50', async () => {
    const h = setup(3);
    await h.run('CANNOSCALE', ['1:50']);
    const t = plain(h, text(0, 0, 2.5));
    await h.run('ANNOUPDATE', [{ sel: [t.handle] }]);
    const t1 = h.doc.entityIndex.get(t.handle) as TextEntity;
    expect(t1.height).toBeCloseTo(150);
    expect(annoState(h.doc, t1, new ScaleIndex(h.doc))?.current).toBe('1:50');
  });

  it('배율 계산', () => {
    const h = setup(3);
    const t = { ...text(0, 0, 2.5), style: 'Anno' };
    expect(annoUpdateScale(h.doc, t, 50)).toBeCloseTo(60);
    expect(annoUpdateScale(h.doc, { ...t, style: 'Standard' }, 50)).toBe(1);
  });
});
