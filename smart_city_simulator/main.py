"""CLI Entry point for the Mini Smart City Simulator.

Configures and executes the multi-subsystem simulation with argparse CLI flags,
error handling, data logging, and automatic matplotlib visualization.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import random
import sys

from smart_city_simulator.city.controller import CityController
from smart_city_simulator.exceptions import SmartCityError, InvalidConfigError
from smart_city_simulator.utils.logger import SimulationLogger
from smart_city_simulator.utils.visualizer import Visualizer


def build_parser() -> argparse.ArgumentParser:
    """Construct the command-line interface parser."""
    parser = argparse.ArgumentParser(
        prog="smart_city_simulator",
        description="🌆 Mini Smart City Simulator — Advanced Object-Oriented Multi-Subsystem Urban Simulation.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=48,
        help="Number of discrete simulation steps/hours to run.",
    )
    parser.add_argument(
        "--zones",
        type=int,
        default=3,
        help="Number of municipal city zones to simulate.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for deterministic, reproducible simulation runs.",
    )
    parser.add_argument(
        "--zone-pop",
        type=int,
        default=None,
        help="Optional uniform population per zone (e.g. 1500).",
    )
    parser.add_argument(
        "--alert-threshold",
        type=float,
        default=110.0,
        help="Air Quality Index threshold triggering emergent odd-even restriction.",
    )
    parser.add_argument(
        "--no-plot",
        action="store_true",
        help="Disable automatic plot generation at the end of the simulation.",
    )
    parser.add_argument(
        "--save-only",
        action="store_true",
        help="Save plot directly to disk without popping up interactive GUI window.",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch the interactive graphical Tkinter dashboard instead of CLI batch run.",
    )
    parser.add_argument(
        "--web",
        action="store_true",
        help="Launch the modern glassmorphic web browser dashboard (default port: 8000).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="HTTP port to bind the web dashboard server on (default: 8000).",
    )
    return parser


def main() -> None:
    """Parse CLI arguments, execute the simulation, log state, and display plots."""
    parser = build_parser()
    args = parser.parse_args()

    # Apply reproducibility seed if provided
    if args.seed is not None:
        random.seed(args.seed)

    # Web Dashboard Mode
    if args.web:
        from smart_city_simulator.web_server import start_server
        start_server(port=args.port, zones=args.zones, seed=args.seed)
        return

    # Desktop GUI Mode
    if args.gui:
        from smart_city_simulator.gui import launch_gui
        launch_gui(initial_zones=args.zones, initial_steps=args.steps)
        return

    if args.steps <= 0:
        print(f"Error: --steps must be a positive integer, got: {args.steps}", file=sys.stderr)
        sys.exit(1)
    if args.zones <= 0:
        print(f"Error: --zones must be a positive integer, got: {args.zones}", file=sys.stderr)
        sys.exit(1)
    if args.zone_pop is not None and args.zone_pop <= 0:
        print(f"Error: --zone-pop must be strictly positive, got: {args.zone_pop}", file=sys.stderr)
        sys.exit(1)

    # Prepare file paths
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    csv_log_path = data_dir / "simulation_log.csv"
    json_log_path = data_dir / "simulation_log.json"
    plot_path = data_dir / "simulation_results.png"

    logger = SimulationLogger(log_path=csv_log_path, json_path=json_log_path)
    visualizer = Visualizer(output_path=plot_path)

    # Reset controller singleton state in case of rerun
    CityController.reset_instance()

    try:
        controller = CityController(
            zones=args.zones,
            zone_population=args.zone_pop,
            logger=logger,
            visualizer=visualizer,
            alert_threshold=args.alert_threshold,
        )

        controller.run_simulation(total_steps=args.steps)

    except SmartCityError as err:
        print(f"\n[SmartCity Simulation Error]: {err}", file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        print("\nSimulation aborted by user.", file=sys.stderr)
        sys.exit(130)

    # Post-simulation visual output
    print(f"\n📁 Log files generated:")
    print(f"   • CSV: {csv_log_path}")
    print(f"   • JSON: {json_log_path}")

    if not args.no_plot:
        visualizer.plot(controller.time_series, save_only=args.save_only)


if __name__ == "__main__":
    main()
