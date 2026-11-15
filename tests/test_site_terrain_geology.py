import math
import json
import unittest
from pathlib import Path
from urllib.error import URLError
from unittest.mock import patch

from process_site_terrain_geology import (
    _fetch_usgs_samples,
    derive_terrain_metrics,
    sample_points,
)

ROOT = Path(__file__).resolve().parents[1]


class TerrainProcessingTests(unittest.TestCase):
    def test_sample_window_is_centered_and_uses_physical_spacing(self):
        points = sample_points(0, 0)
        self.assertEqual(len(points), 9)
        self.assertEqual((points[4]["latitude"], points[4]["longitude"]), (0, 0))
        self.assertAlmostEqual(points[3]["longitude"], -90 / 111320)
        self.assertAlmostEqual(points[1]["latitude"], 90 / 111320)

    def test_metrics_use_all_nine_samples_and_documented_horn_slope(self):
        elevations = [
            row * 90 + column * 180
            for row in range(3)
            for column in range(3)
        ]
        samples = [{"elevation_m": value} for value in elevations]
        metrics = derive_terrain_metrics(samples)
        self.assertEqual(metrics["elevation_m"], elevations[4])
        self.assertEqual(metrics["relief_m"], 540)
        self.assertAlmostEqual(metrics["slope_degrees"], math.degrees(math.atan(math.sqrt(5))))
        self.assertAlmostEqual(metrics["roughness_stddev_m"], math.sqrt(27000))

    def test_missing_elevations_are_not_imputed_or_used_for_derived_metrics(self):
        samples = [{"elevation_m": float(index)} for index in range(9)]
        samples[2]["elevation_m"] = None
        metrics = derive_terrain_metrics(samples)
        self.assertEqual(metrics["valid_samples"], 8)
        self.assertIsNone(metrics["slope_degrees"])
        self.assertIsNone(metrics["relief_m"])
        self.assertIsNone(metrics["roughness_stddev_m"])

    def test_one_failed_usgs_sample_does_not_discard_successful_neighbor_samples(self):
        calls = 0

        def response(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 5:
                raise URLError("temporary service error")
            return {"value": "123", "rasterId": 4, "resolution": 1}

        site = {"site": "test", "latitude": 36.0, "longitude": -116.0}
        with patch("process_site_terrain_geology.fetch_json", side_effect=response):
            samples = _fetch_usgs_samples([site], opener=None)["test"]
        self.assertEqual(len(samples), 9)
        self.assertEqual(sum(sample["elevation_m"] is not None for sample in samples), 8)
        self.assertIn("temporary service error", samples[4]["error"])


class CheckedInEvidenceTests(unittest.TestCase):
    def test_processed_site_values_match_saved_samples_and_source_coordinates(self):
        sites = json.loads((ROOT / "sites.json").read_text())
        dataset = json.loads((ROOT / "data/processed/site_terrain_geology.json").read_text())
        self.assertEqual(set(dataset["locations"]), {site["site"] for site in sites})
        self.assertEqual(dataset["metadata"]["errors"], [])
        for site in sites:
            location = dataset["locations"][site["site"]]
            self.assertEqual(location["coordinates"]["latitude"], site["latitude"])
            self.assertEqual(location["coordinates"]["longitude"], site["longitude"])
            terrain = location["terrain"]
            self.assertEqual(terrain["status"], "complete")
            self.assertEqual(terrain["metrics"]["valid_samples"], 9)
            self.assertEqual(len(terrain["samples"]), 9)
            self.assertEqual(
                terrain["samples"][4]["latitude"], site["latitude"]
            )
            self.assertEqual(
                terrain["samples"][4]["longitude"], site["longitude"]
            )
            calculated = derive_terrain_metrics(terrain["samples"])
            for metric in ("elevation_m", "slope_degrees", "relief_m", "roughness_stddev_m"):
                self.assertAlmostEqual(terrain["metrics"][metric], calculated[metric])
            self.assertTrue(terrain["source"]["source_url"].startswith("https://"))
            self.assertTrue(location["geology"]["map_units"])
            self.assertTrue(location["geology"]["query_url"].startswith("https://"))

    def test_existing_climate_coverage_and_missing_planetary_coordinates_are_explicit(self):
        climate = json.loads((ROOT / "data/earth/climate_summary.json").read_text())
        self.assertEqual(len(climate), 8)
        for summary in climate:
            self.assertEqual(summary["days_downloaded"], 731)
            self.assertEqual(summary["valid_days_t2m"], 731)
            self.assertEqual(summary["valid_days_precipitation"], 731)
        dataset = json.loads((ROOT / "data/processed/site_terrain_geology.json").read_text())
        for body in ("Moon", "Mars"):
            self.assertEqual(
                dataset["planetary_reference"][body]["status"],
                "unavailable_no_site_coordinates",
            )
        sites = json.loads((ROOT / "sites.json").read_text())
        usgs_groups = {
            dataset["locations"][site["site"]]["terrain"]["comparison_group"]
            for site in sites
            if site["country"] == "USA"
        }
        self.assertEqual(len(usgs_groups), 2)

    def test_comparable_cohorts_support_only_shared_product_terrain_deltas(self):
        sites = json.loads((ROOT / "sites.json").read_text())
        dataset = json.loads((ROOT / "data/processed/site_terrain_geology.json").read_text())
        terrain_groups = {}
        for site in sites:
            terrain = dataset["locations"][site["site"]]["terrain"]
            if terrain["status"] == "complete" and terrain["metrics"]["valid_samples"] == 9:
                terrain_groups.setdefault(terrain["comparison_group"], []).append(site["site"])
        shared_cohorts = [members for members in terrain_groups.values() if len(members) > 1]
        self.assertEqual([len(members) for members in shared_cohorts], [6])
        self.assertEqual(sum(len(members) * (len(members) - 1) // 2 for members in shared_cohorts), 15)

        climate = json.loads((ROOT / "data/earth/climate_summary.json").read_text())
        complete_climate_sites = [
            item for item in climate
            if item["days_downloaded"] == item["days_requested"]
            and item["valid_days_t2m"] == item["days_requested"]
            and item["valid_days_precipitation"] == item["days_requested"]
        ]
        self.assertEqual(len(complete_climate_sites), 8)
        self.assertEqual(len({item["source"] for item in complete_climate_sites}), 1)
        self.assertEqual(len({item["period"] for item in complete_climate_sites}), 1)
        self.assertEqual(len(complete_climate_sites) * (len(complete_climate_sites) - 1) // 2, 28)


if __name__ == "__main__":
    unittest.main()
