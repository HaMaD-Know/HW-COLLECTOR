export interface Screen {
  el: HTMLElement;
  /** Called when navigating away; release listeners/timers here. */
  destroy?: () => void;
}

export type RouteParams = Record<string, string>;
export type ScreenFactory = (params: RouteParams, query: URLSearchParams) => Screen | Promise<Screen>;

interface Route {
  pattern: RegExp;
  keys: string[];
  factory: ScreenFactory;
  tab: string;
}

/** "/car/1/edit" -> "/car/1", "/wishlist/new" -> "/wishlist", "/car/1" -> fallback. */
export function parentPath(path: string, fallback: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'car') return parts.length > 2 ? `/car/${parts[1]}` : fallback;
  if (parts.length > 1) return `/${parts[0]}`;
  return fallback;
}

/** Hash router: works from file:// and Capacitor's local server without server rewrites. */
export class Router {
  private readonly routes: Route[] = [];
  private current: Screen | null = null;
  private depth = 0;
  private renderToken = 0;

  constructor(
    private readonly outlet: HTMLElement,
    private readonly onTabChange: (tab: string) => void,
    private readonly fallback = '/collection',
  ) {}

  add(path: string, tab: string, factory: ScreenFactory): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/\//g, '\\/').replace(/:(\w+)/g, (_m, key: string) => {
        keys.push(key);
        return '([^/]+)';
      })}$`,
    );
    this.routes.push({ pattern, keys, factory, tab });
    return this;
  }

  start(): void {
    window.addEventListener('hashchange', () => void this.render());
    void this.render();
  }

  navigate(path: string, options: { replace?: boolean } = {}): void {
    const target = `#${path}`;
    if (options.replace) {
      history.replaceState(null, '', target);
      void this.render();
      return;
    }
    if (location.hash === target) {
      void this.render();
      return;
    }
    this.depth++;
    location.hash = target;
  }

  /** Goes back within the app; with no in-app history it goes to the logical parent screen. */
  back(): void {
    if (this.depth > 0) {
      this.depth--;
      history.back();
    } else {
      this.navigate(parentPath(this.currentPath(), this.fallback), { replace: true });
    }
  }

  canGoBack(): boolean {
    return this.depth > 0;
  }

  currentPath(): string {
    return location.hash.replace(/^#/, '').split('?')[0] || this.fallback;
  }

  private async render(): Promise<void> {
    const token = ++this.renderToken;
    const [rawPath, rawQuery = ''] = location.hash.replace(/^#/, '').split('?');
    const path = rawPath || this.fallback;
    const match = this.match(path);
    if (!match) {
      this.navigate(this.fallback, { replace: true });
      return;
    }
    this.current?.destroy?.();
    this.current = null;
    this.onTabChange(match.route.tab);
    const screen = await match.route.factory(match.params, new URLSearchParams(rawQuery));
    if (token !== this.renderToken) {
      screen.destroy?.(); // a newer navigation finished first
      return;
    }
    this.current = screen;
    this.outlet.replaceChildren(screen.el);
    window.scrollTo({ top: 0 });
    const heading = screen.el.querySelector<HTMLElement>('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }

  private match(path: string): { route: Route; params: RouteParams } | null {
    for (const route of this.routes) {
      const m = route.pattern.exec(path);
      if (m) {
        const params: RouteParams = {};
        route.keys.forEach((key, i) => (params[key] = decodeURIComponent(m[i + 1])));
        return { route, params };
      }
    }
    return null;
  }
}
