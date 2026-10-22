import { createElement as createIcon, type IconNode } from 'lucide';

type Child = Node | string | number | null | undefined | false;
export type ChildTree = Child | ChildTree[];
type Props = Record<string, unknown> & {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
};

/**
 * Tiny DOM builder. Strings become text nodes (never parsed as HTML), so user
 * data such as car names and notes cannot inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: ChildTree[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key in el && key !== 'style' && key !== 'list' && !key.includes('-')) {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: ChildTree[]): void {
  for (const child of children) {
    if (Array.isArray(child)) append(parent, child);
    else if (child != null && child !== false) {
      parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function icon(node: IconNode, size = 20, extraClass = ''): SVGElement {
  const svg = createIcon(node, {
    width: size,
    height: size,
    'stroke-width': 2,
    'aria-hidden': 'true',
    class: `icon ${extraClass}`.trim(),
  });
  return svg;
}

let idCounter = 0;
export function uid(prefix = 'el'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
