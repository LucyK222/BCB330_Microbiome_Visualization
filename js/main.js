// ============================================================
//  main.js — Entry point: tab switching + chart initialization
// ============================================================

import { state }             from '/js/state.js';
import {compInitSliders, initSliders} from '/js/sliders.js';
import { drawViolin }        from '/js/charts/violin.js';
import { initKrona,
    rebuildKrona,
    getSelectedKronaNodes,
    collectDescendantNames,
    clearKronaSelection } from '/js/charts/krona.js';
import { initComposition,
    drawComposition }   from '/js/charts/composition.js';
import { drawHeatmap,
    drawHeatmapFiltered } from '/js/charts/heatmap.js';
import { syncViolinToKrona } from '/js/sync.js';
import { initDescription, drawDescription } from '/js/charts/description.js';


// ── Tab switching ─────────────────────────────────────────────
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchToTab(tabName) {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`panel-${tabName}`).classList.add('active');
}

// Draw description on first visit
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        switchToTab(btn.dataset.tab);
        if (btn.dataset.tab === 'description' && !state.loaded.description) {
            state.loaded.description = true;
            drawDescription();
        }
    });
});

// sync.js dispatches this to switch tabs without a circular import
document.addEventListener('switchTab', e => switchToTab(e.detail));


// ── Krona mode toggle ─────────────────────────────────────────
// When mode changes: clear the cached kronaData so rebuildKrona()
// fetches the correct file (reads vs rpkm). dataLoader.js caches
// each file independently so re-switching is still cheap.
document.querySelectorAll('input[name="kronaMode"]').forEach(radio => {
    radio.addEventListener('change', e => {
        state.kronaMode = e.target.value;
        state.kronaData = null;   // force reload from correct file

        // Show "Sync to Violin" only in RPKM mode
        const syncViolinBtn = document.getElementById('btn-sync-violin');
        syncViolinBtn.style.display = e.target.value === 'rpkm' ? 'inline-flex' : 'none';

        rebuildKrona();
    });
});

document.querySelectorAll('input[name="compositionMode"]').forEach(radio => {
    radio.addEventListener('change', e => {
        state.compositionMode = e.target.value;
        drawComposition();
    });
});


// ── Sync: Krona → Violin ──────────────────────────────────────
document.getElementById('btn-sync-violin').addEventListener('click', () => {
    syncViolinToKrona();
});


// ── Sync: Krona → Heatmap ─────────────────────────────────────
document.getElementById('btn-sync-heatmap').addEventListener('click', async () => {
    const selectedMap = getSelectedKronaNodes();
    if (selectedMap.size === 0) return;

    const allTaxonNames = new Set();
    for (const [, node] of selectedMap) {
        collectDescendantNames(node).forEach(n => allTaxonNames.add(n));
    }

    switchToTab('heatmap');
    await drawHeatmapFiltered(allTaxonNames);
});


// ── Clear selection ───────────────────────────────────────────
document.getElementById('btn-clear-selection').addEventListener('click', () => {
    clearKronaSelection();
    rebuildKrona();
});

// Mirror heatmap-button visibility onto the clear button
const _heatmapBtn = document.getElementById('btn-sync-heatmap');
const _clearBtn   = document.getElementById('btn-clear-selection');
new MutationObserver(() => {
    _clearBtn.style.display = _heatmapBtn.style.display === 'none' ? 'none' : 'inline-flex';
}).observe(_heatmapBtn, { attributes: true, attributeFilter: ['style'] });


// ── Init ──────────────────────────────────────────────────────
initSliders();
initKrona();
initComposition();
compInitSliders()

drawViolin();
rebuildKrona();
drawComposition();
drawHeatmap();
initDescription();