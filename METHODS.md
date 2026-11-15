# Methods, sources, and limitations

## What this explorer does

The app loads the repository's existing candidate list, planetary facts, and source inventory. On Earth, a candidate can be searched, filtered, mapped, and selected for a side-by-side evidence view. If downloaded NASA POWER data is present, summary values and an available daily temperature series are displayed with their period and units. The JSON snapshot includes provenance and data coverage; the CSV export includes the candidate fields, any present climate summary, selection state, and explicit similarity outcome.

The application does not implement a similarity formula. Earth terrain measurements and geologic map intersections are now shown for the supplied approximate candidate points. Geologic map scales vary, planetary site coordinates are absent, and no global similarity score or ranking is supported. The output is not a site recommendation, discovery, or validated analog.

The rotatable Three.js globes are conceptual illustrations using uniform materials and a coordinate grid. They are not rendered from satellite images, elevation products, or planetary surface maps, and they contain no clickable planetary reference sites. If the Three.js CDN or browser WebGL is unavailable, the page retains its labeled CSS illustration.

## Existing data and scope

- `sites.json` and `candidate_sites.csv` contain eight **approximate, unvalidated candidate coordinates**: three rows labeled `known_reference` and five labeled `exploratory_candidate`. These role labels are retained as supplied. They do not establish that a site is a verified analog. The app searches only this list; it does not claim global discovery.
- `planetary_facts.csv` contains published global planetary-reference values for gravity and selected Mars atmosphere properties. These are **global or mean-radius reference values**, not local observations. They are explicitly not compared with candidate site climate or terrain.
- `data_sources.csv` is an inventory of possible sources and processing needs. It is not evidence that a regional product has been downloaded or analyzed.
- `PROJECT_GUIDE.docx` describes the same candidate set and planetary facts and notes that climate and DEM products are acquired separately; it is project context, not a source of additional measurements in this app.

## NASA POWER climate data

`download_real_climate.py` requests the daily parameters `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`, and `PS` for each supplied Earth coordinate from 2023-01-01 through 2024-12-31. NASA POWER is a gridded, modeled/reanalysis-derived data service, not a local weather-station record. Coordinates are approximate, and point API output should not be mistaken for field measurement. Each raw CSV row carries its site, date, approximate latitude/longitude, source URL, and an explicit unit column for every variable; `data/earth/climate_metadata.json` records the dataset scope, parameter units, requested period, and missing-value policy. Summaries retain site coordinates, units, source URL, and period alongside their values.

The raw CSV retains available numerical values and leaves unavailable/sentinel observations blank. Aggregates use only valid values, never replace missing readings with zero, and record parameter-specific valid-day counts. `days_downloaded` counts daily date keys returned within the requested period; it is not a count of valid observations for every parameter. The precipitation aggregate is a cumulative total across the full two-year requested period, calculated only over returned valid precipitation values. It is not an annualized or complete-period estimate if data are missing. Failures are written to `data/earth/download_errors.json`; partial downloads are retained and reported with a nonzero process exit.

## Terrain, geology, and comparison

`process_site_terrain_geology.py` validates that `sites.json` and `candidate_sites.csv` contain the same approximate coordinates before requesting any measurements. It preserves those point coordinates without relocation, records every 3×3 sample coordinate, and never turns a missing response into a numeric value. Rerunning the script updates `data/processed/site_terrain_geology.json` with the returned samples, source metadata, map units, references, query URLs, and per-source errors. These API snapshots are retrieval-time evidence, not static guarantees of future service availability.

For the two supplied USA points, elevation is queried from the USGS National Map Elevation Point Query Service (EPQS) using USGS 3DEP. The EPQS response reports elevation in meters, a raster ID, and a resolution code; the response does **not** identify the vertical datum, so no datum is assumed or converted. The raster ID and resolution code are preserved for each sample. Other Earth points use the Copernicus DEM 2021 release GLO-90 through the Open-Meteo elevation API, documented at 90 m resolution. Copernicus values are returned in meters as EGM2008 orthometric heights; no conversion is applied. Source, API version/release, horizontal CRS, vertical units/datum status, and URL are attached to each site record.

For every Earth point, the script requests nine elevations centered on the unmodified approximate candidate coordinate, at 90 m horizontal spacing (a 180 m × 180 m sample footprint). Latitude and longitude offsets are calculated from physical spacing; exact 8-decimal query coordinates are stored per sample. Elevation is the center sample. Slope is the Horn 3×3 finite-difference derivative at the center, reported in degrees. Relief is maximum minus minimum across the nine samples, in meters. Roughness is the population standard deviation of those nine elevations, in meters. All four metrics require all nine valid samples; partial windows display their valid count and leave derived measures unavailable. This sparse point-window calculation is not a substitute for a full-resolution raster derivative.

The application groups terrain by source, resolution, and vertical-reference metadata. It shows values side by side, but only treats measurements as comparable when every selected site has a complete window and the same comparison group. The two products have distinct vertical references and effective source resolution; cross-source terrain values are not compared. No reprojected raster or cross-source harmonization is claimed.

The USGS EPQS response omits a vertical datum and returns different raster IDs for the two U.S. locations. For that reason, each 3DEP site's terrain values are isolated in their own comparison group; equal service resolution codes alone are not treated as proof of compatible vertical references.

For Earth geology, Macrostrat's `geologic_units/map` API returns map units whose mapped footprints intersect each supplied approximate coordinate. For every returned unit, the snapshot preserves the map ID, original source ID and citation, map-scale class, lithology/description when supplied, and age fields when supplied. Macrostrat marks this API `CC-BY 4.0`. Original USGS map citations are retained where returned (including the Death Valley and Hawaiʻi products); elsewhere, mapped regional sources are identified by their actual citation. Map-scale class is not converted into a resolution or survey certainty. A point intersection at these approximate coordinates is mapped regional evidence, not field-verified lithology; missing attributes remain missing. The detailed/resolution and regional-only labels are descriptive coverage levels, not validation of the candidate point.

No lunar or Mars site coordinates appear in the existing project data. Consequently the repository does not claim a site-level LOLA or MOLA elevation or a point-intersected lunar/Martian geological unit. The source inventory links the NASA LOLA archive, MOLA MEGDR, and USGS lunar and Mars geology map products only as future reference sources; no version, raster resolution, or regional map scale is claimed as processed. The illustrative globes remain non-scientific.

NASA POWER climate summaries and charts are unchanged. Existing site climate files contain 731 of 731 requested days for all eight sites, with 731 valid T2M and precipitation days per site, for 2023-01-01 through 2024-12-31. These are gridded modeled/reanalysis-derived estimates, not in-situ observations.

### Current per-location coverage

The coordinate pairs below are the approximate input points as provided by the project. Terrain values are **elevation (m), slope (degrees), relief (m), roughness standard deviation (m)**, all derived from nine samples at 90 m spacing. For 3DEP, “code 1” is the EPQS response value; its unit is not supplied by that response. Climate is NASA POWER daily coverage for 2023–2024. The geologic entry is the highest-scale returned map intersection; all returned layers and citations remain in the JSON snapshot.

| Candidate point (latitude, longitude) | Terrain (elevation / slope / relief / roughness) | Geology (map scale, mapped unit, age) | Climate |
|---|---|---|---|
| Atacama, Chile (-23.5, -69.3) | Complete 9/9; Copernicus GLO-90; 2112.00 / 4.69 / 17.00 / 6.20 | Regional / small; Paleogene Rhyolitic, rhyolite, 23.04–66 Ma; South America map 1:5,000,000 | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Death Valley, USA (36.46, -116.87) | Complete 9/9; USGS 3DEP, EPQS resolution code 1; -58.72 / 0.84 / 3.70 / 1.09 | Large; Alluvial deposits in recently active channels, 0–0.0117 Ma; USGS SIM 3151 | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Haughton, Canada (75.38, -89.67) | Complete 9/9; Copernicus GLO-90; 132.00 / 2.11 / 10.00 / 3.11 | Regional / small; Neogene sedimentary, 2.588–23.03 Ma. A separate returned layer labels an impact structure; source scales are regional | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Wadi Rum, Jordan (29.58, 35.42) | Complete 9/9; Copernicus GLO-90; 982.00 / 15.57 / 52.00 / 21.07 | Regional / small; Jordan, sandstone, 443.8–541 Ma; International Geological Map of Europe and Adjacent Areas 1:5,000,000 | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Iceland Highlands (64.5, -18.5) | Complete 9/9; Copernicus GLO-90; 660.00 / 3.22 / 14.00 / 4.92 | Regional / medium; tuff-breccia / pyroclastic breccia, 0.0117–2.58 Ma; EGDI pan-European surface geology | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Dallol, Ethiopia (14.24, 40.3) | Complete 9/9; Copernicus GLO-90; -93.00 / 0.72 / 3.00 / 0.99 | Regional / small; unit name not reported, volcanic, 0–2.588 Ma; Africa map 1:10,000,000 | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Tabuk, Saudi Arabia (28.38, 36.58) | Complete 9/9; Copernicus GLO-90; 772.00 / 1.06 / 4.00 / 1.42 | Regional / small; unit name not reported, sedimentary, 358.9–443.8 Ma; Africa map 1:10,000,000 | Complete 731/731 dates; 731 valid T2M and precipitation days |
| Mauna Loa, Hawaiʻi, USA (19.48, -155.6) | Complete 9/9; USGS 3DEP, EPQS resolution code 1; 4016.71 / 38.29 / 165.34 / 60.04 | Large; steep walls of calderas and pit craters, basalt, 0–0.0117 Ma; USGS SIM 3143 | Complete 731/731 dates; 731 valid T2M and precipitation days |

Thus, **no candidate has complete scientific coverage for the requested Earth-to-planet comparison**: the eight Earth points have complete current terrain windows and NASA POWER daily climate summaries, but only Death Valley and Mauna Loa have a large-scale mapped unit; the other six have medium- or small-scale regional context. No site has field validation or supplied per-site measurement uncertainty. The Moon and Mars have no target coordinates in project data, so their site-level terrain and geology coverage is unavailable for every candidate comparison.

No candidate-level uncertainty estimates or confidence intervals are supplied by the existing files or calculated by this MVP. Coverage and uncertainty are distinct: a returned value does not imply a site-specific uncertainty estimate.

No candidate-level uncertainty estimates or confidence intervals are supplied by the existing files or calculated by this MVP. Coverage and uncertainty are distinct: a returned NASA POWER value does not imply a site-specific uncertainty estimate.

Earth and planetary environments cannot be equated using a few global facts. The Moon's near-vacuum and lower gravity and Mars's thin CO₂-rich atmosphere and low pressure are not reproduced by an outdoor Earth location. The current comparison is descriptive only: climate values share one product and period, terrain metrics are grouped by source/resolution, and geologic units are kept separate with their map scales. No arbitrary weighted score, numerical cross-world match, or candidate ranking is computed.

## Running and viewing

Run a local HTTP server from the repository root (for example `python -m http.server 8000`) and open `http://localhost:8000`. Static `fetch` calls may not work from a `file://` URL. Three.js, Leaflet, OpenStreetMap tiles, Chart.js, and fonts are external enhancements. If unavailable, the page presents an unavailable notice and keeps the text evidence usable. Map tiles require network access.

Run `python download_real_climate.py` to request real NASA POWER data; do not treat absent files as measured zeroes. Test downloader validation with `python -m unittest discover -s tests -v`.

Run `python process_site_terrain_geology.py` to refresh Earth terrain and mapped-unit data. Network/source failures are recorded in the output and make the script exit nonzero. The static GitHub Pages workflow packages the complete `data/` directory, so the page reads the checked-in JSON snapshot with relative URLs and needs no API credentials.

## Sources

- NASA POWER API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA SRTM: https://www.earthdata.nasa.gov/data/instruments/srtm
- USGS 3DEP: https://www.usgs.gov/3d-elevation-program
- USGS Elevation Point Query Service documentation: https://epqs.nationalmap.gov/v1/docs
- Copernicus DEM GLO-90 source and collection: https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model
- Open-Meteo Elevation API (GLO-90 provider documentation): https://open-meteo.com/en/docs/elevation-api
- USGS National Geologic Map Database: https://ngmdb.usgs.gov/
- Macrostrat geologic map point API: https://macrostrat.org/api/geologic_units/map
- LOLA: https://imbrium.mit.edu/
- MOLA / MEGDR: https://pds-geosciences.wustl.edu/missions/mgs/megdr.html
- USGS Unified Geologic Map of the Moon: https://pubs.usgs.gov/sim/3464/
- USGS Global Geologic Map of Mars: https://pubs.usgs.gov/sim/3292/
- NASA Mars fact sheet: https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
