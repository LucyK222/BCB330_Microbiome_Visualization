// ============================================================
//  description.js — Alpha diversity indices for the sample
//
//  Reads species-level counts from the leaf nodes of
//  taxa_complete.json (the reads-mode tree) and computes:
//    - Total reads (N), Observed species (S)
//    - Shannon index H' = -Σ p_i * ln(p_i)
//    - Pielou's evenness J' = H' / ln(S)
//    - Simpson's D = Σ n_i(n_i-1) / N(N-1)
//    - Inverse Simpson = 1/D
//    - Chao1 = S + n1² / (2*n2)
//    - Margalef = (S-1) / ln(N)
// ============================================================

import { state }         from '/js/state.js';
import { loadKronaData } from '/js/dataLoader.js';
import { getAssetUrl }   from '/js/assetPaths.js';


// ── Collect species counts from the tree ─────────────────────

function collectLeaves(node) {
    if (!node.children || node.children.length === 0) {
        return [node.value || 0];
    }
    return node.children.flatMap(collectLeaves);
}


// ── Index formulas ───────────────────────────────────────────

function shannon(counts) {
    const N = counts.reduce((s, c) => s + c, 0);
    if (N === 0) return 0;
    return -counts.reduce((s, c) => {
        if (c === 0) return s;
        const p = c / N;
        return s + p * Math.log(p);
    }, 0);
}

function simpson(counts) {
    const N = counts.reduce((s, c) => s + c, 0);
    if (N <= 1) return 0;
    return counts.reduce((s, c) => s + c * (c - 1), 0) / (N * (N - 1));
}

function chao1(counts) {
    const S  = counts.filter(c => c > 0).length;
    const n1 = counts.filter(c => c === 1).length;
    const n2 = counts.filter(c => c === 2).length;
    if (n2 === 0) return S + (n1 * (n1 - 1)) / 2;
    return S + (n1 * n1) / (2 * n2);
}


// ── Public API ───────────────────────────────────────────────

export function initDescription() {}

export async function drawDescription() {
    const savedMode = state.kronaMode;
    state.kronaMode = 'reads';
    const tree = await loadKronaData();
    state.kronaMode = savedMode;

    const counts = collectLeaves(tree).filter(c => c > 0);
    const N = counts.reduce((s, c) => s + c, 0);
    const S = counts.length;

    if (N === 0 || S === 0) {
        document.getElementById('description-content').innerHTML =
            '<p>No read data available.</p>';
        return;
    }

    const H    = shannon(counts);
    const D    = simpson(counts);
    const invD = D > 0 ? 1 / D : null;
    const J    = S > 1 ? H / Math.log(S) : 0;
    const C1   = chao1(counts);
    const marg = N > 1 ? (S - 1) / Math.log(N) : 0;

    const rows = [
        ['Total reads (N)',         N.toLocaleString(),        ''],
        ['Observed species (S)',     S.toLocaleString(),        ''],
        ["Shannon index (H')",       H.toFixed(4),              "H' = -Σ p_i · ln(p_i)"],
        ["Simpson's index (D)",              D.toFixed(4),              'D = Σn(n-1) / N(N-1)']
    ];
    // ["Pielou's evenness (J')",   J.toFixed(4),              "J' = H' / ln(S); range 0–1"],
    // ['Inverse Simpson (1/D)',    invD !== null ? invD.toFixed(4) : '—', 'higher = more diverse'],
    //     ['Chao1 estimator',          Math.round(C1).toLocaleString(), 'estimated true species richness'],
    //     ['Margalef richness',        marg.toFixed(4),           '(S-1) / ln(N)'],

    const tableRows = rows.map(([label, value, note]) => `
        <tr>
            <td>${label}</td>
            <td class="desc-value">${value}</td>
            <td class="desc-note">${note}</td>
        </tr>
    `).join('');

    document.getElementById('description-content').innerHTML = `
        <table class="desc-table">
            <thead>
                <tr>
                    <th>Index</th>
                    <th>Value</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    `;

    // ── Enzyme Coverage Radar Chart ──────────────────────────────
// Paste this block at the end of drawDescription(), after the
// existing innerHTML assignment. It appends a radar (spider-web)
// chart of KEGG pathway category enzyme counts below the table.
//
// Data was derived from EC_coverage.csv: one column per KEGG
// category, values = count of distinct EC numbers detected.
// ─────────────────────────────────────────────────────────────

    await (async function drawEnzymeCoverageRadar() {

        // ── Data ─────────────────────────────────────────────────
        // ── Load EC coverage from CSV ────────────────────────────────
        const response = await fetch(getAssetUrl('/data/EC_coverage.csv'));
        const text     = await response.text();
        const lines    = text.trim().split('\n');
        const headers  = lines[0].split(',').slice(1).map(h => h.trim());
        const lastRow  = lines[lines.length - 1].split(',').slice(1);

// Map category name → coverage value
        const coverageMap = {};
        headers.forEach((h, i) => { coverageMap[h] = parseFloat(lastRow[i]) || 0; });

        const EC_DATA = [
            { label: 'Amino acid\nmetabolism',           value: coverageMap['Amino acid metabolism'] },
            { label: 'Carbohydrate\nmetabolism',         value: coverageMap['Carbohydrate metabolism'] },
            { label: 'Global &\noverview maps',          value: coverageMap['Global and overview maps'] },
            { label: 'Metabolism of\ncofactors & vit.',  value: coverageMap['Metabolism of cofactors and vitamins'] },
            { label: 'Energy\nmetabolism',               value: coverageMap['Energy metabolism'] },
            { label: 'Nucleotide\nmetabolism',           value: coverageMap['Nucleotide metabolism'] },
            { label: 'Metabolism of\nother AA',          value: coverageMap['Metabolism of other amino acids'] },
            { label: 'Lipid\nmetabolism',                value: coverageMap['Lipid metabolism'] },
            { label: 'Glycan biosyn.\n& metabolism',     value: coverageMap['Glycan biosynthesis and metabolism'] },
            { label: 'Biosynthesis\nsecondary met.',     value: coverageMap['Biosynthesis of other secondary metabolites'] },
            { label: 'Xenobiotics\nbiodegradation',      value: coverageMap['Xenobiotics biodegradation and metabolism'] },
            { label: 'Terpenoids &\npolyketides',        value: coverageMap['Metabolism of terpenoids and polyketides'] },
            { label: 'Chemical struct.\ntransformation', value: coverageMap['Chemical structure transformation maps'] },
        ];

        const MAX_VALUE = 100;
        const LEVELS   = 4;             // concentric rings
        const N        = EC_DATA.length;

        // ── SVG dimensions ───────────────────────────────────────
        const W = 560, H = 500;
        const cx = W / 2, cy = H / 2 - 10;
        const R  = Math.min(cx, cy) - 80;  // radius to outermost ring

        const angleStep = (2 * Math.PI) / N;
        const angle = i => i * angleStep - Math.PI / 2;  // start at top

        function polar(i, r) {
            const a = angle(i);
            return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
        }

        // ── Build SVG string ─────────────────────────────────────
        let svg = `<svg xmlns="http://www.w3.org/2000/svg"
        width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
        style="font-family:inherit;overflow:visible">

    <defs>
        <radialGradient id="ecRadarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color="var(--accent,#4c9be8)" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="var(--accent,#4c9be8)" stop-opacity="0.15"/>
        </radialGradient>
    </defs>`;

        // ── Grid rings ───────────────────────────────────────────
        for (let l = 1; l <= LEVELS; l++) {
            const r = R * (l / LEVELS);
            const pts = Array.from({ length: N }, (_, i) => {
                const p = polar(i, r);
                return `${p.x},${p.y}`;
            }).join(' ');
            svg += `<polygon points="${pts}"
            fill="none" stroke="var(--muted,#666)" stroke-opacity="0.3"
            stroke-width="1"/>`;

            // ring label (% of max)
            const labelPct = Math.round((l / LEVELS) * MAX_VALUE);
            const labelPt  = polar(0, r);
            svg += `<text x="${labelPt.x + 4}" y="${labelPt.y - 3}"
            font-size="9" fill="var(--muted,#888)" text-anchor="start">${labelPct}</text>`;
        }

        // ── Spokes ───────────────────────────────────────────────
        for (let i = 0; i < N; i++) {
            const outer = polar(i, R);
            svg += `<line x1="${cx}" y1="${cy}" x2="${outer.x}" y2="${outer.y}"
            stroke="var(--muted,#666)" stroke-opacity="0.35" stroke-width="1"/>`;
        }

        // ── Data polygon ─────────────────────────────────────────
        const dataPts = EC_DATA.map((d, i) => {
            const r = R * (d.value / MAX_VALUE);
            const p = polar(i, r);
            return `${p.x},${p.y}`;
        }).join(' ');

        svg += `<polygon points="${dataPts}"
        fill="url(#ecRadarFill)"
        stroke="var(--accent,#4c9be8)" stroke-width="2"
        stroke-linejoin="round"/>`;

        // ── Data dots ─────────────────────────────────────────────
        EC_DATA.forEach((d, i) => {
            const r = R * (d.value / MAX_VALUE);
            const p = polar(i, r);
            svg += `<circle cx="${p.x}" cy="${p.y}" r="4"
            fill="var(--accent,#4c9be8)"
            stroke="var(--bg,#fff)" stroke-width="1.5">
            <title>${d.label.replace(/\n/,' ')}: ${d.value} ECs</title>
        </circle>`;
        });

        // ── Axis labels ───────────────────────────────────────────
        EC_DATA.forEach((d, i) => {
            const LABEL_OFFSET = 22;
            const p   = polar(i, R + LABEL_OFFSET);
            const a   = angle(i) * (180 / Math.PI);
            // split multi-line labels
            const lines = d.label.split('\n');
            const lineH = 11;
            const totalH = lines.length * lineH;
            // anchor: left/right/middle depending on quadrant
            let anchor = 'middle';
            const ax = Math.cos(angle(i));
            if (ax >  0.15) anchor = 'start';
            if (ax < -0.15) anchor = 'end';
            // vertical nudge so labels don't overlap the dot
            const ay = Math.sin(angle(i));
            const dyBase = ay > 0.1 ? 4 : ay < -0.1 ? -totalH + lineH : -totalH / 2 + lineH / 2;

            lines.forEach((line, li) => {
                svg += `<text x="${p.x}" y="${p.y + dyBase + li * lineH}"
                font-size="12" fill="var(--fg,#111)" text-anchor="${anchor}">${line}</text>`;
            });
        });

        // ── Title ─────────────────────────────────────────────────
        svg += `<text x="${cx}" y="16" font-size="14" font-weight="600"
        fill="var(--fg,#111)" text-anchor="middle">
        Enzyme Coverage by KEGG Pathway Category
    </text>`;

        svg += `</svg>`;

        // ── Inject into description panel ────────────────────────
        const container = document.getElementById('description-content');
        if (!container) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-top:1.5rem;text-align:center;';
        wrapper.innerHTML = svg;
        container.appendChild(wrapper);

        // Subtitle
        const sub = document.createElement('p');
        sub.style.cssText = 'font-size:13px;color:var(--muted,#888);margin-top:4px;';
        sub.textContent = 'Values = Enzyme Coverage ';
        wrapper.appendChild(sub);

    })();
}
