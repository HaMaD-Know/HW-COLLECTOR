import {
  Brush,
  Database,
  Download,
  FlaskConical,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide';
import { APP_VERSION, resolveProxyUrl, type AppContext } from '../app/context';
import { h, icon } from '../components/dom';
import { confirmDialog, infoDialog, toast } from '../components/feedback';
import { topBar } from '../components/nav';
import { button, setBusy, textField } from '../components/ui';
import type { Screen } from '../navigation/router';
import { BackupValidationError, buildBackup, importBackup, validateBackup } from '../services/export-import/backup';
import { backupFileName, deliverBackup, pickBackupFile } from '../services/export-import/file-transfer';
import { normalizeProxyUrl } from '../services/identification/proxy-provider';
import { loadDemoCars } from '../services/sample-data';
import type { ThemePreference } from '../services/settings';
import { CURRENCIES, pluralize, type Currency } from '../utils/format';
import { describeError } from './car-actions';

function settingRow(title: string, description: string | Node, control: HTMLElement | null): HTMLElement {
  return h(
    'div',
    { class: 'setting' },
    h('div', { class: 'setting__text' }, h('strong', null, title), h('span', null, description)),
    control,
  );
}

function panel(node: typeof Info, title: string, ...children: Array<Node | null>): HTMLElement {
  return h('div', { class: 'panel' }, h('h2', { class: 'panel__title' }, icon(node, 18), title), ...children);
}

export function settingsScreen(ctx: AppContext): Screen {
  const settings = ctx.settings.get();

  // ---------- Appearance ----------
  const theme = h(
    'select',
    { class: 'select', 'aria-label': 'Theme' },
    h('option', { value: 'dark' }, 'Dark'),
    h('option', { value: 'light' }, 'Light'),
    h('option', { value: 'system' }, 'Match device'),
  );
  theme.value = settings.theme;
  theme.addEventListener('change', async () => {
    await ctx.settings.update({ theme: theme.value as ThemePreference });
    ctx.events.emit('settings-changed');
  });

  const currency = h(
    'select',
    { class: 'select', 'aria-label': 'Currency' },
    CURRENCIES.map((c) => h('option', { value: c }, c)),
  );
  currency.value = settings.currency;
  currency.addEventListener('change', async () => {
    await ctx.settings.update({ currency: currency.value as Currency });
    ctx.events.emit('settings-changed');
    toast('Currency updated. Existing amounts are not converted.', 'info');
  });

  // ---------- AI ----------
  const statusDot = h('span', { class: 'status-dot' });
  const statusText = h('span', null, 'Checking…');
  const proxy = textField('Identification service URL', {
    value: settings.aiProxyUrl,
    placeholder: import.meta.env.VITE_AI_PROXY_URL || 'https://your-proxy.example.com',
    type: 'url',
    hint: 'The URL of your own deployed proxy (see docs/AI_SETUP.md). Leave empty to use the build default. Never paste a provider API key here.',
  });

  async function checkStatus(): Promise<void> {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Checking…';
    const configured = resolveProxyUrl(ctx.settings.get().aiProxyUrl);
    if (!configured) {
      statusDot.classList.add('status-dot--off');
      statusText.textContent = 'Not configured — manual entry only.';
      return;
    }
    const status = await ctx.identifier().status();
    statusDot.classList.add(status.configured ? 'status-dot--ok' : 'status-dot--off');
    statusText.textContent = status.description;
  }

  const saveProxy = button({
    label: 'Save and test',
    variant: 'outline',
    small: true,
    icon: RefreshCw,
    onClick: async () => {
      const raw = proxy.control.value.trim();
      if (raw && !normalizeProxyUrl(raw)) {
        proxy.setError('Enter a full URL starting with https://');
        return;
      }
      if (/sk-ant-|api[_-]?key/i.test(raw)) {
        proxy.setError('That looks like an API key. Keys belong on the server only.');
        return;
      }
      proxy.setError(null);
      await ctx.settings.update({ aiProxyUrl: raw });
      ctx.events.emit('settings-changed');
      await checkStatus();
    },
  });

  const consentText = h('span');
  const consentBtn = button({
    label: 'Revoke',
    variant: 'ghost',
    small: true,
    onClick: async () => {
      await ctx.settings.update({ aiConsent: false });
      renderConsent();
      toast('You will be asked again before any photo is sent.', 'info');
    },
  });
  function renderConsent(): void {
    const given = ctx.settings.get().aiConsent;
    consentText.textContent = given
      ? 'You agreed that photos you choose to identify are sent to the AI service.'
      : 'You will be asked before the first photo is sent.';
    consentBtn.hidden = !given;
  }
  renderConsent();

  // ---------- Backup ----------
  const exportBtn = button({ label: 'Export', variant: 'outline', small: true, icon: Download });
  exportBtn.addEventListener('click', async () => {
    const restore = setBusy(exportBtn, 'Preparing…');
    try {
      const { backup, missingImages } = await buildBackup(ctx.db, ctx.images, APP_VERSION);
      const result = await deliverBackup(JSON.stringify(backup), backupFileName());
      const summary = `${pluralize(backup.cars.length, 'car')} and ${pluralize(backup.wishlist.length, 'wishlist entry', 'wishlist entries')}`;
      toast(result === 'downloaded' ? `Downloaded backup of ${summary}` : `Backup of ${summary} ready`, 'success');
      if (missingImages) toast(`${pluralize(missingImages, 'photo')} could not be found and were skipped.`, 'info');
    } catch (error) {
      if (!/cancel/i.test(describeError(error))) toast(describeError(error, 'Export failed.'), 'error');
    } finally {
      restore();
    }
  });

  const importBtn = button({ label: 'Import', variant: 'outline', small: true, icon: Upload });
  importBtn.addEventListener('click', async () => {
    let text: string | null;
    try {
      text = await pickBackupFile();
    } catch (error) {
      toast(describeError(error), 'error');
      return;
    }
    if (!text) return;
    const restore = setBusy(importBtn, 'Importing…');
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BackupValidationError('This file is not valid JSON.');
      }
      const { backup, warnings } = validateBackup(parsed);
      const ok = await confirmDialog({
        title: 'Import this backup?',
        message: `It contains ${pluralize(backup.cars.length, 'car')} and ${pluralize(backup.wishlist.length, 'wishlist entry', 'wishlist entries')}. Items already on this device are skipped, nothing is overwritten.${warnings.length ? ` ${pluralize(warnings.length, 'invalid entry', 'invalid entries')} will be ignored.` : ''}`,
        confirmLabel: 'Import',
      });
      if (!ok) return;
      const report = await importBackup(ctx.db, ctx.images, backup);
      ctx.events.emit('cars-changed');
      ctx.events.emit('wishlist-changed');
      const lines = [
        `Cars added: ${report.carsAdded}`,
        `Cars already present (skipped): ${report.carsSkipped}`,
        `Wishlist entries added: ${report.wishlistAdded}`,
        `Wishlist entries skipped: ${report.wishlistSkipped}`,
        `Photos restored: ${report.imagesRestored}`,
        report.imagesMissing ? `Photos missing from the file: ${report.imagesMissing}` : null,
        ...warnings.slice(0, 5),
        ...report.warnings.slice(0, 3),
      ].filter(Boolean) as string[];
      await infoDialog('Import complete', h('ul', { class: 'prose' }, lines.map((l) => h('li', null, l))));
    } catch (error) {
      toast(describeError(error, 'Import failed.'), 'error');
    } finally {
      restore();
    }
  });

  // ---------- Maintenance & demo ----------
  const cleanupBtn = button({
    label: 'Clean up',
    variant: 'outline',
    small: true,
    icon: Brush,
    onClick: async () => {
      const removed = await ctx.images.removeOrphans(await ctx.cars.allImagePaths());
      toast(removed ? `Removed ${pluralize(removed, 'unused photo file')}` : 'No unused photos found', 'success');
    },
  });

  const demoLoad = button({
    label: 'Load demo',
    variant: 'outline',
    small: true,
    icon: FlaskConical,
    onClick: async () => {
      const added = await loadDemoCars(ctx.cars, ctx.images);
      await ctx.db.persist();
      ctx.events.emit('cars-changed');
      toast(added ? `Added ${pluralize(added, 'demo car')} (marked “Demo”)` : 'Demo cars are already loaded', 'success');
    },
  });
  const demoRemove = button({
    label: 'Remove demo',
    variant: 'ghost',
    small: true,
    icon: Trash2,
    onClick: async () => {
      const removed = await ctx.cars.deleteSamples();
      await ctx.db.persist();
      for (const car of removed) await ctx.images.releaseIfUnreferenced(car.imagePath);
      ctx.events.emit('cars-changed');
      toast(removed.length ? `Removed ${pluralize(removed.length, 'demo car')}` : 'No demo cars to remove', 'success');
    },
  });

  const clearBtn = button({
    label: 'Clear collection',
    variant: 'danger',
    small: true,
    icon: TriangleAlert,
    onClick: async () => {
      const total = await ctx.cars.count();
      const wish = await ctx.wishlist.count();
      const first = await confirmDialog({
        title: 'Clear everything?',
        message: `This permanently deletes ${pluralize(total, 'car')}, ${pluralize(wish.total, 'wishlist entry', 'wishlist entries')} and their photos from this device. Export a backup first if you might want them back.`,
        confirmLabel: 'Continue',
        danger: true,
      });
      if (!first) return;
      const second = await confirmDialog({
        title: 'Are you absolutely sure?',
        message: 'There is no undo. Your collection will be empty.',
        confirmLabel: 'Delete everything',
        danger: true,
      });
      if (!second) return;
      try {
        await ctx.db.transaction(async () => {
          await ctx.cars.deleteAll();
          await ctx.wishlist.deleteAll();
        });
        await ctx.db.persist();
        await ctx.images.removeOrphans([]);
        ctx.events.emit('cars-changed');
        ctx.events.emit('wishlist-changed');
        toast('Collection cleared', 'success');
      } catch (error) {
        toast(describeError(error, 'Could not clear the collection.'), 'error');
      }
    },
  });

  const el = h(
    'section',
    null,
    topBar({ title: 'Settings', brand: true }),
    panel(
      Info,
      'General',
      settingRow('Theme', 'Dark matches the original design.', theme),
      settingRow('Currency', 'Used for purchase prices and your estimates.', currency),
    ),
    panel(
      Sparkles,
      'AI identification',
      h('div', { class: 'setting', style: 'padding-top:0' }, h('div', { class: 'setting__text' }, h('strong', null, 'Status'), h('span', { style: 'display:flex;gap:8px;align-items:center' }, statusDot, statusText))),
      h('div', { style: 'padding-top:12px' }, proxy.root, saveProxy),
      settingRow('Photo upload consent', consentText, consentBtn),
    ),
    panel(
      Database,
      'Backup & restore',
      h(
        'p',
        { class: 'prose' },
        'Your collection is stored only on this device. Uninstalling the app deletes it unless you have a backup. Export creates a single JSON file containing your records and photos; keep it somewhere safe (cloud drive, computer).',
      ),
      settingRow('Export collection', 'Save or share a backup file.', exportBtn),
      settingRow('Import backup', 'Merge a backup file into this device.', importBtn),
      settingRow('Unused photo files', 'Remove photo files no record uses.', cleanupBtn),
    ),
    panel(
      FlaskConical,
      'Demo data',
      settingRow('Sample cars', 'Six illustrated cars marked “Demo”, to preview the app. Never mixed with your real data.', h('div', { class: 'btn-row', style: 'flex-wrap:nowrap' }, demoLoad, demoRemove)),
    ),
    panel(
      ShieldCheck,
      'Privacy',
      h(
        'div',
        { class: 'prose' },
        h('p', null, 'No account, no tracking, no analytics. Records and photos stay in this app’s private storage on your device.'),
        h(
          'p',
          null,
          'A photo leaves the device only when you tap Identify: it is sent to the identification service configured for this app, which forwards it to the AI provider (Anthropic) and returns a suggestion. The service does not store photos.',
        ),
        h('p', null, 'Backups you export are plain files you control. See docs/PRIVACY.md for details.'),
      ),
    ),
    panel(TriangleAlert, 'Danger zone', settingRow('Clear collection', 'Delete all cars, wishlist entries and photos.', clearBtn)),
    h(
      'p',
      { class: 'disclaimer' },
      `HW Collector v${APP_VERSION}. An independent collector tool, not affiliated with, sponsored or endorsed by Mattel, Inc. Hot Wheels is a trademark of Mattel, Inc.`,
    ),
  );

  void checkStatus();
  return { el };
}
