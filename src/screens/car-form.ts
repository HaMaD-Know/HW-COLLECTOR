import { Camera, CircleAlert, ImagePlus, Images, Save, Trash2 } from 'lucide';
import type { AppContext } from '../app/context';
import { h, icon, uid } from '../components/dom';
import { confirmDialog, toast } from '../components/feedback';
import { topBar } from '../components/nav';
import { button, emptyState, selectField, setBusy, textareaField, textField } from '../components/ui';
import type { Screen } from '../navigation/router';
import { ValidationError } from '../repositories/car-repository';
import { pickPhoto, PhotoError, type PickedPhoto } from '../services/photo-service';
import {
  CAR_COLORS,
  colorSwatch,
  CONDITION_LABELS,
  CONDITIONS,
  PACKAGING_LABELS,
  PACKAGING_STATUSES,
  SERIES_SUGGESTIONS,
  type CarInput,
  type CarRecord,
} from '../types/models';
import { moneyToInput, parseMoney } from '../utils/format';
import { createId } from '../utils/id';
import { LIMITS, maxReleaseYear } from '../utils/validation';
import { describeError } from './car-actions';

function yearOptions(): Array<{ value: string; label: string }> {
  const options = [];
  for (let y = maxReleaseYear(); y >= LIMITS.minYear; y--) options.push({ value: String(y), label: String(y) });
  return options;
}

function colorOptions(current: string | null): Array<{ value: string; label: string }> {
  const options = CAR_COLORS.map((c) => ({ value: c.name, label: c.name }));
  if (current && !options.some((o) => o.value.toLowerCase() === current.toLowerCase())) {
    options.unshift({ value: current, label: current });
  }
  return options;
}

/** Add (no id) or edit (id) a car. */
export async function carFormScreen(ctx: AppContext, editId?: string): Promise<Screen> {
  const existing = editId ? await ctx.cars.get(editId).catch(() => null) : null;
  if (editId && !existing) {
    return {
      el: h(
        'section',
        null,
        topBar({ title: 'Edit car', onBack: () => ctx.back() }),
        emptyState({
          icon: CircleAlert,
          title: 'Car not found',
          message: 'It may have been deleted.',
          action: button({ label: 'Back to collection', variant: 'primary', onClick: () => ctx.navigate('/collection') }),
        }),
      ),
    };
  }
  return buildForm(ctx, existing);
}

function buildForm(ctx: AppContext, existing: CarRecord | null): Screen {
  const isEdit = existing !== null;
  const currency = ctx.settings.get().currency;
  /** Stable id for this add attempt: re-tapping Save can never create two records. */
  const pendingId = existing?.id ?? createId();

  let photo: PickedPhoto | null = null;
  /** Path of the new photo once written to storage (reused if Save is retried). */
  let storedPhotoPath: string | null = null;
  let removedExistingPhoto = false;
  let saved = false;
  let saving = false;

  // ---------- Fields ----------
  const name = textField('Car name', {
    value: existing?.name,
    placeholder: 'Type the car name…',
    maxLength: LIMITS.name,
  });
  name.control.setAttribute('autocapitalize', 'words');
  name.control.required = true;
  const seriesListId = uid('series');
  const series = textField('Series', {
    value: existing?.series,
    optional: true,
    placeholder: 'e.g. HW Exotics',
    maxLength: LIMITS.shortText,
    list: seriesListId,
  });
  const seriesList = h('datalist', { id: seriesListId }, SERIES_SUGGESTIONS.map((s) => h('option', { value: s })));
  const colorDot = h('span', { class: 'swatch', 'aria-hidden': 'true', style: 'background:transparent' });
  const color = selectField('Color', colorOptions(existing?.color ?? null), {
    value: existing?.color ?? '',
    optional: true,
    placeholder: 'Not set',
    prefix: colorDot,
  });
  const updateDot = () => {
    const hex = colorSwatch(color.control.value);
    colorDot.style.background = hex ?? 'transparent';
    colorDot.style.visibility = hex ? 'visible' : 'hidden';
  };
  color.control.addEventListener('change', updateDot);
  updateDot();
  const releaseYear = selectField('Release year', yearOptions(), {
    value: existing?.releaseYear?.toString() ?? '',
    optional: true,
    placeholder: 'Unknown',
  });
  const notes = textareaField('Notes', {
    value: existing?.notes,
    optional: true,
    placeholder: 'Any special details? (e.g. variant, damage, where you found it)',
    maxLength: LIMITS.notes,
  });
  const manufacturer = textField('Manufacturer', {
    value: existing?.manufacturer,
    optional: true,
    placeholder: 'e.g. Ford',
    maxLength: LIMITS.shortText,
  });
  const model = textField('Model / casting', {
    value: existing?.model,
    optional: true,
    placeholder: 'e.g. GT-40 Mk II',
    maxLength: LIMITS.shortText,
  });
  const purchaseYear = selectField(
    'Purchase year',
    yearOptions().filter((o) => Number(o.value) <= new Date().getFullYear()),
    { value: existing?.purchaseYear?.toString() ?? '', optional: true, placeholder: 'Unknown' },
  );
  const condition = selectField(
    'Condition',
    CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] })),
    { value: existing?.condition ?? '', optional: true, placeholder: 'Not set' },
  );
  const packaging = selectField(
    'Packaging',
    PACKAGING_STATUSES.map((p) => ({ value: p, label: PACKAGING_LABELS[p] })),
    { value: existing?.packaging ?? '', optional: true, placeholder: 'Not set' },
  );
  const price = textField(`Purchase price (${currency})`, {
    value: moneyToInput(existing?.purchasePriceCents ?? null, currency),
    optional: true,
    inputMode: 'decimal',
    placeholder: '0.00',
  });
  const estimate = textField(`Your estimated value (${currency})`, {
    value: moneyToInput(existing?.estimatedValueCents ?? null, currency),
    optional: true,
    inputMode: 'decimal',
    placeholder: '0.00',
    hint: 'Your own estimate. The app never predicts market value.',
  });
  const location = textField('Bought at', {
    value: existing?.purchaseLocation,
    optional: true,
    placeholder: 'e.g. Walmart, swap meet',
    maxLength: LIMITS.shortText,
  });

  const moreOpen =
    !!existing &&
    [
      existing.manufacturer,
      existing.model,
      existing.purchaseYear,
      existing.condition,
      existing.packaging,
      existing.purchasePriceCents,
      existing.estimatedValueCents,
      existing.purchaseLocation,
    ].some((v) => v != null);
  const more = h(
    'details',
    { open: moreOpen },
    h('summary', { class: 'form-section', style: 'cursor:pointer' }, 'More details'),
    h('div', { class: 'field-grid' }, manufacturer.root, model.root),
    h('div', { class: 'field-grid' }, purchaseYear.root, condition.root),
    packaging.root,
    h('div', { class: 'field-grid' }, price.root, estimate.root),
    location.root,
  );

  // ---------- Photo capture ----------
  const frame = h('div', { class: 'capture__frame' });
  const captureActions = h('div', { class: 'capture__actions' });
  const capture = h('div', { class: 'capture' }, frame, captureActions);

  function renderCapture(): void {
    frame.replaceChildren();
    const keepExisting = !photo && existing?.imagePath && !removedExistingPhoto;
    if (photo) {
      frame.append(
        h('img', { src: photo.previewUrl, alt: 'Selected photo' }),
        h('div', { class: 'capture__corners' }, h('span')),
      );
    } else if (keepExisting) {
      const img = h('img', { alt: existing?.name ?? 'Car photo' });
      void ctx.images.displayUrl(existing!.imagePath).then((url) => {
        if (url) img.src = url;
        else frame.replaceChildren(h('div', { class: 'capture__empty' }, icon(CircleAlert, 32), 'Photo file is missing'));
      });
      frame.append(img, h('div', { class: 'capture__corners' }, h('span')));
    } else {
      frame.append(
        h('div', { class: 'capture__corners' }, h('span')),
        h(
          'div',
          { class: 'capture__empty' },
          icon(ImagePlus, 40),
          h('strong', null, 'Add a photo'),
          h('span', { class: 'small' }, 'Take a photo or choose one from your gallery.'),
        ),
      );
    }
    const hasPhoto = !!photo || !!keepExisting;
    captureActions.replaceChildren(
      sourceButton(Camera, hasPhoto ? 'Retake photo' : 'Take photo', 'Open camera', () => choose('camera')),
      sourceButton(Images, 'Choose from gallery', 'Your photos', () => choose('gallery')),
    );
    if (hasPhoto) {
      captureActions.append(
        h(
          'div',
          { style: 'grid-column:1/-1' },
          button({
            label: 'Remove photo',
            variant: 'ghost',
            small: true,
            icon: Trash2,
            onClick: () => {
              photo = null;
              void discardStoredPhoto();
              if (existing?.imagePath) removedExistingPhoto = true;
              renderCapture();
            },
          }),
        ),
      );
    }
  }

  function sourceButton(node: typeof Camera, title: string, subtitle: string, onClick: () => void) {
    return h(
      'button',
      { type: 'button', class: 'source-btn', onClick },
      icon(node, 24),
      h('div', null, h('strong', null, title), h('span', null, subtitle)),
    );
  }

  async function choose(source: 'camera' | 'gallery'): Promise<void> {
    try {
      const picked = await pickPhoto(source);
      if (!picked) return; // cancelled
      await discardStoredPhoto();
      photo = picked;
      renderCapture();
    } catch (error) {
      toast(error instanceof PhotoError ? error.message : 'Could not open the photo.', 'error');
    }
  }

  async function discardStoredPhoto(): Promise<void> {
    if (storedPhotoPath) {
      const path = storedPhotoPath;
      storedPhotoPath = null;
      await ctx.images.releaseIfUnreferenced(path);
    }
  }

  // ---------- Save ----------
  function collect(): { input: Partial<CarInput>; ok: boolean } {
    let ok = true;
    for (const f of [name, price, estimate]) f.setError(null);
    const priceCents = parseMoney(price.control.value, currency);
    const estimateCents = parseMoney(estimate.control.value, currency);
    if (Number.isNaN(priceCents)) {
      price.setError('Enter an amount like 4.99');
      ok = false;
    }
    if (Number.isNaN(estimateCents)) {
      estimate.setError('Enter an amount like 12.50');
      ok = false;
    }
    if (!name.control.value.trim()) {
      name.setError('Car name is required.');
      ok = false;
    }
    return {
      ok,
      input: {
        name: name.control.value,
        series: series.control.value,
        color: color.control.value || null,
        releaseYear: releaseYear.control.value ? Number(releaseYear.control.value) : null,
        notes: notes.control.value,
        manufacturer: manufacturer.control.value,
        model: model.control.value,
        purchaseYear: purchaseYear.control.value ? Number(purchaseYear.control.value) : null,
        condition: (condition.control.value || null) as CarInput['condition'],
        packaging: (packaging.control.value || null) as CarInput['packaging'],
        purchasePriceCents: Number.isNaN(priceCents) ? null : priceCents,
        estimatedValueCents: Number.isNaN(estimateCents) ? null : estimateCents,
        purchaseLocation: location.control.value,
        isWishlisted: existing?.isWishlisted ?? false,
      },
    };
  }

  const saveButton = button({
    label: isEdit ? 'Save changes' : 'Save Car',
    variant: 'primary',
    icon: Save,
    block: true,
    type: 'submit',
  });

  async function save(event: Event): Promise<void> {
    event.preventDefault();
    if (saving) return;
    const { input, ok } = collect();
    if (!ok) {
      (form.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
      return;
    }
    saving = true;
    const restore = setBusy(saveButton, 'Saving…');
    try {
      const duplicates = await ctx.cars.findByName(String(input.name), existing?.id);
      if (duplicates.length && (!isEdit || existing?.name.toLowerCase() !== String(input.name).trim().toLowerCase())) {
        const proceed = await confirmDialog({
          title: 'Possible duplicate',
          message: `You already have ${duplicates.length === 1 ? 'a car' : `${duplicates.length} cars`} named "${duplicates[0].name}". Save anyway?`,
          confirmLabel: 'Save anyway',
        });
        if (!proceed) return;
      }

      if (photo && !storedPhotoPath) storedPhotoPath = await ctx.images.save(photo.base64, photo.mimeType);
      const oldImage = existing?.imagePath ?? null;
      const imagePath = photo ? storedPhotoPath : removedExistingPhoto ? null : oldImage;

      if (isEdit && existing) {
        await ctx.cars.update(existing.id, { ...input, imagePath });
        await ctx.db.persist();
        saved = true;
        if (oldImage && oldImage !== imagePath) await ctx.images.releaseIfUnreferenced(oldImage);
        ctx.events.emit('cars-changed');
        toast('Changes saved', 'success');
        ctx.back();
      } else {
        const car = await ctx.cars.create({ ...input, imagePath }, pendingId);
        await ctx.db.persist();
        saved = true;
        ctx.events.emit('cars-changed');
        toast(`${car.name} added to your collection`, 'success');
        ctx.navigate(`/car/${encodeURIComponent(car.id)}`, { replace: true });
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        if (error.fieldErrors.name) name.setError(error.fieldErrors.name);
        if (error.fieldErrors.purchasePriceCents) price.setError(error.fieldErrors.purchasePriceCents);
        if (error.fieldErrors.estimatedValueCents) estimate.setError(error.fieldErrors.estimatedValueCents);
      }
      toast(describeError(error, 'Could not save the car.'), 'error');
    } finally {
      saving = false;
      if (!saved) restore();
    }
  }

  const form = h(
    'form',
    { novalidate: true, onSubmit: (e: Event) => void save(e) },
    h('h2', { class: 'form-section', style: 'margin-top:0' }, 'Car details'),
    name.root,
    seriesList,
    series.root,
    h('div', { class: 'field-grid' }, color.root, releaseYear.root),
    notes.root,
    more,
    h('div', { class: 'sticky-actions' }, saveButton),
  );

  const el = h(
    'section',
    null,
    topBar({ title: isEdit ? 'Edit car' : 'Add a car', onBack: () => ctx.back() }),
    h('div', { class: 'add-layout' }, h('div', { class: 'stack' }, capture), h('div', { class: 'panel' }, form)),
  );

  renderCapture();

  return {
    el,
    destroy: () => {
      // A photo written for a save that never completed must not linger.
      if (!saved) void discardStoredPhoto();
    },
  };
}
