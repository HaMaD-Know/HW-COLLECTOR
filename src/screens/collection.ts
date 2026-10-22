import { Car, Plus, Search, SearchX, SlidersHorizontal } from 'lucide';
import type { AppContext } from '../app/context';
import { carCard } from '../components/car-card';
import { clear, h, icon } from '../components/dom';
import { topBar } from '../components/nav';
import { button, emptyState, errorState, iconButton } from '../components/ui';
import type { Screen } from '../navigation/router';
import { SORT_LABELS, type CarQuery, type SortOrder } from '../types/models';
import { pluralize } from '../utils/format';
import { openCarMenu } from './car-actions';

/** Survives navigation so returning from a detail page keeps search/filter state. */
const state: Required<Pick<CarQuery, 'sort'>> & CarQuery & { filtersOpen: boolean } = {
  search: '',
  series: null,
  color: null,
  year: null,
  sort: 'newest',
  filtersOpen: false,
};

function activeFilterCount(): number {
  return [state.series, state.color, state.year].filter((v) => v != null && v !== '').length;
}

export function collectionScreen(ctx: AppContext): Screen {
  const grid = h('div', { class: 'car-grid', 'aria-live': 'polite' });
  const meta = h('div', { class: 'collection-meta' });
  const body = h('div');
  const filtersHost = h('div');
  const filterDot = h('span', { class: 'filter-btn__dot', hidden: true });
  const searchInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search your collection…',
    value: state.search ?? '',
    'aria-label': 'Search your collection',
    enterkeyhint: 'search',
    autocomplete: 'off',
  });
  const filterToggle = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn filter-btn',
      'aria-label': 'Filter and sort',
      'aria-expanded': String(state.filtersOpen),
      onClick: () => {
        state.filtersOpen = !state.filtersOpen;
        filterToggle.setAttribute('aria-expanded', String(state.filtersOpen));
        void renderFilters();
      },
    },
    icon(SlidersHorizontal, 20),
    filterDot,
  );

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value;
      void refresh();
    }, 180);
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchInput.blur(); // closes the mobile keyboard
  });

  async function renderFilters(): Promise<void> {
    clear(filtersHost);
    filterDot.hidden = activeFilterCount() === 0;
    if (!state.filtersOpen) return;
    const options = await ctx.cars.filterOptions();
    const make = (label: string, values: string[], current: string | null, onChange: (v: string | null) => void) => {
      const select = h(
        'select',
        { class: 'select', 'aria-label': label },
        h('option', { value: '' }, label),
        values.map((v) => h('option', { value: v }, v)),
      );
      select.value = current ?? '';
      select.addEventListener('change', () => {
        onChange(select.value || null);
        filterDot.hidden = activeFilterCount() === 0;
        void refresh();
      });
      return select;
    };
    const sortSelect = h(
      'select',
      { class: 'select', 'aria-label': 'Sort by' },
      (Object.keys(SORT_LABELS) as SortOrder[]).map((key) => h('option', { value: key }, `Sort: ${SORT_LABELS[key]}`)),
    );
    sortSelect.value = state.sort;
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value as SortOrder;
      void refresh();
    });
    filtersHost.appendChild(
      h(
        'div',
        { class: 'filters' },
        make('All series', options.series, state.series ?? null, (v) => (state.series = v)),
        make('All colors', options.colors, state.color ?? null, (v) => (state.color = v)),
        make(
          'All years',
          options.years.map(String),
          state.year != null ? String(state.year) : null,
          (v) => (state.year = v ? Number(v) : null),
        ),
        sortSelect,
        button({
          label: 'Reset',
          variant: 'ghost',
          small: true,
          onClick: () => {
            Object.assign(state, { series: null, color: null, year: null, sort: 'newest' as SortOrder });
            void renderFilters();
            void refresh();
          },
        }),
      ),
    );
    filtersHost.querySelector('.btn')?.classList.add('filters__reset');
  }

  let refreshToken = 0;
  async function refresh(): Promise<void> {
    const token = ++refreshToken;
    try {
      const [cars, total] = await Promise.all([ctx.cars.list(state), ctx.cars.count()]);
      if (token !== refreshToken) return;
      clear(meta);
      clear(grid);
      clear(body);
      if (total === 0) {
        body.appendChild(
          emptyState({
            icon: Car,
            title: 'Your garage is empty',
            message: 'Add your first car with a photo. AI can suggest the name, or you can type it yourself.',
            action: button({
              label: 'Add your first car',
              variant: 'primary',
              icon: Plus,
              onClick: () => ctx.navigate('/add'),
            }),
          }),
        );
        return;
      }
      const filtered = cars.length !== total;
      meta.append(
        h('span', null, filtered ? `Showing ${cars.length} of ${total}` : 'All cars'),
        h('span', null, 'Total cars: ', h('strong', null, String(total))),
      );
      if (cars.length === 0) {
        body.appendChild(
          emptyState({
            icon: SearchX,
            title: 'No matches',
            message: 'No cars match your search or filters.',
            action: button({
              label: 'Clear search and filters',
              variant: 'outline',
              onClick: () => {
                Object.assign(state, { search: '', series: null, color: null, year: null });
                searchInput.value = '';
                void renderFilters();
                void refresh();
              },
            }),
          }),
        );
        return;
      }
      for (const car of cars) {
        grid.appendChild(
          carCard(car, ctx.images, {
            open: () => ctx.navigate(`/car/${encodeURIComponent(car.id)}`),
            menu: () => void openCarMenu(ctx, car),
          }),
        );
      }
      body.appendChild(grid);
      grid.setAttribute('aria-label', pluralize(cars.length, 'car'));
    } catch (error) {
      console.error(error);
      clear(body);
      body.appendChild(errorState('Your collection could not be loaded.', () => void refresh()));
    }
  }

  const el = h(
    'section',
    null,
    topBar({
      title: 'My Collection',
      brand: true,
      actions: [iconButton(Plus, 'Add car', () => ctx.navigate('/add'))],
    }),
    h('div', { class: 'search-row' }, h('label', { class: 'search' }, icon(Search, 18), searchInput), filterToggle),
    filtersHost,
    meta,
    body,
  );

  const offCars = ctx.events.on('cars-changed', () => {
    void renderFilters();
    void refresh();
  });
  void renderFilters();
  void refresh();

  return {
    el,
    destroy: () => {
      offCars();
      clearTimeout(searchTimer);
    },
  };
}
