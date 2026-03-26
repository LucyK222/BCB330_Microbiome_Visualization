// ============================================================
//  main.js — App entry point. Imports and wires everything.
//
//  This file's only job is coordination:
//    - import all modules
//    - initialise them in the right order
//    - handle tab switching
//    - handle the kronaMode radio toggle
//    - listen for custom events from other modules (e.g. sync.js)
//
//  BEFORE: all of this was spread across several <script> blocks
//  at the top of index.html, reading/writing window globals and
//  calling functions defined in other blocks by implicit order.
//
//  AFTER: every dependency is an explicit import. The execution
//  order is clear from top to bottom of this single file.
// ============================================================

import { state }            from '/js/state.js';
import { initSliders }      from '/js/sliders.js';
import { initKrona,
    rebuildKrona }     from '/js/charts/krona.js';
import { initComposition,
    drawComposition }  from '/js/charts/composition.js';
import { drawViolin }       from '/js/charts/violin.js';
import { syncViolinToKrona } from '/js/sync.js';
import { drawHeatmap } from '/js/charts/heatmap.js';


// ============================================================
//  INITIALISATION
//  Runs once when the page has fully loaded.
// ============================================================

window.addEventListener('DOMContentLoaded', () => {

    // 1. Wire up sliders — must come before chart inits so that
    //    onSliderChange registrations have a listener to add to.
    initSliders();

    // 2. Register each chart's redraw callback with the slider system.
    initKrona();
    initComposition();

    // 3. Draw the default tab (violin) immediately.
    drawViolin();
    state.loaded.violin = true;

    // 4. Wire the kronaMode radio buttons.
    _initKronaToggle();

    // 5. Wire the "Sync to Violin" button.
    //    The button calls syncViolinToKrona() which lives in sync.js.
    //    We attach it here so index.html has no inline onclick handlers.
    document.getElementById('btn-sync-violin')
        .addEventListener('click', syncViolinToKrona);

    // 6. Listen for the custom 'switchTab' event that sync.js fires
    //    when it wants to programmatically switch to the violin tab.
    //    This avoids a circular import between sync.js and main.js.
    document.addEventListener('switchTab', e => {
        const tabName = e.detail;
        const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (btn) switchTab(tabName, btn);
    });

});


// ============================================================
//  TAB SWITCHING
// ============================================================

/**
 * Show the selected panel and lazy-load its chart if needed.
 *
 * BEFORE: switchTab() was a global function in index.html,
 * called via inline onclick="switchTab('violin', this)".
 * It used window._violinLoaded etc. to guard first draws.
 *
 * AFTER: state.loaded tracks what's been drawn. Tab buttons
 * in index.html use data-tab attributes instead of onclick,
 * and we wire click events here.
 *
 * @param {string}      name - 'violin' | 'krona' | 'composition'
 * @param {HTMLElement} btn  - the clicked tab button
 */
export function switchTab(name, btn) {
    // Update active panel
    document.querySelectorAll('.tab-panel')
        .forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn')
        .forEach(b => b.classList.remove('active'));

    document.getElementById('panel-' + name).classList.add('active');
    btn.classList.add('active');

    // Lazy-load charts on first visit
    if (name === 'violin' && !state.loaded.violin) {
        drawViolin();
        state.loaded.violin = true;
    }

    if (name === 'krona' && !state.loaded.krona) {
        state.loaded.krona = true;
        rebuildKrona();
    }

    if (name === 'heatmap' && !state.loaded.heatmap) {
        drawHeatmap();
        state.loaded.heatmap = true;
    }

    if (name === 'composition') {
        // Always redraw composition when switching to it —
        // the original code did this too, since it's cheap and
        // ensures sliders are always in sync.
        drawComposition();
        state.loaded.composition = true;
    }
}

// Wire tab button clicks here instead of inline onclick in HTML
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });
});


// ============================================================
//  KRONA MODE TOGGLE (reads / rpkm)
// ============================================================

/**
 * Wire the Read Counts / RPKM radio buttons.
 *
 * BEFORE: this forEach was inline in index.html, setting the
 * loose global `kronaMode` and calling window._kronaData = null
 * directly before reloading.
 *
 * AFTER: we update state.kronaMode, clear state.kronaData so
 * dataLoader fetches the right file next time, then rebuild.
 */
function _initKronaToggle() {
    document.querySelectorAll('input[name="kronaMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.kronaMode  = e.target.value;
            state.kronaData  = null;   // force reload of the correct file

            // Show/hide the "Sync to Violin" button (only relevant in rpkm mode)
            document.getElementById('btn-sync-violin').style.display =
                state.kronaMode === 'rpkm' ? 'inline-block' : 'none';

            rebuildKrona();
        });
    });
}