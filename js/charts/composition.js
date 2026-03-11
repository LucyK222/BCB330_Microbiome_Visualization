// ============================================================
//  composition.js — Stacked bar chart by taxonomic level
//
//  Exports:
//    initComposition()  — call once at startup to wire sliders
//    drawComposition()  — load data (if needed) + redraw
//
//  BEFORE: drawComposition() lived in a <script> block at the
//  bottom of index.html. It read window._rpkmTreeData directly,
//  called getTopN() as a global, and used nodeValue() which was
//  also a global defined in the slider block above it. The fetch
//  for taxa_rpkm.json was duplicated from loadAndDrawKrona().
//
//  AFTER:
//  - nodeValue() is imported from krona.js (shared, not copied)
//  - data is loaded via loadRpkmTree() from dataLoader.js
//    (same cached fetch Krona uses in rpkm mode)
//  - getTopN() is imported from sliders.js
//  - state is read from state.js
// ============================================================

// TODO: [alg] where does the "other class" in composition graph come from?

// TODO: [display] and the color keys on the side is messy.

import { state }         from '/js/state.js';
import { loadRpkmTree }  from '/js/dataLoader.js';
import { getTopN, onSliderChange } from '/js/sliders.js';
import { nodeValue }     from '/js/charts/krona.js';

// ── SVG config ───────────────────────────────────────────────
const MARGIN = { top: 20, right: 200, bottom: 60, left: 80 };
const WIDTH  = 900 - MARGIN.left - MARGIN.right;
const HEIGHT = 500 - MARGIN.top  - MARGIN.bottom;


// ── Init (called once from main.js) ─────────────────────────

/**
 * Register Composition's redraw with the slider system.
 *
 * BEFORE: the slider forEach block in index.html hardcoded:
 *   if (window._rpkmTreeData) drawComposition();
 *
 * AFTER: Composition registers itself — sliders.js stays clean.
 */
export function initComposition() {
    onSliderChange(() => {
        if (state.rpkmTreeData) drawComposition();
    });
}


// ── Orchestrator ─────────────────────────────────────────────

/**
 * Load rpkm tree data (if not cached) then render the chart.
 *
 * BEFORE (loadAndDrawComposition in index.html):
 *   async function loadAndDrawComposition() {
 *     if (!window._rpkmTreeData) {
 *       const res = await fetch('./data/taxa_rpkm.json');  // ← duplicated fetch!
 *       window._rpkmTreeData = await res.json();
 *     }
 *     drawComposition();
 *   }
 *
 * AFTER: loadRpkmTree() is the single source for this file.
 * Krona (in rpkm mode) uses the same function, so the file
 * is fetched only once across the whole app.
 */
export async function drawComposition() {
    if (!state.rpkmTreeData) {
        state.rpkmTreeData = await loadRpkmTree();
    }
    _render(state.rpkmTreeData);
}


// ── Renderer (private) ───────────────────────────────────────

/**
 * Pure render function — takes the tree and draws the chart.
 * Private to this module (no export), called only by drawComposition().
 *
 * @param {Object} tree - taxa_rpkm.json hierarchy
 */
function _render(tree) {
    const container = d3.select('#composition-chart');
    container.selectAll('*').remove();

    const topN = getTopN();

    // ── 1. Extract taxa per taxonomic level ──
    // Instead of using filterTree() (which preserves tree structure),
    // we flatten each level independently for the bar chart.
    const levels = [
        { name: 'Phylum',  depth: 1 },
        { name: 'Class',   depth: 2 },
        { name: 'Order',   depth: 3 },
        { name: 'Family',  depth: 4 },
        { name: 'Genus',   depth: 5 },
        { name: 'Species', depth: 6 },
    ];

    // Walk the tree and collect all nodes at a specific depth
    function collectAtDepth(node, targetDepth, currentDepth) {
        if (currentDepth === targetDepth) {
            return [{ name: node.name, value: nodeValue(node) }];  // ← imported from krona.js
        }
        return (node.children || []).flatMap(c =>
            collectAtDepth(c, targetDepth, currentDepth + 1)
        );
    }

    const levelData = levels.map(level => {
        const all   = collectAtDepth(tree, level.depth, 0)
            .sort((a, b) => b.value - a.value);
        const total = all.reduce((s, d) => s + d.value, 0);

        return { level: level.name, taxa: all, total };
    });

    // ── 2. SVG setup ──
    const svg = container.append('svg')
        .attr('width',  WIDTH  + MARGIN.left + MARGIN.right)
        .attr('height', HEIGHT + MARGIN.top  + MARGIN.bottom)
        .append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // ── 3. Scales ──
    const x = d3.scaleBand()
        .domain(levels.map(l => l.name))
        .range([0, WIDTH])
        .padding(0.25);

    const maxTotal = d3.max(levelData, d => d.total);
    const y = d3.scaleLinear()
        .domain([0, maxTotal * 1.05])
        .range([HEIGHT, 0]);

    // Consistent color per taxon name across all levels
    const allTaxonNames = [...new Set(levelData.flatMap(d => d.taxa.map(t => t.name)))];
    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(allTaxonNames);

    // ── 4. Axes ──
    svg.append('g')
        .attr('transform', `translate(0,${HEIGHT})`)
        .call(d3.axisBottom(x));

    svg.append('g')
        .call(d3.axisLeft(y))
        .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -MARGIN.left + 15)
        .attr('x', -HEIGHT / 2)
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('fill', 'black')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text('RPKM (sum)');

    // ── 5. Stacked bars ──
    levelData.forEach(({ level, taxa, total }) => {
        let cumulative = 0;

        taxa.forEach(taxon => {
            const barHeight = HEIGHT - y(taxon.value);
            const yPos      = y(cumulative + taxon.value);

            svg.append('rect')
                .attr('x',       x(level))
                .attr('y',       yPos)
                .attr('width',   x.bandwidth())
                .attr('height',  Math.max(0, barHeight))
                .attr('fill',    color(taxon.name))
                .attr('opacity', taxon.name.startsWith('Other') ? 0.3 : 0.8)
                .on('mousemove', function(event) {
                    const tooltip = document.getElementById('tooltip');
                    const pct     = ((taxon.value / total) * 100).toFixed(1);
                    tooltip.style.opacity = 1;
                    tooltip.innerHTML = `
            <strong>${taxon.name}</strong><br>
            RPKM: ${taxon.value.toFixed(2)}<br>
            ${pct}% of ${level} total
          `;
                    tooltip.style.left = (event.pageX + 10) + 'px';
                    tooltip.style.top  = (event.pageY + 10) + 'px';
                })
                .on('mouseleave', () => {
                    document.getElementById('tooltip').style.opacity = 0;
                });

            cumulative += taxon.value;
        });
    });

    // ── 6. Legend ──
    const legendItems = allTaxonNames
        .filter(n => !n.startsWith('Other'))
        .slice(0, 15);

    const legend = svg.append('g')
        .attr('transform', `translate(${WIDTH + 20}, 0)`);

    legendItems.forEach((name, i) => {
        const g = legend.append('g')
            .attr('transform', `translate(0, ${i * 18})`);

        g.append('rect')
            .attr('width', 12).attr('height', 12)
            .attr('fill', color(name))
            .attr('opacity', 0.8);

        g.append('text')
            .attr('x', 16).attr('y', 10)
            .style('font-size', '11px')
            .text(name.length > 22 ? name.slice(0, 22) + '…' : name);
    });
}