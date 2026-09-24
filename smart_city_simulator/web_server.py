"""Web API server for Mini Smart City Simulator.

Uses Python's standard library http.server to provide a zero-dependency,
high-performance REST API and static asset server for the web frontend dashboard.
"""

from __future__ import annotations

import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import random
import sys
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

# Ensure UTF-8 output encoding for terminals across platforms (especially Windows)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from smart_city_simulator.city.controller import CityController
from smart_city_simulator.city.event_bus import EventBus
from smart_city_simulator.city.environment import PollutionAlertEvent, PolicyChangeEvent
from smart_city_simulator.city.energy import BlackoutEvent
from smart_city_simulator.city.waste import WasteOverflowEvent
from smart_city_simulator.city.traffic import TrafficCongestionEvent
from smart_city_simulator.city.water import WaterDeficitEvent, DrainageOverflowEvent
from smart_city_simulator.city.emergency import EmergencyCorridorEvent, HospitalOverloadEvent

WEB_DIR = Path(__file__).parent / "web"


class CitySimulatorAPIHandler(SimpleHTTPRequestHandler):
    """HTTP Request Handler providing REST API endpoints and web UI assets."""

    server_controller: Optional[CityController] = None
    recent_events: List[Dict[str, Any]] = []

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    @classmethod
    def setup_controller(cls, zones: int = 3, seed: Optional[int] = None) -> None:
        """Initialize or reset the shared CityController singleton."""
        if seed is not None:
            random.seed(seed)
        CityController.reset_instance()
        EventBus().clear()
        cls.recent_events.clear()

        cls.server_controller = CityController(zones=zones)

        # Wire event listener to capture live ticker events
        def _on_event(event: Any) -> None:
            evt_data = {
                "type": type(event).__name__,
                "timestamp": getattr(event, "timestamp", 0),
                "message": getattr(event, "message", ""),
            }
            if isinstance(event, PollutionAlertEvent):
                evt_data["aqi"] = event.aqi
                evt_data["severity"] = event.severity
                evt_data["high_pollution"] = event.high_pollution
            elif isinstance(event, BlackoutEvent):
                evt_data["deficit_mw"] = event.deficit_mw
            elif isinstance(event, WasteOverflowEvent):
                evt_data["bin_id"] = event.bin_id
                evt_data["current_load_kg"] = event.current_load_kg
            elif isinstance(event, WaterDeficitEvent):
                evt_data["deficit_kl"] = event.deficit_kl
                evt_data["reservoir_level_pct"] = event.reservoir_level_pct
            elif isinstance(event, DrainageOverflowEvent):
                evt_data["zone_id"] = event.zone_id
                evt_data["drainage_load_pct"] = event.drainage_load_pct
            elif isinstance(event, EmergencyCorridorEvent):
                evt_data["zone_id"] = event.zone_id
                evt_data["severity"] = event.severity
                evt_data["incident_id"] = event.incident_id
            elif isinstance(event, HospitalOverloadEvent):
                evt_data["hospital_id"] = event.hospital_id
                evt_data["occupancy_pct"] = event.occupancy_pct

            cls.recent_events.append(evt_data)
            if len(cls.recent_events) > 50:
                cls.recent_events.pop(0)

        EventBus().subscribe(PollutionAlertEvent, _on_event)
        EventBus().subscribe(BlackoutEvent, _on_event)
        EventBus().subscribe(WasteOverflowEvent, _on_event)
        EventBus().subscribe(TrafficCongestionEvent, _on_event)
        EventBus().subscribe(PolicyChangeEvent, _on_event)
        EventBus().subscribe(WaterDeficitEvent, _on_event)
        EventBus().subscribe(DrainageOverflowEvent, _on_event)
        EventBus().subscribe(EmergencyCorridorEvent, _on_event)
        EventBus().subscribe(HospitalOverloadEvent, _on_event)

    def end_headers(self) -> None:
        """Inject cache-control headers to prevent stale CSS/JS caching."""
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _send_json(self, data: Any, status: int = HTTPStatus.OK) -> None:
        """Helper to send JSON response with proper headers."""
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        """Handle CORS pre-flight requests."""
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        """Handle HTTP GET requests for API endpoints or static assets."""
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/api/status":
            self.handle_get_status()
        elif path == "/api/history":
            self.handle_get_history()
        elif path == "/api/city_layout":
            self.handle_get_city_layout()
        elif path == "/api/events":
            self._send_json({"events": self.recent_events})
        else:
            # Serve static web files from WEB_DIR
            if path == "/" or path == "":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self) -> None:
        """Handle HTTP POST requests for simulation actions."""
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        content_len = int(self.headers.get("Content-Length", 0))
        body = {}
        if content_len > 0:
            raw_body = self.rfile.read(content_len).decode("utf-8")
            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError:
                pass

        if path == "/api/step":
            self.handle_post_step()
        elif path == "/api/run":
            steps = int(body.get("steps", 10))
            self.handle_post_run(steps)
        elif path == "/api/reset":
            zones = int(body.get("zones", 3))
            seed = body.get("seed")
            self.setup_controller(zones=zones, seed=seed)
            self._send_json({"success": True, "message": f"Simulation reset with {zones} zones"})
        elif path == "/api/policy":
            policy_name = body.get("policy")
            active = bool(body.get("active", False))
            self.handle_post_policy(policy_name, active)
        else:
            self._send_json({"error": "Endpoint not found"}, status=HTTPStatus.NOT_FOUND)

    # ---------------------------------------------------------------------
    # API Handlers
    # ---------------------------------------------------------------------

    def handle_get_status(self) -> None:
        ctrl = self.server_controller
        if not ctrl:
            self._send_json({"error": "Controller not initialized"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        latest_record = ctrl.time_series[-1] if ctrl.time_series else {}
        current_step = len(ctrl.time_series)

        status_data = {
            "step": current_step,
            "hour_of_day": current_step % 24,
            "zones_count": len(ctrl.zones),
            "active_policies": ctrl.active_policies,
            "subsystems": {
                "traffic": ctrl.traffic.get_status(),
                "energy": ctrl.energy.get_status(),
                "waste": ctrl.waste.get_status(),
                "environment": ctrl.environment.get_status(),
                "water": ctrl.water.get_status(),
                "emergency": ctrl.emergency.get_status(),
            },
            "latest_metrics": latest_record,
            "recent_events": self.recent_events[-10:],
        }
        self._send_json(status_data)

    def handle_get_history(self) -> None:
        ctrl = self.server_controller
        history = ctrl.time_series if ctrl else []
        self._send_json({"history": history, "total_records": len(history)})

    def handle_get_city_layout(self) -> None:
        """Return structural topology for canvas rendering."""
        ctrl = self.server_controller
        if not ctrl:
            self._send_json({})
            return

        zones_data = []
        for i, z in enumerate(ctrl.zones):
            zones_data.append({
                "id": z.id,
                "name": z.name,
                "population": z.population,
            })

        roads_data = [
            {
                "id": r.id,
                "name": r.name,
                "zone_id": r.zone_id,
                "capacity": r.capacity,
                "current_vehicles": r.current_vehicles,
                "is_arterial": r.is_arterial,
                "congestion_level": r.congestion_level,
            }
            for r in ctrl.traffic.roads.values()
        ]

        intersections_data = [
            {
                "id": inter.id,
                "name": inter.name,
                "zone_id": inter.zone_id,
                "state": inter.state.value,
                "connected_roads": inter.connected_road_ids,
            }
            for inter in ctrl.traffic.intersections.values()
        ]

        plants_data = [
            {
                "id": p.id,
                "name": p.name,
                "type": p.plant_type.value,
                "capacity_mw": p.capacity_mw,
                "is_renewable": p.is_renewable,
                "operating": p.operating,
            }
            for p in ctrl.energy.plants
        ]

        hospitals_data = [
            {
                "id": h.id,
                "name": h.name,
                "zone_id": h.zone_id,
                "total_beds": h.total_beds,
                "occupied_beds": h.occupied_beds,
                "occupancy_rate": h.occupancy_rate,
            }
            for h in ctrl.emergency.hospitals.values()
        ]

        reservoirs_data = [
            {
                "id": r.id,
                "name": r.name,
                "capacity_kl": r.capacity_kl,
                "current_level_kl": r.current_level_kl,
                "level_percentage": r.level_percentage,
            }
            for r in ctrl.water.reservoirs
        ]

        pump_stations_data = [
            {
                "id": p.id,
                "name": p.name,
                "zone_id": p.zone_id,
                "max_flow_rate_kl": p.max_flow_rate_kl,
                "current_load_kl": p.current_load_kl,
                "load_percentage": p.load_percentage,
                "gate_open": p.gate_open,
            }
            for p in ctrl.water.pump_stations.values()
        ]

        self._send_json({
            "zones": zones_data,
            "roads": roads_data,
            "intersections": intersections_data,
            "power_plants": plants_data,
            "hospitals": hospitals_data,
            "reservoirs": reservoirs_data,
            "pump_stations": pump_stations_data,
            "trucks": [
                {
                    "id": t.id,
                    "name": t.name,
                    "capacity_kg": t.capacity_kg,
                    "current_load_kg": t.current_load_kg,
                    "current_zone": t.current_zone(),
                }
                for t in ctrl.waste.trucks
            ],
        })

    def _execute_step(self) -> Dict[str, Any]:
        """Advance simulation by 1 step internally and return record."""
        ctrl = self.server_controller
        step = len(ctrl.time_series)

        traffic_data = ctrl.traffic.update(step)
        energy_data = ctrl.energy.update(step)
        waste_data = ctrl.waste.update(step)
        env_data = ctrl.environment.update(
            step=step,
            traffic_congestion=traffic_data["traffic_congestion"],
            total_vehicles=traffic_data["total_vehicles"],
            non_renewable_mw=energy_data["non_renewable_mw"],
        )
        water_data = ctrl.water.update(step)
        emergency_data = ctrl.emergency.update(
            step=step,
            traffic_congestion=traffic_data["traffic_congestion"],
        )

        record = {
            "step": step,
            "hour_of_day": step % 24,
            "traffic_congestion": traffic_data["traffic_congestion"],
            "total_vehicles": traffic_data["total_vehicles"],
            "rerouted_vehicles": traffic_data["rerouted_vehicles"],
            "congested_roads": traffic_data["congested_roads"],
            "odd_even_active": 1 if ctrl.active_policies["odd_even_rule"] else 0,
            "green_wave_active": 1 if ctrl.active_policies["emergency_green_wave"] else 0,
            "energy_usage": energy_data["energy_usage"],
            "energy_supply": energy_data["energy_supply"],
            "renewable_mw": energy_data["renewable_mw"],
            "non_renewable_mw": energy_data["non_renewable_mw"],
            "emissions_kg": energy_data["emissions_kg"],
            "blackout": 1 if energy_data["blackout"] else 0,
            "total_waste_kg": waste_data["total_waste_kg"],
            "collected_waste_kg": waste_data["collected_waste_kg"],
            "overflow_bins": waste_data["overflow_bins"],
            "aqi": env_data["aqi"],
            "high_pollution": 1 if env_data["high_pollution"] else 0,
            "severity": env_data["severity"],
            "water_consumption_kl": water_data["water_consumption_kl"],
            "water_demand_kl": water_data["water_demand_kl"],
            "water_deficit_kl": water_data["water_deficit_kl"],
            "reservoir_level_pct": water_data["reservoir_level_pct"],
            "drainage_overflows": water_data["drainage_overflows"],
            "avg_drainage_load_pct": water_data["avg_drainage_load_pct"],
            "water_rationing_active": 1 if ctrl.active_policies["water_rationing_rule"] else 0,
            "emergency_incidents": emergency_data["emergency_incidents"],
            "critical_incidents": emergency_data["critical_incidents"],
            "avg_response_time_min": emergency_data["avg_response_time_min"],
            "avg_hospital_occupancy": emergency_data["avg_hospital_occupancy"],
            "overloaded_hospitals": emergency_data["overloaded_hospitals"],
        }
        ctrl.time_series.append(record)
        return record

    def handle_post_step(self) -> None:
        """Advance simulation by 1 step (hour) and return result."""
        ctrl = self.server_controller
        if not ctrl:
            self._send_json({"error": "Controller not initialized"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        record = self._execute_step()
        self._send_json({
            "success": True,
            "record": record,
            "total_steps": len(ctrl.time_series),
            "recent_events": self.recent_events[-5:],
        })

    def handle_post_run(self, steps: int) -> None:
        """Advance multiple steps in one batch and return consolidated status."""
        ctrl = self.server_controller
        if not ctrl:
            self._send_json({"error": "Controller not initialized"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        records = []
        for _ in range(steps):
            records.append(self._execute_step())

        self._send_json({
            "success": True,
            "steps_executed": len(records),
            "total_steps": len(ctrl.time_series),
            "latest_record": records[-1] if records else {},
            "recent_events": self.recent_events[-5:],
        })

    def handle_post_policy(self, policy: Optional[str], active: bool) -> None:
        ctrl = self.server_controller
        if not ctrl or not policy:
            self._send_json({"error": "Invalid policy"}, status=HTTPStatus.BAD_REQUEST)
            return

        if policy == "odd_even_rule":
            ctrl.active_policies["odd_even_rule"] = active
            ctrl.traffic.set_odd_even(active)
        elif policy == "curtail_nonrenewable":
            ctrl.active_policies["curtail_nonrenewable"] = active
            ctrl.energy.set_curtail_nonrenewable(active)
        elif policy == "water_rationing_rule":
            ctrl.active_policies["water_rationing_rule"] = active
            ctrl.water.set_rationing(active)
        elif policy == "emergency_green_wave":
            ctrl.active_policies["emergency_green_wave"] = active
            ctrl.traffic.set_green_wave(active)
            ctrl.emergency.set_green_wave(active)

        self._send_json({"success": True, "active_policies": ctrl.active_policies})


def start_server(port: int = 8000, zones: int = 3, seed: Optional[int] = None) -> None:
    """Start the smart city simulation web server."""
    CitySimulatorAPIHandler.setup_controller(zones=zones, seed=seed)
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, CitySimulatorAPIHandler)
    print(f"\n==================================================================")
    print(f"🌐 Smart City Web Dashboard is live at: http://localhost:{port}")
    print(f"   Press Ctrl+C in terminal to stop the server.")
    print(f"==================================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down web server...")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    start_server(port=8000)
