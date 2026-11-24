/**
 * 지시선(LEADER) 복사본의 주석 연결(지시선 DXF 340 ↔ 주석의 반응자 330, 160차).
 * Autodesk 도움말 "About Leader Associativity"(ActiveX)·"Leader Associativity"(.NET): 지시선과 주석을 한 번에 함께 복사하면 새 복사본도 연관이고,
 * 따로 복사하면 연관이 아니다. freshEntity가 복사본의 원본 핸들(지시선은 원본 주석 핸들도)을 적어 두고, 같은 편집에서 새 핸들을 받은 뒤
 * relinkLeaderCopies가 같은 변환으로 만든 복사본끼리 잇는다 — 주석이 함께 복사되지 않았으면 복사본 지시선의 주석 연결을 뗀다.
 * 전에는 복사본 지시선이 원본 주석을 가리켰다(함께 복사해도 복사본 주석은 반응자가 지워져 옮겨도 복사본 지시선이 따라가지 않았다).
 * 함께 복사한 객체끼리 새 핸들로 잇고 못 찾으면 떼는 것은 다른 도면으로 옮기는 정의 복사(edit/layertools/clone.ts relink)와 같다 —
 * 정의 복사는 모든 객체의 반응자를 지우므로 relink 뒤에 addLeaderReactors로 복사본 주석의 반응자를 채우고, 다른 도면에서 붙여 넣을 때(app/pastedeps.ts)는
 * leaderAnnotations로 함께 붙여 넣는 주석의 반응자를 남겨 붙여넣기 명령이 이 파일의 흐름으로 잇게 한다(162차)
 */
import type { Entity } from '../../core/model';
import { normalizeHandle } from '../../core/model';
import { transformTag } from './mtextcols';

interface CopyNote {
  /** 원본 핸들 */
  src: string;
  /** 지시선: 원본 주석 핸들 */
  annotation?: string;
  /** 같은 변환으로 만든 복사본끼리 같은 꼬리표 */
  tag: string;
}

const notes = new WeakMap<Entity, CopyNote>();

/** 지시선 주석이 될 수 있는 객체(지시선 73: 여러 줄 문자·공차·블록 참조) */
const ANNOTATION_TYPES = new Set(['MTEXT', 'TOLERANCE', 'INSERT']);

/**
 * freshEntity가 핸들을 지우기 전에 부른다: 주석이 있는 지시선과 반응자가 있는 주석 꼴 객체만 적는다.
 * 편집 명령 확정을 거치지 않고 블록 정의로 복사하는 경로(블록으로 붙여넣기·BLOCK의 유지·연관 배열의 원본 블록)도 새 핸들을 주기 전에 부르고,
 * 새 핸들을 다 준 뒤 relinkLeaderCopies를 부른다(161차)
 */
export function noteLeaderCopy(x: Entity): void {
  if (!x.handle) return;
  if (x.type === 'LEADER') {
    if (x.annotation) notes.set(x, { src: normalizeHandle(x.handle), annotation: normalizeHandle(x.annotation), tag: '' });
  } else if (x.reactors?.length && ANNOTATION_TYPES.has(x.type)) notes.set(x, { src: normalizeHandle(x.handle), tag: '' });
}

/** 같은 변환(행렬과 고도 차)으로 만든 복사본에 같은 꼬리표(적어 둔 복사본만) */
export function tagLeaderCopy(x: Entity, m: readonly number[], dz?: number): void {
  const n = notes.get(x);
  if (n) n.tag = transformTag(m, dz);
}

/**
 * 같은 편집에서 더하는 객체(또는 한 번에 블록 정의로 복사한 객체 — 새 핸들을 받고 반응자를 지운 뒤): 적어 둔 복사본 지시선마다 원본 주석이 같은 변환으로 함께 복사됐으면
 * 그 복사본을 가리키게 하고 복사본 주석의 반응자에 지시선을 넣는다. 함께 복사되지 않았으면 주석 연결을 뗀다.
 * 같은 원본의 복사본이 여럿이면(분해한 블록 참조 여럿 등) 더한 차례로 짝짓는다. 이은 수
 */
export function relinkLeaderCopies(added: readonly Entity[]): number {
  let leaders: Entity[] | null = null;
  for (const e of added) if (e.type === 'LEADER' && notes.get(e)?.annotation) (leaders ??= []).push(e);
  let linked = 0;
  if (leaders) {
    const groups = new Map<string, Map<string, Entity[]>>();
    for (const e of added) {
      const n = notes.get(e);
      if (!n) continue;
      let g = groups.get(n.tag);
      if (!g) groups.set(n.tag, (g = new Map()));
      let l = g.get(n.src);
      if (!l) g.set(n.src, (l = []));
      l.push(e);
    }
    for (const ld of leaders) {
      if (ld.type !== 'LEADER') continue;
      const n = notes.get(ld)!;
      const g = groups.get(n.tag)!;
      const k = g.get(n.src)!.indexOf(ld);
      const ann = g.get(n.annotation!)?.[k];
      if (ann && ann.handle && ANNOTATION_TYPES.has(ann.type)) {
        ld.annotation = ann.handle;
        ann.reactors = [...(ann.reactors ?? []), ld.handle];
        linked++;
      } else delete ld.annotation;
    }
  }
  for (const e of added) notes.delete(e);
  return linked;
}

/**
 * 함께 복사하는 객체 가운데 지시선이 가리키는 주석의 핸들(정규화). 반응자를 지우는 의존 정의 복사(다른 도면에서 붙여넣기 — app/pastedeps.ts)가
 * 이 주석의 원래 반응자를 남겨 두면, 붙여넣기 명령이 새 핸들을 주기 전에 noteLeaderCopy가 주석을 적어 복사본끼리 잇는다(같은 도면에서 붙여넣기와 같다 — 162차).
 * 지시선이 없으면 null
 */
export function leaderAnnotations(list: readonly Entity[]): Set<string> | null {
  let out: Set<string> | null = null;
  for (const e of list) if (e.type === 'LEADER' && e.annotation) (out ??= new Set()).add(normalizeHandle(e.annotation));
  return out;
}

/**
 * 다른 도면으로 옮기는 정의 복사(edit/layertools/clone.ts entities — 새 핸들을 다 주고 relink가 지시선 340을 함께 복사한 주석으로 이은 뒤)에서
 * 그 복사본 주석의 반응자에 복사본 지시선을 넣는다(relinkLeaderCopies가 잇는 짝과 같다 — 162차). 정의 복사가 반응자를 지워 전에는 340만 이어졌다
 * (가져온 배치의 주석을 옮겨도 지시선이 따라가지 않았다 — app/leaderassoc.ts는 주석의 반응자로 지시선을 찾는다). 넣은 수
 */
export function addLeaderReactors(list: readonly Entity[]): number {
  let byHandle: Map<string, Entity> | null = null;
  let n = 0;
  for (const ld of list) {
    if (ld.type !== 'LEADER' || !ld.annotation || !ld.handle) continue;
    byHandle ??= new Map(list.filter((x) => x.handle).map((x) => [normalizeHandle(x.handle), x] as const));
    const ann = byHandle.get(normalizeHandle(ld.annotation));
    if (!ann || !ANNOTATION_TYPES.has(ann.type)) continue;
    const h = normalizeHandle(ld.handle);
    if (ann.reactors?.some((r) => normalizeHandle(r) === h)) continue;
    ann.reactors = [...(ann.reactors ?? []), ld.handle];
    n++;
  }
  return n;
}
