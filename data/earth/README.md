# Earth climate products

No downloaded climate measurements are committed with the starter candidate data. Run `python download_real_climate.py` from the repository root in a networked Python 3 environment to request NASA POWER daily data. The script writes the real API response records, summaries, source/unit metadata, and per-site errors here. It does not create terrain or geological measurements.

The candidate coordinates are approximate input locations. NASA POWER records are gridded modeled/reanalysis-derived estimates, not in-situ observations. See [METHODS.md](../../METHODS.md) for variable units, coverage rules, and limitations.
