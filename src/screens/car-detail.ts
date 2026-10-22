import { Car, CarFront, EllipsisVertical, Heart, Layers, Pencil, Sparkles, Tag, Trash2 } from 'lucide';
import type { AppContext } from '../app/context';
import { carMeta } from '../components/car-card';
import { carImage } from '../components/car-image';
import { h, icon } from '../components/dom';
import { actionSheet } from '../components/feedback';
import { topBar } from '../components/nav';
import { button, chip, emptyState, errorState, iconButton, loadingState, swatch } from '../components/ui';
import type { Screen } from '../navigation/router';
import {
  colorSwatch,
  CONDITION_LABELS,
  NAME_SOURCE_LABELS,
  PACKAGING_LABELS,
  type CarRecord,
} from '../types/models';
import { formatDate, formatMoney } from '../utils/format';
import { deleteCarWithConfirm, toggleWishlistFlag } from './car-actions';

export function carDetailScreen(ctx: AppContext, id: string): Screen {
  const host = h('div', null, loadingState('Loading car…'));
  const el = h('section', null, topBar({ title: 'Car details', onBack: () => ctx.back() }), host);

  async function load(): Promise<void> {
    try {
      const car = await ctx.cars.get(id);
      if (!car) {
        el.replaceChildren(
          topBar({ title: 'Not found', onBack: () => ctx.back() }),
          emptyState({
            icon: CarFront,
            title: 'Car not found',
            message: 'It may have been deleted.',
            action: button({ label: 'Back to collection', variant: 'primary', onClick: () => ctx.navigate('/collection') }),
          }),
        );
        return;
      }
      await render(car);
    } catch (error) {
      console.error(error);
      host.replaceChildren(errorState('This car could not be loaded.', () => void load()));
    }
  }

  async function render(car: CarRecord): Promise<void> {
    const currency = ctx.settings.get().currency;
    const heart = iconButton(
      Heart,
      car.isWishlisted ? 'Remove wishlist flag' : 'Flag for wishlist',
      async () => {
        await toggleWishlistFlag(ctx, car);
      },
      car.isWishlisted ? 'icon-btn--active' : '',
    );
    heart.setAttribute('aria-pressed', String(car.isWishlisted));
    const more = iconButton(EllipsisVertical, 'More actions', async () => {
      const choice = await actionSheet(car.name, [
        { id: 'edit', label: 'Edit details', icon: Pencil },
        { id: 'delete', label: 'Delete car', icon: Trash2, danger: true },
      ]);
      if (choice === 'edit') ctx.navigate(`/car/${encodeURIComponent(car.id)}/edit`);
      if (choice === 'delete' && (await deleteCarWithConfirm(ctx, car))) ctx.back();
    });

    const specs: Array<[string, Node | string]> = [];
    const add = (label: string, value: Node | string | null | undefined) => {
      if (value != null && value !== '') specs.push([label, value]);
    };
    add('Manufacturer', car.manufacturer);
    add('Model / casting', car.model);
    add('Series', car.series);
    add('Color', car.color ? h('span', null, swatch(colorSwatch(car.color)), ` ${car.color}`) : null);
    add('Release year', car.releaseYear?.toString());
    add('Purchase year', car.purchaseYear?.toString());
    add('Condition', car.condition ? CONDITION_LABELS[car.condition] : null);
    add('Packaging', car.packaging ? PACKAGING_LABELS[car.packaging] : null);
    add('Purchase price', car.purchasePriceCents != null ? formatMoney(car.purchasePriceCents, currency) : null);
    add(
      'Your estimate',
      car.estimatedValueCents != null ? `${formatMoney(car.estimatedValueCents, currency)} (your own estimate)` : null,
    );
    add('Bought at', car.purchaseLocation);
    add('Date added', formatDate(car.createdAt));
    if (car.updatedAt - car.createdAt > 60_000) add('Last edited', formatDate(car.updatedAt));
    add('Name source', NAME_SOURCE_LABELS[car.nameSource]);
    if (car.nameSource === 'ai-corrected') add('AI had suggested', car.aiSuggestedName);
    const missing = [car.series, car.color, car.releaseYear, car.condition, car.packaging].filter((v) => v == null).length;

    const recent = (await ctx.cars.recent(7)).filter((c) => c.id !== car.id).slice(0, 6);

    const main = h(
      'div',
      null,
      carImage(ctx.images, car.imagePath, car.name, 'hero'),
      h('h2', { class: 'detail-title' }, car.name),
      h(
        'div',
        { class: 'detail-chips' },
        car.series ? chip(car.series, 'orange', Layers) : null,
        car.nameSource !== 'manual' ? chip(car.nameSource === 'ai-confirmed' ? 'AI confirmed' : 'AI corrected', 'success', Sparkles) : null,
        car.isWishlisted ? chip('Wishlist flag', 'warning', Heart) : null,
        car.isSample ? chip('Demo record', 'demo') : null,
      ),
      h('div', { class: 'panel' }, h('dl', { class: 'spec-list' }, specs.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
      missing >= 3
        ? h(
            'p',
            { class: 'small faint' },
            'Some details are not set yet. ',
            h('a', { href: `#/car/${encodeURIComponent(car.id)}/edit`, style: 'color:var(--primary-2)' }, 'Add details'),
          )
        : null,
      car.notes
        ? h('div', { class: 'panel' }, h('h3', { class: 'panel__title' }, icon(Tag, 18), 'Notes'), h('p', { class: 'notes' }, car.notes))
        : null,
      h(
        'div',
        { class: 'btn-row', style: 'margin-top:var(--space-4)' },
        button({
          label: 'Edit',
          variant: 'primary',
          icon: Pencil,
          onClick: () => ctx.navigate(`/car/${encodeURIComponent(car.id)}/edit`),
        }),
        button({
          label: 'Delete',
          variant: 'danger',
          icon: Trash2,
          onClick: async () => {
            if (await deleteCarWithConfirm(ctx, car)) ctx.back();
          },
        }),
      ),
    );

    const side = h(
      'aside',
      null,
      recent.length
        ? h(
            'div',
            { class: 'panel' },
            h('h3', { class: 'panel__title' }, icon(Car, 18), 'Recent additions'),
            h(
              'div',
              { class: 'recent-strip' },
              recent.map((r) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'car-card car-card__link',
                    onClick: () => ctx.navigate(`/car/${encodeURIComponent(r.id)}`, { replace: true }),
                    'aria-label': `Open ${r.name}`,
                  },
                  carImage(ctx.images, r.imagePath, r.name),
                  h(
                    'div',
                    { class: 'car-card__body', style: 'padding-right:12px' },
                    h('div', { class: 'car-card__name' }, r.name),
                    h('div', { class: 'car-card__meta' }, carMeta(r) || ' '),
                  ),
                ),
              ),
            ),
          )
        : null,
    );

    el.replaceChildren(
      topBar({ title: car.name, onBack: () => ctx.back(), actions: [heart, more] }),
      h('div', { class: 'detail-layout' }, main, side),
    );
  }

  const off = ctx.events.on('cars-changed', () => void load());
  void load();
  return { el, destroy: off };
}
