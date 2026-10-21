// JS_SDK 2.0 — the loading screen's progress (GM Loader v1), for the top of your entry module.
//
// **Counts COMPLETED FILES, not bytes.** Bytes are not measurable through a hundred small awaits;
// completions are. The bar therefore moves in steps of a whole file, which is why the fill is
// tweened in CSS — without that it reads as stuttering rather than as loading.
//
// `SHEETS_SHARE` is how much of the bar the heavy assets get. Here the art is twelve megabytes
// against four hundred kilobytes of everything else, so it takes 85% and the tail is short on
// purpose. Re-measure it for a new game rather than copying the number.
//
// Call `showLoading(fraction)` as each asset lands, and `hideLoading()` once the first frame is
// ready to draw. The three states follow the template's gmSetProgress: spinner until the first
// count, then the % bar (.gmIsLoading), then "Almost there..." from 99% (.gmAlmost).

const loadingEl = document.getElementById('gmLoader');
const loadFill = document.getElementById('gmLoaderFill');
const loadText = document.getElementById('load-text');
const loadVersion = document.getElementById('load-version');

const SHEETS_SHARE = 0.85;

/**
 * The template's wording, and it is **English and hard-coded** — which here is forced rather
 * than chosen. This line is on screen before the localisation sheets have been fetched, so
 * there is nothing to translate it with.
 */
function loadingLabel(percent) {
  return percent >= 99 ? 'Almost there...' : `${percent}%`;
}

export function showLoading(fraction) {
  const progress = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
  if (!loadingEl || progress <= 0) return; // nothing counted yet: keep the spinner
  loadingEl.classList.add('gmIsLoading');
  if (loadFill) loadFill.style.width = `${progress}%`;
  if (!loadText) return;
  if (progress >= 99) {
    loadingEl.classList.add('gmAlmost');
    loadText.textContent = loadingLabel(progress);
    return;
  }
  loadText.innerHTML = `<b>${loadingLabel(progress)}</b>`;
}

/** Hidden outright rather than emptied: it has children, and two of them are the key art. */
export function hideLoading() {
  if (loadingEl) loadingEl.hidden = true;
}

// The build stamps the version into `GM_GAME` for the analytics backend; the corner reads the same
// field rather than being stamped a second time, so the number on screen and the number in the
// dashboard cannot disagree about which build this is.
if (loadVersion) {
  loadVersion.textContent = globalThis.GM_GAME?.version ?? '';
}
