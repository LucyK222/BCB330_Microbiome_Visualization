// ============================================================
//  composition.js — Stacked bar chart by taxonomic level
//
//  Exports:
//    initComposition()  — call once at startup to wire sliders
//    drawComposition()  — load data (if needed) + redraw
// ============================================================

import { state }         from '/js/state.js';
import { loadRpkmTree }  from '/js/dataLoader.js';
import { getTopN, onSliderChange } from '/js/sliders.js';
import { nodeValue }     from '/js/charts/krona.js';
import { taxaColorByName } from '/js/taxaColors.js';

// ── SVG config ───────────────────────────────────────────────
// COL_WIDTH controls spacing between columns (wider = more room for labels).
const MARGIN   = { top: 40, right: 260, bottom: 60, left: 80 };
const COL_WIDTH = 160;   // px slot per taxonomic level
const BAR_WIDTH =  80;   // actual bar width within each slot
const HEIGHT    = 520;
const N_LEVELS  =   6;
const WIDTH     = COL_WIDTH * N_LEVELS;
const TOTAL_W   = WIDTH + MARGIN.left + MARGIN.right;
const TOTAL_H   = HEIGHT + MARGIN.top  + MARGIN.bottom;

// Minimum bar segment height (px) before we bother drawing a label
const MIN_LABEL_HEIGHT = 14;

// ── Init ─────────────────────────────────────────────────────
export function initComposition() {
    onSliderChange(() => {
        if (state.rpkmTreeData) drawComposition();
    });

    document.getElementById('select-fontsize').addEventListener('change', () => {
        if (state.rpkmTreeData) drawComposition();
    });
}

// ── Orchestrator ─────────────────────────────────────────────
export async function drawComposition() {
    if (!state.rpkmTreeData) {
        state.rpkmTreeData = await loadRpkmTree();
    }
    const fontSize = parseInt(document.getElementById('select-fontsize').value, 10);
    _render(state.rpkmTreeData, fontSize);
}

// ── Ancestry map ─────────────────────────────────────────────
// Walks raw JSON tree and maps every taxon name → { phylum, className, depth }
// so taxaColorByName() can be called without a d3 hierarchy node.
function buildAncestryMap(node, depth = 0, phylum = '', className = '', map = new Map()) {
    if (depth === 1) phylum    = node.name;
    if (depth === 2) className = node.name;
    if (depth >= 1)  map.set(node.name, { phylum, className, depth });
    (node.children || []).forEach(c => buildAncestryMap(c, depth + 1, phylum, className, map));
    return map;
}

// ── Renderer ─────────────────────────────────────────────────
function _render(tree, fontSize = 9) {
    const FONT_H = fontSize;

    const container = d3.select('#composition-chart');
    container.selectAll('*').remove();

    const ancestryMap = buildAncestryMap(tree);

    // Color helper — mirrors Krona's taxaColor() logic
    function colorForName(name) {
        if (name.startsWith('Other ')) return '#cccccc';
        const info = ancestryMap.get(name);
        if (!info) return '#cccccc';
        if (info.phylum.toLowerCase().startsWith('unclassified')) return '#cccccc';
        return taxaColorByName(info.phylum, info.className, info.depth);
    }

    // ── 1. Levels & data ──
    const levels = [
        { name: 'Phylum',  depth: 1 },
        { name: 'Class',   depth: 2 },
        { name: 'Order',   depth: 3 },
        { name: 'Family',  depth: 4 },
        { name: 'Genus',   depth: 5 },
        { name: 'Species', depth: 6 },
    ];

    function collectAtDepth(node, targetDepth, currentDepth) {
        if (currentDepth === targetDepth) return [{ name: node.name, value: nodeValue(node) }];
        return (node.children || []).flatMap(c => collectAtDepth(c, targetDepth, currentDepth + 1));
    }

    const levelData = levels.map(level => {
        const all   = collectAtDepth(tree, level.depth, 0).sort((a, b) => b.value - a.value);
        const total = all.reduce((s, d) => s + d.value, 0);
        return { level: level.name, taxa: all, total };
    });

    // ── 2. SVG ──
    const svg = container.append('svg')
        .attr('width',  TOTAL_W)
        .attr('height', TOTAL_H)
        .style('overflow', 'visible')
        .append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // ── 3. Scales ──
    // Use a custom x that centres each bar within its COL_WIDTH slot.
    // slotLeft(level) → left edge of the slot for that level.
    const levelIndex = Object.fromEntries(levels.map((l, i) => [l.name, i]));
    const slotLeft   = name => levelIndex[name] * COL_WIDTH;
    const slotCx     = name => slotLeft(name) + COL_WIDTH / 2;
    const barLeft    = name => slotCx(name) - BAR_WIDTH / 2;
    const barRight   = name => barLeft(name) + BAR_WIDTH;

    const maxTotal = d3.max(levelData, d => d.total);
    const y = d3.scaleLinear()
        .domain([0, maxTotal * 1.05])
        .range([HEIGHT, 0]);

    // ── 4. Axes ──
    // Bottom axis: manually place level name labels at slot centres
    svg.append('g')
        .attr('transform', `translate(0,${HEIGHT})`)
        .call(d3.axisBottom(
            d3.scalePoint()
                .domain(levels.map(l => l.name))
                .range([COL_WIDTH / 2, WIDTH - COL_WIDTH / 2])
        ).tickSize(4))
        .call(g => g.select('.domain').attr('stroke', '#ccc'))
        .selectAll('text')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .attr('dy', '1.6em');

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

    // ── 5. Bars + inline labels with leader lines ──
    // Two SVG groups ensure labels always render on top of bars from all columns.
    const barGroup   = svg.append('g');
    const labelGroup = svg.append('g');

    levelData.forEach(({ level, taxa, total }) => {
        const bx  = barLeft(level);
        const brx = barRight(level);

        // Pass 1: draw bars into barGroup, collect segments for labeling.
        const segments = [];
        let cumulative = 0;

        taxa.forEach(taxon => {
            const yTop  = y(cumulative + taxon.value);
            const yBot  = y(cumulative);
            const segH  = yBot - yTop;
            const yCx   = yTop + segH / 2;

            barGroup.append('rect')
                .attr('x',      bx)
                .attr('y',      yTop)
                .attr('width',  BAR_WIDTH)
                .attr('height', Math.max(0, segH))
                .attr('fill',   colorForName(taxon.name))
                .attr('opacity', taxon.name.startsWith('Other') ? 0.3 : 0.8)
                .attr('stroke', 'rgba(80, 80, 80, 0.4)')
                .attr('stroke-width', 0.5)
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

            if (!taxon.name.startsWith('Other')) {
                segments.push({ taxon, yTop, segH, yCx });
            }

            cumulative += taxon.value;
        });

        // -- Label layout --
        // Ideal position: each label sits at its segment's vertical centre.
        // A force-relaxation pass then nudges overlapping labels apart while
        // keeping them as close as possible to their ideal positions.
        // Leader lines connect the bar's right edge to wherever each label lands.

        const LABEL_X  = brx + 8;
        // const FONT_H   = 9;
        const MIN_STEP = FONT_H + 2;   // minimum px between label centres
        const n = segments.length;

        if (n === 0) return;

        // Start every label at its segment's vertical centre (ideal = anchor).
        const ideal  = segments.map(seg => seg.yCx);
        const placed = [...ideal];

        // Force-relaxation: alternate bottom→top and top→bottom passes to
        // resolve collisions. Labels are pushed away from their neighbours
        // only as much as needed, staying as close to ideal as possible.
        for (let pass = 0; pass < 20; pass++) {
            // Bottom→top: if label[i] is too close above label[i+1], push it up.
            for (let i = n - 2; i >= 0; i--) {
                const minY = placed[i + 1] + MIN_STEP;
                if (placed[i] < minY) placed[i] = minY;
            }
            // Top→bottom: if label[i] is too close below label[i-1], push it down.
            for (let i = 1; i < n; i++) {
                const maxY = placed[i - 1] - MIN_STEP;
                if (placed[i] > maxY) placed[i] = maxY;
            }
            // Clamp to chart bounds after each pass.
            for (let i = 0; i < n; i++) {
                placed[i] = Math.max(0, Math.min(HEIGHT, placed[i]));
            }
        }

        // Pass 2: draw labels into labelGroup (rendered above all bars).
        segments.forEach((seg, i) => {
            const { taxon, yCx } = seg;
            const labelY = placed[i];

            // Leader line: segment centre → label
            labelGroup.append('line')
                .attr('x1', slotCx(level)).attr('y1', yCx)
                .attr('x2', LABEL_X - 3).attr('y2', labelY)
                .attr('stroke', '#111')
                .attr('stroke-width', 0.7)
                .style('pointer-events', 'none');

            labelGroup.append('text')
                .attr('x', LABEL_X)
                .attr('y', labelY)
                .attr('dy', '0.35em')
                .style('font-size', FONT_H + 'px')
                .style('fill', '#111')
                .style('text-anchor', 'start')
                .style('pointer-events', 'none')
                .text(taxon.name);
        });
    });
}