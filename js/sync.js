// ============================================================
//  sync.js — "Sync to Violin" feature + EC mapping helpers
//
//  Exports:
//    syncViolinToKrona() — the main sync handler, called when
//                          user clicks the "Sync to Violin" button
//
//  BEFORE: syncViolinToKrona() was a large async function buried
//  in a <script> block alongside EC helpers (parseEcToMap,
//  parseMapToSuper, getSuperpathwaysForEc). All of them read
//  from window globals: window._rpkmRows, window._ecToMap,
//  window._mapToSuper, window._kronaData, kronaCurrentNode.
//
//  AFTER: all dependencies are explicit imports. The EC helpers
//  are private to this file (no export needed — nothing else
//  uses them). State is read from state.js.
// ============================================================

import { state }                from '/js/state.js';
import { loadViolinDatabases }  from '/js/dataLoader.js';
import { getTopN }              from '/js/sliders.js';
import { filterTree }           from '/js/charts/krona.js';
import { drawViolinFromData }   from '/js/charts/violin.js';


// ── EC mapping helpers (private) ─────────────────────────────
// These replicate the logic from python/EC_to_superpath.py.
// They are only used by syncViolinToKrona() so they stay
// private — no export.

/**
 * Parse EC_pathway.txt into a lookup map.
 * Each line: "path:mapXXXXX\tec:1.2.3.4"
 * Returns: { "1.2.3.4": ["map00010", ...], ... }
 */
function parseEcToMap(text) {
    const ecToMap = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [left, right] = trimmed.split('\t');
        if (!left || !right) continue;
        const mapId = left.replace('path:', '');
        const ec    = right.replace('ec:', '');
        if (!ecToMap[ec]) ecToMap[ec] = [];
        ecToMap[ec].push(mapId);
    }
    return ecToMap;
}

/**
 * Parse pathway_to_superpathway.csv rows into a lookup map.
 * Returns: { "map00010": "Carbohydrate metabolism", ... }
 */
function parseMapToSuper(rows) {
    const mapToSuper = {};
    for (const row of rows) {
        mapToSuper[row['Pathway ID']] = row['Superpathway'];
    }
    return mapToSuper;
}

/**
 * Given an EC number, return all superpathway names it maps to.
 * Returns an empty array if the EC isn't found.
 */
function getSuperpathwaysForEc(ec, ecToMap, mapToSuper) {
    const maps      = ecToMap[ec] || [];
    const superpaths = new Set();
    for (const m of maps) {
        if (mapToSuper[m]) superpaths.add(mapToSuper[m]);
    }
    return [...superpaths];
}


// ── Tree traversal helpers (private) ─────────────────────────

/** Collect all leaf node names under a given tree node. */
function collectLeafNames(node) {
    if (!node.children || node.children.length === 0) return [node.name];
    return node.children.flatMap(c => collectLeafNames(c));
}

/** Find a node by name anywhere in the tree. Returns null if not found. */
function findNodeInTree(tree, targetName) {
    if (tree.name === targetName) return tree;
    for (const child of tree.children || []) {
        const found = findNodeInTree(child, targetName);
        if (found) return found;
    }
    return null;
}


// ── Main sync function (public) ──────────────────────────────

/**
 * Read the currently visible taxa from the Krona chart,
 * match them to columns in the RPKM table, map EC numbers
 * to superpathways, and redraw the violin chart.
 *
 * Called by the "Sync to Violin" button in index.html.
 * The button is only visible when kronaMode === 'rpkm'.
 *
 * BEFORE: this was a single 80-line async function in index.html
 * reading from 6 different window globals.
 *
 * AFTER: all dependencies come in via imports or state.js.
 * The 6 numbered steps are preserved and clearly commented.
 */
export async function syncViolinToKrona() {

    // ── Step 1: Load all three database files (cached after first load) ──
    const { rpkmRows, ecPathwayRaw, pathwayRows } = await loadViolinDatabases();
    const ecToMap    = parseEcToMap(ecPathwayRaw);
    const mapToSuper = parseMapToSuper(pathwayRows);

    // ── Step 2: Get visible taxa at the current Krona zoom level ──
    let visibleTaxa;
    const cur = state.kronaCurrentNode;

    if (!cur || cur.depth === 0) {
        // At root — use filtered top-level phylum children
        const filteredRoot = filterTree(state.kronaData, getTopN());
        visibleTaxa = (filteredRoot.children || [])
            .map(d => d.name)
            .filter(n => !n.startsWith('Other'));
    } else {
        // Drilled into a node — use its direct children
        visibleTaxa = (cur.data.children || [])
            .map(d => d.name)
            .filter(n => !n.startsWith('Other'));
    }

    if (visibleTaxa.length === 0) {
        alert('No visible taxa found in current Krona view.');
        return;
    }

    // ── Step 3: Match visible taxa to RPKM table columns ──
    const FIXED_COLS = new Set(['GeneID', 'Length', 'Reads', 'EC#', 'ECF', 'RPKM', 'Bacteria']);
    const taxonCols  = Object.keys(rpkmRows[0]).filter(c => !FIXED_COLS.has(c));

    const uniqueMatchedCols = new Set();

    for (const taxonName of visibleTaxa) {
        // Try direct substring match first
        const directMatch = taxonCols.find(
            col => col.includes(taxonName) || taxonName.includes(col)
        );
        if (directMatch) {
            uniqueMatchedCols.add(directMatch);
            continue;
        }

        // No direct match — walk the full tree to find all descendant leaf names
        const node = findNodeInTree(state.kronaData, taxonName);
        if (node) {
            for (const leafName of collectLeafNames(node)) {
                const leafMatch = taxonCols.find(
                    col => col.includes(leafName) || leafName.includes(col)
                );
                if (leafMatch) uniqueMatchedCols.add(leafMatch);
            }
        }
    }

    if (uniqueMatchedCols.size === 0) {
        alert(`None of the visible taxa matched columns in the RPKM table.\nVisible: ${visibleTaxa.join(', ')}`);
        return;
    }

    const matchedCols = [...uniqueMatchedCols];

    // ── Step 4: Filter RPKM rows to matched taxa with valid EC numbers ──
    const filteredRows = rpkmRows.filter(row => {
        if (!row['EC#'] || row['EC#'] === '0.0.0.0') return false;
        return matchedCols.some(col => {
            const v = parseFloat(row[col]);
            return !isNaN(v) && v !== 0;
        });
    });

    if (filteredRows.length === 0) {
        alert('No matching rows found after filtering.');
        return;
    }

    // ── Step 5: Map each EC number to superpathways, build flat data ──
    const flatData = [];
    for (const row of filteredRows) {
        const rpkm = parseFloat(row['RPKM']);
        if (isNaN(rpkm)) continue;

        const ecs = row['EC#'].split('|').map(e => e.trim());
        for (const ec of ecs) {
            for (const sp of getSuperpathwaysForEc(ec, ecToMap, mapToSuper)) {
                flatData.push({ superpathway: sp, RPKM: rpkm });
            }
        }
    }

    if (flatData.length === 0) {
        alert('No superpathway mappings found for the filtered genes.');
        return;
    }

    // ── Step 6: Switch to the violin tab and draw ──
    // We import switchTab from main.js indirectly via a DOM event
    // to avoid a circular import (main.js imports sync.js).
    // Dispatching a custom event keeps the dependency one-directional.
    document.dispatchEvent(new CustomEvent('switchTab', { detail: 'violin' }));

    const title = `RPKM by Superpathway — ${visibleTaxa.join(', ')}`;
    drawViolinFromData(flatData, title);
}