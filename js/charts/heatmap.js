// ============================================================
//  heatmap.js — Taxon × Superpathway RPKM heatmap
//
//  Exports:
//    drawHeatmap()                    — loads data + draws with all top-20 taxa
//    drawHeatmapFiltered(taxonNames)  — draws with only the given taxon names
//                                       (used by Krona shift-click sync)
// ============================================================

const MARGIN = { top: 120, right: 150, bottom: 40, left: 220 };
const CELL_H = 28;
const CELL_W = 44;

// ── Public: default (top-20) view ────────────────────────────
export async function drawHeatmap() {
    await _drawHeatmapCore(null);
}

// ── Public: filtered view from Krona selection ───────────────
/**
 * @param {Set<string>} taxonNames — set of taxon names to include.
 *   These are matched against RPKM_table column headers using the same
 *   fuzzy logic as taxa_RPKM_generate.py (exact, then case-insensitive,
 *   then substring).
 */
export async function drawHeatmapFiltered(taxonNames) {
    await _drawHeatmapCore(taxonNames);
}


// ── Core renderer ────────────────────────────────────────────

async function _drawHeatmapCore(filterSet) {
    const [raw, ecToMapText, superpathRows] = await Promise.all([
        d3.tsv('databases/RPKM_table.tsv'),
        d3.text('databases/EC_pathway.txt'),
        d3.csv('databases/pathway_to_superpathway.csv'),
    ]);

    // --- Build EC → superpathway lookup ---
    const ecToMap = {};
    for (const line of ecToMapText.split('\n')) {
        const [left, right] = line.trim().split('\t');
        if (!left || !right) continue;
        const mapId = left.replace('path:', '');
        const ec    = right.replace('ec:', '');
        if (!ecToMap[ec]) ecToMap[ec] = [];
        ecToMap[ec].push(mapId);
    }
    const mapToSuper = {};
    for (const row of superpathRows) mapToSuper[row['Pathway ID']] = row['Superpathway'];

    // --- Identify taxon columns ---
    const FIXED = new Set(['GeneID', 'EC#', 'Length', 'Reads', 'ECF', 'RPKM', 'Bacteria']);
    const allTaxonCols = Object.keys(raw[0] || {}).filter(k => !FIXED.has(k.replace(/^\uFEFF/, '')));

    // --- Determine which columns to display ---
    let displayCols;

    if (filterSet && filterSet.size > 0) {
        // Match filterSet names against actual column names
        // (fuzzy: exact → case-insensitive → substring, same as Python script)
        const matched = new Set();

        for (const wantedName of filterSet) {
            // Exact match
            if (allTaxonCols.includes(wantedName)) {
                matched.add(wantedName);
                continue;
            }
            // Case-insensitive
            const lower = wantedName.toLowerCase();
            const ci = allTaxonCols.find(c => c.toLowerCase() === lower);
            if (ci) { matched.add(ci); continue; }
            // Substring
            const sub = allTaxonCols.find(c =>
                c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())
            );
            if (sub) matched.add(sub);
        }

        displayCols = [...matched];

        // Sort by total RPKM descending
        const taxonTotals = {};
        for (const col of displayCols) {
            taxonTotals[col] = d3.sum(raw, r => +r[col] || 0);
        }
        displayCols.sort((a, b) => (taxonTotals[b] || 0) - (taxonTotals[a] || 0));

        // Show a title note
        _setHeatmapTitle(
            `Enzyme Expression by Superpathway × Taxon (RPKM) — ${displayCols.length} selected taxon${displayCols.length !== 1 ? 'a' : ''}`
        );
    } else {
        // Default: top-20 by total RPKM
        const taxonTotals = {};
        for (const col of allTaxonCols) {
            taxonTotals[col] = d3.sum(raw, r => +r[col] || 0);
        }
        displayCols = Object.entries(taxonTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([col]) => col);

        _setHeatmapTitle('Enzyme Expression by Superpathway × Taxon (RPKM)');
    }

    if (displayCols.length === 0) {
        _renderEmpty('No matching taxa found in RPKM table for the selected nodes.');
        return;
    }

    // --- Build matrix: taxon × superpathway → summed RPKM ---
    const matrix = {};
    const superpathSet = new Set();

    for (const row of raw) {
        const ecRaw = row['EC#'] || '';
        const rpkm  = +row['RPKM'] || 0;
        if (!ecRaw || ecRaw === '0.0.0.0' || rpkm === 0) continue;

        const superpaths = new Set();
        for (const ec of ecRaw.split('|')) {
            for (const mapId of (ecToMap[ec.trim()] || [])) {
                if (mapToSuper[mapId]) superpaths.add(mapToSuper[mapId]);
            }
        }
        if (superpaths.size === 0) continue;

        for (const taxon of displayCols) {
            const taxVal = +row[taxon] || 0;
            if (taxVal === 0) continue;
            if (!matrix[taxon]) matrix[taxon] = {};
            for (const sp of superpaths) {
                superpathSet.add(sp);
                matrix[taxon][sp] = (matrix[taxon][sp] || 0) + rpkm;
            }
        }
    }

    const superpaths = [...superpathSet].sort();

    if (superpaths.length === 0) {
        _renderEmpty('No superpathway data found for the selected taxa.');
        return;
    }

    // --- Dynamic cell sizing: if many columns, shrink cells ---
    const cellW = displayCols.length > 20 ? Math.max(20, Math.floor(900 / displayCols.length)) : CELL_W;
    const cellH = CELL_H;

    // --- Render ---
    const W = cellW * displayCols.length;
    const H = cellH * superpaths.length;
    const totalW = W + MARGIN.left + MARGIN.right;
    const totalH = H + MARGIN.top  + MARGIN.bottom;

    const container = d3.select('#heatmap-chart');
    container.selectAll('*').remove();

    const maxVal = d3.max(superpaths, sp =>
        d3.max(displayCols, t => matrix[t]?.[sp] || 0)
    );
    const color = d3.scaleSequential()
        .domain([0, maxVal])
        .interpolator(d3.interpolateRgbBasis([
            '#fef0e6', '#F0997B', '#D85A30', '#993C1D', '#4a1980', '#26215C'
        ]));

    const svg = container.append('svg')
        .attr('width',  totalW)
        .attr('height', totalH)
        .append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const tooltip = document.getElementById('tooltip');

    // Cells
    superpaths.forEach((sp, si) => {
        displayCols.forEach((taxon, ti) => {
            const val = matrix[taxon]?.[sp] || 0;
            svg.append('rect')
                .attr('x',      ti * cellW)
                .attr('y',      si * cellH)
                .attr('width',  cellW)
                .attr('height', cellH)
                .attr('rx',     0)
                .attr('fill',   val === 0 ? '#f5f5f2' : color(val))
                .on('mousemove', function(event) {
                    tooltip.style.opacity = 1;
                    tooltip.innerHTML = `
                        <strong>${taxon}</strong><br>
                        ${sp}<br>
                        RPKM sum: ${val.toFixed(1)}
                    `;
                    tooltip.style.left = (event.pageX + 10) + 'px';
                    tooltip.style.top  = (event.pageY + 10) + 'px';
                })
                .on('mouseleave', () => { tooltip.style.opacity = 0; });
        });
    });

    // Y axis — superpathway labels
    svg.selectAll('.sp-label')
        .data(superpaths).enter()
        .append('text')
        .attr('x',  -8)
        .attr('y',  (d, i) => i * cellH + cellH / 2)
        .attr('dy', '0.35em')
        .style('text-anchor', 'end')
        .style('font-size', '11px')
        .style('fill', '#333')
        .text(d => d);

    // X axis — taxon labels (rotated)
    svg.selectAll('.taxon-label')
        .data(displayCols).enter()
        .append('text')
        .attr('x',  (d, i) => i * cellW + cellW / 2)
        .attr('y',  -8)
        .attr('dy', '0.35em')
        .style('text-anchor', 'start')
        .style('font-size', cellW < 30 ? '8px' : '10px')
        .style('fill', '#333')
        .attr('transform', (d, i) =>
            `rotate(-45, ${i * cellW + cellW / 2}, -8)`
        )
        .text(d => d);

    // Color legend
    const legendW = 12, legendH = 300;
    const lx = W + 20, ly = 0;
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
        .attr('id', 'hmGrad')
        .attr('x1', '0%').attr('y1', '100%')
        .attr('x2', '0%').attr('y2', '0%');
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(t => {
        grad.append('stop')
            .attr('offset', `${t * 100}%`)
            .attr('stop-color', color(t * maxVal));
    });

    svg.append('rect')
        .attr('x', lx).attr('y', ly)
        .attr('width', legendW).attr('height', legendH)
        .attr('rx', 3).attr('fill', 'url(#hmGrad)');

    svg.append('text')
        .attr('x', lx + legendW + 6).attr('y', ly + legendH)
        .attr('dy', '0.35em').style('font-size', '9px').style('fill', '#666')
        .text('0');

    svg.append('text')
        .attr('x', lx + legendW + 6).attr('y', ly)
        .attr('dy', '0.35em').style('font-size', '9px').style('fill', '#666')
        .text(d3.format('.0f')(maxVal));

    svg.append('text')
        .attr('x', lx + legendW / 2).attr('y', ly - 8)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px').style('fill', '#444')
        .text('RPKM');

    const legendScale = d3.scaleLinear().domain([0, maxVal]).range([legendH, 0]);
    const step = 10000;
    const dynamicTicks = d3.range(step, maxVal, step);
    const ticks = [0, ...dynamicTicks, maxVal];

    svg.selectAll('.legend-tick')
        .data(ticks).enter()
        .append('text')
        .attr('x', lx + legendW + 6)
        .attr('y', d => ly + legendScale(d))
        .attr('dy', '0.35em')
        .style('font-size', '9px').style('fill', '#666')
        .text(d => d3.format('.0f')(d));
}


// ── Helpers ───────────────────────────────────────────────────

function _setHeatmapTitle(text) {
    const el = document.querySelector('#panel-heatmap .panel-title');
    if (el) el.textContent = text;
}

function _renderEmpty(message) {
    const container = d3.select('#heatmap-chart');
    container.selectAll('*').remove();
    container.append('p')
        .style('color', '#888')
        .style('padding', '20px')
        .style('font-style', 'italic')
        .text(message);
}