#!/usr/bin/env python3
"""Extract reproducible terrain samples and mapped geology for supplied Earth points."""
import csv
import json
import math
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data" / "processed" / "site_terrain_geology.json"
SAMPLE_SPACING_M = 90.0
USGS_EPQS_URL = "https://epqs.nationalmap.gov/v1/json"
COPERNICUS_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
MACROSTRAT_MAP_URL = "https://macrostrat.org/api/geologic_units/map"
MACROSTRAT_API_URL = "https://macrostrat.org/api"
COPERNICUS_VERSION = "Copernicus DEM 2021 release GLO-90"


def fetch_json(url, opener=urllib.request.urlopen):
    request = urllib.request.Request(
        url, headers={"User-Agent": "Space-Analog-Explorer/1.0 (scientific data provenance)"}
    )
    with opener(request, timeout=40) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError(f"{url} returned a non-object JSON response")
    return payload


def load_sites():
    sites = json.loads((ROOT / "sites.json").read_text(encoding="utf-8"))
    with (ROOT / "candidate_sites.csv").open(newline="", encoding="utf-8") as source:
        csv_sites = {row["site"]: row for row in csv.DictReader(source)}
    if not sites or len(sites) != len(csv_sites):
        raise ValueError("sites.json and candidate_sites.csv do not contain the same sites")
    for site in sites:
        row = csv_sites.get(site["site"])
        if row is None:
            raise ValueError(f"{site['site']} is missing from candidate_sites.csv")
        if (float(row["latitude"]) != float(site["latitude"])
                or float(row["longitude"]) != float(site["longitude"])):
            raise ValueError(f"Coordinate mismatch for {site['site']} between site files")
        latitude, longitude = float(site["latitude"]), float(site["longitude"])
        if not math.isfinite(latitude) or not -90 <= latitude <= 90:
            raise ValueError(f"Invalid latitude for {site['site']}")
        if not math.isfinite(longitude) or not -180 <= longitude <= 180:
            raise ValueError(f"Invalid longitude for {site['site']}")
    return sites


def sample_points(latitude, longitude, spacing_m=SAMPLE_SPACING_M):
    """Return a row-major 3x3 neighborhood centered on the unmodified site point."""
    latitude_step = spacing_m / 111_320.0
    longitude_scale = abs(math.cos(math.radians(latitude)))
    if longitude_scale < 1e-8:
        raise ValueError("Cannot create a longitude-spaced sample window at a geographic pole")
    longitude_step = latitude_step / longitude_scale
    return [
        {
            "row": row,
            "column": column,
            "latitude": round(latitude + (1 - row) * latitude_step, 8),
            "longitude": round(longitude + (column - 1) * longitude_step, 8),
        }
        for row in range(3)
        for column in range(3)
    ]


def derive_terrain_metrics(samples, spacing_m=SAMPLE_SPACING_M):
    """Calculate Horn slope, 3x3 relief, and population elevation standard deviation."""
    elevations = [sample.get("elevation_m") for sample in samples]
    valid = [value for value in elevations if value is not None]
    result = {
        "valid_samples": len(valid),
        "total_samples": len(samples),
        "elevation_m": elevations[4] if len(elevations) == 9 else None,
        "slope_degrees": None,
        "relief_m": None,
        "roughness_stddev_m": None,
    }
    if len(elevations) != 9 or len(valid) != 9:
        return result
    z1, z2, z3, z4, _, z6, z7, z8, z9 = elevations
    dz_dx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * spacing_m)
    dz_dy = ((z1 + 2 * z2 + z3) - (z7 + 2 * z8 + z9)) / (8 * spacing_m)
    mean = sum(valid) / len(valid)
    result.update({
        "slope_degrees": math.degrees(math.atan(math.hypot(dz_dx, dz_dy))),
        "relief_m": max(valid) - min(valid),
        "roughness_stddev_m": math.sqrt(sum((value - mean) ** 2 for value in valid) / len(valid)),
    })
    return result


def _number_or_none(value):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and abs(number) < 1_000_000 else None


def _fetch_copernicus_samples(sites, opener=urllib.request.urlopen):
    points_by_site = {
        site["site"]: sample_points(float(site["latitude"]), float(site["longitude"]))
        for site in sites
    }
    points = [point for site_points in points_by_site.values() for point in site_points]
    if len(points) > 100:
        raise ValueError("Open-Meteo elevation API accepts at most 100 points per request")
    query = urllib.parse.urlencode({
        "latitude": ",".join(f"{point['latitude']:.8f}" for point in points),
        "longitude": ",".join(f"{point['longitude']:.8f}" for point in points),
    })
    url = f"{COPERNICUS_ELEVATION_URL}?{query}"
    payload = fetch_json(url, opener)
    elevations = payload.get("elevation")
    if not isinstance(elevations, list) or len(elevations) != len(points):
        raise ValueError("Open-Meteo response did not contain one elevation per requested point")
    result = {}
    offset = 0
    for site in sites:
        samples = points_by_site[site["site"]]
        for point, elevation in zip(samples, elevations[offset:offset + 9]):
            point["elevation_m"] = _number_or_none(elevation)
            point["source_url"] = url
        result[site["site"]] = samples
        offset += 9
    return result, url


def _fetch_usgs_samples(sites, opener=urllib.request.urlopen):
    result = {}
    for site in sites:
        points = sample_points(float(site["latitude"]), float(site["longitude"]))
        for point in points:
            query = urllib.parse.urlencode({
                "x": f"{point['longitude']:.8f}",
                "y": f"{point['latitude']:.8f}",
                "units": "Meters",
                "output": "json",
            })
            url = f"{USGS_EPQS_URL}?{query}"
            try:
                payload = fetch_json(url, opener)
                point["elevation_m"] = _number_or_none(payload.get("value"))
                point["source_url"] = url
                point["raster_id"] = payload.get("rasterId")
                point["resolution_code"] = payload.get("resolution")
                if point["elevation_m"] is None:
                    point["error"] = "USGS EPQS returned no numeric elevation"
            except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
                point["elevation_m"] = None
                point["source_url"] = url
                point["error"] = str(exc)
        result[site["site"]] = points
    return result


def _reference_url(reference):
    if not reference:
        return None
    doi = re.search(r"\bdoi:\s*(10\.[0-9][^\s,;.]*)", reference, re.IGNORECASE)
    if doi:
        return f"https://doi.org/{doi.group(1).rstrip('.')}"
    url = re.search(r"https?://[^\s)]+", reference)
    return url.group(0).rstrip(".,") if url else None


def _fetch_geology(site, opener=urllib.request.urlopen):
    query = urllib.parse.urlencode({
        "lat": site["latitude"],
        "lng": site["longitude"],
    })
    url = f"{MACROSTRAT_MAP_URL}?{query}"
    payload = fetch_json(url, opener)
    response = payload.get("success")
    if not isinstance(response, dict):
        raise ValueError("Macrostrat map response has no success object")
    units = response.get("data", [])
    references = response.get("refs", {})
    if not isinstance(units, list) or not isinstance(references, dict):
        raise ValueError("Macrostrat map response has an unexpected schema")
    if any(not isinstance(unit, dict) for unit in units):
        raise ValueError("Macrostrat map response contains a non-object map unit")
    map_units = []
    for unit in units:
        source_id = unit.get("source_id")
        reference = references.get(str(source_id))
        map_units.append({
            "map_id": unit.get("map_id"),
            "source_id": source_id,
            "name": unit.get("name") or None,
            "stratigraphic_name": unit.get("strat_name") or None,
            "lithology": unit.get("lith") or None,
            "description": unit.get("descrip") or None,
            "geologic_age_name": unit.get("best_int_name"),
            "age_top_ma": _number_or_none(unit.get("t_age")),
            "age_bottom_ma": _number_or_none(unit.get("b_age")),
            "map_scale_class": unit.get("scale"),
            "source_reference": reference,
            "source_reference_url": _reference_url(reference),
        })
    scale_rank = {"large": 0, "medium": 1, "small": 2, "tiny": 3}
    map_units.sort(key=lambda unit: scale_rank.get(unit["map_scale_class"], 4))
    best_scale = map_units[0]["map_scale_class"] if map_units else None
    status = "detailed_map_unit_available" if best_scale == "large" else (
        "regional_map_unit_only" if map_units else "no_mapped_unit_returned"
    )
    return {
        "status": status,
        "dataset": "Macrostrat geologic_units/map point intersection",
        "api_version": response.get("v"),
        "license": response.get("license"),
        "query_url": url,
        "query_coordinates": {
            "latitude": float(site["latitude"]),
            "longitude": float(site["longitude"]),
            "coordinate_source": "sites.json; approximate candidate point",
        },
        "interpretation": (
            "Returned map units intersect the approximate candidate coordinate. Map scale "
            "varies by source; this is a regional map interpretation, not a field-verified "
            "site observation. Ages and lithologies are shown only when supplied by the source."
        ),
        "map_units": map_units,
    }


def _terrain_source(site, samples):
    if site["country"] == "USA":
        codes = sorted({str(sample.get("resolution_code")) for sample in samples})
        raster_ids = sorted({
            sample.get("raster_id") for sample in samples if sample.get("raster_id") is not None
        })
        code = ",".join(codes) if codes else "not-reported"
        return {
            "dataset": "USGS 3D Elevation Program (3DEP), Elevation Point Query Service",
            "dataset_version": "Live USGS service; point-query response supplies raster IDs and resolution codes, not a named release",
            "source_url": USGS_EPQS_URL,
            "product_page": "https://www.usgs.gov/3d-elevation-program",
            "horizontal_crs": "WGS 84 (EPSG:4326)",
            "vertical_unit": "m",
            "vertical_datum": "Not identified in the EPQS point response; no datum conversion applied",
            "resolution_codes": codes,
            "raster_ids": raster_ids,
            "native_resolution_note": "Service-reported resolution code is preserved per point; the API response does not identify its unit.",
            "comparison_group": f"usgs-3dep-resolution-{code}-datum-unreported:{site['site']}",
        }
    return {
        "dataset": COPERNICUS_VERSION,
        "dataset_version": "GLO-90, 2021 release",
        "source_url": COPERNICUS_ELEVATION_URL,
        "product_page": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
        "provider": "Open-Meteo Elevation API",
        "provider_url": "https://open-meteo.com/en/docs/elevation-api",
        "horizontal_crs": "WGS 84 (EPSG:4326)",
        "vertical_unit": "m",
        "vertical_datum": "EGM2008 orthometric heights per Copernicus DEM product; no conversion applied",
        "native_resolution_m": 90,
        "native_resolution_note": "Copernicus GLO-90; point values are returned by the Open-Meteo API",
        "comparison_group": "copernicus-dem-glo-90-2021",
    }


def build_dataset(sites, opener=urllib.request.urlopen):
    us_sites = [site for site in sites if site["country"] == "USA"]
    global_sites = [site for site in sites if site["country"] != "USA"]
    errors = []
    elevation_samples = {}
    try:
        global_samples, global_request_url = _fetch_copernicus_samples(global_sites, opener)
        elevation_samples.update(global_samples)
        for site in global_sites:
            if any(sample["elevation_m"] is None for sample in global_samples[site["site"]]):
                errors.append({
                    "site": site["site"],
                    "source": "Copernicus GLO-90 via Open-Meteo",
                    "error": "One or more requested samples had no numeric elevation",
                })
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
        global_request_url = None
        errors.append({"source": "Copernicus GLO-90 via Open-Meteo", "error": str(exc)})
        for site in global_sites:
            elevation_samples[site["site"]] = [
                {**point, "elevation_m": None, "error": str(exc)}
                for point in sample_points(float(site["latitude"]), float(site["longitude"]))
            ]
    for site in us_sites:
        try:
            samples = _fetch_usgs_samples([site], opener)[site["site"]]
            elevation_samples[site["site"]] = samples
            if any(sample["elevation_m"] is None for sample in samples):
                errors.append({
                    "site": site["site"],
                    "source": "USGS 3DEP EPQS",
                    "error": "One or more requested samples had no numeric elevation",
                })
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
            errors.append({"site": site["site"], "source": "USGS 3DEP EPQS", "error": str(exc)})
            elevation_samples[site["site"]] = [
                {**point, "elevation_m": None, "error": str(exc)}
                for point in sample_points(float(site["latitude"]), float(site["longitude"]))
            ]

    locations = {}
    for site in sites:
        samples = elevation_samples[site["site"]]
        terrain = {
            "status": "complete" if all(sample["elevation_m"] is not None for sample in samples) else "incomplete",
            "source": _terrain_source(site, samples),
            "coordinate_source": "sites.json and candidate_sites.csv (validated to match)",
            "site_coordinate_precision": "Approximate candidate coordinate; no additional precision inferred",
            "sampling": {
                "method": "3x3 point samples centered on the supplied coordinate",
                "sample_spacing_m": SAMPLE_SPACING_M,
                "footprint_m": 2 * SAMPLE_SPACING_M,
                "rows": 3,
                "columns": 3,
                "nodata_policy": "No imputation; all four derived metrics require all 9 valid samples",
            },
            "processing": {
                "elevation": "Center value from the 3x3 sample window",
                "slope": "Horn 3x3 finite-difference derivative at the center; slope = atan(sqrt(dz/dx^2 + dz/dy^2)); degrees",
                "relief": "Maximum minus minimum elevation among the 9 samples; metres",
                "roughness": "Population standard deviation of the 9 sampled elevations; metres",
            },
            "metrics": derive_terrain_metrics(samples),
            "samples": samples,
            "comparison_group": _terrain_source(site, samples)["comparison_group"],
        }
        try:
            geology = _fetch_geology(site, opener)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
            geology = {
                "status": "unavailable",
                "dataset": "Macrostrat geologic_units/map point intersection",
                "query_url": f"{MACROSTRAT_MAP_URL}?{urllib.parse.urlencode({'lat': site['latitude'], 'lng': site['longitude']})}",
                "query_coordinates": {
                    "latitude": float(site["latitude"]),
                    "longitude": float(site["longitude"]),
                    "coordinate_source": "sites.json; approximate candidate point",
                },
                "map_units": [],
                "error": str(exc),
            }
            errors.append({"site": site["site"], "source": "Macrostrat geology map", "error": str(exc)})
        locations[site["site"]] = {
            "coordinates": {
                "latitude": float(site["latitude"]),
                "longitude": float(site["longitude"]),
                "source": "sites.json; approximate candidate point",
            },
            "terrain": terrain,
            "geology": geology,
        }

    return {
        "metadata": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "coordinate_source": "sites.json; coordinates cross-checked against candidate_sites.csv",
            "candidate_coordinate_status": "Approximate and unvalidated; retained without rounding or relocation",
            "terrain_sample_spacing_m": SAMPLE_SPACING_M,
            "global_elevation_request_url": global_request_url,
            "comparison_method": (
                "Show measured values side by side, with source and resolution group. Numeric "
                "terrain comparisons require the same source/resolution, vertical reference, "
                "and 3x3 sampling method. USGS EPQS locations remain separate because its "
                "response omits the vertical datum. Geology map units are descriptive and "
                "their source scales differ. No weighted score or rank is calculated."
            ),
            "errors": errors,
        },
        "locations": locations,
        "planetary_reference": {
            "Moon": {
                "status": "unavailable_no_site_coordinates",
                "reason": "The project contains no lunar target location or coordinates; no site-level LOLA elevation or USGS lunar map unit was extracted.",
                "elevation_source": "NASA Lunar Orbiter Laser Altimeter (LOLA)",
                "elevation_source_url": "https://imbrium.mit.edu/",
                "geology_source": "USGS Astrogeology planetary map products",
                "geology_source_url": "https://astrogeology.usgs.gov/search/map/moon/geology",
                "geology_product_url": "https://pubs.usgs.gov/sim/3464/",
                "product_version_or_resolution": "No LOLA raster/version or lunar map scale selected because no target coordinates were supplied.",
            },
            "Mars": {
                "status": "unavailable_no_site_coordinates",
                "reason": "The project contains no Mars target location or coordinates; no site-level MOLA elevation or USGS Mars map unit was extracted.",
                "elevation_source": "NASA Mars Orbiter Laser Altimeter (MOLA) MEGDR",
                "elevation_source_url": "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html",
                "geology_source": "USGS Astrogeology planetary map products",
                "geology_source_url": "https://astrogeology.usgs.gov/search/map/mars/geology",
                "geology_product_url": "https://pubs.usgs.gov/sim/3292/",
                "product_version_or_resolution": "No MOLA raster/version or Mars map scale selected because no target coordinates were supplied.",
            },
        },
    }


def main():
    try:
        sites = load_sites()
        dataset = build_dataset(sites)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Unable to process terrain and geology data: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} for {len(sites)} Earth locations.")
    if dataset["metadata"]["errors"]:
        print(f"{len(dataset['metadata']['errors'])} source error(s) recorded in the output.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
