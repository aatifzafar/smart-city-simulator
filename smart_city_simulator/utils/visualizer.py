"""Visualization module for the Mini Smart City Simulator.

Generates a multi-panel analytics dashboard using Matplotlib with a modern
pastel color palette, clean gridlines, annotations for emergent policy changes,
and automatic export to PNG image files.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import os


class Visualizer:
    """Renders and saves comprehensive multi-subsystem simulation graphs."""

    # Modern curated pastel palette
    PALETTE = {
        "blue": "#6baed6",
        "dark_blue": "#3182bd",
        "orange": "#fdae6b",
        "red": "#e6550d",
        "green": "#74c476",
        "dark_green": "#31a354",
        "purple": "#bcbddc",
        "dark_purple": "#756bb1",
        "gray": "#bdbdbd",
        "bg_alert": "#fee6ce",
        "alert_red": "#de2d26",
    }

    def __init__(self, output_path: Optional[Path] = None) -> None:
        self.output_path = Path(output_path) if output_path else None

    def plot(self, time_series: List[Dict[str, Any]], save_only: bool = False) -> Optional[Path]:
        """Plot the simulation metrics across discrete time steps.

        Args:
            time_series: List of per-step metric dictionaries.
            save_only: If True, do not attempt to pop up interactive window.

        Returns:
            Optional[Path]: Path to the saved figure image if saved.
        """
        if not time_series:
            print("Visualizer: No time-series data provided to plot.")
            return None

        # Import matplotlib lazily to ensure environment compatibility
        import matplotlib
        if save_only or os.environ.get("DISPLAY", "") == "" and os.environ.get("MPLBACKEND", "") == "":
            matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        # Apply clean styling
        available_styles = plt.style.available
        if "seaborn-v0_8-whitegrid" in available_styles:
            plt.style.use("seaborn-v0_8-whitegrid")
        elif "seaborn-whitegrid" in available_styles:
            plt.style.use("seaborn-whitegrid")
        else:
            plt.style.use("default")

        steps = [record["step"] for record in time_series]
        congestion = [record["traffic_congestion"] for record in time_series]
        vehicles = [record["total_vehicles"] for record in time_series]
        odd_even = [record.get("odd_even_active", 0) for record in time_series]

        energy_demand = [record["energy_usage"] for record in time_series]
        energy_supply = [record["energy_supply"] for record in time_series]
        renewable = [record.get("renewable_mw", 0) for record in time_series]
        blackouts = [record.get("blackout", 0) for record in time_series]

        aqi = [record["aqi"] for record in time_series]
        waste_gen = [record["total_waste_kg"] for record in time_series]
        waste_collected = [record["collected_waste_kg"] for record in time_series]

        fig, axes = plt.subplots(3, 1, figsize=(14, 11), sharex=True)
        fig.suptitle(
            "Mini Smart City Simulator - Multi-Subsystem Performance & Emergent Policy Dashboard",
            fontsize=15,
            fontweight="bold",
            y=0.98,
        )

        # -----------------------------------------------------------------
        # Panel 1: Traffic Management & Odd-Even Policy Activation
        # -----------------------------------------------------------------
        ax1 = axes[0]
        ax1.plot(
            steps,
            congestion,
            color=self.PALETTE["blue"],
            linewidth=2.2,
            label="Avg Road Congestion (0.0-1.0)",
        )
        ax1.axhline(0.75, color=self.PALETTE["alert_red"], linestyle="--", alpha=0.6, label="Congestion Alert Threshold (75%)")
        ax1.set_ylabel("Congestion Ratio", fontsize=11, fontweight="semibold")
        ax1.set_ylim(0, max(1.1, max(congestion) * 1.15))
        ax1.grid(True, linestyle="--", alpha=0.5)

        # Twin axis for vehicle volume
        ax1_twin = ax1.twinx()
        ax1_twin.plot(
            steps,
            vehicles,
            color=self.PALETTE["dark_purple"],
            linestyle=":",
            linewidth=1.8,
            alpha=0.75,
            label="Active Commuter Vehicles",
        )
        ax1_twin.set_ylabel("Vehicle Count", fontsize=10, color=self.PALETTE["dark_purple"])
        ax1_twin.tick_params(colors=self.PALETTE["dark_purple"])

        # Highlight odd-even rule activation intervals
        active_spans = []
        start_step = None
        for s, active in zip(steps, odd_even):
            if active and start_step is None:
                start_step = s
            elif not active and start_step is not None:
                active_spans.append((start_step, s))
                start_step = None
        if start_step is not None:
            active_spans.append((start_step, steps[-1]))

        for start, end in active_spans:
            ax1.axvspan(start, end, color=self.PALETTE["bg_alert"], alpha=0.6, label="Odd-Even Policy Active")

        # Deduplicate legends
        lines1, labels1 = ax1.get_legend_handles_labels()
        lines2, labels2 = ax1_twin.get_legend_handles_labels()
        by_label = dict(zip(labels1 + labels2, lines1 + lines2))
        ax1.legend(by_label.values(), by_label.keys(), loc="upper left", framealpha=0.85, fontsize=9)
        ax1.set_title("Traffic Subsystem: Congestion Dynamics & Restriction Policy", fontsize=12, pad=6)

        # -----------------------------------------------------------------
        # Panel 2: Energy Grid Dispatch & Load Balancing
        # -----------------------------------------------------------------
        ax2 = axes[1]
        ax2.plot(steps, energy_demand, color=self.PALETTE["orange"], linewidth=2.0, label="Demand Load (MW)")
        ax2.plot(steps, energy_supply, color=self.PALETTE["dark_green"], linewidth=2.0, label="Total Supply Dispatched (MW)")
        ax2.fill_between(steps, 0, renewable, color=self.PALETTE["green"], alpha=0.35, label="Clean Renewable (Solar/Wind)")

        # Mark any blackouts
        blackout_steps = [s for s, b in zip(steps, blackouts) if b]
        if blackout_steps:
            ax2.scatter(
                blackout_steps,
                [energy_demand[s] for s in blackout_steps],
                color=self.PALETTE["alert_red"],
                s=70,
                zorder=5,
                marker="X",
                label="Blackout Deficit Event",
            )

        ax2.set_ylabel("Power (MW)", fontsize=11, fontweight="semibold")
        ax2.grid(True, linestyle="--", alpha=0.5)
        ax2.legend(loc="upper left", framealpha=0.85, fontsize=9)
        ax2.set_title("Energy Grid: Merit-Order Green Generation & Load Balancing", fontsize=12, pad=6)

        # -----------------------------------------------------------------
        # Panel 3: Environmental Air Quality Index (AQI) & Waste
        # -----------------------------------------------------------------
        ax3 = axes[2]
        ax3.plot(steps, aqi, color=self.PALETTE["red"], linewidth=2.4, label="Air Quality Index (AQI)")
        ax3.axhline(110.0, color=self.PALETTE["alert_red"], linestyle="--", linewidth=1.5, label="Policy Trigger Threshold (AQI 110)")
        ax3.axhline(80.0, color=self.PALETTE["dark_green"], linestyle=":", linewidth=1.5, label="Clear Return Threshold (AQI 80)")
        ax3.set_ylabel("Air Quality Index (AQI)", fontsize=11, fontweight="semibold")
        ax3.set_xlabel("Simulation Time Step (Simulated Hours)", fontsize=11, fontweight="semibold")
        ax3.set_ylim(0, max(160, max(aqi) * 1.15))
        ax3.grid(True, linestyle="--", alpha=0.5)

        # Highlight unhealthy region
        ax3.axhspan(110.0, max(180, max(aqi) * 1.2), color="#fee0d2", alpha=0.4, label="Unhealthy / Alert Air Zone")

        # Shade policy period in environmental graph as well
        for start, end in active_spans:
            ax3.axvspan(start, end, color=self.PALETTE["bg_alert"], alpha=0.5)

        ax3.legend(loc="upper left", framealpha=0.85, fontsize=9)
        ax3.set_title("Environmental Monitor: Atmospheric Pollution & Policy Triggers", fontsize=12, pad=6)

        plt.tight_layout()

        # Save to disk
        out_file = self.output_path or (Path(__file__).parent.parent / "data" / "simulation_results.png")
        out_file.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out_file, dpi=200, bbox_inches="tight")
        print(f"📊 Visualization dashboard saved to: {out_file}")

        if not save_only and os.environ.get("DISPLAY", "") != "":
            try:
                plt.show()
            except Exception:
                pass
        plt.close(fig)

        return out_file
