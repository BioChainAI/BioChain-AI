/**
 * Identicon — deterministic visual fingerprint for signing keys.
 * All output is seeded from the keyId, so the same key always produces the same
 * identicon SVG: an identity can be verified by eye across nodes. The nested
 * Hilbert manifold is folded from the key vector; role tints the ring; a
 * revoked/retired key gets a broken-ring + strike overlay so a dead key reads as
 * dead at a glance.
 */

// ── PRNG ──────────────────────────────────────────────────────────────────────
function xmur3(str) {
  for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    var t = (a + b) | 0;
    a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11);
    d = d + 1 | 0; t = t + d | 0; c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function makeRand(seed) {
  const h = xmur3(seed);
  return sfc32(h(), h(), h(), h());
}

// ── Glyph motifs (abstract geometric marks, keyed per key) ─────────────────────
export const GLYPHS = [
  { id: 'NODE',   color: '#00f0ff',
    svg: `<path stroke="currentColor" stroke-width="1" fill="none" d="M50,85 L25,60 L45,50 Z M50,85 L75,60 L55,50 Z M45,50 L55,50 M25,60 L15,15 L40,35 L50,25 L60,35 L85,15 L75,60 M15,15 L50,85 L85,15"/>
          <path stroke="white" stroke-width="1.5" fill="none" d="M50,35 L45,42 L50,50 L55,42 Z"/>
          <g fill="white"><circle cx="50" cy="85" r="2"/><circle cx="25" cy="60" r="2"/><circle cx="75" cy="60" r="2"/><circle cx="15" cy="15" r="2"/><circle cx="85" cy="15" r="2"/><circle cx="50" cy="25" r="2.5"/></g>` },
  { id: 'SHIELD', color: '#d4af37',
    svg: `<path stroke="currentColor" stroke-width="1.5" fill="none" d="M35,90 L65,90 L80,65 L70,25 L60,35 L50,25 L40,35 L30,25 L20,65 Z"/>
          <path stroke="currentColor" stroke-width="1" fill="none" d="M40,70 L50,55 L60,70 M20,65 L40,50 L60,50 L80,65"/>
          <path stroke="white" stroke-width="1.5" fill="none" d="M50,30 L45,35 L50,42 L55,35 Z"/>
          <g fill="white"><circle cx="35" cy="90" r="2.5"/><circle cx="65" cy="90" r="2.5"/><circle cx="50" cy="55" r="2"/><circle cx="50" cy="25" r="2"/></g>` },
  { id: 'PRISM',  color: '#b026ff',
    svg: `<path stroke="currentColor" stroke-width="1" fill="none" d="M50,15 L75,35 L85,65 L50,90 L15,65 L25,35 Z M50,15 L50,35 M85,65 L65,65 M15,65 L35,65"/>
          <path stroke="white" stroke-width="1.5" fill="none" d="M35,45 L45,50 L35,55 Z M65,45 L55,50 L65,55 Z"/>
          <path stroke="currentColor" stroke-width="0.75" fill="none" d="M50,35 L35,45 L35,65 L50,90 L65,65 L65,45 Z"/>
          <g fill="white"><circle cx="50" cy="15" r="2"/><circle cx="85" cy="65" r="2"/><circle cx="15" cy="65" r="2"/><circle cx="50" cy="90" r="2"/></g>` },
  { id: 'HELIX',  color: '#00ff66',
    svg: `<path stroke="currentColor" stroke-width="1.5" fill="none" d="M50,15 L75,25 L85,50 L65,70 L50,55 L35,70 L50,90 L75,80 M50,15 L25,25 L15,50 L35,70 L50,55 M25,25 L35,35 L65,35 L75,25"/>
          <path stroke="white" stroke-width="1.5" fill="none" d="M45,25 L50,20 L55,25 Z"/>
          <g fill="white"><circle cx="50" cy="15" r="2"/><circle cx="85" cy="50" r="2"/><circle cx="50" cy="55" r="2"/><circle cx="50" cy="90" r="2"/></g>` },
  { id: 'EMBER',  color: '#ff3366',
    svg: `<path stroke="currentColor" stroke-width="1.2" fill="none" d="M50,85 L20,40 L30,15 L45,35 L50,30 L55,35 L70,15 L80,40 Z"/>
          <path stroke="currentColor" stroke-width="1" fill="none" d="M50,85 L35,55 L65,55 Z M20,40 L45,55 M80,40 L55,55"/>
          <path stroke="white" stroke-width="1.5" fill="none" d="M40,55 L45,50 L50,55 L45,60 Z M60,55 L55,50 L50,55 L55,60 Z"/>
          <g fill="white"><circle cx="50" cy="85" r="2"/><circle cx="30" cy="15" r="2"/><circle cx="70" cy="15" r="2"/></g>` },
];

/** Pick a deterministic glyph for a key (or identity). */
export function glyphForKey(keyId) {
  if (!keyId) return GLYPHS[2];
  const rand = makeRand(String(keyId));
  return GLYPHS[Math.floor(rand() * GLYPHS.length)];
}

// ── Hilbert manifold (nested polygon string art) ───────────────────────────────
const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
export function generateManifoldSVG(n, k, t, maxRadius = 45) {
  n = Math.max(3, Math.min(64, parseInt(n) || 12));
  k = Math.max(1, Math.min(64, parseInt(k) || 5));
  t = Math.max(1, Math.min(6,  parseInt(t) || 4));
  const center = { x: 50, y: 50 };
  const baseFibIndex = Math.min(t + 3, FIB.length - 1);
  let svg = '';
  for (let layer = 0; layer < t; layer++) {
    const fibIdx = Math.max(0, baseFibIndex - layer);
    const radius = maxRadius * (FIB[fibIdx] / FIB[baseFibIndex]);
    const coords = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      coords.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
    }
    let pathData = '';
    for (let i = 0; i < n; i++) {
      const s = coords[i], e = coords[(i * k) % n];
      pathData += `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${e.x.toFixed(1)},${e.y.toFixed(1)} `;
    }
    const opacity = layer === 0 ? 0.9 : (0.9 - layer * 0.15);
    const sw = layer === 0 ? 0.5 : 0.3;
    const dash = layer === 0 ? '' : 'stroke-dasharray="1 2"';
    svg += `<path d="${pathData}" stroke="currentColor" stroke-width="${sw}" fill="none" opacity="${opacity}" ${dash}/>`;
    if (layer === 0) {
      let nodes = '';
      for (let i = 0; i < n; i++)
        nodes += `<circle cx="${coords[i].x.toFixed(1)}" cy="${coords[i].y.toFixed(1)}" r="0.7" fill="currentColor" opacity="0.7"/>`;
      svg += `<g>${nodes}</g>`;
    }
  }
  return svg;
}

// ── Role colors ────────────────────────────────────────────────────────────────
const ROLE_COLORS = { ADMIN: '#D4AF37', OPERATOR: '#00d4ff', MEMBER: '#94a3b8' };

/** Fold a 16-hex key vector into a deterministic Hilbert manifold {n,k,t}. */
export function identiconManifold(keyVector) {
  const hex = String(keyVector || '').replace(/[^0-9a-fA-F]/g, '').padEnd(16, '0');
  const b = i => parseInt(hex.substr(i * 2, 2), 16) || 0;
  return { n: 3 + (b(0) % 22), k: 1 + (b(1) % 16), t: 2 + (b(2) % 4) };
}

/**
 * Render an identicon SVG for a signing key.
 * @param {object} key  — { keyId, keyVector, role?, status? }
 * @param {object} [opts] — { size=120 }
 */
export function renderKeyIdenticon(key, opts = {}) {
  const size = opts.size || 120;
  const mf = identiconManifold(key.keyVector);
  const glyph = glyphForKey(key.keyId || key.identityId || 'key');
  const roleColor = ROLE_COLORS[key.role] || ROLE_COLORS.MEMBER;
  const cx = 50, cy = 50, rBorder = 50, rRole = 36, rCore = 28;

  const manifoldLayer = `<g transform="translate(${cx - rCore}, ${cy - rCore}) scale(${(rCore * 2) / 100})"
        color="${glyph.color}" style="color:${glyph.color};opacity:0.22">
        ${generateManifoldSVG(mf.n, mf.k, mf.t, 45)}</g>`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}"
       style="filter:drop-shadow(0 0 6px ${glyph.color}88)">
    <circle cx="${cx}" cy="${cy}" r="${rBorder}" fill="none" stroke="${glyph.color}" stroke-width="0.4" opacity="0.4"/>
    <circle cx="${cx}" cy="${cy}" r="${rRole}" fill="none" stroke="${roleColor}" stroke-width="${key.role === 'ADMIN' ? 1.5 : 1}" opacity="0.8"/>
    <g transform="translate(${cx - rCore}, ${cy - rCore}) scale(${(rCore * 2) / 100})">
      <circle cx="50" cy="50" r="49" fill="#05030a" opacity="0.85"/></g>
    ${manifoldLayer}
    <g transform="translate(${cx - rCore}, ${cy - rCore}) scale(${(rCore * 2) / 100})"
       color="${glyph.color}" style="color:${glyph.color}">${glyph.svg}</g>
  </svg>`;

  if (key.status && key.status !== 'active') {
    svg = svg.replace('</svg>',
      `<circle cx="50" cy="50" r="47" fill="none" stroke="#f87171" stroke-width="1" stroke-dasharray="2 3" opacity="0.85"/>` +
      `<line x1="22" y1="78" x2="78" y2="22" stroke="#f87171" stroke-width="1.4" opacity="0.6"/></svg>`);
  }
  return svg;
}
