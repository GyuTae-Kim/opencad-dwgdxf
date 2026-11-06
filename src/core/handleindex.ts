/**
 * 핸들 → 값 색인(문서의 entityIndex·objects).
 *
 * 열쇠가 들어오는 길은 set 하나뿐이다(Map 생성자에 목록을 주는 것도 set을 부른다 — 여기서는 목록을 받지 않고 of로 만든다).
 * 그 길에서 "글자 길이, 같으면 글자 차례"로 가장 큰 열쇠를 기억한다. 지워도 줄이지 않으므로 늘 지금 든 열쇠 모두의 위(같거나 큼)다.
 * 그래서 above(h)가 참이면 h와 같은 열쇠는 이 색인에 없다(같은 글자면 이 차례에서도 같은 자리라 기억한 것보다 클 수 없다).
 * 새 핸들(edit/session.ts newHandle)은 이것으로 이미 쓰인 핸들인지 확인(has)을 건너뛴다(100차 — 객체 42만 개 도면 EXPLODE는
 * 새 핸들 약 124만 번, 두 색인의 has가 명령의 약 11%였다). 세션 밖에서 색인에 넣어도 set을 지나므로 기억이 따라간다.
 *
 * 정규형 핸들(대문자 16진, 앞 0 없음 — 리더가 핸들을 이 꼴로 읽는다)끼리는 이 차례가 곧 수의 차례라, 늘어나는 씨앗이 쓰인 가장 큰 핸들을
 * 넘으면 바로 위가 된다. 정규형이 아닌 열쇠(소문자 등)가 기억을 키우면 위가 되는 일이 줄 뿐(그때는 전처럼 has로 확인한다) 틀리지 않는다.
 * Map.prototype.set.call로 넣으면 기억을 건너뛰므로 쓰지 않는다. 구조화 복제·new Map(색인)은 일반 Map이 된다(그때도 전처럼 has로 확인한다).
 */
export class HandleIndex<V> extends Map<string, V> {
  /** 넣은 열쇠 가운데 (길이, 글자 차례)로 가장 큰 것('' = 아직 없음) */
  private top = '';

  /** 목록(일반 Map 등)의 열쇠·값을 같은 차례로 담은 색인 */
  static of<V>(entries: Iterable<readonly [string, V]>): HandleIndex<V> {
    const ix = new HandleIndex<V>();
    for (const [k, v] of entries) ix.set(k, v);
    return ix;
  }

  override set(k: string, v: V): this {
    const t = this.top;
    if (typeof k === 'string' && (k.length > t.length || (k.length === t.length && k > t))) this.top = k;
    return super.set(k, v);
  }

  override clear(): void {
    this.top = '';
    super.clear();
  }

  /** h가 이 색인에 넣은 모든 열쇠보다 (길이, 글자 차례)로 큰지(참이면 has(h)는 거짓이다) */
  above(h: string): boolean {
    const t = this.top;
    return h.length > t.length || (h.length === t.length && h > t);
  }
}
