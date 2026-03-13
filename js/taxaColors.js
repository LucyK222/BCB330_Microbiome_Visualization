// ============================================================
//  taxaColors.js — Deterministic hierarchical color system
//
//  Design principles:
//    1. Phylum → fixed base hue (following Ana's conventions)
//    2. Class  → distinguishable shade within that hue
//    3. Order and below → inherit class color, getting
//       progressively lighter with each level outward
//
//  Color distance is measured in HSL lightness increments,
//  inspired by the CIEDE2000 perceptual distance concept.
//
//  Phylum color conventions (Ana's scheme):
//    Firmicutes/Bacillota   → Blues  (exception: Bacilli class → Purples)
//    Pseudomonadota         → Yellows
//    Actinobacteria/ota     → Reds
//    Bacteroidota           → Greens
//    Verrucomicrobiota      → Pinks
//    (others)               → auto-assigned from FALLBACK_HUES
// ============================================================


// ── Tailwind color palettes ───────────────────────────────────
//
// Each phylum maps to a Tailwind color name, which has 11
// designer-crafted shades (50 → 950). We use these shades
// to represent taxonomic depth:
//
//   Depth 1 = Phylum  → shade 500  (vivid base)
//   Depth 2 = Class   → shade 400 or 600 (spaced across siblings)
//   Depth 3 = Order   → shade 300
//   Depth 4 = Family  → shade 200
//   Depth 5 = Genus   → shade 100
//   Depth 6 = Species → shade 50
//
// Multiple Tailwind color names can be assigned per phylum,
// one per class, so sibling classes are distinguishable.

// Tailwind hex values, keyed by color name and shade
const TW = {
    // Blues — Firmicutes / Bacillota
    sky:     { 50:'#f0f9ff', 100:'#e0f2fe', 200:'#bae6fd', 300:'#7dd3fc', 400:'#38bdf8', 500:'#0ea5e9', 600:'#0284c7', 700:'#0369a1', 800:'#075985', 900:'#0c4a6e' },
    blue:    { 50:'#eff6ff', 100:'#dbeafe', 200:'#bfdbfe', 300:'#93c5fd', 400:'#60a5fa', 500:'#3b82f6', 600:'#2563eb', 700:'#1d4ed8', 800:'#1e40af', 900:'#1e3a8a' },
    cyan:    { 50:'#ecfeff', 100:'#cffafe', 200:'#a5f3fc', 300:'#67e8f9', 400:'#22d3ee', 500:'#06b6d4', 600:'#0891b2', 700:'#0e7490', 800:'#155e75', 900:'#164e63' },
    indigo:  { 50:'#eef2ff', 100:'#e0e7ff', 200:'#c7d2fe', 300:'#a5b4fc', 400:'#818cf8', 500:'#6366f1', 600:'#4f46e5', 700:'#4338ca', 800:'#3730a3', 900:'#312e81' },

    // Purples — Bacilli class override
    violet:  { 50:'#f5f3ff', 100:'#ede9fe', 200:'#ddd6fe', 300:'#c4b5fd', 400:'#a78bfa', 500:'#8b5cf6', 600:'#7c3aed', 700:'#6d28d9', 800:'#5b21b6', 900:'#4c1d95' },
    purple:  { 50:'#faf5ff', 100:'#f3e8ff', 200:'#e9d5ff', 300:'#d8b4fe', 400:'#c084fc', 500:'#a855f7', 600:'#9333ea', 700:'#7e22ce', 800:'#6b21a8', 900:'#581c87' },

    // Yellows — Pseudomonadota
    yellow:  { 50:'#fefce8', 100:'#fef9c3', 200:'#fef08a', 300:'#fde047', 400:'#facc15', 500:'#eab308', 600:'#ca8a04', 700:'#a16207', 800:'#854d0e', 900:'#713f12' },
    amber:   { 50:'#fffbeb', 100:'#fef3c7', 200:'#fde68a', 300:'#fcd34d', 400:'#fbbf24', 500:'#f59e0b', 600:'#d97706', 700:'#b45309', 800:'#92400e', 900:'#78350f' },

    // Reds — Actinobacteria
    red:     { 50:'#fef2f2', 100:'#fee2e2', 200:'#fecaca', 300:'#fca5a5', 400:'#f87171', 500:'#ef4444', 600:'#dc2626', 700:'#b91c1c', 800:'#991b1b', 900:'#7f1d1d' },
    rose:    { 50:'#fff1f2', 100:'#ffe4e6', 200:'#fecdd3', 300:'#fda4af', 400:'#fb7185', 500:'#f43f5e', 600:'#e11d48', 700:'#be123c', 800:'#9f1239', 900:'#881337' },
    orange:  { 50:'#fff7ed', 100:'#ffedd5', 200:'#fed7aa', 300:'#fdba74', 400:'#fb923c', 500:'#f97316', 600:'#ea580c', 700:'#c2410c', 800:'#9a3412', 900:'#7c2d12' },

    // Greens — Bacteroidota
    green:   { 50:'#f0fdf4', 100:'#dcfce7', 200:'#bbf7d0', 300:'#86efac', 400:'#4ade80', 500:'#22c55e', 600:'#16a34a', 700:'#15803d', 800:'#166534', 900:'#14532d' },
    emerald: { 50:'#ecfdf5', 100:'#d1fae5', 200:'#a7f3d0', 300:'#6ee7b7', 400:'#34d399', 500:'#10b981', 600:'#059669', 700:'#047857', 800:'#065f46', 900:'#064e3b' },
    teal:    { 50:'#f0fdfa', 100:'#ccfbf1', 200:'#99f6e4', 300:'#5eead4', 400:'#2dd4bf', 500:'#14b8a6', 600:'#0d9488', 700:'#0f766e', 800:'#115e59', 900:'#134e4a' },
    lime:    { 50:'#f7fee7', 100:'#ecfccb', 200:'#d9f99d', 300:'#bef264', 400:'#a3e635', 500:'#84cc16', 600:'#65a30d', 700:'#4d7c0f', 800:'#3f6212', 900:'#365314' },

    // Pinks — Verrucomicrobiota
    pink:    { 50:'#fdf2f8', 100:'#fce7f3', 200:'#fbcfe8', 300:'#f9a8d4', 400:'#f472b6', 500:'#ec4899', 600:'#db2777', 700:'#be185d', 800:'#9d174d', 900:'#831843' },
    fuchsia: { 50:'#fdf4ff', 100:'#fae8ff', 200:'#f5d0fe', 300:'#f0abfc', 400:'#e879f9', 500:'#d946ef', 600:'#c026d3', 700:'#a21caf', 800:'#86198f', 900:'#701a75' },
};

// Phylum → array of Tailwind color names to assign to its classes
// First color = first class, second = second class, etc.
// Having multiple colors per phylum means each class is visually distinct
const PHYLUM_COLORS = {
    // Firmicutes / Bacillota → Blues
    'firmicutes':        ['sky', 'blue', 'cyan', 'indigo'],
    'bacillota':         ['sky', 'blue', 'cyan', 'indigo'],

    // Pseudomonadota → Yellows
    'pseudomonadota':    ['yellow', 'amber'],
    'proteobacteria':    ['yellow', 'amber'],

    // Actinobacteria → Reds
    'actinobacteria':    ['red', 'rose', 'orange'],
    'actinobacteriota':  ['red', 'rose', 'orange'],

    // Bacteroidota → Greens
    'bacteroidota':      ['green', 'emerald', 'teal', 'lime'],
    'bacteroidetes':     ['green', 'emerald', 'teal', 'lime'],

    // Verrucomicrobiota → Pinks
    'verrucomicrobiota': ['pink', 'fuchsia'],
    'verrucomicrobiae':  ['pink', 'fuchsia'],
};

// Special class override: Bacilli → Purples regardless of phylum
const CLASS_COLOR_OVERRIDE = {
    'bacilli': ['violet', 'purple'],
};

// Fallback color names for unknown phyla
const FALLBACK_COLORS = [
    ['teal',   'cyan'],
    ['orange', 'amber'],
    ['indigo', 'violet'],
    ['lime',   'green'],
];

// Tailwind shade to use at each taxonomy depth
// depth 1=phylum, 2=class, 3=order, 4=family, 5=genus, 6=species
const DEPTH_SHADE = {
    1: 600,
    2: 500,
    3: 400,
    4: 300,
    5: 200,
    6: 100,
};


// ── Internal state ───────────────────────────────────────────

let _fallbackIndex = 0;
const _phylumColorCache = new Map();  // phylumName → color name array
const _classColorCache  = new Map();  // "phylum|class" → hex string


// ── Public API ───────────────────────────────────────────────

/**
 * Given a d3-hierarchy node, return a hex color string.
 */
export function taxaColor(node) {
    const ancestors  = node.ancestors().reverse(); // root → self
    const depth      = node.depth;

    if (depth === 0) return '#e5e7eb';  // root — neutral

    const phylumNode = ancestors[1];
    const classNode  = ancestors[2];

    const phylumName = phylumNode ? normalise(phylumNode.data.name) : '';
    const className  = classNode  ? normalise(classNode.data.name)  : '';

    const shade = DEPTH_SHADE[depth] || 50;

    if (depth === 1) {
        // Phylum: use the first color in its palette at the phylum shade
        const colors = getPhylumColors(phylumName);
        return TW[colors[0]][DEPTH_SHADE[1]];
    }

    if (depth === 2) {
        // Class: pick a color from the phylum palette based on sibling index
        return getClassHex(phylumName, className, phylumNode, DEPTH_SHADE[2]);
    }

    // Order and below: same color family as class, lighter shade
    return getClassHex(phylumName, className, phylumNode, shade);
}

/**
 * Convenience: return color by name strings + depth (no d3 node needed).
 */
export function taxaColorByName(phylum, className = '', depth = 1) {
    const pn    = normalise(phylum);
    const cn    = normalise(className);
    const shade = DEPTH_SHADE[depth] || 50;

    if (depth === 1) {
        const colors = getPhylumColors(pn);
        return TW[colors[0]][DEPTH_SHADE[1]];
    }
    return getClassHex(pn, cn, null, shade);
}


// ── Internal helpers ─────────────────────────────────────────

function normalise(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Return the array of Tailwind color names for a phylum */
function getPhylumColors(phylumName) {
    if (_phylumColorCache.has(phylumName)) return _phylumColorCache.get(phylumName);

    for (const [key, colors] of Object.entries(PHYLUM_COLORS)) {
        if (phylumName.includes(normalise(key)) || normalise(key).includes(phylumName)) {
            _phylumColorCache.set(phylumName, colors);
            return colors;
        }
    }

    // Assign next fallback for unknown phylum
    const colors = FALLBACK_COLORS[_fallbackIndex % FALLBACK_COLORS.length];
    _fallbackIndex++;
    _phylumColorCache.set(phylumName, colors);
    return colors;
}

/**
 * Return a hex color for a class node at a given Tailwind shade.
 * Distributes sibling classes across the phylum's color array.
 */
function getClassHex(phylumName, className, phylumNode, shade) {
    const cacheKey = `${phylumName}|${className}|${shade}`;
    if (_classColorCache.has(cacheKey)) return _classColorCache.get(cacheKey);

    // Check class-level override (e.g. Bacilli → purples)
    let colorNames = null;
    for (const [key, names] of Object.entries(CLASS_COLOR_OVERRIDE)) {
        if (className.includes(normalise(key)) || normalise(key).includes(className)) {
            colorNames = names;
            break;
        }
    }
    if (!colorNames) colorNames = getPhylumColors(phylumName);

    // Pick color name by sibling index
    let classIndex = 0;
    if (phylumNode && phylumNode.children) {
        const classNames = phylumNode.children.map(c => normalise(c.data.name));
        const idx = classNames.indexOf(className);
        if (idx >= 0) classIndex = idx;
    }

    const colorName = colorNames[classIndex % colorNames.length];
    const palette   = TW[colorName];
    // Find the closest available shade
    const available = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const closest   = available.reduce((a, b) => Math.abs(b - shade) < Math.abs(a - shade) ? b : a);
    const hex       = palette[closest] || palette[500];

    _classColorCache.set(cacheKey, hex);
    return hex;
}