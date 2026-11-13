/**
 * MATCHPROP의 주석 특성(120차, Autodesk 특성 설정 대화 상자 도움말 — 문자·치수·다중 지시선은 스타일과 함께, 해치는 해치 특성과
 * 함께(121차) 주석 특성을 대상 객체에 옮긴다). 원본과 대상의 주석 여부가 다를 때만 다룬다 — 같으면 matchProps 그대로(주석 객체끼리는
 * 확정 고리가 레코드를 따라가게 한다).
 * - 주석으로: 특성을 옮긴 뒤 대상 공간의 주석 축척 하나로. 크기는 ANNOUPDATE(119차)와 같은 길 — 문자는 스타일 고정 용지 높이 ×
 *   축척 배율(0이면 크기 그대로 — 같은 종류면 옮긴 원본 높이 그대로), 치수는 DIMSCALE = 축척 배율로 다시 그린 그림,
 *   다중 지시선은 전체 축척 = 축척 배율, 해치는 원본의 용지 무늬(옮긴 무늬 축척 그대로, 무늬 선 = 원본 선 ÷ 원본이 보이는 축척 배율) ×
 *   축척 배율.
 * - 주석 아님으로: 특성 팔레트처럼 용지 크기로 돌리고 레코드를 지운 뒤 특성을 옮긴다(같은 종류 문자는 원본 높이).
 *   치수는 특성(스타일·재지정)을 옮긴 뒤 끄고 그림은 MATCHPROP이 다시 그린다.
 * 레코드 작업이 확정 고리의 따라가기와 겹치지 않게 부르는 쪽은 결과를 commitOwn으로 확정한다.
 */
import type { Entity, MTextEntity, TextEntity } from '../core/model';
import type { EditOp } from '../edit/session';
import { type EditEnv, annoState, annoUpdateScale, factorOf, makeAnnotative, makeNonAnnotative } from '../edit/annoscale';
import type { App } from './app';
import type { DocState } from './docstate';
import { scaleForSpace } from './annoscale-core';

export interface AnnoMatch {
  after: Entity;
  ops: EditOp[];
  /** 치수 그림을 이미 다시 그렸다(MATCHPROP이 다시 그리지 않는다) */
  drawn: boolean;
}

const textual = (e: Entity) => e.type === 'TEXT' || e.type === 'MTEXT';

/** 켠 설정이 주석 특성을 옮기는 짝인지: 문자(TEXT·MTEXT 끼리), 치수, 다중 지시선, 해치(121차) */
function annoPair(src: Entity, dst: Entity, on: ReadonlySet<string>): boolean {
  if (textual(src) && textual(dst)) return on.has('text');
  if (src.type === 'DIMENSION' && dst.type === 'DIMENSION') return on.has('dimension');
  if (src.type === 'MULTILEADER' && dst.type === 'MULTILEADER') return on.has('mleader');
  if (src.type === 'HATCH' && dst.type === 'HATCH') return on.has('hatch');
  return false;
}

/**
 * 원본의 주석 특성을 대상(공간 블록 키 block)에 옮긴 결과. 주석 여부가 같거나 옮길 짝이 아니면 null(부르는 쪽이 match를 쓴다).
 * match: 주석 특성 밖의 특성 옮기기(matchProps). env: 한 번의 고르기에 같은 것(새 치수 그림 이름이 겹치지 않게 taken을 함께 쓴다)
 */
export function matchAnnotative(app: App, st: DocState, env: EditEnv, block: string, src: Entity, dst: Entity, on: ReadonlySet<string>, match: (s: Entity, d: Entity) => Entity): AnnoMatch | null {
  if (!annoPair(src, dst, on)) return null;
  const ss = annoState(st.doc, src, env.idx);
  const ds = annoState(st.doc, dst, env.idx);
  // 축척을 읽을 수 없는 주석 객체(표지만 있다)는 다루지 않는다
  if (ss?.foreign || ds?.foreign || !!ss === !!ds) return null;
  if (ss) {
    const s = scaleForSpace(app, st, block);
    if (!s?.handle) return null;
    const c = match(src, dst);
    const f = factorOf(s);
    // 해치: 옮긴 무늬 선은 원본이 보이는 축척(ss.current)의 모형 크기다
    const k = textual(c) ? annoUpdateScale(st.doc, c as TextEntity | MTextEntity, f) : c.type === 'MULTILEADER' ? f / (c.context.scale || 1) : c.type === 'HATCH' ? f / env.idx.factor(ss.current) : undefined;
    const r = makeAnnotative(env, c, s.name, k === undefined ? {} : { k });
    return { after: r.entity, ops: r.ops, drawn: c.type === 'DIMENSION' };
  }
  if (dst.type === 'DIMENSION') {
    const r = makeNonAnnotative(env, match(src, dst), { regen: false });
    return { after: r.entity, ops: r.ops, drawn: false };
  }
  const r = makeNonAnnotative(env, dst);
  return { after: match(src, r.entity), ops: r.ops, drawn: false };
}
