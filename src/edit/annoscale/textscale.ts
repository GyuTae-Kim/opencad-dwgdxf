/**
 * SCALETEXT의 높이 옵션과 주석 문자(118차, Autodesk SCALETEXT 도움말):
 * - 새 모형 높이: 주석이 아닌 객체에만 준다.
 * - 도면 높이(P, Paper height): 주석 객체에만, 주석 특성에 따라 — 그려지는 높이 = 용지 높이 × 객체의 보이는 축척 배율
 *   (주석 객체 자체 데이터는 보이는 축척의 표현이고, 다른 축척 표현은 높이 비로 따라간다 — represent.ts).
 * - 객체 일치(M): 고른 객체와 같은 꼴(주석·주석 아님)에만. 주석이면 용지 높이를 맞춘다.
 * - 축척 비율: 모두.
 * 예전에는 셋 다 모든 문자에 같은 모형 높이를 주어, 1:50 주석 문자에 도면 높이 2.5를 주면 그려지는 높이가 125가 아니라 2.5가 됐다.
 */
import type { CadDocument, Entity } from '../../core/model';
import { type ScaleIndex, annoState } from './represent';

/** 높이 옵션 */
export type TextScaleMode =
  | { kind: 'model'; height: number }
  | { kind: 'paper'; height: number }
  | { kind: 'match'; source: Entity; height: number }
  | { kind: 'factor'; factor: number };

/** 문자의 주석 꼴: 주석이면 보이는 축척의 배율(축척을 읽을 수 없는 주석 객체는 null) */
export function textAnnoFactor(doc: CadDocument, e: Entity, idx: ScaleIndex): { annotative: false } | { annotative: true; factor: number | null } {
  const st = annoState(doc, e, idx);
  if (!st) return { annotative: false };
  if (st.foreign || !st.current) return { annotative: true, factor: null };
  const f = idx.factor(st.current);
  return { annotative: true, factor: f > 0 && Number.isFinite(f) ? f : null };
}

/** 건너뛴 까닭: 주석 객체(모형 높이·주석 아닌 객체에 맞추기), 주석이 아닌 객체(도면 높이·주석 객체에 맞추기), 축척을 읽을 수 없는 주석 객체 */
export type TextScaleSkip = 'annotative' | 'nonAnnotative' | 'unknownScale';

/**
 * 문자 하나의 축척 배율(그려지는 높이 h에서). 옵션이 이 객체에 닿지 않으면 건너뛴 까닭.
 * 객체 일치의 height는 고른 객체의 그려지는 높이(모형 높이)다
 */
export function textScaleFactor(doc: CadDocument, e: Entity, h: number, mode: TextScaleMode, idx: ScaleIndex): { k: number } | { skip: TextScaleSkip } {
  if (mode.kind === 'factor') return { k: mode.factor };
  const a = textAnnoFactor(doc, e, idx);
  if (mode.kind === 'model') return a.annotative ? { skip: 'annotative' } : { k: mode.height / h };
  if (mode.kind === 'paper') {
    if (!a.annotative) return { skip: 'nonAnnotative' };
    return a.factor === null ? { skip: 'unknownScale' } : { k: (mode.height * a.factor) / h };
  }
  const s = textAnnoFactor(doc, mode.source, idx);
  if (!s.annotative) return a.annotative ? { skip: 'annotative' } : { k: mode.height / h };
  if (!a.annotative) return { skip: 'nonAnnotative' };
  if (s.factor === null || a.factor === null) return { skip: 'unknownScale' };
  return { k: ((mode.height / s.factor) * a.factor) / h };
}
