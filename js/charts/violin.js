// ============================================================
//  violin.js — Violin + box plot chart with drag-to-select
//              drill-down table
//
//  Exports:
//    drawViolin()                    — loads default TSV and draws
//    drawViolinFromData(data, title) — draws from prepared data
//                                     (used by syncViolinToKrona)
// ============================================================

// ── Shared SVG config ────────────────────────────────────────
const MARGIN = { top: 10, right: 80, bottom: 160, left: 80 };
const WIDTH  = 1200 - MARGIN.left - MARGIN.right;
const HEIGHT = 500  - MARGIN.top  - MARGIN.bottom;


// ── EC → Superpathway helpers ─────────────────────────────────

/**
 * Load EC_pathway.txt and build ec_to_map:
 *   { "1.1.1.1": ["map00010", "map00020", ...], ... }
 */
async function loadEcToMap(filepath) {
    const text = await d3.text(filepath);
    const ec_to_map = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [left, right] = trimmed.split('\t');
        if (!left || !right) continue;
        const map_id = left.replace('path:', '');
        const ec     = right.replace('ec:', '');
        if (!ec_to_map[ec]) ec_to_map[ec] = [];
        ec_to_map[ec].push(map_id);
    }
    return ec_to_map;
}

/**
 * Load pathway_to_superpathway.csv and build map_to_super:
 *   { "map00010": "Carbohydrate Metabolism", ... }
 */
async function loadMapToSuper(filepath) {
    const rows = await d3.csv(filepath);
    const map_to_super = {};
    for (const row of rows) {
        map_to_super[row['Pathway ID']] = row['Superpathway'];
    }
    return map_to_super;
}

/**
 * Given an EC number, return unique superpathways it belongs to.
 */
function getSuperpathwaysForEc(ec, ec_to_map, map_to_super) {
    const maps = ec_to_map[ec] || [];
    const superpaths = new Set();
    for (const m of maps) {
        if (map_to_super[m]) superpaths.add(map_to_super[m]);
    }
    return [...superpaths];
}

/**
 * Flatten raw TSV rows into { GeneID, EC, RPKM, superpathway },
 * duplicating each gene once per superpathway it belongs to.
 * Genes with no superpathway mapping are placed in "Unclassified".
 */
function flattenWithSuperpathways(raw, ec_to_map, map_to_super) {
    const firstRow  = raw[0] || {};
    const allKeys   = Object.keys(firstRow);
    const geneIDKey = allKeys.find(k => k.replace(/^[.,\uFEFF]+/, '') === 'GeneID') || 'GeneID';
    const ecKey     = allKeys.find(k => k.replace(/^[.,\uFEFF]+/, '') === 'EC#')    || 'EC#';
    const rpkmKey   = allKeys.find(k => k.replace(/^[.,\uFEFF]+/, '') === 'RPKM')   || 'RPKM';

    const flat = [];
    for (const row of raw) {
        const ec         = row[ecKey];
        const superpaths = getSuperpathwaysForEc(ec, ec_to_map, map_to_super);
        const targets    = superpaths.length > 0 ? superpaths : ['Unclassified'];
        for (const sp of targets) {
            flat.push({
                GeneID:       row[geneIDKey],
                EC:           ec,
                RPKM:         +row[rpkmKey],
                superpathway: sp,
            });
        }
    }
    return flat;
}


// ── Public: default view ─────────────────────────────────────

/**
 * Load the default TSV + database files, build the flat data,
 * then hand off to drawViolinFromData().
 */
export async function drawViolin() {
    const [raw, ec_to_map, map_to_super] = await Promise.all([
        d3.tsv('databases/RPKM_table.tsv'),
        loadEcToMap('databases/EC_pathway.txt'),
        loadMapToSuper('databases/pathway_to_superpathway.csv'),
    ]);

    const flatData = flattenWithSuperpathways(raw, ec_to_map, map_to_super);
    drawViolinFromData(flatData, 'RPKM Distribution by Superpathway');
}


// ── Public: draw from prepared data ─────────────────────────

/**
 * Render the violin + box plot from a flat array of
 * { GeneID, EC, RPKM, superpathway } objects.
 *
 * Used both by drawViolin() above and by syncViolinToKrona()
 * in sync.js when the user clicks "Sync to Violin".
 *
 * @param {Array}  flatData  - array of { GeneID, EC, RPKM, superpathway }
 * @param {string} title     - text shown above the chart
 */
export function drawViolinFromData(flatData, title) {
    // Clear previous chart and update title
    d3.select('#my_dataviz').selectAll('*').remove();
    document.querySelector('#panel-violin .panel-title').textContent = title;

    // Clear any previous drill-down table
    d3.select('#violin-drilldown').remove();

    // ── SVG setup ──
    const svg = d3.select('#my_dataviz')
        .append('svg')
        .attr('width',  WIDTH  + MARGIN.left + MARGIN.right)
        .attr('height', HEIGHT + MARGIN.top  + MARGIN.bottom)
        .append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // ── X scale ──
    const domain = [...new Set(flatData.map(d => d.superpathway))].sort();
    const x = d3.scaleBand().range([0, WIDTH]).domain(domain).padding(0.05);

    svg.append('g')
        .attr('transform', `translate(0,${HEIGHT})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-40)');

    // ── Y scale ──
    const yMax = d3.max(flatData, d => d.RPKM) * 1.1;
    const y = d3.scaleLinear()
        .domain([0, yMax])
        .range([HEIGHT, 0]);

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
        .text('RPKM');

    // ── Histogram bins (for violin shape) ──
    const histogram = d3.bin()
        .domain(y.domain())
        .thresholds(y.ticks(20))
        .value(d => d);

    const groups  = d3.group(flatData, d => d.superpathway);
    const sumstat = Array.from(groups, ([key, values]) => ({
        key,
        value: histogram(values.map(g => g.RPKM)),
    }));

    // ── Box plot statistics ──
    const boxStats = Array.from(groups, ([key, values]) => {
        const vals = values.map(g => g.RPKM).sort(d3.ascending);
        return {
            key,
            value: {
                q1:     d3.quantile(vals, 0.25),
                median: d3.quantile(vals, 0.5),
                q3:     d3.quantile(vals, 0.75),
                min:    d3.min(vals),
                max:    d3.max(vals),
            },
        };
    });

    // ── Draw violins ──
    const maxNum = d3.max(sumstat, d => d3.max(d.value, b => b.length));
    const xNum   = d3.scaleLinear().range([0, x.bandwidth()]).domain([-maxNum, maxNum]);

    svg.selectAll('myViolin')
        .data(sumstat).enter()
        .append('g')
        .attr('transform', d => `translate(${x(d.key)},0)`)
        .append('path')
        .datum(d => d.value)
        .style('stroke', 'none')
        .style('fill', '#69b3a2')
        .attr('d', d3.area()
            .x0(d => xNum(-d.length))
            .x1(d => xNum(d.length))
            .y(d  => y(d.x0))
            .curve(d3.curveCatmullRom)
        );

    // ── Draw box plots ──
    const boxWidth = x.bandwidth() * 0.15;

    svg.selectAll('boxplot')
        .data(boxStats).enter()
        .append('rect')
        .attr('x',      d => x(d.key) + x.bandwidth() / 2 - boxWidth / 2)
        .attr('width',  boxWidth)
        .attr('y',      d => y(d.value.q3))
        .attr('height', d => y(d.value.q1) - y(d.value.q3))
        .style('fill', 'black')
        .style('fill-opacity', 0.05)
        .style('stroke', 'black');

    // Median line
    svg.selectAll('medianLine')
        .data(boxStats).enter()
        .append('line')
        .attr('x1', d => x(d.key) + x.bandwidth() / 2 - boxWidth / 2)
        .attr('x2', d => x(d.key) + x.bandwidth() / 2 + boxWidth / 2)
        .attr('y1', d => y(d.value.median))
        .attr('y2', d => y(d.value.median))
        .style('stroke', 'black')
        .style('stroke-width', 2);

    // Whisker line
    svg.selectAll('whisker')
        .data(boxStats).enter()
        .append('line')
        .attr('x1', d => x(d.key) + x.bandwidth() / 2)
        .attr('x2', d => x(d.key) + x.bandwidth() / 2)
        .attr('y1', d => y(d.value.min))
        .attr('y2', d => y(d.value.max))
        .style('stroke', 'black');

    // Whisker caps
    ['max', 'min'].forEach(cap => {
        svg.selectAll(`whiskerCap-${cap}`)
            .data(boxStats).enter()
            .append('line')
            .attr('x1', d => x(d.key) + x.bandwidth() / 2 - boxWidth / 4)
            .attr('x2', d => x(d.key) + x.bandwidth() / 2 + boxWidth / 4)
            .attr('y1', d => y(d.value[cap]))
            .attr('y2', d => y(d.value[cap]))
            .style('stroke', 'black');
    });


    // ── Drag-to-select overlay ────────────────────────────────
    const highlightLayer = svg.append('g').attr('class', 'highlight-layer');
    let dragState = null;

    svg.selectAll('.drag-overlay')
        .data(domain).enter()
        .append('rect')
        .attr('class', 'drag-overlay')
        .attr('x',      d => x(d))
        .attr('y',      0)
        .attr('width',  x.bandwidth())
        .attr('height', HEIGHT)
        .style('fill', 'transparent')
        .style('cursor', 'ns-resize')
        .call(
            d3.drag()
                .on('start', function(event, key) {
                    const startY = Math.max(0, Math.min(HEIGHT, event.y));
                    dragState = { key, startY, currentY: startY };

                    highlightLayer.selectAll('.selection-band').remove();

                    highlightLayer.append('rect')
                        .attr('class', `selection-band band-${sanitize(key)}`)
                        .attr('x',      x(key))
                        .attr('y',      startY)
                        .attr('width',  x.bandwidth())
                        .attr('height', 0)
                        .style('fill', '#f4a261')
                        .style('fill-opacity', 0.4)
                        .style('stroke', '#e76f51')
                        .style('stroke-width', 1)
                        .style('pointer-events', 'none');
                })
                .on('drag', function(event) {
                    if (!dragState) return;
                    dragState.currentY = Math.max(0, Math.min(HEIGHT, event.y));

                    const bandY = Math.min(dragState.startY, dragState.currentY);
                    const bandH = Math.abs(dragState.currentY - dragState.startY);

                    highlightLayer.select(`.band-${sanitize(dragState.key)}`)
                        .attr('y',      bandY)
                        .attr('height', bandH);
                })
                .on('end', function() {
                    if (!dragState) return;
                    const { key, startY, currentY } = dragState;

                    const rpkmHigh = y.invert(Math.min(startY, currentY));
                    const rpkmLow  = y.invert(Math.max(startY, currentY));

                    const filtered = flatData.filter(d =>
                        d.superpathway === key &&
                        d.RPKM >= rpkmLow &&
                        d.RPKM <= rpkmHigh
                    ).sort((a, b) => b.RPKM - a.RPKM);

                    renderDrilldownTable(filtered, key, rpkmLow, rpkmHigh);
                    dragState = null;
                })
        );

    function sanitize(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '_');
    }
}


// ── Drill-down table ─────────────────────────────────────────

function renderDrilldownTable(rows, superpathway, rpkmLow, rpkmHigh) {
    d3.select('#violin-drilldown').remove();

    const container = d3.select('#my_dataviz')
        .append('div')
        .attr('id', 'violin-drilldown')
        .style('margin-top', '24px')
        .style('font-family', 'sans-serif')
        .style('font-size', '13px');

    container.append('p')
        .style('margin', '0 0 8px 0')
        .style('font-weight', 'bold')
        .style('color', '#333')
        .html(
            `${rows.length} gene${rows.length !== 1 ? 's' : ''} in ` +
            `<em>${superpathway}</em> &nbsp;|&nbsp; ` +
            `RPKM ${rpkmLow.toFixed(3)} – ${rpkmHigh.toFixed(3)}`
        );

    if (rows.length === 0) {
        container.append('p')
            .style('color', '#888')
            .text('No genes found in this range. Try dragging a wider selection.');
        return;
    }

    const table = container.append('table')
        .style('border-collapse', 'collapse')
        .style('width', '100%');

    const headers = ['EC Number', 'RPKM', 'Superpathway'];
    const fields  = ['EC',        'RPKM', 'superpathway'];

    table.append('thead')
        .append('tr')
        .selectAll('th')
        .data(headers).enter()
        .append('th')
        .text(d => d)
        .style('text-align', 'left')
        .style('padding', '6px 12px')
        .style('border-bottom', '2px solid #ccc')
        .style('background', '#f5f5f5')
        .style('color', '#444')
        .style('font-weight', '600');

    const tbody = table.append('tbody');

    const tr = tbody.selectAll('tr')
        .data(rows).enter()
        .append('tr')
        .style('border-bottom', '1px solid #eee')
        .on('mouseover', function() { d3.select(this).style('background', '#fff8f0'); })
        .on('mouseout',  function() { d3.select(this).style('background', 'white'); });

    fields.forEach((field, i) => {
        tr.append('td')
            .text(d => field === 'RPKM' ? (+d[field]).toFixed(4) : d[field])
            .style('padding', '5px 12px')
            .style('color', i === 0 ? '#1a6fa8' : '#333')
            .style('font-family', i === 0 ? 'monospace' : 'sans-serif');
    });
}