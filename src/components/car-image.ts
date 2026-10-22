import { Car, ImageOff } from 'lucide';
import type { ImageStore } from '../services/image-storage/image-store';
import { h, icon } from './dom';

/**
 * Renders a stored image path. Shows "No photo" when the record has none and
 * "Photo missing" when the file was deleted outside the app, instead of a
 * broken image.
 */
export function carImage(
  store: ImageStore,
  path: string | null,
  alt: string,
  variant: 'card' | 'hero' | 'thumb' = 'card',
): HTMLDivElement {
  const frame = h('div', { class: `car-image ${variant === 'hero' ? 'car-image--hero' : ''}`.trim() });
  const fallback = (missing: boolean) =>
    h(
      'div',
      { class: 'car-image__fallback' },
      icon(missing ? ImageOff : Car, variant === 'thumb' ? 22 : 32),
      variant === 'thumb' ? null : h('span', null, missing ? 'Photo missing' : 'No photo'),
    );

  if (!path) {
    frame.appendChild(fallback(false));
    return frame;
  }
  const img = h('img', { alt, loading: 'lazy', decoding: 'async' });
  img.addEventListener('load', () => img.classList.add('is-loaded'));
  img.addEventListener('error', () => frame.replaceChildren(fallback(true)));
  frame.appendChild(img);
  void store.displayUrl(path).then((url) => {
    if (url) img.src = url;
    else frame.replaceChildren(fallback(true));
  });
  return frame;
}
