/**
 * 제도 설정 극좌표 추적 탭의 추가 각도 목록(POLARADDANG). AutoCAD 도움말의 제도 설정 대화상자처럼 목록과 [새로 만들기]·[삭제] 단추:
 * "To add new angles, click New. To remove existing angles, click Delete." 새로 만들기는 10개까지(같은 방향은 거른다).
 * 각도는 도면의 각도 단위(AUNITS·AUPREC)로 보이고 그 단위로 받는다(polar.ts formatPolarAngle·addPolarAngle). 값은 도로 둔다.
 *
 * 키보드: 목록에서 위·아래·Home·End로 고르고 Delete(또는 Backspace)로 지운다. Insert는 새로 만들기.
 * 새 각도 칸에서 Enter로 넣고 Esc로 그만둔다(상자는 닫지 않는다). 칸에 글을 남긴 채 확인을 누르면 넣어 보고, 안 되면 상자를 닫지 않는다.
 * 화면 읽기: 목록은 listbox(고른 칸은 aria-activedescendant), 단추 이름은 "추가 각도 새로 만들기"·"추가 각도 삭제", 알림은 status.
 */
import { h } from './ui/dom';
import { type AngleUnits, POLARADDANG_MAX, addPolarAngle, formatPolarAngle, removePolarAngle } from './polar';

export interface PolarAddEditor {
  el: HTMLElement;
  /** 지금 목록(도, 넣은 차례) */
  values(): number[];
  /** 새 각도 칸에 글이 남아 있으면 넣어 본다. 안 되면 문구(그 글은 칸에 그대로) */
  commitPending(): string | null;
}

let serial = 0;

export function polarAddEditor(initial: readonly number[], units: AngleUnits): PolarAddEditor {
  const id = `polar-add-${++serial}`;
  let list = [...initial];
  let sel = list.length ? 0 : -1;
  const box = h('div', { class: 'polar-add-list', role: 'listbox', 'aria-label': '추가 각도 목록', tabindex: 0 });
  const edit = h('input', { type: 'text', class: 'polar-add-edit', 'aria-label': '새 추가 각도', autocomplete: 'off', spellcheck: 'false' });
  edit.hidden = true;
  const btnNew = h('button', { type: 'button', class: 'btn', 'aria-label': '추가 각도 새로 만들기' }, '새로 만들기');
  const btnDel = h('button', { type: 'button', class: 'btn', 'aria-label': '추가 각도 삭제' }, '삭제');
  const msg = h('div', { class: 'polar-add-msg', role: 'status' });
  const say = (text: string, error = false) => {
    msg.textContent = text;
    msg.classList.toggle('err', error);
  };

  const render = () => {
    box.replaceChildren(
      ...list.map((d, i) =>
        h(
          'div',
          {
            id: `${id}-${i}`,
            class: 'polar-add-item',
            role: 'option',
            'aria-selected': i === sel ? 'true' : 'false',
            translate: 'no',
            onclick: () => {
              sel = i;
              render();
              box.focus();
            },
          },
          formatPolarAngle(d, units, true),
        ),
      ),
    );
    if (sel >= 0) box.setAttribute('aria-activedescendant', `${id}-${sel}`);
    else box.removeAttribute('aria-activedescendant');
    (box.children[sel] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    btnNew.disabled = list.length >= POLARADDANG_MAX;
    btnDel.disabled = sel < 0;
  };

  const startNew = () => {
    // 치던 각도가 있으면 먼저 넣는다(못 넣으면 그 칸에 남긴다)
    if (!edit.hidden && edit.value.trim() && commit()) {
      edit.focus();
      return;
    }
    if (list.length >= POLARADDANG_MAX) {
      say(`추가 각도는 ${POLARADDANG_MAX}개까지입니다.`, true);
      // 막힌 단추에 초점이 남지 않게
      box.focus();
      return;
    }
    say('');
    edit.hidden = false;
    edit.value = '';
    edit.focus();
  };
  const stopEdit = () => {
    edit.value = '';
    edit.hidden = true;
  };
  /** 새 각도 칸의 글을 넣는다. 빈 칸이면 그만둔다 */
  const commit = (): string | null => {
    if (edit.hidden) return null;
    if (!edit.value.trim()) {
      stopEdit();
      return null;
    }
    const r = addPolarAngle(list, edit.value, units);
    if ('error' in r) {
      say(r.error, true);
      return r.error;
    }
    list = r.list;
    sel = r.index;
    stopEdit();
    render();
    say(r.note ?? (list.length >= POLARADDANG_MAX ? `추가 각도는 ${POLARADDANG_MAX}개까지입니다.` : ''));
    return null;
  };
  const remove = () => {
    if (sel < 0) return;
    const r = removePolarAngle(list, sel);
    list = r.list;
    sel = r.index;
    render();
    say('');
    if (list.length) box.focus();
    else btnNew.focus();
  };

  btnNew.addEventListener('click', startNew);
  btnDel.addEventListener('click', remove);
  edit.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      if (!commit()) box.focus();
    } else if (ev.key === 'Escape') {
      // 새 각도만 그만둔다(상자는 닫지 않는다)
      ev.preventDefault();
      ev.stopPropagation();
      stopEdit();
      say('');
      btnNew.focus();
    }
  });
  box.addEventListener('keydown', (ev) => {
    const go = (i: number) => {
      if (!list.length) return;
      sel = Math.max(0, Math.min(list.length - 1, i));
      render();
    };
    const k = ev.key;
    if (k === 'ArrowDown') go(sel + 1);
    else if (k === 'ArrowUp') go(sel < 0 ? 0 : sel - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(list.length - 1);
    else if (k === 'Delete' || k === 'Backspace') remove();
    else if (k === 'Insert') startNew();
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  });

  render();
  const el = h('div', { class: 'polar-add' }, box, edit, h('div', { class: 'polar-add-btns' }, btnNew, btnDel), msg);
  return { el, values: () => [...list], commitPending: commit };
}
