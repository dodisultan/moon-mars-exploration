#!/usr/bin/env python3
"""Fetch and validate real NASA POWER daily climate data; never synthesize missing values."""
import csv
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
START_DATE = date(2023, 1, 1)
END_DATE = date(2024, 12, 31)
PARAMETERS = (
    "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M",
    "ALLSKY_SFC_SW_DWN", "PS",
)
PARAMETER_UNITS = {
    "T2M": "degC",
    "T2M_MAX": "degC",
    "T2M_MIN": "degC",
    "PRECTOTCORR": "mm/day",
    "RH2M": "%",
    "WS2M": "m/s",
    "ALLSKY_SFC_SW_DWN": "MJ/m^2/day",
    "PS": "kPa",
}
CSV_FIELDS = [
    "site", "date", "latitude", "longitude", "source", "source_url",
    *PARAMETERS, *(f"{parameter}_unit" for parameter in PARAMETERS),
]
SUMMARY_FIELDS = [
    "site", "latitude", "longitude", "days_downloaded", "days_requested", "mean_temp_c",
    "mean_temp_unit",
    "total_precipitation_mm_2023_2024", "mean_humidity_pct", "mean_wind_ms",
    "daily_precipitation_unit", "total_precipitation_unit", "humidity_unit", "wind_unit",
    "valid_days_t2m", "valid_days_precipitation", "valid_days_humidity",
    "valid_days_wind", "source", "source_url", "period",
]
BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"


def load_sites(path):
    """Read candidate points and reject malformed or out-of-range coordinates."""
    with path.open(newline="", encoding="utf-8") as source:
        sites = list(csv.DictReader(source))
    if not sites:
        raise ValueError(f"No candidate sites found in {path}")
    required = {"site", "latitude", "longitude"}
    for line, site in enumerate(sites, start=2):
        if (not required.issubset(site) or not isinstance(site.get("site"), str)
                or not site["site"].strip()):
            raise ValueError(f"Candidate CSV row {line} is missing site/coordinate fields")
        try:
            latitude, longitude = float(site["latitude"]), float(site["longitude"])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Candidate CSV row {line} has invalid coordinates") from exc
        if not (math.isfinite(latitude) and -90 <= latitude <= 90):
            raise ValueError(f"Candidate CSV row {line} has latitude outside [-90, 90]")
        if not (math.isfinite(longitude) and -180 <= longitude <= 180):
            raise ValueError(f"Candidate CSV row {line} has longitude outside [-180, 180]")
    return sites


def parse_power_response(payload, site):
    """Validate a NASA POWER payload; retain missing/sentinel observations as None."""
    try:
        variables = payload["properties"]["parameter"]
    except (TypeError, KeyError) as exc:
        raise ValueError("response has no properties.parameter object") from exc
    if not isinstance(variables, dict) or any(
        not isinstance(values, dict) for values in variables.values()
    ):
        raise ValueError("response parameter data is not a date-to-value mapping")
    missing_parameters = [parameter for parameter in PARAMETERS if parameter not in variables]
    if missing_parameters:
        raise ValueError(f"response is missing requested parameters: {', '.join(missing_parameters)}")
    dates = sorted(set().union(*(set(values) for values in variables.values())))
    rows = []
    for day in dates:
        try:
            if not isinstance(day, str) or len(day) != 8 or not day.isdigit():
                raise ValueError(f"invalid date key {day!r}")
            parsed_day = date(int(day[:4]), int(day[4:6]), int(day[6:8]))
        except (TypeError, ValueError, IndexError) as exc:
            raise ValueError(f"response contains invalid date key {day!r}") from exc
        if not START_DATE <= parsed_day <= END_DATE:
            continue
        row = {
            "site": site["site"],
            "date": day,
            "latitude": site["latitude"],
            "longitude": site["longitude"],
            "source": "NASA POWER daily API",
            "source_url": BASE_URL,
        }
        for parameter in PARAMETERS:
            value = variables[parameter].get(day)
            row[f"{parameter}_unit"] = PARAMETER_UNITS[parameter]
            if value is None:
                row[parameter] = None
                continue
            try:
                number = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"non-numeric {parameter} value for {day}: {value!r}") from exc
            row[parameter] = number if math.isfinite(number) and number > -990 else None
        rows.append(row)
    if not rows:
        raise ValueError("response contains no daily records in the requested date range")
    return rows


def summarize_rows(rows):
    """Aggregate observed values only and report variable-specific coverage explicitly."""
    grouped = {}
    for row in rows:
        grouped.setdefault(row["site"], []).append(row)
    requested_days = (END_DATE - START_DATE).days + 1
    summary = []
    for site, site_rows in grouped.items():
        def good(parameter):
            return [float(row[parameter]) for row in site_rows if row[parameter] is not None]

        def mean(parameter):
            values = good(parameter)
            return round(sum(values) / len(values), 3) if values else None

        precipitation = good("PRECTOTCORR")
        summary.append({
            "site": site,
            "latitude": site_rows[0]["latitude"],
            "longitude": site_rows[0]["longitude"],
            "days_downloaded": len(site_rows),
            "days_requested": requested_days,
            "mean_temp_c": mean("T2M"),
            "mean_temp_unit": PARAMETER_UNITS["T2M"],
            "total_precipitation_mm_2023_2024": round(sum(precipitation), 3) if precipitation else None,
            "mean_humidity_pct": mean("RH2M"),
            "mean_wind_ms": mean("WS2M"),
            "daily_precipitation_unit": PARAMETER_UNITS["PRECTOTCORR"],
            "total_precipitation_unit": "mm",
            "humidity_unit": PARAMETER_UNITS["RH2M"],
            "wind_unit": PARAMETER_UNITS["WS2M"],
            "valid_days_t2m": len(good("T2M")),
            "valid_days_precipitation": len(precipitation),
            "valid_days_humidity": len(good("RH2M")),
            "valid_days_wind": len(good("WS2M")),
            "source": "NASA POWER daily API",
            "source_url": BASE_URL,
            "period": f"{START_DATE.isoformat()} to {END_DATE.isoformat()}",
        })
    return summary


def fetch_site(site, opener=urllib.request.urlopen):
    """Fetch one point with explicit request parameters and a bounded timeout."""
    query = {
        "parameters": ",".join(PARAMETERS),
        "community": "AG",
        "latitude": site["latitude"],
        "longitude": site["longitude"],
        "start": START_DATE.strftime("%Y%m%d"),
        "end": END_DATE.strftime("%Y%m%d"),
        "format": "JSON",
    }
    request = urllib.request.Request(
        f"{BASE_URL}?{urllib.parse.urlencode(query)}",
        headers={"User-Agent": "Space-Analog-Explorer/1.0"},
    )
    with opener(request, timeout=120) as response:
        payload = json.load(response)
    return parse_power_response(payload, site)


def write_outputs(rows, errors, output_dir):
    """Write observed records, summaries, and per-site errors without coercing nulls."""
    output_dir.mkdir(parents=True, exist_ok=True)
    with (output_dir / "nasa_power_daily_2023_2024.csv").open(
        "w", newline="", encoding="utf-8"
    ) as target:
        writer = csv.DictWriter(target, fieldnames=CSV_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    summary = summarize_rows(rows)
    with (output_dir / "climate_summary.csv").open(
        "w", newline="", encoding="utf-8"
    ) as target:
        writer = csv.DictWriter(target, fieldnames=SUMMARY_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(summary)
    (output_dir / "climate_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "download_errors.json").write_text(
        json.dumps(errors, indent=2) + "\n", encoding="utf-8"
    )
    metadata = {
        "dataset": "NASA POWER daily point data",
        "source_url": BASE_URL,
        "data_character": "Gridded modeled/reanalysis-derived estimates; not in-situ station observations.",
        "requested_period": f"{START_DATE.isoformat()} to {END_DATE.isoformat()}",
        "uncertainty": "No site-level uncertainty or confidence interval is derived by this application.",
        "parameters": {
            parameter: {"unit": unit}
            for parameter, unit in PARAMETER_UNITS.items()
        },
        "candidate_locations": [
            {
                "site": site_rows[0]["site"],
                "latitude": site_rows[0]["latitude"],
                "longitude": site_rows[0]["longitude"],
            }
            for site_rows in _group_rows(rows).values()
        ],
        "missing_value_policy": "NASA POWER sentinels (<= -990) and unavailable values are null/blank; no imputation.",
        "precipitation_aggregate": "Sum of valid returned PRECTOTCORR daily values over the full requested period; not annualized.",
    }
    (output_dir / "climate_metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )


def _group_rows(rows):
    grouped = {}
    for row in rows:
        grouped.setdefault(row["site"], []).append(row)
    return grouped


def main():
    sites = load_sites(ROOT / "candidate_sites.csv")
    rows, errors = [], []
    for index, site in enumerate(sites):
        try:
            site_rows = fetch_site(site)
            rows.extend(site_rows)
            print(f"Downloaded {site['site']}: {len(site_rows)} daily records")
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
            errors.append({"site": site["site"], "error": str(exc)})
            print(f"FAILED {site['site']}: {exc}")
        if index + 1 < len(sites):
            time.sleep(1)
    write_outputs(rows, errors, ROOT / "data" / "earth")
    print(f"Done. Records: {len(rows)}. Failed sites: {len(errors)}.")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
