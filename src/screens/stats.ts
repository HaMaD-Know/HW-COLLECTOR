import { CarFront, ChartColumn, Heart, Layers, Package, Palette, Shapes, Wallet } from 'lucide';
import type { IconNode } from 'lucide';
import type { AppContext } from '../app/context';
import { append, h, icon } from '../components/dom';
import { topBar } from '../components/nav';
import { button, emptyState, errorState, loadingState, swatch } from '../components/ui';
import type { Screen } from '../navigation/router';
import { colorSwatch, type CollectionStats } from '../types/models';
import { formatMoney, formatMonthKey, pluralize } from '../utils/format';

function statTile(node: IconNode, label: string, value: string, tint: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('div', { class: 'stat__icon', style: `background:${tint}22;color:${tint}` }, icon(node, 20)),
    h('div', { style: 'min-width:0' }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value' }, value)),
  );
}

/** Horizontal bars, single hue, every bar directly labelled with its count. */
function barList(rows: Array<{ label: string; count: number; dot?: string | null }>, total: number): HTMLElement {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return h(
    'div',
    { class: 'bars', role: 'list' },
    rows.map((r) => {
      const pct = total ? Math.round((r.count / total) * 100) : 0;
      return h(
        'div',
        { class: 'bar', role: 'listitem', title: `${r.label}: ${r.count} (${pct}%)` },
        h('span', { class: 'bar__label' }, r.dot !== undefined ? swatch(r.dot) : null, r.label),
        h('span', { class: 'bar__track', 'aria-hidden': 'true' }, h('span', { class: 'bar__fill', style: `display:block;width:${(r.count / max) * 100}%` })),
        h('span', { class: 'bar__value' }, String(r.count), h('span', { class: 'sr-only' }, ` cars, ${pct} percent`)),
      );
    }),
  );
}

function monthColumns(rows: CollectionStats['addedOverTime']): HTMLElement {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return h(
    'div',
    { class: 'columns', role: 'list', 'aria-label': 'Cars added per month' },
    rows.map((r) =>
      h(
        'div',
        { class: 'column', role: 'listitem', title: `${formatMonthKey(r.month)}: ${pluralize(r.count, 'car')}` },
        h('span', { class: 'column__value' }, String(r.count)),
        h('span', { class: 'column__bar-wrap', 'aria-hidden': 'true' }, h('span', { class: 'column__bar', style: `height:${(r.count / max) * 100}%` })),
        h('span', null, formatMonthKey(r.month)),
      ),
    ),
  );
}

export function statsScreen(ctx: AppContext): Screen {
  const body = h('div', null, loadingState('Crunching your numbers…'));

  async function refresh(): Promise<void> {
    try {
      const stats = await ctx.stats.compute(6);
      const currency = ctx.settings.get().currency;
      body.replaceChildren();
      if (stats.totalCars === 0 && stats.wishlistTotal === 0) {
        body.append(
          emptyState({
            icon: ChartColumn,
            title: 'No stats yet',
            message: 'Statistics are calculated from the cars you save. Add a car to get started.',
            action: button({ label: 'Add a car', variant: 'primary', onClick: () => ctx.navigate('/add') }),
          }),
        );
        return;
      }
      append(body, [
        h(
          'div',
          { class: 'stat-grid' },
          statTile(CarFront, 'Total cars', String(stats.totalCars), '#2f9bff'),
          statTile(Shapes, 'Unique models', String(stats.uniqueModels), '#14b8a6'),
          statTile(Layers, 'Series collected', String(stats.seriesCount), '#a274ff'),
          statTile(Heart, 'Wishlist items', String(stats.wishlistTotal), '#ff5f7a'),
        ),
        h(
          'div',
          { class: 'panel', style: 'margin-top:var(--space-4)' },
          h('h2', { class: 'panel__title' }, icon(Wallet, 18), 'Money'),
          h(
            'div',
            { class: 'money-row' },
            h('span', null, 'Total purchase cost', h('div', { class: 'small faint' }, `${pluralize(stats.pricedCount, 'car')} with a price recorded`)),
            h('strong', null, formatMoney(stats.totalPurchaseCents, currency)),
          ),
          h(
            'div',
            { class: 'money-row' },
            h(
              'span',
              null,
              'Your estimated value',
              h('div', { class: 'small faint' }, `Sum of your own estimates for ${pluralize(stats.estimatedCount, 'car')}. Not a market valuation.`),
            ),
            h('strong', null, stats.estimatedCount ? formatMoney(stats.totalEstimateCents, currency) : '—'),
          ),
        ),
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel__title' }, icon(ChartColumn, 18), 'Cars added (last 6 months)'),
          monthColumns(stats.addedOverTime),
        ),
        stats.colorDistribution.length
          ? h(
              'div',
              { class: 'panel' },
              h('h2', { class: 'panel__title' }, icon(Palette, 18), 'Colors'),
              barList(
                stats.colorDistribution.map((c) => ({ label: c.label, count: c.count, dot: colorSwatch(c.label) })),
                stats.totalCars,
              ),
            )
          : null,
        stats.packagingDistribution.length
          ? h(
              'div',
              { class: 'panel' },
              h('h2', { class: 'panel__title' }, icon(Package, 18), 'Packaging'),
              barList(stats.packagingDistribution, stats.totalCars),
            )
          : null,
      ]);
    } catch (error) {
      console.error(error);
      body.replaceChildren(errorState('Statistics could not be calculated.', () => void refresh()));
    }
  }

  const el = h('section', null, topBar({ title: 'Collection Stats', brand: true }), body);
  const offs = [ctx.events.on('cars-changed', () => void refresh()), ctx.events.on('wishlist-changed', () => void refresh())];
  void refresh();
  return { el, destroy: () => offs.forEach((off) => off()) };
}
