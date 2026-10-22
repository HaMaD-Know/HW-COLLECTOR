import { ChartColumn, ChevronLeft, Heart, LayoutGrid, ScanLine, Settings, type IconNode } from 'lucide';
import { h, icon } from './dom';
import { logoSvg } from './logo';
import { iconButton } from './ui';

export interface NavItem {
  tab: string;
  href: string;
  label: string;
  icon: IconNode;
  scan?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { tab: 'collection', href: '#/collection', label: 'Collection', icon: LayoutGrid },
  { tab: 'wishlist', href: '#/wishlist', label: 'Wishlist', icon: Heart },
  { tab: 'add', href: '#/add', label: 'Add Car', icon: ScanLine, scan: true },
  { tab: 'stats', href: '#/stats', label: 'Stats', icon: ChartColumn },
  { tab: 'settings', href: '#/settings', label: 'Settings', icon: Settings },
];

/** Bottom bar on phones, sidebar on tablets/desktop. Returns a function that highlights the active tab. */
export function buildNavigation(): { sidebar: HTMLElement; bottom: HTMLElement; setActive: (tab: string) => void } {
  const sidebarLinks = NAV_ITEMS.map((item) =>
    h('a', { href: item.href, dataset: { tab: item.tab } }, icon(item.icon, 20), item.label),
  );
  const sidebar = h(
    'nav',
    { class: 'sidebar', 'aria-label': 'Main' },
    h('div', { class: 'brand' }, logoSvg()),
    sidebarLinks,
    h('p', { class: 'sidebar__note' }, 'Independent fan app. Not affiliated with Mattel.'),
  );
  const bottomLinks = NAV_ITEMS.map((item) =>
    h(
      'a',
      { href: item.href, class: item.scan ? 'nav-scan' : '', dataset: { tab: item.tab } },
      item.scan ? h('span', { class: 'nav-scan__bubble' }, icon(item.icon, 24)) : icon(item.icon, 22),
      h('span', null, item.scan ? 'Add' : item.label),
    ),
  );
  const bottom = h('nav', { class: 'bottom-nav', 'aria-label': 'Main' }, bottomLinks);
  const setActive = (tab: string) => {
    for (const link of [...sidebarLinks, ...bottomLinks]) {
      if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };
  return { sidebar, bottom, setActive };
}

/** Sticky screen header. Root tabs show the brand; nested screens show a back button. */
export function topBar(opts: { title: string; onBack?: () => void; actions?: HTMLElement[]; brand?: boolean }) {
  return h(
    'header',
    { class: 'topbar' },
    opts.onBack ? iconButton(ChevronLeft, 'Back', opts.onBack) : null,
    opts.brand ? h('div', { class: 'brand' }, logoSvg()) : null,
    h('h1', { class: `topbar__title ${opts.onBack ? '' : 'topbar__title--pad'}`.trim() }, opts.title),
    opts.actions?.length ? h('div', { class: 'topbar__actions' }, opts.actions) : null,
  );
}
