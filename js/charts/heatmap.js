// ============================================================
//  heatmap.js — Taxon × Superpathway RPKM heatmap
//
//  Exports:
//    drawHeatmap() — loads RPKM_table.tsv + db files, builds
//                    the summed matrix, renders via D3
// ============================================================

const MARGIN = { top: 120, right: 150, bottom: 40, left: 220 };
const CELL_H = 28;
const CELL_W = 44;

export async function drawHeatmap() {
    const [raw, ecToMapText, superpathRows] = await Promise.all([
        d3.tsv('databases/RPKM_table.tsv'),
        d3.text('databases/EC_pathway.txt'),
        d3.csv('databases/pathway_to_superpathway.csv'),
    ]);

    // --- Build EC → superpathway lookup (same logic as violin.js) ---
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

    // --- Identify the top 20 taxa columns ---
    const FIXED = new Set(['GeneID', 'EC#', 'Length', 'Reads', 'ECF', 'RPKM', 'Bacteria']);
    const allTaxonCols = Object.keys(raw[0] || {}).filter(k => !FIXED.has(k.replace(/^\uFEFF/, '')));

    // Sum total RPKM per taxon to pick the top 20
    const taxonTotals = {};
    for (const col of allTaxonCols) {
        taxonTotals[col] = d3.sum(raw, r => +r[col] || 0);
    }
    const top20 = Object.entries(taxonTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([col]) => col);

    // --- Build the matrix: taxon × superpathway → summed RPKM ---
    // For each row in RPKM_table: for each top-20 taxon with non-zero value,
    // map EC# → superpathways and accumulate RPKM into that cell.
    const matrix = {};  // matrix[taxon][superpathway] = sum
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

        for (const taxon of top20) {
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

    // --- Render ---
    const W = CELL_W * top20.length;
    const H = CELL_H * superpaths.length;
    const totalW = W + MARGIN.left + MARGIN.right;
    const totalH = H + MARGIN.top  + MARGIN.bottom;

    const container = d3.select('#heatmap-chart');
    container.selectAll('*').remove();

    // Color scale: 0 → light peach, max → dark purple (coral→purple ramp)
    const maxVal = d3.max(superpaths, sp =>
        d3.max(top20, t => matrix[t]?.[sp] || 0)
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
        top20.forEach((taxon, ti) => {
            const val = matrix[taxon]?.[sp] || 0;
            svg.append('rect')
                .attr('x',      ti * CELL_W)
                .attr('y',      si * CELL_H)
                .attr('width',  CELL_W)
                .attr('height', CELL_H)
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
        .attr('y',  (d, i) => i * CELL_H + CELL_H / 2)
        .attr('dy', '0.35em')
        .style('text-anchor', 'end')
        .style('font-size', '11px')
        .style('fill', '#333')
        .text(d => d);

    // X axis — taxon labels (rotated)
    svg.selectAll('.taxon-label')
        .data(top20).enter()
        .append('text')
        .attr('x',  (d, i) => i * CELL_W + CELL_W / 2)
        .attr('y',  -8)
        .attr('dy', '0.35em')
        .style('text-anchor', 'start')
        .style('font-size', '10px')
        .style('fill', '#333')
        .attr('transform', (d, i) =>
            `rotate(-45, ${i * CELL_W + CELL_W / 2}, -8)`
        )
        .text(d => d);

    // Color legend
    const legendW = 12, legendH = 300;
    const lx = W + 20, ly = 0;
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
        .attr('id', 'hmGrad')
        .attr('x1', '0%')
        .attr('y1', '100%')   // bottom
        .attr('x2', '0%')
        .attr('y2', '0%');    // top
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(t => {
        grad.append('stop')
            .attr('offset', `${t * 100}%`)
            .attr('stop-color', color(t * maxVal));
    });
// Gradient bar
    svg.append('rect')
        .attr('x', lx)
        .attr('y', ly)
        .attr('width', legendW)
        .attr('height', legendH)
        .attr('rx', 3)
        .attr('fill', 'url(#hmGrad)');

// Min label (bottom)
    svg.append('text')
        .attr('x', lx + legendW + 6)
        .attr('y', ly + legendH)
        .attr('dy', '0.35em')
        .style('font-size', '9px')
        .style('fill', '#666')
        .text('0');

// Max label (top)
    svg.append('text')
        .attr('x', lx + legendW + 6)
        .attr('y', ly)
        .attr('dy', '0.35em')
        .style('font-size', '9px')
        .style('fill', '#666')
        .text(d3.format('.0f')(maxVal));

// Title
    svg.append('text')
        .attr('x', lx + legendW / 2)
        .attr('y', ly - 8)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', '#444')
        .text('RPKM');

    // Helper: map value → y position on legend
    const legendScale = d3.scaleLinear()
        .domain([0, maxVal])
        .range([legendH, 0]);  // bottom → top

// Tick values you want
    const step = 10000;

// Generate intermediate ticks
    const dynamicTicks = d3.range(step, maxVal, step);

// Final ticks: include 0 and maxVal
    const ticks = [0, ...dynamicTicks, maxVal];

// Draw tick labels
    svg.selectAll('.legend-tick')
        .data(ticks)
        .enter()
        .append('text')
        .attr('x', lx + legendW + 6)
        .attr('y', d => ly + legendScale(d))
        .attr('dy', '0.35em')
        .style('font-size', '9px')
        .style('fill', '#666')
        .text(d => d3.format('.0f')(d));
}