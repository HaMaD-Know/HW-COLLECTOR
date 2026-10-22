import { EllipsisVertical, Heart } from 'lucide';
import type { ImageStore } from '../services/image-storage/image-store';
import type { CarRecord } from '../types/models';
import { carImage } from './car-image';
import { h, icon } from './dom';
import { chip, iconButton } from './ui';

export function carMeta(car: Pick<CarRecord, 'color' | 'releaseYear' | 'series'>, includeSeries = false): string {
  return [includeSeries ? car.series : null, car.color, car.releaseYear?.toString()].filter(Boolean).join(' • ');
}

export function carCard(
  car: CarRecord,
  store: ImageStore,
  handlers: { open: () => void; menu: () => void },
): HTMLElement {
  const meta = carMeta(car);
  return h(
    'article',
    { class: 'car-card' },
    h(
      'button',
      { type: 'button', class: 'car-card__link', onClick: handlers.open, 'aria-label': `Open ${car.name}` },
      carImage(store, car.imagePath, car.name),
      h(
        'div',
        { class: 'car-card__body' },
        h('h3', { class: 'car-card__name' }, car.name),
        h('div', { class: 'car-card__meta' }, meta || car.series || 'No details yet'),
      ),
    ),
    h('div', { class: 'car-card__badges' }, car.isSample ? chip('Demo', 'demo') : null),
    car.isWishlisted ? h('span', { class: 'car-card__heart', title: 'Flagged for wishlist' }, icon(Heart, 15)) : null,
    h(
      'div',
      { class: 'car-card__menu' },
      iconButton(EllipsisVertical, `Actions for ${car.name}`, (event) => {
        event.stopPropagation();
        handlers.menu();
      }),
    ),
  );
}
