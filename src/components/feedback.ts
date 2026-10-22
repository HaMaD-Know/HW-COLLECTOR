import { CircleAlert, CircleCheck, Info, type IconNode } from 'lucide';
import { h, icon } from './dom';
import { button } from './ui';

type ToastKind = 'success' | 'error' | 'info';

let toastHost: HTMLDivElement | null = null;

export function toast(message: string, kind: ToastKind = 'info', durationMs = 3200): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.appendChild(toastHost);
  }
  const node = kind === 'success' ? CircleCheck : kind === 'error' ? CircleAlert : Info;
  const el = h(
    'div',
    { class: `toast toast--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(node, 18),
    h('span', null, message),
  );
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? durationMs + 2000 : durationMs);
}

/** Stack of open overlays so the Android back button can close the top one. */
const openOverlays: Array<() => void> = [];

export function closeTopOverlay(): boolean {
  const close = openOverlays.pop();
  if (!close) return false;
  close();
  return true;
}

function openOverlay(dialog: HTMLElement, onDismiss: () => void): () => void {
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = h('div', { class: 'overlay' }, dialog);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const index = openOverlays.indexOf(dismiss);
    if (index >= 0) openOverlays.splice(index, 1);
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    previousFocus?.focus?.();
  };
  const dismiss = () => {
    close();
    onDismiss();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismiss();
    if (event.key === 'Tab') trapFocus(dialog, event);
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  openOverlays.push(dismiss);
  const first = dialog.querySelector<HTMLElement>('[data-autofocus], button, input, select, textarea');
  first?.focus();
  return close;
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]'),
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const titleId = `dlg-${Date.now()}`;
    let close: () => void = () => undefined;
    const finish = (value: boolean) => {
      close();
      resolve(value);
    };
    const dialog = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('h2', { id: titleId }, opts.title),
      h('p', null, opts.message),
      h(
        'div',
        { class: 'btn-row' },
        button({ label: opts.cancelLabel ?? 'Cancel', variant: 'outline', onClick: () => finish(false) }),
        button({
          label: opts.confirmLabel,
          variant: opts.danger ? 'danger' : 'primary',
          onClick: () => finish(true),
        }),
      ),
    );
    close = openOverlay(dialog, () => resolve(false));
  });
}

export interface SheetAction<T extends string> {
  id: T;
  label: string;
  icon: IconNode;
  danger?: boolean;
}

export function actionSheet<T extends string>(title: string, actions: Array<SheetAction<T>>): Promise<T | null> {
  return new Promise((resolve) => {
    let close: () => void = () => undefined;
    const finish = (value: T | null) => {
      close();
      resolve(value);
    };
    const dialog = h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', null, title),
      h(
        'div',
        { class: 'sheet-list' },
        actions.map((a) =>
          h(
            'button',
            { type: 'button', class: a.danger ? 'is-danger' : '', onClick: () => finish(a.id) },
            icon(a.icon, 20),
            a.label,
          ),
        ),
      ),
      button({ label: 'Cancel', variant: 'outline', block: true, onClick: () => finish(null) }),
    );
    close = openOverlay(dialog, () => resolve(null));
  });
}

/** Shows arbitrary content in a dialog; resolves when closed. */
export function infoDialog(title: string, content: Node, closeLabel = 'Close'): Promise<void> {
  return new Promise((resolve) => {
    let close: () => void = () => undefined;
    const dialog = h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', null, title),
      content,
      button({
        label: closeLabel,
        variant: 'primary',
        block: true,
        onClick: () => {
          close();
          resolve();
        },
      }),
    );
    close = openOverlay(dialog, () => resolve());
  });
}
