"""Unit test suite for the Mini Smart City Simulator subsystems.

Uses pytest to validate core subsystem logic, design patterns (Observer,
Strategy, Singleton), emergent behaviors, and exception handling.
"""

from pathlib import Path
import pytest

from smart_city_simulator.exceptions import (
    InvalidConfigError,
    ZeroPopulationZoneError,
)
from smart_city_simulator.city.base import BaseSubsystem
from smart_city_simulator.city.event_bus import EventBus
from smart_city_simulator.city.traffic import (
    Zone,
    Road,
    Vehicle,
    Intersection,
    TrafficLightState,
    TrafficManagementSystem,
    StaticRoutingStrategy,
    DynamicCongestionReroutingStrategy,
    TrafficCongestionEvent,
)
from smart_city_simulator.city.energy import (
    PowerPlant,
    PlantType,
    Building,
    BuildingType,
    SmartEnergyGrid,
    BlackoutEvent,
)
from smart_city_simulator.city.waste import (
    WasteBin,
    GarbageTruck,
    WasteManagementSystem,
    WasteOverflowEvent,
)
from smart_city_simulator.city.environment import (
    EnvironmentMonitor,
    PollutionAlertEvent,
    PolicyChangeEvent,
)
from smart_city_simulator.city.controller import CityController
from smart_city_simulator.utils.logger import SimulationLogger


@pytest.fixture(autouse=True)
def clean_singletons():
    """Ensure EventBus and CityController state are fresh for every test."""
    EventBus().clear()
    CityController.reset_instance()
    yield
    EventBus().clear()
    CityController.reset_instance()


# ===========================================================================
# 1. Traffic Subsystem Tests
# ===========================================================================

def test_zone_zero_population_raises_error():
    """Ensure zones with non-positive population raise ZeroPopulationZoneError."""
    with pytest.raises(ZeroPopulationZoneError):
        Zone(id=1, name="GhostTown", population=0)

    with pytest.raises(ZeroPopulationZoneError):
        Zone(id=2, name="NegativeTown", population=-500)


def test_traffic_light_state_machine():
    """Verify traffic light cycles GREEN -> YELLOW -> RED -> GREEN."""
    light = Intersection(
        id="INT-1",
        name="Main Cross",
        zone_id=0,
        connected_road_ids=["R1", "R2"],
        state=TrafficLightState.GREEN,
        green_duration=2,
        yellow_duration=1,
        red_duration=2,
    )

    # Step 1: Green timer 1
    light.tick()
    assert light.state == TrafficLightState.GREEN

    # Step 2: Green reaches duration 2 -> transitions to YELLOW
    light.tick()
    assert light.state == TrafficLightState.YELLOW

    # Step 3: Yellow reaches duration 1 -> transitions to RED
    light.tick()
    assert light.state == TrafficLightState.RED

    # Step 4 & 5: Red duration 2 -> transitions back to GREEN
    light.tick()
    assert light.state == TrafficLightState.RED
    light.tick()
    assert light.state == TrafficLightState.GREEN


def test_traffic_odd_even_policy_reduces_vehicles():
    """Verify that odd-even restriction filters approximately 50% of vehicles."""
    zones = [Zone(id=0, population=2000)]
    traffic = TrafficManagementSystem(zones=zones, odd_even_active=False)

    # Standard run without restriction
    unrestricted_metrics = traffic.update(step=0)
    unrestricted_vehicles = unrestricted_metrics["total_vehicles"]

    # Activate odd-even policy
    traffic.set_odd_even(True)
    restricted_metrics = traffic.update(step=1)
    restricted_vehicles = restricted_metrics["total_vehicles"]

    assert restricted_vehicles < unrestricted_vehicles
    # Ratio should be roughly halved (+/- fluctuation)
    assert 0.35 <= (restricted_vehicles / unrestricted_vehicles) <= 0.65


def test_dynamic_rerouting_strategy():
    """Verify Strategy Pattern: Dynamic strategy reroutes from congested to empty road."""
    roads = {
        "R-1": Road(id="R-1", name="Arterial", zone_id=0, capacity=10, current_vehicles=8),
        "R-2": Road(id="R-2", name="Bypass", zone_id=0, capacity=20, current_vehicles=0),
    }
    vehicles = [Vehicle(id="V-1", zone_id=0, is_odd_plate=True, assigned_road="R-1")]

    # Baseline Static Routing: adds vehicle to congested R-1
    static_strat = StaticRoutingStrategy()
    static_rerouted = static_strat.route_vehicles(vehicles, roads, {})
    assert static_rerouted == 0
    assert roads["R-1"].current_vehicles == 9

    # Reset road vehicle counts
    roads["R-1"].current_vehicles = 8
    roads["R-2"].current_vehicles = 0
    vehicles[0].assigned_road = "R-1"

    # Dynamic Congestion Aware Strategy: R-1 congestion = 8/10 = 0.80 >= 0.70 threshold
    dyn_strat = DynamicCongestionReroutingStrategy(congestion_threshold=0.70)
    dyn_rerouted = dyn_strat.route_vehicles(vehicles, roads, {})
    assert dyn_rerouted == 1
    assert vehicles[0].assigned_road == "R-2"
    assert roads["R-2"].current_vehicles == 1


# ===========================================================================
# 2. Energy Grid Subsystem Tests
# ===========================================================================

def test_energy_load_balancing_renewable_priority():
    """Verify renewable power is dispatched first before fossil plants."""
    zones = [Zone(id=0, population=1500)]
    grid = SmartEnergyGrid(zones=zones)

    # Step at noon (step 12 = 12:00, high solar)
    metrics = grid.update(step=12)
    assert metrics["energy_usage"] > 0
    assert metrics["renewable_mw"] > 0
    assert metrics["energy_supply"] >= metrics["energy_usage"]
    assert metrics["blackout"] == 0 or metrics["blackout"] is False


def test_energy_blackout_event_emission():
    """Verify blackout event is fired when building demand exceeds plant capacity."""
    zones = [Zone(id=0, population=1000)]
    grid = SmartEnergyGrid(zones=zones)

    # Artificially inflate demand
    for building in grid.buildings:
        building.base_demand_mw = 10000.0

    blackout_events = []
    EventBus().subscribe(BlackoutEvent, lambda evt: blackout_events.append(evt))

    metrics = grid.update(step=0)
    assert metrics["blackout"] is True or metrics["blackout"] == 1
    assert len(blackout_events) == 1
    assert blackout_events[0].deficit_mw > 0


# ===========================================================================
# 3. Waste Management Subsystem Tests
# ===========================================================================

def test_waste_truck_collection_cycle():
    """Verify garbage trucks collect waste and reduce bin loads."""
    zones = [Zone(id=0, population=1000)]
    waste_sys = WasteManagementSystem(zones=zones)
    bin_ = waste_sys.bins[0]
    bin_.add_waste(300.0)

    initial_load = bin_.current_load_kg
    metrics = waste_sys.update(step=0)

    # Truck should have serviced Zone 0 and collected waste
    assert metrics["collected_waste_kg"] > 0
    assert bin_.current_load_kg < initial_load + metrics["total_waste_kg"]


def test_waste_overflow_event_published():
    """Verify bin overflow triggers WasteOverflowEvent when bins exceed capacity."""
    zones = [Zone(id=0, population=1000)]
    waste_sys = WasteManagementSystem(zones=zones)
    bin_ = waste_sys.bins[0]
    bin_.capacity_kg = 100.0
    bin_.current_load_kg = 150.0  # Force overflow

    # Fill the trucks so they cannot collect this step
    for truck in waste_sys.trucks:
        truck.current_load_kg = truck.capacity_kg

    overflow_events = []
    EventBus().subscribe(WasteOverflowEvent, lambda evt: overflow_events.append(evt))

    metrics = waste_sys.update(step=1)
    assert metrics["overflow_bins"] >= 1
    assert len(overflow_events) >= 1
    assert overflow_events[0].bin_id == bin_.id


# ===========================================================================
# 4. Environment Monitor Subsystem Tests
# ===========================================================================

def test_environment_aqi_and_alert_trigger():
    """Verify AQI calculation and alert event when pollution crosses threshold."""
    monitor = EnvironmentMonitor(alert_threshold=100.0)
    alerts = []
    EventBus().subscribe(PollutionAlertEvent, lambda evt: alerts.append(evt))

    # Low activity -> Good air quality
    low_metrics = monitor.update(step=0, traffic_congestion=0.1, total_vehicles=50, non_renewable_mw=0.5)
    assert low_metrics["aqi"] < 80.0
    assert low_metrics["high_pollution"] is False

    # Extreme activity -> Unhealthy air quality triggering alert
    high_metrics = monitor.update(step=1, traffic_congestion=0.95, total_vehicles=2000, non_renewable_mw=15.0)
    assert high_metrics["aqi"] >= 100.0
    assert high_metrics["high_pollution"] is True
    assert len(alerts) == 2
    assert alerts[1].high_pollution is True


# ===========================================================================
# 5. City Controller & Emergent Behavior Tests (Observer + Singleton)
# ===========================================================================

def test_controller_singleton_pattern():
    """Verify CityController maintains only one singleton instance."""
    c1 = CityController(zones=2)
    c2 = CityController(zones=2)
    assert c1 is c2

    # Verify reset_instance allows fresh creation
    CityController.reset_instance()
    c3 = CityController(zones=3)
    assert c3 is not c1
    assert len(c3.zones) == 3


def test_controller_emergent_policy_activation():
    """Verify emergent behavior: pollution alert triggers odd-even rule & power curtailment."""
    controller = CityController(zones=2, alert_threshold=100.0)

    assert controller.active_policies["odd_even_rule"] is False
    assert controller.traffic.odd_even_active is False

    # Simulate pollution spike event via EventBus
    event_bus = EventBus()
    event_bus.publish(
        PollutionAlertEvent(
            timestamp=5,
            aqi=125.0,
            high_pollution=True,
            severity="UNHEALTHY",
        )
    )

    # Controller should have automatically enacted emergency policies!
    assert controller.active_policies["odd_even_rule"] is True
    assert controller.traffic.odd_even_active is True
    assert controller.energy.curtail_nonrenewable is True

    # Simulate clearing event
    event_bus.publish(
        PollutionAlertEvent(
            timestamp=10,
            aqi=70.0,
            high_pollution=False,
            severity="GOOD",
        )
    )

    # Controller lifts restriction
    assert controller.active_policies["odd_even_rule"] is False
    assert controller.traffic.odd_even_active is False
    assert controller.energy.curtail_nonrenewable is False


def test_invalid_config_errors():
    """Verify invalid simulation inputs raise InvalidConfigError."""
    with pytest.raises(InvalidConfigError):
        CityController(zones=0)

    controller = CityController(zones=2)
    with pytest.raises(InvalidConfigError):
        controller.run_simulation(total_steps=0)


def test_logger_file_output(tmp_path: Path):
    """Verify SimulationLogger creates CSV and JSON files with proper headers and data."""
    csv_file = tmp_path / "test_log.csv"
    json_file = tmp_path / "test_log.json"
    logger = SimulationLogger(log_path=csv_file, json_path=json_file)

    sample_metrics = {
        "step": 0,
        "hour_of_day": 0,
        "traffic_congestion": 0.35,
        "total_vehicles": 120,
        "rerouted_vehicles": 5,
        "congested_roads": 0,
        "odd_even_active": 0,
        "energy_usage": 5.2,
        "energy_supply": 5.2,
        "renewable_mw": 3.0,
        "non_renewable_mw": 2.2,
        "emissions_kg": 990.0,
        "blackout": 0,
        "total_waste_kg": 50.0,
        "collected_waste_kg": 50.0,
        "overflow_bins": 0,
        "aqi": 42.0,
        "high_pollution": 0,
        "severity": "GOOD",
    }

    logger.log(0, sample_metrics)

    assert csv_file.exists()
    content = csv_file.read_text(encoding="utf-8")
    assert "traffic_congestion" in content
    assert "0.35" in content

    assert json_file.exists()
    json_content = json_file.read_text(encoding="utf-8")
    assert '"traffic_congestion": 0.35' in json_content
