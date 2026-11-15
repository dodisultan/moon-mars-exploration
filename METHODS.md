# Methods, sources, and limitations

## What this explorer does

The app loads the repository's existing candidate list, planetary facts, and source inventory. On Earth, a candidate can be searched, filtered, mapped, and selected for a side-by-side evidence view. If downloaded NASA POWER data is present, summary values and an available daily temperature series are displayed with their period and units. The JSON snapshot includes provenance and data coverage; the CSV export includes the candidate fields, any present climate summary, selection state, and explicit similarity outcome.

The application does not implement a similarity formula. With the supplied files, the scientifically honest outcome is **Insufficient verified data**: there are no validated candidate site measurements for comparable terrain or geology. The output is not a site recommendation, discovery, or validated analog.

The rotatable Three.js globes are conceptual illustrations using uniform materials and a coordinate grid. They are not rendered from satellite images, elevation products, or planetary surface maps, and they contain no clickable planetary reference sites. If the Three.js CDN or browser WebGL is unavailable, the page retains its labeled CSS illustration.

## Existing data and scope

- `sites.json` and `candidate_sites.csv` contain eight **approximate, unvalidated candidate coordinates**: three rows labeled `known_reference` and five labeled `exploratory_candidate`. These role labels are retained as supplied. They do not establish that a site is a verified analog. The app searches only this list; it does not claim global discovery.
- `planetary_facts.csv` contains published global planetary-reference values for gravity and selected Mars atmosphere properties. These are **global or mean-radius reference values**, not local observations. They are explicitly not compared with candidate site climate or terrain.
- `data_sources.csv` is an inventory of possible sources and processing needs. It is not evidence that a regional product has been downloaded or analyzed.
- `PROJECT_GUIDE.docx` describes the same candidate set and planetary facts and notes that climate and DEM products are acquired separately; it is project context, not a source of additional measurements in this app.

## NASA POWER climate data

`download_real_climate.py` requests the daily parameters `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`, and `PS` for each supplied Earth coordinate from 2023-01-01 through 2024-12-31. NASA POWER is a gridded, modeled/reanalysis-derived data service, not a local weather-station record. Coordinates are approximate, and point API output should not be mistaken for field measurement. Each raw CSV row carries its site, date, approximate latitude/longitude, source URL, and an explicit unit column for every variable; `data/earth/climate_metadata.json` records the dataset scope, parameter units, requested period, and missing-value policy. Summaries retain site coordinates, units, source URL, and period alongside their values.

The raw CSV retains available numerical values and leaves unavailable/sentinel observations blank. Aggregates use only valid values, never replace missing readings with zero, and record parameter-specific valid-day counts. `days_downloaded` counts daily date keys returned within the requested period; it is not a count of valid observations for every parameter. The precipitation aggregate is a cumulative total across the full two-year requested period, calculated only over returned valid precipitation values. It is not an annualized or complete-period estimate if data are missing. Failures are written to `data/earth/download_errors.json`; partial downloads are retained and reported with a nonzero process exit.

## Terrain, geology, and matching

The repository lists NASA SRTM and USGS 3DEP for Earth elevation, LOLA for lunar elevation, and MOLA for Mars elevation, alongside geological map sources. No site-level elevation, slope, relief, roughness, or mapped geological unit has been processed into the current dataset. Coverage labels are therefore missing / not processed rather than zero.

No candidate-level uncertainty estimates or confidence intervals are supplied by the existing files or calculated by this MVP. Coverage and uncertainty are distinct: a returned NASA POWER value does not imply a site-specific uncertainty estimate.

Earth and planetary environments cannot be equated using a few global facts. The Moon's near-vacuum and lower gravity and Mars's thin CO₂-rich atmosphere and low pressure are not reproduced by an outdoor Earth location. A future defensible comparison would require regionally extracted, harmonized measurements; explicit spatial resolution and temporal coverage; a justified feature set and normalization; missing-data handling; validation against references; and uncertainty reporting. Until then, a numerical match or ranked candidate would be unsupported.

## Running and viewing

Run a local HTTP server from the repository root (for example `python -m http.server 8000`) and open `http://localhost:8000`. Static `fetch` calls may not work from a `file://` URL. Three.js, Leaflet, OpenStreetMap tiles, Chart.js, and fonts are external enhancements. If unavailable, the page presents an unavailable notice and keeps the text evidence usable. Map tiles require network access.

Run `python download_real_climate.py` to request real NASA POWER data; do not treat absent files as measured zeroes. Test downloader validation with `python -m unittest discover -s tests -v`.

## Sources

- NASA POWER API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA SRTM: https://www.earthdata.nasa.gov/data/instruments/srtm
- USGS 3DEP: https://www.usgs.gov/3d-elevation-program
- USGS National Geologic Map Database: https://ngmdb.usgs.gov/
- LOLA: https://imbrium.mit.edu/
- MOLA / MEGDR: https://pds-geosciences.wustl.edu/missions/mgs/megdr.html
- USGS Astrogeology: https://astrogeology.usgs.gov/
- NASA Mars fact sheet: https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
