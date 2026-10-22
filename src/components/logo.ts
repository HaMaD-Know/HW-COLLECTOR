/**
 * Original wordmark for this independent app. Deliberately not the Hot Wheels
 * flame logo so the app does not suggest Mattel endorsement.
 */
let instance = 0;

export function logoSvg(): SVGSVGElement {
  // Unique gradient id per instance: a hidden copy (e.g. the sidebar on phones) must not own the only definition.
  const gid = `lg-flame-${++instance}`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 168 40');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'HW Collector');
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffcc1f"/><stop offset=".55" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff3d2e"/>
      </linearGradient>
    </defs>
    <path d="M2 30 L18 30 L30 12 L14 12 Z" fill="url(#${gid})"/>
    <path d="M10 36 L40 36 L44 31 L13 31 Z" fill="#1f7bff"/>
    <text x="36" y="25" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="20" fill="currentColor" letter-spacing="-0.5">HW</text>
    <text x="72" y="25" font-family="Arial, sans-serif" font-weight="800" font-style="italic" font-size="15" fill="url(#${gid})" letter-spacing="0.5">COLLECTOR</text>`;
  return svg;
}
