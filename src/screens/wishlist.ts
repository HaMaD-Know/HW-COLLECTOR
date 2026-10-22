import { Check, CircleCheck, EllipsisVertical, Heart, PackageCheck, Pencil, Plus, Trash2, Undo2 } from 'lucide';
import type { AppContext } from '../app/context';
import { carImage } from '../components/car-image';
import { carMeta } from '../components/car-card';
import { h } from '../components/dom';
import { actionSheet, confirmDialog, toast } from '../components/feedback';
import { topBar } from '../components/nav';
import { button, chip, emptyState, errorState, iconButton, loadingState } from '../components/ui';
import type { Screen } from '../navigation/router';
import type { WishlistItem } from '../types/models';
import { formatDate } from '../utils/format';
import { describeError } from './car-actions';

export function wishlistScreen(ctx: AppContext): Screen {
  const body = h('div', null, loadingState());

  async function convert(item: WishlistItem): Promise<void> {
    const ok = await confirmDialog({
      title: 'Add to your collection?',
      message: `"${item.name}" will be added to your collection and marked as acquired here. You can add a photo and details next.`,
      confirmLabel: 'Add to collection',
    });
    if (!ok) return;
    try {
      const { car, created } = await ctx.wishlist.convertToCar(item.id);
      await ctx.db.persist();
      ctx.events.emit('wishlist-changed');
      ctx.events.emit('cars-changed');
      toast(created ? `${car.name} added to your collection` : 'Already in your collection', 'success');
      ctx.navigate(`/car/${encodeURIComponent(car.id)}/edit`);
    } catch (error) {
      toast(describeError(error, 'Could not add it to your collection.'), 'error');
    }
  }

  async function remove(item: WishlistItem): Promise<void> {
    const ok = await confirmDialog({
      title: 'Remove from wishlist?',
      message: `"${item.name}" will be removed from your wishlist.${item.acquiredCarId ? ' The car stays in your collection.' : ''}`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      const removed = await ctx.wishlist.delete(item.id);
      await ctx.db.persist();
      if (removed) await ctx.images.releaseIfUnreferenced(removed.imagePath);
      ctx.events.emit('wishlist-changed');
      toast('Removed from wishlist', 'success');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  }

  async function setAcquired(item: WishlistItem, acquired: boolean): Promise<void> {
    try {
      await ctx.wishlist.setAcquired(item.id, acquired);
      await ctx.db.persist();
      ctx.events.emit('wishlist-changed');
      toast(acquired ? 'Marked as acquired' : 'Moved back to wanted', 'success');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  }

  async function menu(item: WishlistItem): Promise<void> {
    type Choice = 'edit' | 'convert' | 'acquired' | 'unacquire' | 'open-car' | 'delete';
    const actions: Array<{ id: Choice; label: string; icon: typeof Check; danger?: boolean }> = [
      { id: 'edit', label: 'Edit', icon: Pencil },
    ];
    if (!item.acquiredCarId) actions.push({ id: 'convert', label: 'Got it — add to collection', icon: PackageCheck });
    if (!item.acquiredAt) actions.push({ id: 'acquired', label: 'Mark acquired (don’t add to collection)', icon: Check });
    if (item.acquiredAt && !item.acquiredCarId) actions.push({ id: 'unacquire', label: 'Move back to wanted', icon: Undo2 });
    if (item.acquiredCarId) actions.push({ id: 'open-car', label: 'Open in collection', icon: CircleCheck });
    actions.push({ id: 'delete', label: 'Remove', icon: Trash2, danger: true });
    const choice = await actionSheet(item.name, actions);
    if (choice === 'edit') ctx.navigate(`/wishlist/${encodeURIComponent(item.id)}/edit`);
    else if (choice === 'convert') await convert(item);
    else if (choice === 'acquired') await setAcquired(item, true);
    else if (choice === 'unacquire') await setAcquired(item, false);
    else if (choice === 'open-car' && item.acquiredCarId) ctx.navigate(`/car/${encodeURIComponent(item.acquiredCarId)}`);
    else if (choice === 'delete') await remove(item);
  }

  function row(item: WishlistItem): HTMLElement {
    const sub = [item.series, item.notes].filter(Boolean).join(' • ');
    return h(
      'div',
      { class: `list-item ${item.acquiredAt ? 'list-item--done' : ''}`.trim() },
      h('div', { class: 'list-item__thumb' }, carImage(ctx.images, item.imagePath, item.name, 'thumb')),
      h(
        'div',
        {
          class: 'list-item__body',
          role: 'button',
          tabindex: '0',
          onClick: () => ctx.navigate(`/wishlist/${encodeURIComponent(item.id)}/edit`),
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') ctx.navigate(`/wishlist/${encodeURIComponent(item.id)}/edit`);
          },
        },
        h('p', { class: 'list-item__title' }, item.name),
        sub ? h('p', { class: 'list-item__sub' }, sub) : null,
        item.acquiredAt
          ? h(
              'div',
              { style: 'margin-top:4px' },
              chip(item.acquiredCarId ? 'In collection' : `Acquired ${formatDate(item.acquiredAt)}`, 'success', Check),
            )
          : null,
      ),
      item.acquiredAt
        ? null
        : button({ label: 'Got it', variant: 'outline', small: true, icon: PackageCheck, onClick: () => void convert(item) }),
      iconButton(EllipsisVertical, `Actions for ${item.name}`, () => void menu(item)),
    );
  }

  async function refresh(): Promise<void> {
    try {
      const [items, flagged] = await Promise.all([ctx.wishlist.list(), ctx.cars.list({ wishlistedOnly: true, sort: 'name-asc' })]);
      const open = items.filter((i) => !i.acquiredAt);
      const done = items.filter((i) => i.acquiredAt);
      body.replaceChildren();
      if (items.length === 0 && flagged.length === 0) {
        body.append(
          emptyState({
            icon: Heart,
            title: 'Your wishlist is empty',
            message: 'Keep track of cars you are hunting for. Mark them as acquired when you find them.',
            action: button({ label: 'Add to wishlist', variant: 'primary', icon: Plus, onClick: () => ctx.navigate('/wishlist/new') }),
          }),
        );
        return;
      }
      body.append(
        h('div', { class: 'section-title' }, h('span', null, `Wanted (${open.length})`)),
        open.length
          ? h('div', { class: 'list' }, open.map(row))
          : h('p', { class: 'small muted' }, 'Nothing on the hunt list right now.'),
      );
      if (flagged.length) {
        body.append(
          h('div', { class: 'section-title' }, h('span', null, `Flagged in your collection (${flagged.length})`)),
          h('p', { class: 'small faint', style: 'margin-top:-6px' }, 'Cars you own but want another copy, variant or upgrade of.'),
          h(
            'div',
            { class: 'list' },
            flagged.map((car) =>
              h(
                'div',
                { class: 'list-item' },
                h('div', { class: 'list-item__thumb' }, carImage(ctx.images, car.imagePath, car.name, 'thumb')),
                h(
                  'div',
                  { class: 'list-item__body', role: 'button', tabindex: '0', onClick: () => ctx.navigate(`/car/${encodeURIComponent(car.id)}`) },
                  h('p', { class: 'list-item__title' }, car.name),
                  h('p', { class: 'list-item__sub' }, carMeta(car, true) || 'In your collection'),
                ),
              ),
            ),
          ),
        );
      }
      if (done.length) {
        body.append(h('div', { class: 'section-title' }, h('span', null, `Acquired (${done.length})`)), h('div', { class: 'list' }, done.map(row)));
      }
    } catch (error) {
      console.error(error);
      body.replaceChildren(errorState('Your wishlist could not be loaded.', () => void refresh()));
    }
  }

  const el = h(
    'section',
    null,
    topBar({ title: 'Wishlist', brand: true, actions: [iconButton(Plus, 'Add to wishlist', () => ctx.navigate('/wishlist/new'))] }),
    body,
  );
  const offs = [ctx.events.on('wishlist-changed', () => void refresh()), ctx.events.on('cars-changed', () => void refresh())];
  void refresh();
  return { el, destroy: () => offs.forEach((off) => off()) };
}
