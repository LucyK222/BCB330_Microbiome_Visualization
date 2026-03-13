// ============================================================
//  sliders.js — Slider UI: reading values + wiring events
//
//  BEFORE: getTopN() and slider event listeners were in a
//  <script> block in index.html, hardcoding calls to
//  rebuildKrona() and drawComposition() directly.
//
//  AFTER: sliders own their own logic. Charts register a
//  callback via onSliderChange() and get notified on update.
//  The slider code no longer needs to know which charts exist.
// ============================================================

// ── Internal list of registered callbacks ───────────────────
// Each chart that cares about slider changes calls
// onSliderChange(fn) to register itself.

// TODO: [user friendly] sliding sliders will make the krona chart jump to the original state.

// TODO: [user friendly] change the max and min of slide bar
const _listeners = [];

/**
 * Register a function to be called whenever any slider changes.
 * Charts call this during their own setup, e.g.:
 *   onSliderChange(() => rebuildKrona());
 *
 * BEFORE: slider wiring block hardcoded:
 *   if (window._kronaData)    rebuildKrona();
 *   if (window._rpkmTreeData) drawComposition();
 *
 * AFTER: charts register themselves — sliders don't need to
 * know anything about what charts exist.
 */
export function onSliderChange(fn) {
    _listeners.push(fn);
}

/**
 * Read the current value of all six taxonomy sliders.
 * Returns a plain object used by filterTree() in krona.js
 * and drawComposition() in composition.js.
 *
 * BEFORE (inline in index.html):
 *   function getTopN() {
 *     return {
 *       phylum: +document.getElementById('slider-phylum').value,
 *       ...
 *     };
 *   }
 */
export function getTopN() {
    return {
        phylum:  +document.getElementById('slider-phylum').value,
        class:   +document.getElementById('slider-class').value,
        order:   +document.getElementById('slider-order').value,
        family:  +document.getElementById('slider-family').value,
        genus:   +document.getElementById('slider-genus').value,
        species: +document.getElementById('slider-species').value,
    };
}

/**
 * Wire up all six sliders: update the displayed number label
 * and notify all registered listeners on every change.
 *
 * Call this once at app startup from main.js.
 *
 * BEFORE: this forEach loop was inline in index.html,
 * and directly called rebuildKrona() / drawComposition().
 */
export function initSliders() {
    ['phylum', 'class', 'order', 'family', 'genus', 'species'].forEach(level => {
        const slider = document.getElementById('slider-' + level);
        const label  = document.getElementById('val-' + level);

        slider.addEventListener('input', () => {
            // Update the visible number next to the slider
            label.textContent = slider.value;

            // Notify every registered chart
            _listeners.forEach(fn => fn());
        });
    });
}