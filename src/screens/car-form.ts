import {
  Camera,
  Check,
  CircleAlert,
  ImagePlus,
  Images,
  Info,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from 'lucide';
import type { AppContext } from '../app/context';
import { append, h, icon, uid } from '../components/dom';
import { confirmDialog, toast } from '../components/feedback';
import { topBar } from '../components/nav';
import {
  button,
  chip,
  emptyState,
  notice,
  selectField,
  setBusy,
  spinner,
  swatch,
  textareaField,
  textField,
} from '../components/ui';
import type { Screen } from '../navigation/router';
import { ValidationError } from '../repositories/car-repository';
import { IdentificationError, type IdentificationResult } from '../services/identification/types';
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
  type NameSource,
} from '../types/models';
import { moneyToInput, parseMoney } from '../utils/format';
import { createId } from '../utils/id';
import { LIMITS, maxReleaseYear } from '../utils/validation';
import { describeError } from './car-actions';

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading'; controller: AbortController }
  | { kind: 'result'; result: IdentificationResult }
  | { kind: 'error'; error: IdentificationError };

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
  let ai: AiState = { kind: 'idle' };
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

  function currentPreview(): string | null {
    return photo?.previewUrl ?? null;
  }

  function renderCapture(): void {
    frame.replaceChildren();
    const preview = currentPreview();
    const keepExisting = !photo && existing?.imagePath && !removedExistingPhoto;
    if (preview) {
      frame.append(h('img', { src: preview, alt: 'Selected photo' }), h('div', { class: 'capture__corners' }, h('span')));
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
    const hasPhoto = !!preview || !!keepExisting;
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
              cancelAi();
              ai = { kind: 'idle' };
              renderCapture();
              renderAi();
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
      cancelAi();
      await discardStoredPhoto();
      photo = picked;
      ai = { kind: 'idle' };
      renderCapture();
      renderAi();
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

  // ---------- AI identification ----------
  const aiBody = h('div', { 'aria-live': 'polite' });
  const aiPanel = h(
    'div',
    { class: 'panel' },
    h('h2', { class: 'panel__title' }, icon(Sparkles, 18), 'AI Identifier'),
    aiBody,
  );

  function cancelAi(): void {
    if (ai.kind === 'loading') ai.controller.abort();
  }

  function renderAi(): void {
    const provider = ctx.identifier();
    aiBody.replaceChildren();
    if (!provider.isConfigured()) {
      aiBody.append(
        notice(
          Info,
          h(
            'p',
            null,
            'AI identification is not set up, so type the name below. ',
            h('a', { href: '#/settings', style: 'color:var(--primary-2)' }, 'AI settings'),
          ),
        ),
      );
      return;
    }
    if (!photo) {
      aiBody.append(
        h(
          'p',
          { class: 'small muted', style: 'margin:0' },
          isEdit && existing?.imagePath && !removedExistingPhoto
            ? 'Take or choose a new photo to identify it again.'
            : 'Add a photo, then tap Identify. You can always type the name yourself.',
        ),
      );
      return;
    }
    if (ai.kind === 'idle') {
      aiBody.append(
        h('p', { class: 'small muted', style: 'margin:0 0 12px' }, 'Your photo is sent to the identification service only when you tap Identify.'),
        button({ label: 'Identify car', variant: 'primary', icon: Sparkles, block: true, onClick: () => void identify() }),
      );
      return;
    }
    if (ai.kind === 'loading') {
      const controller = ai.controller;
      aiBody.append(
        h('div', { class: 'ai-panel__status' }, spinner(), 'Analyzing your car…'),
        button({
          label: 'Cancel',
          variant: 'ghost',
          small: true,
          icon: X,
          onClick: () => {
            controller.abort();
            ai = { kind: 'idle' };
            renderAi();
          },
        }),
      );
      return;
    }
    if (ai.kind === 'error') {
      const offline = ai.error.code === 'offline';
      aiBody.append(
        notice(offline ? WifiOff : CircleAlert, ai.error.message, 'warning'),
        h(
          'div',
          { class: 'btn-row', style: 'margin-top:12px' },
          button({ label: 'Try again', variant: 'outline', small: true, icon: RefreshCw, onClick: () => void identify() }),
          button({ label: 'Type name instead', variant: 'ghost', small: true, icon: Pencil, onClick: () => name.control.focus() }),
        ),
      );
      return;
    }

    const result = ai.result;
    if (!result.isDiecastCar || !result.suggestedName) {
      append(aiBody, [
        notice(CircleAlert, 'This photo does not look like a die-cast car to the AI. Try another photo or enter the name manually.', 'warning'),
        result.reasoningSummary ? h('p', { class: 'small faint' }, result.reasoningSummary) : null,
      ]);
      return;
    }
    const facts = [
      result.manufacturer ? chip(result.manufacturer) : null,
      result.series ? chip(result.series, 'orange') : null,
      result.releaseYear ? chip(String(result.releaseYear)) : null,
      result.color ? h('span', { class: 'chip' }, swatch(colorSwatch(result.color)), result.color) : null,
    ].filter(Boolean) as HTMLElement[];
    append(aiBody, [
      h(
        'div',
        { class: 'ai-result' },
        photo ? h('img', { class: 'ai-result__thumb', src: photo.previewUrl, alt: '' }) : null,
        h(
          'div',
          { style: 'min-width:0' },
          h('div', { class: 'ai-result__label' }, result.needsManualReview ? 'Possible match' : 'Suggested match'),
          h('div', { class: 'ai-result__name' }, result.suggestedName),
          result.needsManualReview ? chip('Needs review', 'warning', CircleAlert) : chip('Clear match', 'success', Check),
          facts.length ? h('div', { class: 'detail-chips', style: 'margin:8px 0 0' }, facts) : null,
        ),
      ),
      result.reasoningSummary ? h('p', { class: 'small muted' }, result.reasoningSummary) : null,
      result.alternatives.length
        ? h(
            'div',
            null,
            h('div', { class: 'small muted' }, 'Could also be:'),
            h(
              'div',
              { class: 'alt-list' },
              result.alternatives.map((alt) =>
                h('button', { type: 'button', onClick: () => acceptName(alt, false) }, alt),
              ),
            ),
          )
        : null,
      h('p', { class: 'small', style: 'margin:12px 0 8px;font-weight:650' }, 'Is this correct?'),
      h(
        'div',
        { class: 'btn-row' },
        button({ label: "Yes, it's correct", variant: 'success', icon: Check, small: true, onClick: () => acceptName(result.suggestedName, true) }),
        button({
          label: 'Edit name',
          variant: 'outline',
          icon: Pencil,
          small: true,
          onClick: () => {
            if (!name.control.value.trim()) name.control.value = result.suggestedName;
            name.control.focus();
            name.control.select();
          },
        }),
      ),
      h('p', { class: 'small faint', style: 'margin:10px 0 0' }, `Suggestions come from ${result.provider} and can be wrong. Check before saving.`),
    ]);
  }

  /** Copies the chosen name (and, if empty, the AI's other facts) into the form for the user to review. */
  function acceptName(value: string, fillFacts: boolean): void {
    name.control.value = value;
    name.setError(null);
    if (fillFacts && ai.kind === 'result') {
      const r = ai.result;
      if (r.series && !series.control.value) series.control.value = r.series;
      if (r.manufacturer && !manufacturer.control.value) manufacturer.control.value = r.manufacturer;
      if (r.releaseYear && !releaseYear.control.value) releaseYear.control.value = String(r.releaseYear);
      if (r.color && !color.control.value) {
        const match = CAR_COLORS.find((c) => r.color!.toLowerCase().includes(c.name.toLowerCase()));
        if (match) {
          color.control.value = match.name;
          updateDot();
        }
      }
    }
    toast('Name filled in. Review the details, then save.', 'success');
  }

  async function identify(): Promise<void> {
    if (!photo) return;
    if (!ctx.settings.get().aiConsent) {
      const ok = await confirmDialog({
        title: 'Send this photo for identification?',
        message:
          'To identify the car, this photo is uploaded to the identification service configured for this app, which forwards it to an external AI provider (Anthropic) under that provider’s API data policy. The service does not save your photo. You can always skip this and type the name yourself.',
        confirmLabel: 'Allow and identify',
        cancelLabel: 'Not now',
      });
      if (!ok) return;
      await ctx.settings.update({ aiConsent: true });
    }
    const controller = new AbortController();
    ai = { kind: 'loading', controller };
    renderAi();
    try {
      const result = await ctx.identifier().identify({ base64: photo.base64, mimeType: photo.mimeType }, controller.signal);
      if (controller.signal.aborted) return;
      ai = { kind: 'result', result };
    } catch (error) {
      if (controller.signal.aborted) return;
      ai = { kind: 'error', error: error instanceof IdentificationError ? error : new IdentificationError('unknown') };
    }
    renderAi();
  }

  // ---------- Save ----------
  function suggestionForSave(): string | null {
    if (ai.kind === 'result' && ai.result.suggestedName) return ai.result.suggestedName;
    if (!photo && existing?.aiSuggestedName) return existing.aiSuggestedName;
    return null;
  }

  function nameSourceFor(value: string, suggestion: string | null): NameSource {
    if (!suggestion) return 'manual';
    return value.trim().toLowerCase() === suggestion.trim().toLowerCase() ? 'ai-confirmed' : 'ai-corrected';
  }

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
    const suggestion = suggestionForSave();
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
        aiSuggestedName: suggestion,
        nameSource: nameSourceFor(name.control.value, suggestion),
        isWishlisted: existing?.isWishlisted ?? false,
      },
    };
  }

  const saveButton = button({ label: isEdit ? 'Save changes' : 'Save Car', variant: 'primary', icon: Save, block: true, type: 'submit' });

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
    h('div', { class: 'add-layout' }, h('div', { class: 'stack' }, capture, aiPanel), h('div', { class: 'panel' }, form)),
  );

  renderCapture();
  renderAi();
  const offSettings = ctx.events.on('settings-changed', renderAi);

  return {
    el,
    destroy: () => {
      offSettings();
      cancelAi();
      // A photo written for a save that never completed must not linger.
      if (!saved) void discardStoredPhoto();
    },
  };
}

