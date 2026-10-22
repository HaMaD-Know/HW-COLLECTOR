import { CircleAlert, type IconNode } from 'lucide';
import { h, icon, uid } from './dom';

export interface ButtonOptions {
  label: string;
  variant?: 'primary' | 'success' | 'outline' | 'ghost' | 'danger' | 'default';
  icon?: IconNode;
  block?: boolean;
  small?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  ariaLabel?: string;
}

export function button(opts: ButtonOptions): HTMLButtonElement {
  const classes = ['btn'];
  if (opts.variant && opts.variant !== 'default') classes.push(`btn--${opts.variant}`);
  if (opts.block) classes.push('btn--block');
  if (opts.small) classes.push('btn--sm');
  return h(
    'button',
    {
      type: opts.type ?? 'button',
      class: classes.join(' '),
      disabled: opts.disabled,
      onClick: opts.onClick,
      'aria-label': opts.ariaLabel,
    },
    opts.icon ? icon(opts.icon, 18) : null,
    h('span', null, opts.label),
  );
}

export function iconButton(
  node: IconNode,
  label: string,
  onClick: (event: MouseEvent) => void,
  extraClass = '',
): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `icon-btn ${extraClass}`.trim(), 'aria-label': label, title: label, onClick },
    icon(node, 22),
  );
}

/** Puts a button into a busy state and returns a function that restores it. */
export function setBusy(btn: HTMLButtonElement, busyLabel: string): () => void {
  const original = Array.from(btn.childNodes);
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, busyLabel));
  return () => {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.replaceChildren(...original);
  };
}

export interface FieldHandle<T extends HTMLElement> {
  root: HTMLDivElement;
  control: T;
  setError(message: string | null | undefined): void;
}

function fieldWrapper<T extends HTMLElement>(
  label: string,
  control: T,
  opts: { optional?: boolean; hint?: string; id: string; prefix?: Node | null },
): FieldHandle<T> {
  const errorId = `${opts.id}-error`;
  const error = h('div', { class: 'field__error', id: errorId, role: 'alert', hidden: true });
  const root = h(
    'div',
    { class: 'field' },
    h('label', { for: opts.id }, label, opts.optional ? h('span', { class: 'field__optional' }, ' (optional)') : null),
    opts.prefix ? h('div', { class: 'input-with-swatch' }, opts.prefix, control) : control,
    opts.hint ? h('div', { class: 'field__hint' }, opts.hint) : null,
    error,
  );
  return {
    root,
    control,
    setError(message) {
      root.classList.toggle('field--error', !!message);
      error.hidden = !message;
      error.textContent = message ?? '';
      if (message) control.setAttribute('aria-describedby', errorId);
      else control.removeAttribute('aria-describedby');
      control.setAttribute('aria-invalid', message ? 'true' : 'false');
    },
  };
}

export function textField(
  label: string,
  opts: {
    value?: string | number | null;
    placeholder?: string;
    optional?: boolean;
    hint?: string;
    inputMode?: string;
    type?: string;
    maxLength?: number;
    list?: string;
    autocomplete?: string;
  } = {},
): FieldHandle<HTMLInputElement> {
  const id = uid('f');
  const input = h('input', {
    id,
    class: 'input',
    type: opts.type ?? 'text',
    value: opts.value == null ? '' : String(opts.value),
    placeholder: opts.placeholder,
    inputmode: opts.inputMode,
    maxLength: opts.maxLength,
    autocomplete: opts.autocomplete ?? 'off',
    enterkeyhint: 'next',
  });
  if (opts.list) input.setAttribute('list', opts.list);
  return fieldWrapper(label, input, { optional: opts.optional, hint: opts.hint, id });
}

export function textareaField(
  label: string,
  opts: { value?: string | null; placeholder?: string; optional?: boolean; maxLength?: number } = {},
): FieldHandle<HTMLTextAreaElement> {
  const id = uid('f');
  const textarea = h('textarea', {
    id,
    class: 'textarea',
    placeholder: opts.placeholder,
    maxLength: opts.maxLength,
    rows: 4,
  });
  textarea.value = opts.value ?? '';
  return fieldWrapper(label, textarea, { optional: opts.optional, id });
}

export function selectField(
  label: string,
  options: Array<{ value: string; label: string }>,
  opts: { value?: string | null; optional?: boolean; placeholder?: string; prefix?: Node | null } = {},
): FieldHandle<HTMLSelectElement> {
  const id = uid('f');
  const select = h(
    'select',
    { id, class: 'select' },
    opts.placeholder !== undefined ? h('option', { value: '' }, opts.placeholder) : null,
    options.map((o) => h('option', { value: o.value }, o.label)),
  );
  select.value = opts.value ?? '';
  return fieldWrapper(label, select, { optional: opts.optional, id, prefix: opts.prefix });
}

export function chip(text: string, variant: '' | 'orange' | 'success' | 'warning' | 'demo' = '', node?: IconNode) {
  return h('span', { class: `chip ${variant ? `chip--${variant}` : ''}`.trim() }, node ? icon(node, 13) : null, text);
}

export function spinner(large = false): HTMLSpanElement {
  return h('span', { class: `spinner ${large ? 'spinner--lg' : ''}`.trim(), role: 'status', 'aria-label': 'Loading' });
}

export function loadingState(message = 'Loading…'): HTMLDivElement {
  return h('div', { class: 'loading', role: 'status', 'aria-live': 'polite' }, spinner(true), h('span', null, message));
}

export function emptyState(opts: {
  icon: IconNode;
  title: string;
  message: string;
  action?: HTMLElement | null;
}): HTMLDivElement {
  return h(
    'div',
    { class: 'state' },
    h('div', { class: 'state__icon' }, icon(opts.icon, 32)),
    h('h2', null, opts.title),
    h('p', null, opts.message),
    opts.action ?? null,
  );
}

export function errorState(message: string, onRetry?: () => void): HTMLDivElement {
  return h(
    'div',
    { class: 'state state--error', role: 'alert' },
    h('div', { class: 'state__icon' }, icon(CircleAlert, 32)),
    h('h2', null, 'Something went wrong'),
    h('p', null, message),
    onRetry ? button({ label: 'Try again', variant: 'outline', onClick: onRetry }) : null,
  );
}

export function notice(
  node: IconNode,
  content: string | Node,
  variant: '' | 'warning' | 'danger' = '',
): HTMLDivElement {
  return h(
    'div',
    { class: `notice ${variant ? `notice--${variant}` : ''}`.trim() },
    icon(node, 18),
    typeof content === 'string' ? h('p', null, content) : content,
  );
}

export function swatch(color: string | null): HTMLSpanElement | null {
  if (!color) return null;
  return h('span', { class: 'swatch', style: `background:${color}`, 'aria-hidden': 'true' });
}
