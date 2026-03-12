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
//  Color system (taxaColors.js):
//    Phylum  → fixed base hue (Ana's conventions)
//    Class   → distinguishable shade within that hue band
//    Order+  → inherit class color, progressively lighter per level
//              so outer rings are always a lighter shade of inner rings
// ============================================================

import { state }          from '/js/state.js';
import { loadKronaData }  from '/js/dataLoader.js';
import { getTopN, onSliderChange } from '/js/sliders.js';
import { taxaColor }      from '/js/taxaColors.js';


// ── Init (called once from main.js) ─────────────────────────

export function initKrona() {
    onSliderChange(() => {
        if (state.kronaData) rebuildKrona();
    });
}


// ── Orchestrator ─────────────────────────────────────────────

export async function rebuildKrona() {
    if (!state.kronaData) {
        state.kronaData = await loadKronaData();
    }

    const container = document.getElementById('chart');
    container.innerHTML = '';

    const totalValue = nodeValue(state.kronaData);
    const filtered   = filterTree(state.kronaData, getTopN());

    container.appendChild(drawKrona(filtered, totalValue));
}


// ── Tree helpers ─────────────────────────────────────────────

export function nodeValue(node) {
    if (node.value !== undefined) return node.value;
    return (node.children || []).reduce((s, c) => s + nodeValue(c), 0);
}

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
        if (!node.children) return { ...node };

        let children = node.children.map(c => walk(c, depth + 1));

        const cfg = config[depth + 1];
        if (cfg) children = filterChildren(children, cfg.limit, cfg.label);

        const pct = children.reduce((s, c) => s + (c.percentage || 0), 0);
        return { ...node, percentage: pct, children };
    }

    return walk(root, 0);
}


// ── Renderer ─────────────────────────────────────────────────

export function drawKrona(data, totalValue) {
    const width  = 800;
    const height = 700;
    const radius = Math.min(width, height) / 6;

    const hierarchy = d3.hierarchy(data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    const realFraction = (data.children || [])
        .reduce((s, c) => s + (c.percentage || 0), 0);

    const angularSpan = state.kronaMode === 'rpkm'
        ? 2 * Math.PI
        : 2 * Math.PI * Math.min(realFraction, 1);

    const root = d3.partition()
        .size([angularSpan, hierarchy.height + 1])(hierarchy);
    root.each(d => d.current = d);

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

    // ── Arcs ──────────────────────────────────────────────────
    //
    // Color assignment:
    //   "Other *" nodes → neutral grey so they don't distract
    //   Real taxa       → taxaColor(d) from our hierarchical system
    //
    const path = zoomGroup.append('g')
        .selectAll('path')
        .data(root.descendants().slice(1))
        .join('path')
        .attr('fill', d => {
            const name = d.data.name;
            if (name.startsWith('Other ')) return '#cccccc';
            // Check if this node or its phylum ancestor is Unclassified
            const phylumNode = d.ancestors().find(a => a.depth === 1);
            if (phylumNode && phylumNode.data.name.toLowerCase().startsWith('unclassified')) return '#cccccc';
            return taxaColor(d);
        })
        // Inner rings (branch nodes) slightly more opaque than leaf rings
        // to reinforce the "darker inside, lighter outside" visual logic
        .attr('fill-opacity', d => arcVisible(d.current) ? (d.children ? 0.85 : 0.70) : 0)
        .attr('pointer-events', d => arcVisible(d.current) ? 'auto' : 'none')
        .attr('d', d => arc(d.current))
        .on('mousemove', function(event, d) {
            const tooltip     = document.getElementById('tooltip');
            const namePath    = d.ancestors().map(x => x.data.name).reverse().join(' / ');
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

    // ── Labels ────────────────────────────────────────────────
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
        // Darker text for inner (darker) rings, lighter for outer rings
        .attr('fill', d => d.depth <= 2 ? '#1a1a1a' : '#333333')
        .text(d => d.data.name);

    // ── Centre click target (navigate up) ────────────────────
    const parent = zoomGroup.append('circle')
        .datum(root)
        .attr('r', radius)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('click', clicked);

    // ── Click to zoom ─────────────────────────────────────────
    function clicked(event, p) {
        state.kronaCurrentNode = p;
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
            .attr('fill-opacity', d => arcVisible(d.target) ? (d.children ? 0.85 : 0.70) : 0)
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

    // ── Visibility helpers ────────────────────────────────────
    function arcVisible(d)   { return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0; }
    function labelVisible(d) { return d.y1 <= 4 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03; }
    function labelTransform(d) {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2 * radius;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    // ── Zoom/pan ──────────────────────────────────────────────
    const zoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .on('zoom', event => zoomGroup.attr('transform', event.transform));
    svg.call(zoom);

    return svg.node();
}