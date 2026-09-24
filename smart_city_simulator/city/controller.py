"""City Controller Subsystem.

Acts as the central Singleton orchestrator tying all city subsystems together,
executing the simulation loop, reacting to events via the Observer pattern,
and managing emergent policy decisions.
"""

from __future__ import annotations

import random
import threading
from typing import Any, Dict, List, Optional

from .base import BaseSubsystem
from .traffic import (
    Zone,
    TrafficManagementSystem,
    DynamicCongestionReroutingStrategy,
    TrafficCongestionEvent,
)
from .energy import SmartEnergyGrid, BlackoutEvent
from .waste import WasteManagementSystem, WasteOverflowEvent
from .environment import (
    EnvironmentMonitor,
    PollutionAlertEvent,
    PolicyChangeEvent,
)
from .water import (
    WaterManagementSystem,
    WaterDeficitEvent,
    DrainageOverflowEvent,
)
from .emergency import (
    EmergencyServicesSystem,
    EmergencyCorridorEvent,
    HospitalOverloadEvent,
)
from .transit import (
    PublicTransportSystem,
    TransitDelayEvent,
)
from .concurrency import (
    traffic_event_generator,
    electricity_event_generator,
    water_event_generator,
    emergency_event_generator,
    waste_event_generator,
    transit_event_generator,
    EventStreamIterator,
    EventPipeline,
    ConcurrentCityEngine,
)
from .event_bus import EventBus, Event
from ..exceptions import InvalidConfigError, ZeroPopulationZoneError


class CityController:
    """Central Singleton orchestrator for the Smart City Simulation."""

    _instance: Optional[CityController] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs) -> CityController:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (primarily for clean test isolation)."""
        with cls._lock:
            cls._instance = None

    def __init__(
        self,
        zones: int = 3,
        zone_population: Optional[int] = None,
        logger: Any = None,
        visualizer: Any = None,
        alert_threshold: float = 110.0,
    ) -> None:
        # Guard against re-initialization if already initialized
        if getattr(self, "_initialized", False):
            return

        if zones <= 0:
            raise InvalidConfigError(f"Number of zones must be positive integer, got: {zones}")

        self.logger = logger
        self.visualizer = visualizer
        self.time_series: List[Dict[str, Any]] = []
        self._event_bus = EventBus()
        self.active_policies: Dict[str, bool] = {
            "odd_even_rule": False,
            "curtail_nonrenewable": False,
            "water_rationing_rule": False,
            "emergency_green_wave": False,
        }

        # Create city zones
        self.zones: List[Zone] = []
        for i in range(zones):
            pop = zone_population if zone_population is not None else random.randint(1200, 2400)
            if pop <= 0:
                raise ZeroPopulationZoneError(
                    f"Zone index {i} received non-positive population: {pop}."
                )
            self.zones.append(Zone(id=i, name=f"District-{i + 1}", population=pop))

        # Instantiate subsystems implementing BaseSubsystem
        self.traffic = TrafficManagementSystem(
            zones=self.zones,
            strategy=DynamicCongestionReroutingStrategy(congestion_threshold=0.70),
        )
        self.energy = SmartEnergyGrid(zones=self.zones)
        self.waste = WasteManagementSystem(zones=self.zones)
        self.environment = EnvironmentMonitor(alert_threshold=alert_threshold)
        self.water = WaterManagementSystem(zones=self.zones)
        self.emergency = EmergencyServicesSystem(zones=self.zones)
        self.transit = PublicTransportSystem(zones=self.zones)

        self.subsystems: List[BaseSubsystem] = [
            self.traffic,
            self.energy,
            self.waste,
            self.environment,
            self.water,
            self.emergency,
            self.transit,
        ]

        # Register event observers for emergent behaviors
        self._event_bus.subscribe(PollutionAlertEvent, self._handle_pollution_event)
        self._event_bus.subscribe(BlackoutEvent, self._handle_blackout_event)
        self._event_bus.subscribe(WasteOverflowEvent, self._handle_waste_event)
        self._event_bus.subscribe(WaterDeficitEvent, self._handle_water_event)
        self._event_bus.subscribe(EmergencyCorridorEvent, self._handle_emergency_corridor_event)
        self._event_bus.subscribe(HospitalOverloadEvent, self._handle_hospital_overload_event)
        self._event_bus.subscribe(TransitDelayEvent, self._handle_transit_delay_event)

        # Concurrency Engine (CO-5)
        self.concurrent_engine = ConcurrentCityEngine(self)

        self._initialized = True

    # ---------------------------------------------------------------------
    # Observer Event Handlers (Smart Decision Rules)
    # ---------------------------------------------------------------------

    def _handle_pollution_event(self, event: PollutionAlertEvent) -> None:
        """Emergent Policy: High pollution triggers Odd-Even traffic rule and non-renewable energy curtailment."""
        if event.high_pollution and not self.active_policies["odd_even_rule"]:
            self.active_policies["odd_even_rule"] = True
            self.active_policies["curtail_nonrenewable"] = True
            self.traffic.set_odd_even(True)
            self.energy.set_curtail_nonrenewable(True)

            msg = (
                f"[Step {event.timestamp:02d}] ⚠️ EMERGENT POLICY ACTIVATION: "
                f"AQI reached {event.aqi:.1f} ({event.severity}). "
                f"Activated 'Odd-Even Vehicle Restriction' & 'Fossil Power Curtailment'."
            )
            print(msg)
            self._event_bus.publish(
                PolicyChangeEvent(
                    timestamp=event.timestamp,
                    policy_name="Odd-Even Rule & Clean Power Curtailment",
                    status="ACTIVATED",
                    trigger_reason=f"AQI threshold exceeded: {event.aqi:.1f}",
                    message=msg,
                )
            )

        elif (
            not event.high_pollution
            and event.aqi < EnvironmentMonitor.AQI_CLEAR_THRESHOLD
            and self.active_policies["odd_even_rule"]
        ):
            self.active_policies["odd_even_rule"] = False
            self.active_policies["curtail_nonrenewable"] = False
            self.traffic.set_odd_even(False)
            self.energy.set_curtail_nonrenewable(False)

            msg = (
                f"[Step {event.timestamp:02d}] 🍃 POLICY DEACTIVATION: "
                f"AQI returned to safe levels ({event.aqi:.1f}). "
                f"Lifted 'Odd-Even Vehicle Restriction'."
            )
            print(msg)
            self._event_bus.publish(
                PolicyChangeEvent(
                    timestamp=event.timestamp,
                    policy_name="Odd-Even Rule & Clean Power Curtailment",
                    status="DEACTIVATED",
                    trigger_reason=f"AQI dropped to safe level: {event.aqi:.1f}",
                    message=msg,
                )
            )

    def _handle_water_event(self, event: WaterDeficitEvent) -> None:
        """Emergent Policy: Low reservoir activates municipal water rationing."""
        if event.reservoir_level_pct < 25.0 and not self.active_policies["water_rationing_rule"]:
            self.active_policies["water_rationing_rule"] = True
            self.water.set_rationing(True)
            print(f"[Step {event.timestamp:02d}] 💧 WATER RATIONING ACTIVATED (Reserves: {event.reservoir_level_pct:.1f}%).")
        elif event.reservoir_level_pct > 50.0 and self.active_policies["water_rationing_rule"]:
            self.active_policies["water_rationing_rule"] = False
            self.water.set_rationing(False)
            print(f"[Step {event.timestamp:02d}] 🚰 WATER RATIONING LIFTED (Reserves: {event.reservoir_level_pct:.1f}%).")

    def _handle_emergency_corridor_event(self, event: EmergencyCorridorEvent) -> None:
        """Emergent Policy: Critical EMS dispatches trigger Green-Wave Corridor."""
        if not self.active_policies["emergency_green_wave"]:
            self.active_policies["emergency_green_wave"] = True
            self.traffic.set_green_wave(True)
            self.emergency.set_green_wave(True)
            print(f"[Step {event.timestamp:02d}] 🚑 GREEN WAVE ACTIVATED: Priority corridor cleared for EMS {event.incident_id}.")

    def _handle_hospital_overload_event(self, event: HospitalOverloadEvent) -> None:
        if event.timestamp % 6 == 0:
            print(f"[Step {event.timestamp:02d}] 🏥 {event.message}")

    def _handle_blackout_event(self, event: BlackoutEvent) -> None:
        print(f"[Step {event.timestamp:02d}] ⚡ {event.message}")

    def _handle_waste_event(self, event: WasteOverflowEvent) -> None:
        if event.timestamp % 12 == 0:
            print(f"[Step {event.timestamp:02d}] 🗑️ {event.message}")

    def _handle_transit_delay_event(self, event: TransitDelayEvent) -> None:
        if event.timestamp % 12 == 0:
            print(f"[Step {event.timestamp:02d}] 🚌 {event.message}")

    # ---------------------------------------------------------------------
    # CO-3 & CO-4: Stream Generators & Iterator Pipelines
    # ---------------------------------------------------------------------

    def get_event_stream_iterators(self) -> Dict[str, EventStreamIterator]:
        """Return memory-efficient Iterator objects wrapping generator streams (CO-3 & CO-4)."""
        return {
            "Traffic": EventStreamIterator(traffic_event_generator(self.traffic)),
            "Electricity": EventStreamIterator(electricity_event_generator(self.energy)),
            "Water": EventStreamIterator(water_event_generator(self.water)),
            "Emergency": EventStreamIterator(emergency_event_generator(self.emergency)),
            "Waste": EventStreamIterator(waste_event_generator(self.waste)),
            "Transit": EventStreamIterator(transit_event_generator(self.transit)),
        }

    # ---------------------------------------------------------------------
    # Simulation Loop
    # ---------------------------------------------------------------------

    def step(self, step_idx: int) -> Dict[str, Any]:
        """Execute a single discrete simulation step across all subsystems."""
        step = step_idx
        # 1. Update Traffic Subsystem
        traffic_data = self.traffic.update(step)

        # 2. Update Energy Grid Subsystem
        energy_data = self.energy.update(step)

        # 3. Update Waste Subsystem
        waste_data = self.waste.update(step)

        # 4. Update Environmental Monitor
        env_data = self.environment.update(
            step=step,
            traffic_congestion=traffic_data["traffic_congestion"],
            total_vehicles=traffic_data["total_vehicles"],
            non_renewable_mw=energy_data["non_renewable_mw"],
        )

        # 5. Update Water Management Subsystem
        water_data = self.water.update(step)

        # 6. Update Emergency Services Subsystem
        emergency_data = self.emergency.update(
            step=step,
            traffic_congestion=traffic_data["traffic_congestion"],
        )

        # 7. Update Public Transport Subsystem
        transit_data = self.transit.update(
            step=step,
            traffic_congestion=traffic_data["traffic_congestion"],
        )

        # Deactivate single-step green wave corridor if no active critical emergency
        if self.active_policies["emergency_green_wave"] and emergency_data["critical_incidents"] == 0:
            self.active_policies["emergency_green_wave"] = False
            self.traffic.set_green_wave(False)
            self.emergency.set_green_wave(False)

        # Compile consolidated step snapshot
        step_record: Dict[str, Any] = {
            "step": step,
            "hour_of_day": step % 24,
            "traffic_congestion": traffic_data["traffic_congestion"],
            "total_vehicles": traffic_data["total_vehicles"],
            "rerouted_vehicles": traffic_data["rerouted_vehicles"],
            "congested_roads": traffic_data["congested_roads"],
            "odd_even_active": 1 if self.active_policies["odd_even_rule"] else 0,
            "green_wave_active": 1 if self.active_policies["emergency_green_wave"] else 0,
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
            "water_rationing_active": 1 if self.active_policies["water_rationing_rule"] else 0,
            "emergency_incidents": emergency_data["emergency_incidents"],
            "critical_incidents": emergency_data["critical_incidents"],
            "avg_response_time_min": emergency_data["avg_response_time_min"],
            "avg_hospital_occupancy": emergency_data["avg_hospital_occupancy"],
            "overloaded_hospitals": emergency_data["overloaded_hospitals"],
            "delayed_transit_routes": transit_data["delayed_routes"],
            "avg_transit_delay_min": transit_data["avg_transit_delay_min"],
            "on_time_performance_pct": transit_data["on_time_performance_pct"],
        }

        self.time_series.append(step_record)
        if self.logger:
            self.logger.log(step, step_record)

        return step_record

    def run_simulation(self, total_steps: int = 48) -> List[Dict[str, Any]]:
        """Run the simulation loop for a specified number of time steps.

        Args:
            total_steps: Number of discrete hours/steps to simulate.

        Returns:
            List[Dict[str, Any]]: Complete recorded time series data.
        """
        if total_steps <= 0:
            raise InvalidConfigError(f"Simulation total_steps must be > 0, got: {total_steps}")

        print(f"\n=======================================================")
        print(f"🚀 Starting Mini Smart City Simulator ({total_steps} steps, {len(self.zones)} zones)")
        print(f"=======================================================\n")

        for step in range(total_steps):
            self.step(step_idx=step)

        print("\n✅ Simulation successfully finished.")
        return self.time_series

