// ============================================================
//  dataLoader.js — All data fetching lives here, nothing else.
//
//  Rules:
//    - Every function returns a Promise that resolves to data
//    - No drawing, no DOM touching, no state mutation here
//    - Results are cached so the same file is never fetched twice
// ============================================================

// TODO: fix the dependency of loading data (loadrpkmtree)

import { state } from '/js/state.js';
import { getAssetUrl } from '/js/assetPaths.js';

// ── Internal cache ───────────────────────────────────────────
// These are module-level variables, private to this file.
// Other files never touch them directly — they call the
// load functions below, which return cached data if available.
const cache = {
    taxaReads:    null,   // taxa_complete.json
    taxaRpkm:     null,   // taxa_rpkm.json  (shared by Krona + Composition)
    taxaReadsComp: null,  // taxa_complete.json
    rpkmTable:    null,   // RPKM_table.tsv
    ecPathway:    null,   // EC_pathway.txt
    pathwaySuper: null,   // pathway_to_superpathway.csv
};


// ── Public load functions ────────────────────────────────────

/**
 * Load the taxa hierarchy for the Krona chart.
 * Which file to load depends on the current kronaMode in state.
 *
 * BEFORE (scattered across index.html):
 *   fetch(kronaMode === 'reads' ? './data/taxa_complete.json' : './data/taxa_rpkm.json')
 *     .then(r => r.json())
 *     .then(data => { window._kronaData = data; rebuildKrona(); })
 *
 * AFTER: just call loadKronaData() and await the result.
 */
export async function loadKronaData() {
    if (state.kronaMode === 'reads') {
        if (!cache.taxaReads) {
            const res = await fetch(getAssetUrl('./data/taxa_complete.json'));
            cache.taxaReads = await res.json();
        }
        return cache.taxaReads;

    } else {
        // rpkm mode reuses the same tree as the Composition chart
        return loadRpkmTree();
    }
}

/**
 * Load taxa_rpkm.json — shared by both Krona (rpkm mode) and Composition.
 *
 * BEFORE: fetched separately in two different functions:
 *   // in loadAndDrawKrona():
 *   fetch('./data/taxa_rpkm.json').then(...)
 *   // in loadAndDrawComposition():
 *   const res = await fetch('./data/taxa_rpkm.json');
 *   window._rpkmTreeData = await res.json();
 *
 * AFTER: one fetch, cached, shared.
 */
export async function loadRpkmTree() {
    if (!cache.taxaRpkm) {
        const res = await fetch(getAssetUrl('./data/taxa_rpkm.json'));
        cache.taxaRpkm = await res.json();
    }
    return cache.taxaRpkm;
}

export async function loadReadsTree() {
    if (!cache.taxaReadsComp) {
        const res = await fetch(getAssetUrl('./data/taxa_complete.json'));
        cache.taxaReadsComp = await res.json();
    }
    return cache.taxaReadsComp;
}

/**
 * Load all three databases needed for the Sync to Violin feature.
 * Returns them together as one object so callers don't need three awaits.
 *
 * BEFORE (all inside syncViolinToKrona(), mixed with rendering logic):
 *   if (!window._rpkmRows) window._rpkmRows = await d3.tsv("databases/RPKM_table.tsv");
 *   if (!window._ecToMap)  { const text = await d3.text(...); window._ecToMap = parseEcToMap(text); }
 *   if (!window._mapToSuper) { const rows = await d3.csv(...); window._mapToSuper = parseMapToSuper(rows); }
 *
 * AFTER: one call, all three come back cached.
 */
export async function loadViolinDatabases() {
    if (!cache.rpkmTable) {
        cache.rpkmTable = await d3.tsv(getAssetUrl('databases/RPKM_table.tsv'));
    }
    if (!cache.ecPathway) {
        cache.ecPathway = await d3.text(getAssetUrl('databases/EC_pathway.txt'));
    }
    if (!cache.pathwaySuper) {
        cache.pathwaySuper = await d3.csv(getAssetUrl('databases/pathway_to_superpathway.csv'));
    }

    return {
        rpkmRows:    cache.rpkmTable,
        ecPathwayRaw: cache.ecPathway,
        pathwayRows:  cache.pathwaySuper,
    };
}

export function resetDataCache() {
    Object.keys(cache).forEach(key => {
        cache[key] = null;
    });
}
