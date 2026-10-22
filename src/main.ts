import './theme/tokens.css';
import './theme/app.css';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { createIdentifier, EventBus, type AppContext } from './app/context';
import { h } from './components/dom';
import { closeTopOverlay } from './components/feedback';
import { buildNavigation } from './components/nav';
import { errorState, loadingState } from './components/ui';
import { CapacitorSqliteDriver } from './database/capacitor-driver';
import { runMigrations } from './database/migrations';
import { Router } from './navigation/router';
import { CarRepository } from './repositories/car-repository';
import { StatsRepository } from './repositories/stats-repository';
import { WishlistRepository } from './repositories/wishlist-repository';
import { carDetailScreen } from './screens/car-detail';
import { carFormScreen } from './screens/car-form';
import { collectionScreen } from './screens/collection';
import { settingsScreen } from './screens/settings';
import { statsScreen } from './screens/stats';
import { wishlistScreen } from './screens/wishlist';
import { wishlistFormScreen } from './screens/wishlist-form';
import { CapacitorFileAdapter } from './services/image-storage/capacitor-file-adapter';
import { ImageStore } from './services/image-storage/image-store';
import { SettingsService, type ThemePreference } from './services/settings';

function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (Capacitor.isNativePlatform()) {
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    if (Capacitor.getPlatform() === 'android') {
      void StatusBar.setBackgroundColor({ color: dark ? '#060a14' : '#eef2f9' }).catch(() => undefined);
    }
  }
}

/** Hide the bottom bar while typing so the keyboard never covers the Save button. */
function trackKeyboard(): void {
  const isTextInput = (el: EventTarget | null) =>
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'file', 'submit'].includes(el.type));
  document.addEventListener('focusin', (e) => {
    if (isTextInput(e.target)) document.body.classList.add('keyboard-open');
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isTextInput(document.activeElement)) document.body.classList.remove('keyboard-open');
    }, 50);
  });
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const outlet = h('main', { class: 'view', id: 'view' }, loadingState('Opening your garage…'));
  const nav = buildNavigation();
  root.replaceChildren(h('div', { class: 'app-shell' }, nav.sidebar, h('div', { class: 'main' }, outlet)), nav.bottom);

  const settings = new SettingsService();
  applyTheme((await settings.load()).theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(settings.get().theme));
  trackKeyboard();

  let ctx: AppContext;
  try {
    const db = await CapacitorSqliteDriver.open();
    await runMigrations(db);
    const cars = new CarRepository(db);
    const images = new ImageStore(new CapacitorFileAdapter(), (path) => cars.countImageReferences(path));
    const events = new EventBus();
    let identifier = createIdentifier(settings.get().aiProxyUrl);
    events.on('settings-changed', () => {
      identifier = createIdentifier(settings.get().aiProxyUrl);
      applyTheme(settings.get().theme);
    });

    const router = new Router(outlet, nav.setActive);
    ctx = {
      db,
      cars,
      wishlist: new WishlistRepository(db),
      stats: new StatsRepository(db),
      images,
      settings,
      events,
      identifier: () => identifier,
      navigate: (path, options) => router.navigate(path, options),
      back: () => router.back(),
    };

    router
      .add('/collection', 'collection', () => collectionScreen(ctx))
      .add('/add', 'add', () => carFormScreen(ctx))
      .add('/car/:id', 'collection', (p) => carDetailScreen(ctx, p.id))
      .add('/car/:id/edit', 'collection', (p) => carFormScreen(ctx, p.id))
      .add('/wishlist', 'wishlist', () => wishlistScreen(ctx))
      .add('/wishlist/new', 'wishlist', () => wishlistFormScreen(ctx))
      .add('/wishlist/:id/edit', 'wishlist', (p) => wishlistFormScreen(ctx, p.id))
      .add('/stats', 'stats', () => statsScreen(ctx))
      .add('/settings', 'settings', () => settingsScreen(ctx));
    router.start();

    if (Capacitor.isNativePlatform()) {
      void App.addListener('backButton', () => {
        if (closeTopOverlay()) return;
        if (router.canGoBack()) router.back();
        else if (router.currentPath() !== '/collection') router.navigate('/collection', { replace: true });
        else void App.exitApp();
      });
    }

    // Housekeeping: delete photo files left behind by an interrupted save.
    setTimeout(() => {
      void cars.allImagePaths().then((paths) => images.removeOrphans(paths)).catch(() => undefined);
    }, 4000);
  } catch (error) {
    console.error('Startup failed', error);
    outlet.replaceChildren(
      errorState(
        'The local database could not be opened. Close and reopen the app. If this keeps happening, free up storage space.',
        () => location.reload(),
      ),
    );
  } finally {
    void SplashScreen.hide().catch(() => undefined);
  }
}

void boot();
