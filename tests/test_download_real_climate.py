import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import download_real_climate as downloader


class PowerDataValidationTests(unittest.TestCase):
    def setUp(self):
        self.site = {
            "site": "test_point",
            "latitude": "1.25",
            "longitude": "-2.5",
        }

    def payload(self, values):
        dates = ("20230101", "20230102")
        return {
            "properties": {
                "parameter": {
                    parameter: {day: values.get(parameter, {}).get(day) for day in dates}
                    for parameter in downloader.PARAMETERS
                }
            }
        }

    def test_parse_preserves_missing_values_and_ignores_out_of_range_dates(self):
        payload = self.payload({
            "T2M": {"20230101": 12.5, "20230102": -999},
            "PRECTOTCORR": {"20230101": 0.0, "20230102": 2.0},
        })
        payload["properties"]["parameter"]["T2M"]["20250101"] = 20
        rows = downloader.parse_power_response(payload, self.site)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["T2M"], 12.5)
        self.assertIsNone(rows[1]["T2M"])
        self.assertEqual(rows[0]["PRECTOTCORR"], 0.0)
        self.assertEqual(rows[0]["date"], "20230101")

    def test_rejects_missing_requested_parameter(self):
        payload = self.payload({})
        del payload["properties"]["parameter"]["PS"]
        with self.assertRaisesRegex(ValueError, "missing requested parameters: PS"):
            downloader.parse_power_response(payload, self.site)

    def test_rejects_malformed_values_instead_of_silently_dropping_them(self):
        payload = self.payload({"T2M": {"20230101": "not-a-number"}})
        with self.assertRaisesRegex(ValueError, "non-numeric T2M"):
            downloader.parse_power_response(payload, self.site)

    def test_summary_averages_only_valid_measurements_and_reports_coverage(self):
        rows = downloader.parse_power_response(self.payload({
            "T2M": {"20230101": 10, "20230102": -999},
            "PRECTOTCORR": {"20230101": 0, "20230102": 2},
        }), self.site)
        summary = downloader.summarize_rows(rows)[0]
        self.assertEqual(summary["mean_temp_c"], 10)
        self.assertEqual(summary["valid_days_t2m"], 1)
        self.assertEqual(summary["valid_days_precipitation"], 2)
        self.assertEqual(summary["total_precipitation_mm_2023_2024"], 2)
        self.assertEqual(summary["total_precipitation_unit"], "mm")
        self.assertEqual(summary["daily_precipitation_unit"], "mm/day")
        self.assertEqual(summary["days_requested"], 731)

    def test_records_and_outputs_keep_measurement_provenance(self):
        rows = downloader.parse_power_response(self.payload({
            "T2M": {"20230101": 10},
        }), self.site)
        row = rows[0]
        self.assertEqual(row["latitude"], self.site["latitude"])
        self.assertEqual(row["longitude"], self.site["longitude"])
        self.assertEqual(row["source_url"], downloader.BASE_URL)
        self.assertEqual(row["T2M_unit"], "degC")

        with TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory)
            downloader.write_outputs(rows, [], output_dir)
            metadata = json.loads((output_dir / "climate_metadata.json").read_text())
            self.assertEqual(metadata["requested_period"], "2023-01-01 to 2024-12-31")
            self.assertIn("uncertainty", metadata)
            self.assertEqual(metadata["parameters"]["PRECTOTCORR"]["unit"], "mm/day")
            with (output_dir / "nasa_power_daily_2023_2024.csv").open(newline="") as source:
                record = next(csv.DictReader(source))
            self.assertEqual(record["T2M_unit"], "degC")
            self.assertEqual(record["source_url"], downloader.BASE_URL)


if __name__ == "__main__":
    unittest.main()
