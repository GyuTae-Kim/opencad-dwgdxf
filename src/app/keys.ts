/**
 * Ctrl(맥은 ⌘) 단축키 가운데 AutoCAD 2026의 제도 보조·입력 키(Shift·Alt 없이):
 *   Ctrl+G 격자, Ctrl+B 스냅, Ctrl+L 직교, Ctrl+F 객체 스냅, Ctrl+U 극좌표, Ctrl+H PICKSTYLE(그룹 선택),
 *   Ctrl+I 상태 막대 좌표 표시 돌리기(COORDS), Ctrl+K 하이퍼링크, Ctrl+0 화면 정리, Ctrl+8 빠른 계산기, Ctrl+J·Ctrl+M Enter, Ctrl+\ 취소.
 * 브라우저가 페이지에 넘기지 않는 조합(Ctrl+N·W·T·Tab, 맥의 ⌘H·⌘M·⌘Q)은 여기서 다룰 수 없다.
 * 열기·저장·명령 취소 같은 그 밖의 Ctrl 키는 app.ts onKey가 직접 다룬다.
 */
export type Toggle = 'grid' | 'snap' | 'ortho' | 'osnap' | 'polar' | 'pickstyle' | 'coords';

export type KeyAction = { toggle: Toggle } | { run: string } | { enter: true } | { cancel: true };

const MAP: Record<string, KeyAction> = {
  g: { toggle: 'grid' },
  b: { toggle: 'snap' },
  l: { toggle: 'ortho' },
  f: { toggle: 'osnap' },
  u: { toggle: 'polar' },
  h: { toggle: 'pickstyle' },
  i: { toggle: 'coords' },
  k: { run: 'HYPERLINK' },
  '0': { run: 'CLEANSCREENON' },
  '8': { run: 'QUICKCALC' },
  j: { enter: true },
  m: { enter: true },
  '\\': { cancel: true },
};

/** Ctrl+키(Shift·Alt 없이)의 동작. 이 표에 없으면 null */
export function ctrlAction(ev: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): KeyAction | null {
  if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey) return null;
  // 한글 자판 상태에서도 같은 자리의 키로(KeyG → g)
  const k = /^Key([A-Z])$/.exec(ev.code ?? '')?.[1]?.toLowerCase() ?? (ev.code === 'Digit0' ? '0' : ev.code === 'Digit8' ? '8' : ev.code === 'Backslash' ? '\\' : ev.key.toLowerCase());
  return MAP[k] ?? null;
}

/**
 * Ctrl(⌘) 한 번 누르기: Ctrl을 눌렀다가 그 사이 다른 키·클릭 없이 떼면 한 번 누른 것이다(다기능 그립의 Ctrl 순환).
 * Ctrl을 누른 채 찍기(그립 복사)·Ctrl 단축키는 누르기로 치지 않는다. 오래 누르고 있다가 떼도 치지 않는다.
 */
export class CtrlTap {
  private downAt: number | null = null;
  /** 이보다 오래 누르고 있으면 누르기가 아니다(밀리초) */
  constructor(private readonly maxHold = 1000) {}

  /** 키를 눌렀다(t: 밀리초) */
  keyDown(ev: { key: string; repeat?: boolean }, t: number): void {
    if (ev.key === 'Control' || ev.key === 'Meta') {
      if (!ev.repeat) this.downAt = t;
    } else this.downAt = null;
  }

  /** 키를 뗐다: Ctrl 한 번 누르기면 true */
  keyUp(ev: { key: string }, t: number): boolean {
    if (ev.key !== 'Control' && ev.key !== 'Meta') return false;
    const d = this.downAt;
    this.downAt = null;
    return d !== null && t - d <= this.maxHold;
  }

  /** 누르거나 끌었다(Ctrl을 누른 채 찍기·창 포커스 잃음) */
  cancel(): void {
    this.downAt = null;
  }
}
