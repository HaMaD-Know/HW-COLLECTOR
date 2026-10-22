import { Camera, CircleAlert, Images, Save, Trash2 } from 'lucide';
import type { AppContext } from '../app/context';
import { carImage } from '../components/car-image';
import { h, uid } from '../components/dom';
import { toast } from '../components/feedback';
import { topBar } from '../components/nav';
import { button, emptyState, setBusy, textareaField, textField } from '../components/ui';
import type { Screen } from '../navigation/router';
import { ValidationError } from '../repositories/car-repository';
import { pickPhoto, PhotoError, type PickedPhoto } from '../services/photo-service';
import { SERIES_SUGGESTIONS, type WishlistItem } from '../types/models';
import { createId } from '../utils/id';
import { LIMITS } from '../utils/validation';
import { describeError } from './car-actions';

export async function wishlistFormScreen(ctx: AppContext, editId?: string): Promise<Screen> {
  const existing = editId ? await ctx.wishlist.get(editId).catch(() => null) : null;
  if (editId && !existing) {
    return {
      el: h(
        'section',
        null,
        topBar({ title: 'Wishlist', onBack: () => ctx.back() }),
        emptyState({ icon: CircleAlert, title: 'Entry not found', message: 'It may have been removed.' }),
      ),
    };
  }
  return build(ctx, existing);
}

function build(ctx: AppContext, existing: WishlistItem | null): Screen {
  const pendingId = existing?.id ?? createId();
  let photo: PickedPhoto | null = null;
  let storedPath: string | null = null;
  let removedPhoto = false;
  let saved = false;

  const name = textField('Car name', { value: existing?.name, placeholder: 'e.g. Twin Mill', maxLength: LIMITS.name });
  const listId = uid('series');
  const series = textField('Series', { value: existing?.series, optional: true, maxLength: LIMITS.shortText, list: listId });
  const notes = textareaField('Notes', {
    value: existing?.notes,
    optional: true,
    placeholder: 'Colour variant, where to look, price limit…',
    maxLength: LIMITS.notes,
  });

  const photoHost = h('div', { class: 'stack' });
  function renderPhoto(): void {
    const keep = !photo && existing?.imagePath && !removedPhoto;
    const preview = photo
      ? h('div', { class: 'car-image car-image--hero' }, h('img', { src: photo.previewUrl, alt: 'Reference photo', class: 'is-loaded' }))
      : keep
        ? carImage(ctx.images, existing!.imagePath, existing!.name, 'hero')
        : null;
    photoHost.replaceChildren(
      ...(preview ? [preview] : []),
      h(
        'div',
        { class: 'btn-row' },
        button({ label: 'Take photo', variant: 'outline', small: true, icon: Camera, onClick: () => void choose('camera') }),
        button({ label: 'Gallery', variant: 'outline', small: true, icon: Images, onClick: () => void choose('gallery') }),
        preview
          ? button({
              label: 'Remove',
              variant: 'ghost',
              small: true,
              icon: Trash2,
              onClick: () => {
                photo = null;
                if (existing?.imagePath) removedPhoto = true;
                renderPhoto();
              },
            })
          : null,
      ),
    );
  }

  async function choose(source: 'camera' | 'gallery'): Promise<void> {
    try {
      const picked = await pickPhoto(source);
      if (picked) {
        photo = picked;
        if (storedPath) {
          await ctx.images.releaseIfUnreferenced(storedPath);
          storedPath = null;
        }
        renderPhoto();
      }
    } catch (error) {
      toast(error instanceof PhotoError ? error.message : 'Could not open the photo.', 'error');
    }
  }

  const saveBtn = button({ label: existing ? 'Save changes' : 'Add to wishlist', variant: 'primary', icon: Save, block: true, type: 'submit' });
  let saving = false;

  async function save(event: Event): Promise<void> {
    event.preventDefault();
    if (saving) return;
    name.setError(null);
    if (!name.control.value.trim()) {
      name.setError('Name is required.');
      name.control.focus();
      return;
    }
    saving = true;
    const restore = setBusy(saveBtn, 'Saving…');
    try {
      if (photo && !storedPath) storedPath = await ctx.images.save(photo.base64, photo.mimeType);
      const oldImage = existing?.imagePath ?? null;
      const imagePath = photo ? storedPath : removedPhoto ? null : oldImage;
      const input = { name: name.control.value, series: series.control.value, notes: notes.control.value, imagePath };
      if (existing) await ctx.wishlist.update(existing.id, input);
      else await ctx.wishlist.create(input, pendingId);
      await ctx.db.persist();
      saved = true;
      if (oldImage && oldImage !== imagePath) await ctx.images.releaseIfUnreferenced(oldImage);
      ctx.events.emit('wishlist-changed');
      toast(existing ? 'Wishlist entry updated' : 'Added to wishlist', 'success');
      ctx.back();
    } catch (error) {
      if (error instanceof ValidationError && error.fieldErrors.name) name.setError(error.fieldErrors.name);
      toast(describeError(error, 'Could not save.'), 'error');
    } finally {
      saving = false;
      if (!saved) restore();
    }
  }

  renderPhoto();
  const el = h(
    'section',
    null,
    topBar({ title: existing ? 'Edit wishlist entry' : 'Add to wishlist', onBack: () => ctx.back() }),
    h(
      'div',
      { class: 'add-layout' },
      h('div', { class: 'panel' }, h('h2', { class: 'panel__title' }, 'Reference photo (optional)'), photoHost),
      h(
        'form',
        { class: 'panel', novalidate: true, onSubmit: (e: Event) => void save(e) },
        name.root,
        h('datalist', { id: listId }, SERIES_SUGGESTIONS.map((s) => h('option', { value: s }))),
        series.root,
        notes.root,
        h('div', { class: 'sticky-actions' }, saveBtn),
      ),
    ),
  );
  return {
    el,
    destroy: () => {
      if (!saved && storedPath) void ctx.images.releaseIfUnreferenced(storedPath);
    },
  };
}
