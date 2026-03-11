// ============================================================
//  krona.js — Sunburst (Krona-style) taxonomic chart
//
//  Exports:
//    initKrona()     — call once at startup to wire slider callbacks
//    rebuildKrona()  — clear + re-filter + redraw from current state
//    drawKrona()     — pure renderer: data in, SVG node out
//    filterTree()    — pure function: tree in, filtered tree out
//    nodeValue()     — pure helper: sum a node's leaf values
//
//  BEFORE: filterTree, nodeValue, filterChildren, drawKrona,
//  and rebuildKrona were all scattered across two separate
//  <script> blocks in index.html, with kronaCurrentNode and
//  kronaMode accessed as loose globals.
//
//  AFTER: all Krona logic is in one file. State is read from
//  state.js, data from dataLoader.js, sliders from sliders.js.
// ============================================================

// TODO: [user friendly] the original display of krona chart is not a complete krona chart.

// TODO: [important] the color code!

import { state }          from '/js/state.js';
import { loadKronaData }  from '/js/dataLoader.js';
import { getTopN, onSliderChange } from '/js/sliders.js';


// ── Init (called once from main.js) ─────────────────────────

/**
 * Register Krona's redraw with the slider system, so whenever
 * any slider moves, Krona redraws automatically.
 *
 * BEFORE: the slider forEach block in index.html hardcoded:
 *   if (window._kronaData) rebuildKrona();
 *
 * AFTER: Krona registers itself — sliders.js doesn't need to
 * know Krona exists.
 */
export function initKrona() {
    onSliderChange(() => {
        if (state.kronaData) rebuildKrona();
    });
}


// ── Orchestrator ─────────────────────────────────────────────

/**
 * Load data (if not already cached), filter it with current
 * slider values, and render into #chart.
 *
 * BEFORE (loadAndDrawKrona in index.html):
 *   fetch(getKronaFile())
 *     .then(r => r.json())
 *     .then(data => { window._kronaData = data; rebuildKrona(); })
 *
 * The old version mixed fetching + storing + drawing together.
 * Now fetching is in dataLoader.js, storing is in state.js,
 * and this function just orchestrates the flow.
 */
export async function rebuildKrona() {
    // Load and cache data if we don't have it yet
    if (!state.kronaData) {
        state.kronaData = await loadKronaData();
    }

    const container = document.getElementById('chart');
    container.innerHTML = '';

    const totalValue = nodeValue(state.kronaData);     // unfiltered total for % calc
    const filtered   = filterTree(state.kronaData, getTopN());

    container.appendChild(drawKrona(filtered, totalValue));
}


// ── Tree helpers ─────────────────────────────────────────────

/**
 * Recursively sum all leaf values under a node.
 * Leaf nodes have a numeric `value` property directly.
 * Branch nodes have `children` but no `value`.
 */
export function nodeValue(node) {
    if (node.value !== undefined) return node.value;
    return (node.children || []).reduce((s, c) => s + nodeValue(c), 0);
}

/**
 * Keep the top-N children by value, merge the rest into
 * a single "Other X" node.
 *
 * @param {Array}  children   - array of tree nodes
 * @param {number} topN       - how many to keep
 * @param {string} otherLabel - label for the collapsed node
 */
function filterChildren(children, topN, otherLabel) {
    if (!children || children.length === 0) return [];

    const sorted = [...children].sort((a, b) => nodeValue(b) - nodeValue(a));
    const kept   = sorted.slice(0, topN);
    const rest   = sorted.slice(topN);

    if (rest.length > 0) {
        const otherValue = rest.reduce((s, c) => s + nodeValue(c), 0);
        const otherPct   = rest.reduce((s, c) => s + (c.percentage || 0), 0);
        kept.push({ name: otherLabel, value: otherValue, percentage: otherPct });
    }

    return kept;
}

/**
 * Walk the full tree and apply top-N filtering at each level.
 * Returns a new filtered tree — does not mutate the original.
 *
 * Tree depth:
 *   root(0) → Phylum(1) → Class(2) → Order(3)
 *           → Family(4) → Genus(5) → Species(6)
 *
 * @param {Object} root  - raw JSON tree root
 * @param {Object} topN  - { phylum, class, order, family, genus, species }
 */
export function filterTree(root, topN) {
    const config = {
        1: { limit: topN.phylum,  label: 'Other Phyla'   },
        2: { limit: topN.class,   label: 'Other Classes'  },
        3: { limit: topN.order,   label: 'Other Orders'   },
        4: { limit: topN.family,  label: 'Other Families' },
        5: { limit: topN.genus,   label: 'Other Genera'   },
        6: { limit: topN.species, label: 'Other Species'  },
    };

    function walk(node, depth) {
        if (!node.children) return { ...node };  // leaf — return as-is

        let children = node.children.map(c => walk(c, depth + 1));

        const cfg = config[depth + 1];
        if (cfg) children = filterChildren(children, cfg.limit, cfg.label);

        const pct = children.reduce((s, c) => s + (c.percentage || 0), 0);
        return { ...node, percentage: pct, children };
    }

    return walk(root, 0);
}


// ── Renderer ─────────────────────────────────────────────────

/**
 * Build and return a sunburst SVG node from filtered tree data.
 * This is a pure function: same input always produces same output.
 * It does not touch state or the DOM (except creating an SVG element).
 *
 * @param {Object} data        - filtered tree (output of filterTree)
 * @param {number} totalValue  - unfiltered total, used for % in tooltip
 * @returns {SVGElement}
 */
export function drawKrona(data, totalValue) {
    const width  = 800;
    const height = 700;
    const radius = Math.min(width, height) / 6;

    const color = d3.scaleOrdinal(
        d3.quantize(d3.interpolateRainbow, (data.children || []).length + 1)
    );

    const hierarchy = d3.hierarchy(data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    // Use actual percentages to set the angular span — so "Other" nodes
    // take proportionally correct space even after filtering
    const realFraction = (data.children || [])
        .reduce((s, c) => s + (c.percentage || 0), 0);

    const angularSpan = state.kronaMode === 'rpkm'
        ? 2 * Math.PI
        : 2 * Math.PI * Math.min(realFraction, 1);

    const root = d3.partition()
        .size([angularSpan, hierarchy.height + 1])(hierarchy);
    root.each(d => d.current = d);

    // Save current node to state so syncViolinToKrona can read it
    state.kronaCurrentNode = root;

    const arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius * 1.5)
        .innerRadius(d => d.y0 * radius)
        .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

    const svg = d3.create('svg')
        .attr('viewBox', [-width / 2, -height / 2, width, height])
        .style('font', '10px sans-serif')
        .style('width', '100%')
        .style('height', 'calc(100vh - 160px)');

    const zoomGroup = svg.append('g');

    // ── Arcs ──
    const path = zoomGroup.append('g')
        .selectAll('path')
        .data(root.descendants().slice(1))
        .join('path')
        .attr('fill', d => {
            let e = d;
            while (e.depth > 1) e = e.parent;
            return color(e.data.name);
        })
        .attr('fill-opacity', d => arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0)
        .attr('pointer-events', d => arcVisible(d.current) ? 'auto' : 'none')
        .attr('d', d => arc(d.current))
        .on('mousemove', function(event, d) {
            const tooltip    = document.getElementById('tooltip');
            const namePath   = d.ancestors().map(x => x.data.name).reverse().join(' / ');
            const metricLabel = state.kronaMode === 'reads' ? 'Reads' : 'RPKM';
            const metricValue = state.kronaMode === 'reads'
                ? d.value
                : d.value.toFixed(2);

            tooltip.style.opacity = 1;
            tooltip.innerHTML = `
        <strong>${namePath}</strong><br>
        ${metricLabel}: ${metricValue}<br>
        Percentage: ${((d.value / totalValue) * 100).toFixed(2)}%
      `;
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top  = (event.pageY + 10) + 'px';
        })
        .on('mouseleave', () => {
            document.getElementById('tooltip').style.opacity = 0;
        });

    path.filter(d => d.children)
        .style('cursor', 'pointer')
        .on('click', clicked);

    // ── Labels ──
    const label = zoomGroup.append('g')
        .attr('pointer-events', 'none')
        .attr('text-anchor', 'middle')
        .style('user-select', 'none')
        .selectAll('text')
        .data(root.descendants().slice(1))
        .join('text')
        .attr('dy', '0.35em')
        .attr('fill-opacity', d => +labelVisible(d.current))
        .attr('transform',    d => labelTransform(d.current))
        .text(d => d.data.name);

    // ── Centre click target (navigate up) ──
    const parent = zoomGroup.append('circle')
        .datum(root)
        .attr('r', radius)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('click', clicked);

    // ── Click to zoom ──
    function clicked(event, p) {
        state.kronaCurrentNode = p;   // ← update state, not a global
        parent.datum(p.parent || root);

        const span = p.x1 - p.x0;
        root.each(d => d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / span)) * angularSpan,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / span)) * angularSpan,
            y0: Math.max(0, d.y0 - p.depth),
            y1: Math.max(0, d.y1 - p.depth),
        });

        const t = svg.transition().duration(event.altKey ? 7500 : 750);

        path.transition(t)
            .tween('data', d => {
                const i = d3.interpolate(d.current, d.target);
                return t => d.current = i(t);
            })
            .filter(function(d) {
                return +this.getAttribute('fill-opacity') || arcVisible(d.target);
            })
            .attr('fill-opacity', d => arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0)
            .attr('pointer-events', d => arcVisible(d.target) ? 'auto' : 'none')
            .attrTween('d', d => () => arc(d.current));

        label
            .filter(function(d) {
                return +this.getAttribute('fill-opacity') || labelVisible(d.target);
            })
            .transition(t)
            .attr('fill-opacity', d => +labelVisible(d.target))
            .attrTween('transform', d => () => labelTransform(d.current));
    }

    // ── Visibility helpers ──
    function arcVisible(d)   { return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0; }
    function labelVisible(d) { return d.y1 <= 4 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03; }
    function labelTransform(d) {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2 * radius;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    // ── Zoom/pan ──
    const zoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .on('zoom', event => zoomGroup.attr('transform', event.transform));
    svg.call(zoom);

    return svg.node();
}