// ============================================================
//  violin.js — Violin + box plot chart
//
//  Exports:
//    drawViolin()                  — loads default CSV and draws
//    drawViolinFromData(data, title) — draws from prepared data
//                                    (used by syncViolinToKrona)
//
//  BEFORE: two separate functions lived in a <script> block in
//  index.html. drawViolin() had its own inline d3.csv() call
//  and duplicated all the SVG setup that drawViolinFromData()
//  also had.
//
//  AFTER: drawViolin() just loads the CSV then delegates to
//  drawViolinFromData() — one drawing path, no duplication.
// ============================================================

// ── Shared SVG config ────────────────────────────────────────
// Defined once here instead of duplicated in both functions.
const MARGIN = { top: 10, right: 30, bottom: 160, left: 80 };
const WIDTH  = 900 - MARGIN.left - MARGIN.right;
const HEIGHT = 500 - MARGIN.top  - MARGIN.bottom;


// ── Public: default view ─────────────────────────────────────

/**
 * Load the default CSV and draw the violin chart.
 * Called once when the violin tab first becomes active.
 *
 * BEFORE: this function had its own copy of all the SVG setup
 * code (margins, scales, histogram, box stats) duplicated from
 * drawViolinFromData().
 *
 * AFTER: loads data, reshapes it to { superpathway, RPKM }
 * format, then hands off to drawViolinFromData().
 */
export async function drawViolin() {
    const raw = await d3.csv('data/violin_Dorea_sp_5_2.csv');
    raw.forEach(d => { d.RPKM = +d.RPKM; });

    drawViolinFromData(raw, 'RPKM Distribution by Superpathway — Dorea sp. 5_2');
}


// ── Public: draw from prepared data ─────────────────────────

/**
 * Render the violin + box plot from any flat array of
 * { superpathway, RPKM } objects.
 *
 * Used both by drawViolin() above and by syncViolinToKrona()
 * in sync.js when the user clicks "Sync to Violin".
 *
 * @param {Array}  flatData  - array of { superpathway, RPKM }
 * @param {string} title     - text shown above the chart
 */
export function drawViolinFromData(flatData, title) {
    // Clear previous chart and update title
    d3.select('#my_dataviz').selectAll('*').remove();
    document.querySelector('#panel-violin .panel-title').textContent = title;

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
    const y = d3.scaleLinear()
        .domain([0, d3.max(flatData, d => d.RPKM) * 1.1])
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

    const groups   = d3.group(flatData, d => d.superpathway);
    const sumstat  = Array.from(groups, ([key, values]) => ({
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
}