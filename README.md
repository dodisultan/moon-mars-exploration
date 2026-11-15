# Space Analog Explorer

A static, GitHub Pages-compatible research MVP for exploring a supplied list of Earth candidate environments alongside global Moon and Mars reference facts. It is an evidence index, **not** a site-selection recommendation.

Challenge: [Permanent Moon Base Locations and Mars](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/).

## What is included

- Responsive interactive 3D planet illustration (drag, rotate, zoom, reset), candidate map and cards, search and role filters, source-gated pairwise comparison tables, and JSON / CSV / print-to-PDF report controls. The globe is illustrative, not satellite imagery or a terrain model.
- Eight approximate candidate points from `sites.json` and `candidate_sites.csv`. All remain `candidate_not_scored`; the included UI does not call them validated analogs or discoveries.
- Global planetary reference facts in `planetary_facts.csv`, a source inventory in `data_sources.csv`, and data-processing limitations in [METHODS.md](METHODS.md).
- `download_real_climate.py`, which requests real daily NASA POWER values for listed Earth points for 2023–2024. The script validates response fields, preserves unavailable values as empty CSV cells / JSON `null`, and writes per-site failures and source/unit metadata under `data/earth/`.
- `process_site_terrain_geology.py`, which retrieves 3×3 elevation samples from USGS 3DEP for listed U.S. points and the Copernicus DEM GLO-90 service elsewhere, derives terrain measurements without filling missing samples, and retrieves cited point-intersected geology from Macrostrat. Its output preserves the approximate input point, returned sample values and resolution metadata, source citations, processing method, and per-location gaps.

The repository includes a NASA POWER daily climate snapshot for all eight approximate Earth coordinates (2023–2024), processed terrain samples, and geologic map-unit intersections. Climate deltas require the same NASA POWER source, units, period, and full valid-day coverage; terrain deltas require complete windows in the same source/resolution/vertical-reference group. USGS 3DEP points are isolated because the point service omits vertical datum. Geology attributes are juxtaposed only within shared cited map sources and scale classes; tiny-scale global geology is excluded. No composite similarity score or ranking is calculated. No Moon or Mars target coordinates are supplied, so planetary site measurements remain unavailable. External Three.js, Leaflet, Chart.js, OpenStreetMap tiles, and fonts are progressive enhancements; candidate and evidence information remains available if a CDN or data file is unavailable.

## Run locally

Serve this directory over HTTP (the page uses `fetch`, so opening `index.html` directly as a `file://` URL is not sufficient). For example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. To request NASA POWER data, use Python 3:

```sh
python download_real_climate.py
```

The downloader writes actual returned values to `data/earth/nasa_power_daily_2023_2024.csv`, aggregate values and variable-specific coverage to `data/earth/climate_summary.csv` and `data/earth/climate_summary.json`, source/units/location metadata to `data/earth/climate_metadata.json`, and request or validation failures to `data/earth/download_errors.json`. API requests require network access. A partial failure exits nonzero while preserving successful sites and documenting failures. Inspect coverage before interpreting aggregates. The precipitation sum is the observed total over the full 2023–2024 period, not an annual total. `days_downloaded` counts dates returned by the service; per-variable valid-day fields indicate measurement coverage.

To refresh terrain and mapped geology measurements, run `python process_site_terrain_geology.py`. It validates `sites.json` against `candidate_sites.csv`, then writes source samples, derived values, citations, and explicit errors to `data/processed/site_terrain_geology.json`. Network access is required. The script exits nonzero when a source fails and preserves unavailable values instead of imputing them.

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` publishes the repository root on pushes to `main` and on manual dispatch. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source. No package install or build step is required.

## Validate changes

```sh
python -m unittest discover -s tests -v
python -m py_compile download_real_climate.py
node --check app.js
```

See [METHODS.md](METHODS.md) for sources, comparison eligibility rules, processing, and known limitations.
