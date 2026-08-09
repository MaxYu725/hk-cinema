import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 6M separates seat-map and official booking actions", async () => {
  const [index, compare, phase6m, broadwaySeats, mclSeats, emperorSeats] = await Promise.all([
    source("app/index.html"),
    source("app/provider-compare-v3.js"),
    source("app/provider-compare-phase6m.js"),
    source("app/seatmap.js"),
    source("app/mcl-seatmap.js"),
    source("app/emperor-seatmap.js")
  ]);

  assert.match(index, /provider-compare-v3\.js\?v=7a3/);
  assert.match(index, /provider-compare-phase6m\.js\?v=7a1/);
  assert.match(index, /provider-compare-seats\.js\?v=6o1/);
  assert.match(index, /emperor-seatmap\.js\?v=7b3/);
  assert.match(compare, /<article class="provider-compare-show phase6m-show-card phase6o-native-show"/);
  assert.match(compare, /data-booking-url=/);
  assert.match(compare, /provider-compare-booking/);
  assert.doesNotMatch(compare, /<a class="provider-compare-show"/);
  assert.doesNotMatch(phase6m, /convertLinkedCard|replaceWith\(replacement\)/);
  assert.match(broadwaySeats, /dataset\?\.bookingUrl \|\| card\?\.getAttribute\("href"\)/);
  assert.match(mclSeats, /dataset\?\.bookingUrl \|\| card\?\.getAttribute\("href"\)/);
  assert.match(broadwaySeats, /\.provider-compare-show \.provider-compare-seat/);
  assert.match(mclSeats, /\.mcl-showtime-card, \.provider-compare-show/);
  assert.match(emperorSeats, /\.provider-compare-show/);
});

test("Phase 6M keeps active filters visible and recoverable from zero results", async () => {
  const [phase6m, insights, preferences] = await Promise.all([
    source("app/provider-compare-phase6m.js"),
    source("app/provider-compare-insights-v3.js"),
    source("app/provider-compare-preferences.js")
  ]);

  assert.match(insights, /data-phase6m-active-filters/);
  assert.match(insights, /data-insight-clear-filter/);
  assert.match(phase6m, /data-phase6m-filter-shortcut/);
  assert.match(phase6m, /shortcut\.textContent !== label/);
  assert.match(phase6m, /沒有符合目前篩選的場次/);
  assert.match(phase6m, /data-provider-compare-reset/);
  assert.match(phase6m, /data-phase6m-no-dates/);
  assert.match(insights, /data-insight-provider/);
  assert.match(insights, /data-insight-region/);
  assert.match(insights, /data-insight-cinema/);
  assert.match(insights, /data-insight-period/);
  assert.match(insights, /data-insight-sort/);
  assert.match(insights, /records\.some\(mutationTouchesTimeline\)/);
  assert.match(preferences, /hkcinema:provider-compare-filters:v1/);
});

test("Phase 6M mobile layout handles long lists, long labels and three-provider Smart Picks", async () => {
  const [css, phase6m, compare, insights, recommendations] = await Promise.all([
    source("app/provider-compare-phase6m.css"),
    source("app/provider-compare-phase6m.js"),
    source("app/provider-compare-v3.js"),
    source("app/provider-compare-insights-v3.js"),
    source("app/provider-compare-recommendations-v3.js")
  ]);

  assert.match(css, /position: sticky/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(max-width: 330px\)/);
  assert.match(css, /-webkit-line-clamp: 2/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /provider-compare-seat\.seatmap-launch/);
  assert.match(phase6m, /poster\.decoding = "async"/);
  assert.match(phase6m, /poster\.setAttribute\("width", "120"\)/);
  assert.match(compare, /Promise\.allSettled/);

  for (const label of ["目前最低票價", "目前最早場次", "院線最低價差", "目前最多可用座位"]) {
    assert.match(insights, new RegExp(label));
  }

  for (const provider of ["broadway", "mcl", "emperor"]) {
    assert.match(recommendations, new RegExp(`key: "${provider}"`));
  }
  assert.match(recommendations, /provider-count-\$\{presentProviders\.size\}/);
  assert.match(recommendations, /presentProviders\.size > 1/);
});
