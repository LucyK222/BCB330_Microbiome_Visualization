// ============================================================
//  krona.js — Sunburst (Krona-style) taxonomic chart
//
//  Exports:
//    initKrona()          — call once at startup to wire slider callbacks
//    rebuildKrona()       — clear + re-filter + redraw from current state
//    drawKrona()          — pure renderer: data in, SVG node out
//    filterTree()         — pure function: tree in, filtered tree out
//    nodeValue()          — pure helper: sum a node's leaf values
//    getSelectedKronaNodes() — returns Set of currently selected node names
//    clearKronaSelection()   — clears all selections
//
//  Shift+click multi-select:
//    Hold Shift and click arcs to toggle selection (highlighted with a
//    glowing ring). Selected nodes + all descendants feed into the
//    "Sync to Heatmap" workflow in main.js.
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


// ── Selection state ──────────────────────────────────────────
const _selectedNodes = new Map();   // name → d3 hierarchy node

export function getSelectedKronaNodes() {
    return new Map(_selectedNodes);
}

export function clearKronaSelection() {
    _selectedNodes.clear();
    _updateSyncButton();
}

function _updateSyncButton() {
    const btn = document.getElementById('btn-sync-heatmap');
    if (!btn) return;
    if (_selectedNodes.size > 0) {
        btn.style.display = 'inline-flex';
        btn.textContent   = `Sync ${_selectedNodes.size} taxon${_selectedNodes.size > 1 ? 'a' : ''} → Heatmap`;
    } else {
        btn.style.display = 'none';
    }
}

// ── Init (called once from main.js) ─────────────────────────

export function initKrona() {
    onSliderChange(() => {
        if (state.kronaData) rebuildKrona();
    });

    document.getElementById('select-krona-fontsize').addEventListener('change', () => {
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
    const fontSize   = parseInt(document.getElementById('select-krona-fontsize').value, 10);

    container.appendChild(drawKrona(filtered, totalValue, fontSize));
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


// ── Collect all taxon column names under a node ───────────────
export function collectDescendantNames(hierarchyNode) {
    const names = new Set();

    function walk(d) {
        if (!d.children || d.children.length === 0) {
            names.add(d.data.name);
        } else {
            names.add(d.data.name);
            d.children.forEach(walk);
        }
    }

    walk(hierarchyNode);
    return names;
}


// ── Renderer ─────────────────────────────────────────────────

export function drawKrona(data, totalValue, fontSize = 10) {
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

    const arcHighlight = d3.arc()
        .startAngle(d => d.x0 - 0.01)
        .endAngle(d => d.x1 + 0.01)
        .padAngle(0)
        .padRadius(radius * 1.5)
        .innerRadius(d => d.y0 * radius - 3)
        .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1) + 3);

    const svg = d3.create('svg')
        .attr('viewBox', [-width / 2, -height / 2, width, height])
        .style('font', `${fontSize}px sans-serif`)
        .style('width', '100%')
        .style('height', 'calc(100vh - 160px)');

    const zoomGroup = svg.append('g');

    svg.append('text')
        .attr('x', -width / 2 + 12)
        .attr('y', -height / 2 + 18)
        .style('font-size', '11px')
        .style('fill', '#888')
        .style('font-style', 'italic')
        .text('Shift+click to select taxa for heatmap');

    const highlightLayer = zoomGroup.append('g').attr('class', 'selection-layer');

    // ── Arcs ──────────────────────────────────────────────────
    const path = zoomGroup.append('g')
        .selectAll('path')
        .data(root.descendants().slice(1))
        .join('path')
        .attr('fill', d => {
            const name = d.data.name;
            if (name.startsWith('Other ')) return '#cccccc';
            const phylumNode = d.ancestors().find(a => a.depth === 1);
            if (phylumNode && phylumNode.data.name.toLowerCase().startsWith('unclassified')) return '#cccccc';
            return taxaColor(d);
        })
        .attr('fill-opacity', d => arcVisible(d.current) ? (d.children ? 0.85 : 0.70) : 0)
        .attr('pointer-events', d => arcVisible(d.current) ? 'auto' : 'none')
        .attr('d', d => arc(d.current))
        .on('mousemove', function(event, d) {
            const tooltip  = document.getElementById('tooltip');
            const namePath = d.ancestors().map(x => x.data.name).reverse().join(' / ');

            if (state.kronaMode === 'reads') {
                // ── Reads mode: simple tooltip ──
                tooltip.innerHTML = `
                    <strong>${namePath}</strong><br>
                    Reads: ${d.value}<br>
                    Percentage: ${((d.value / totalValue) * 100).toFixed(2)}%<br>
                    <span style="color:#aaa;font-style:italic">Shift+click to select</span>
                `;
            } else {
                // ── RPKM mode: show total + direct RPKM ──
                // d.value = total RPKM (used for arc size — includes all descendants)
                // d.data.direct_rpkm = RPKM assigned directly to this taxon level
                const totalRpkm  = d.value;
                const directRpkm = d.data.direct_rpkm || 0;
                const pct        = ((totalRpkm / totalValue) * 100).toFixed(2);

                // Build the direct RPKM line — only show if this node has direct reads
                // (i.e. the RPKM table had a column for exactly this taxon)
                let directLine = '';
                if (directRpkm > 0) {
                    const directPct = ((directRpkm / totalValue) * 100).toFixed(2);
                    directLine = `
                        <span style="color:#f0c040">&#9658; Direct RPKM: ${directRpkm.toFixed(2)} (${directPct}%)</span><br>
                        <span style="color:#aaa;font-size:10px;font-style:italic">
                            (reads assigned only to this level, not to any descendant)
                        </span><br>
                    `;
                }

                tooltip.innerHTML = `
                    <strong>${namePath}</strong><br>
                    Total RPKM: ${totalRpkm.toFixed(2)} (${pct}%)<br>
                    ${directLine}
                    <span style="color:#aaa;font-style:italic">Shift+click to select</span>
                `;
            }

            tooltip.style.opacity = 1;
            tooltip.style.left    = (event.pageX + 10) + 'px';
            tooltip.style.top     = (event.pageY + 10) + 'px';
        })
        .on('mouseleave', () => {
            document.getElementById('tooltip').style.opacity = 0;
        })
        .on('click', function(event, d) {
            if (event.shiftKey) {
                event.stopPropagation();
                const name = d.data.name;
                if (name.startsWith('Other ')) return;

                if (_selectedNodes.has(name)) {
                    _selectedNodes.delete(name);
                } else {
                    _selectedNodes.set(name, d);
                }

                _updateSyncButton();
                _redrawSelectionRings(highlightLayer, root, arc, arcHighlight, angularSpan, radius);
            } else {
                clicked(event, d);
            }
        });

    path.filter(d => d.children)
        .style('cursor', 'pointer');

    _redrawSelectionRings(highlightLayer, root, arc, arcHighlight, angularSpan, radius);

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
        .attr('fill', d => d.depth <= 2 ? '#1a1a1a' : '#333333')
        .text(d => d.data.name);

    // ── Centre click target (navigate up) ────────────────────
    const parent = zoomGroup.append('circle')
        .datum(root)
        .attr('r', radius)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('click', (event, d) => {
            if (!event.shiftKey) clicked(event, d);
        });

    // ── Click to zoom ─────────────────────────────────────────
    function clicked(event, p) {
        state.kronaCurrentNode = p;
        parent.datum(p.parent || root);

        const span = p.x1 - p.x0;

        if (!p.children || p.children.length === 0) {
            root.each(d => {
                d.target = { x0: 0, x1: 0, y0: d.y0, y1: d.y1 };
            });
            p.target = { x0: 0, x1: angularSpan, y0: 1, y1: 2 };

            const t = svg.transition().duration(event.altKey ? 7500 : 750);
            path.transition(t)
                .tween('data', d => {
                    const i = d3.interpolate(d.current, d.target);
                    return t => d.current = i(t);
                })
                .filter(function(d) {
                    return +this.getAttribute('fill-opacity') || arcVisible(d.target);
                })
                .attr('fill-opacity', d => d === p ? 0.85 : 0)
                .attr('pointer-events', d => d === p ? 'auto' : 'none')
                .attrTween('d', d => () => arc(d.current));

            label.transition(t)
                .attr('fill-opacity', d => d === p ? 1 : 0)
                .attrTween('transform', d => () => labelTransform(d.current));

            state.kronaCurrentNode = p;
            parent.datum(p.parent || root);
            t.on('end', () => {
                _redrawSelectionRings(highlightLayer, root, arc, arcHighlight, angularSpan, radius);
            });
            return;
        }

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

        t.on('end', () => {
            _redrawSelectionRings(highlightLayer, root, arc, arcHighlight, angularSpan, radius);
        });
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


// ── Selection ring renderer ───────────────────────────────────
function _redrawSelectionRings(layer, root, arc, arcHighlight, angularSpan, radius) {
    layer.selectAll('*').remove();

    if (_selectedNodes.size === 0) return;

    root.descendants().slice(1).forEach(d => {
        if (!_selectedNodes.has(d.data.name)) return;
        if (!arcVisible(d.current)) return;

        layer.append('path')
            .attr('d', arcHighlight(d.current))
            .attr('fill', 'none')
            .attr('stroke', '#FFD700')
            .attr('stroke-width', 6)
            .attr('stroke-opacity', 0.35)
            .attr('pointer-events', 'none');

        layer.append('path')
            .attr('d', arcHighlight(d.current))
            .attr('fill', 'none')
            .attr('stroke', '#FFD700')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.95)
            .attr('pointer-events', 'none');
    });

    function arcVisible(d) { return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0; }
}