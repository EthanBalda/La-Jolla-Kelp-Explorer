# La-Jolla-Kelp-Explorer

Local previews (serve this directory on port 5500):

- Full explorer: http://localhost:5500/index.html
- Ocean embed: http://localhost:5500/ocean-embed.html
- Relationships embed: http://localhost:5500/relationships-embed.html
- Full-width and 320px iframe checks: http://localhost:5500/tests/embed-preview.html

The embed pages reuse `src/main.js` and `src/styles.css` and load the three real project CSVs independently. Each iframe has its own selected quarter and playback
state. The preview check page automatically exercises controls and reports
horizontal overflow. It is a local QA page, not an embed target.

For Google Sites, host the project files at a public HTTPS URL, then embed the
individual page URL. Localhost URLs are for local review only. Set the Google
Sites embed height to fit the content; a short iframe will scroll vertically.


Chart conventions and data quality:

- Displayed canopy areas divide the source square metres by 1,000,000. Up to six
  decimal places in km2 retain the precision of the original whole-square-metre observations.
- The heatmap uses finer positive bands near zero (0.002, 0.012, 0.05, 0.13,
  and 0.4 km2), rounded near observed positive-data percentiles. Reported zero
  and missing observations have separate swatches. The grid scrolls within its
  own panel at narrow widths.
- Scatterplots retain the existing same-season anomaly calculations in source
  units. Display conversion never changes Pearson r. Axes use the full record
  for each comparison and remain fixed across the three lag settings.
- 1995 Q4 has no usable kelp observation and remains missing. 1996 Q1 is still
  included analytically as a reported zero, despite its source flag saying blank
  and some cloud-free cells being recorded. A team decision is needed before
  changing that treatment; the interface does not call it a confirmed absence.

Run `node tests/scene.test.cjs` for real-CSV regression checks. Open the iframe
check page for browser control, conversion, missing/zero, all six comparison/lag,
keyboard selection, playback, and horizontal-overflow checks.


Seasonal temperature comparisons:

- `relationships-embed.html#seasonalPlots` adds same-quarter temperature/kelp
  anomaly plots, with common axes and ticks. Statistics reuse `scatterPairs`,
  `anomalies`, and `pairStatistics`; source canopy remains in m2 for calculations.
- The fall overlay joins `data/oni_ond_v6.csv` by calendar year. The NOAA CPC v6
  OND source, retrieval date, units, and interpretation are documented in
  `data/oni_ond_v6.README.md`. It is an optional local dependency; a missing ONI
  value or failed ONI load never removes a paired fall from its plot or overall fit.
- The inclusive cutoff is OND ONI >= +0.5 C, named El Nino-like falls. The below-
  cutoff subgroup includes neutral and La Nina-like conditions. Neither subgroup
  includes unknown ONI. This grouping is distinct from official episode labels.
- The 1996 Q1 analytical treatment remains unchanged; 1995 Q4 still has missing kelp.
- Runtime checks in `tests/scene.test.cjs` cover seasonal/subgroup correlations,
  threshold equality, missing ONI, retained points/fits, details, and selection.
- Browser checks add common-axis, responsive-grid, toggle, hover/focus/tap, and
  subgroup checks to the existing desktop/320px iframe suite. For visual review:
  `http://localhost:5500/tests/embed-preview.html?seasonal=1` and
  `http://localhost:5500/tests/embed-preview.html?seasonal=1&narrow=1&fall=1&highlight=1`.
