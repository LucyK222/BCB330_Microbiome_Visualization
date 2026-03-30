// ============================================================
//  state.js — Single source of truth for all shared app data
//
//  BEFORE: globals scattered across index.html like:
//    window._kronaData = data;
//    window._violinLoaded = true;
//    let kronaMode = 'reads';
//
//  AFTER: everything lives here, imported where needed.
// ============================================================

export const state = {

    // ── Which tabs have been initialized (drawn for the first time) ──
    loaded: {
        violin:      false,
        krona:       false,
        composition: false,
        heatmap:     false,
    },

    // ── Krona chart state ──
    kronaMode:        'reads',      // 'reads' | 'rpkm'
    kronaData:        null,         // raw JSON tree currently loaded
    kronaCurrentNode: null,         // the node the user has drilled into

    // Composition chart state
    compositionMode: 'rpkm',        // 'reads' | 'rpkm'

    // ── Shared data trees ──
    rpkmTreeData: null,             // taxa_rpkm.json, shared by Krona + Composition
    readsTreeData: null
};