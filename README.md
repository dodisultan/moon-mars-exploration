# Space Analog Explorer — GitHub-ready starter

## What is ready
- A working static map website (`index.html`) for GitHub Pages.
- Eight geographic **candidate points**, not scientifically validated analogs (`candidate_sites.csv`, `sites.json`). Coordinates are approximate reference points, not precise field survey locations.
- Published planetary reference figures (`planetary_facts.csv`). These are **global** facts, not site-specific terrain measurements.
- Source inventory (`data_sources.csv`).
- A runnable NASA POWER daily data downloader (`download_real_climate.py`) for 2023–2024, producing actual values only if the API succeeds.
- A methods and limitations document (`PROJECT_GUIDE.docx`).

## How to deploy
1. Extract this ZIP. Upload **the files and folders inside** to the root of a public GitHub repository.
2. Repository Settings → Pages → Deploy from branch → main / root.
3. Open the published Pages URL. Map and candidate cards work immediately.
4. On a computer or Google Colab, run `python download_real_climate.py` in the extracted folder (Colab: `%cd /content/Space_Analog_Complete_Starter` first). Upload the resulting `data/` folder to the same repository.
5. Reload GitHub Pages. Climate cards appear when `data/climate_summary.json` exists.

## Scientific caution
- There are NO invented site-specific temperatures, slopes, elevations, geological scores, or matching percentages.
- The 2023–24 rainfall sum is over the full two-year period, **not** annual rainfall.
- NASA POWER is a gridded modeled/reanalysis-derived data service; not a local station reading.
- Moon/Mars global properties are not sufficient to infer a terrestrial analog score. For real rankings, derive comparable slope, relief, roughness, lithology and target-specific metrics from LOLA/MOLA/SRTM/Copernicus DEM and geology datasets; normalize and document uncertainty.
- Moon vacuum, gravity, radiation and Mars atmospheric pressure cannot be reproduced by an outdoor Earth location.

## Sources
Official challenge: https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/
NASA POWER API: https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/
LOLA: https://pds-geosciences.wustl.edu/missions/lro/lola.htm
MOLA: https://pds-geosciences.wustl.edu/missions/mgs/mola.html
USGS: https://astrogeology.usgs.gov/
