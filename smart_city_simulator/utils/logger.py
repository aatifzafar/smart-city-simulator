"""Data logging utilities for the Mini Smart City Simulator.

Writes structured per-step simulation statistics to CSV and JSON formats.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Dict, Any, List, Optional


class SimulationLogger:
    """Logs simulation data to CSV and optional JSON lines.

    Writes structured tabular data with designated column headers for effortless
    analysis and plotting.
    """

    FIELDNAMES = [
        "step",
        "hour_of_day",
        "traffic_congestion",
        "total_vehicles",
        "rerouted_vehicles",
        "congested_roads",
        "odd_even_active",
        "energy_usage",
        "energy_supply",
        "renewable_mw",
        "non_renewable_mw",
        "emissions_kg",
        "blackout",
        "total_waste_kg",
        "collected_waste_kg",
        "overflow_bins",
        "aqi",
        "high_pollution",
        "severity",
    ]

    def __init__(self, log_path: Path, json_path: Optional[Path] = None) -> None:
        self.log_path = Path(log_path)
        self.json_path = Path(json_path) if json_path else None
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_csv()

    def _initialize_csv(self) -> None:
        """Create or overwrite the CSV file with the standard header."""
        with open(self.log_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=self.FIELDNAMES, extrasaction="ignore")
            writer.writeheader()

        if self.json_path:
            self.json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.json_path, "w", encoding="utf-8") as f:
                pass  # Empty file ready for json lines

    def log(self, step: int, metrics: Dict[str, Any]) -> None:
        """Log metrics dictionary for a simulation step."""
        with open(self.log_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=self.FIELDNAMES, extrasaction="ignore")
            writer.writerow(metrics)

        if self.json_path:
            with open(self.json_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(metrics) + "\n")
