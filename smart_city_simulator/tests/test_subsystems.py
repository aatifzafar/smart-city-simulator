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
from smart_city_simulator.city.water import (
    WaterReservoir,
    DrainagePumpStation,
    WaterManagementSystem,
    WaterDeficitEvent,
    DrainageOverflowEvent,
)
from smart_city_simulator.city.emergency import (
    Hospital,
    EmergencyIncident,
    IncidentSeverity,
    EmergencyServicesSystem,
    EmergencyCorridorEvent,
    HospitalOverloadEvent,
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
    zones = [Zone(id=0, name="Central", population=1000)]
    traffic = TrafficManagementSystem(zones=zones, odd_even_active=False)

    data_normal = traffic.update(step=0)
    normal_vehicles = data_normal["total_vehicles"]
    assert normal_vehicles > 0

    # Activate odd-even policy
    traffic.set_odd_even(True)
    data_restricted = traffic.update(step=0)
    restricted_vehicles = data_restricted["total_vehicles"]

    # Restricted volume should be significantly lower (around ~50%)
    assert restricted_vehicles < normal_vehicles


def test_traffic_rerouting_strategy_swapping():
    """Verify Strategy pattern enables runtime swapping of routing logic."""
    zones = [Zone(id=0, name="Central", population=1000)]
    traffic = TrafficManagementSystem(zones=zones)

    # Inject static strategy
    traffic.set_strategy(StaticRoutingStrategy())
    assert isinstance(traffic.strategy, StaticRoutingStrategy)

    vehicles = [Vehicle(id="V-1", zone_id=0, is_odd_plate=True, assigned_road="R-1")]
    roads = {
        "R-1": Road(id="R-1", name="Arterial", zone_id=0, capacity=10, current_vehicles=10),
        "R-2": Road(id="R-2", name="Bypass", zone_id=0, capacity=10, current_vehicles=0),
    }
    intersections = {}
    rerouted = traffic.strategy.route_vehicles(vehicles, roads, intersections)
    assert rerouted == 0  # Static never reroutes

    # Switch to dynamic strategy
    traffic.set_strategy(DynamicCongestionReroutingStrategy(congestion_threshold=0.5))
    assert isinstance(traffic.strategy, DynamicCongestionReroutingStrategy)
    rerouted = traffic.strategy.route_vehicles(vehicles, roads, intersections)
    assert rerouted == 1  # Dynamic rerouted over-saturated road


# ===========================================================================
# 2. Energy Grid Subsystem Tests
# ===========================================================================

def test_energy_merit_order_prioritizes_renewables():
    """Verify clean renewables are dispatched first before conventional gas/coal."""
    zones = [Zone(id=0, name="Zone1", population=1000)]
    grid = SmartEnergyGrid(zones=zones)

    # Step at noon (12:00) when solar generation is at maximum
    data = grid.update(step=12)
    assert data["renewable_mw"] > 0
    assert data["energy_supply"] >= data["energy_usage"]


def test_energy_curtailment_policy():
    """Verify non-renewable peaker plants are capped during curtailment."""
    zones = [Zone(id=0, name="Zone1", population=2000)]
    grid = SmartEnergyGrid(zones=zones)

    # Step at 20:00 (evening demand spike when solar is 0)
    grid.set_curtail_nonrenewable(False)
    data_normal = grid.update(step=20)

    grid.set_curtail_nonrenewable(True)
    data_curtailed = grid.update(step=20)

    # Non-renewable output and emissions should be reduced
    assert data_curtailed["non_renewable_mw"] <= data_normal["non_renewable_mw"]
    assert data_curtailed["emissions_kg"] <= data_normal["emissions_kg"]


# ===========================================================================
# 3. Waste Management Subsystem Tests
# ===========================================================================

def test_waste_truck_collection_cycle():
    """Verify trucks collect refuse from full bins and empty them at depots."""
    zones = [Zone(id=0, name="Zone1", population=1000)]
    waste_sys = WasteManagementSystem(zones=zones)

    # Fill bin artificially
    bin_unit = waste_sys.bins[0]
    bin_unit.current_load_kg = bin_unit.capacity_kg * 0.95

    # Run step -> truck should collect waste
    data = waste_sys.update(step=0)
    assert data["collected_waste_kg"] > 0


# ===========================================================================
# 4. Environmental Subsystem & Observer Pattern Tests
# ===========================================================================

def test_environmental_aqi_scaling_and_events():
    """Verify AQI increases with road traffic emissions and emits PollutionAlertEvent."""
    env = EnvironmentMonitor(alert_threshold=100.0)
    event_bus = EventBus()
    received_events = []

    def on_pollution(event: PollutionAlertEvent):
        received_events.append(event)

    event_bus.subscribe(PollutionAlertEvent, on_pollution)

    # High traffic and heavy non-renewable generation -> AQI crosses threshold
    data = env.update(
        step=1,
        traffic_congestion=0.95,
        total_vehicles=800,
        non_renewable_mw=15.0,
    )

    assert data["aqi"] > 100.0
    assert data["high_pollution"] is True
    assert len(received_events) == 1
    assert received_events[0].severity in ["UNHEALTHY", "HAZARDOUS"]


# ===========================================================================
# 5. Smart Water & Drainage Subsystem Tests
# ===========================================================================

def test_water_subsystem_consumption_and_replenishment():
    """Verify water diurnal consumption and reservoir tracking."""
    zones = [Zone(id=0, name="Zone1", population=1000)]
    water_sys = WaterManagementSystem(zones=zones)

    res = water_sys.reservoirs[0]
    initial_level = res.current_level_kl

    # Step at morning peak (hour 8)
    data = water_sys.update(step=8)
    assert data["water_consumption_kl"] > 0
    assert data["reservoir_level_pct"] > 0


def test_water_rationing_policy_reduces_consumption():
    """Verify water rationing rule reduces gross demand by ~35%."""
    zones = [Zone(id=0, name="Zone1", population=1000)]
    water_sys = WaterManagementSystem(zones=zones)

    water_sys.set_rationing(False)
    data_normal = water_sys.update(step=8)

    water_sys.set_rationing(True)
    data_rationed = water_sys.update(step=8)

    assert data_rationed["water_demand_kl"] < data_normal["water_demand_kl"]


def test_water_deficit_event_emitted():
    """Verify WaterDeficitEvent is published when reservoir drops below 20%."""
    zones = [Zone(id=0, name="Zone1", population=1000)]
    water_sys = WaterManagementSystem(zones=zones)
    event_bus = EventBus()
    events = []

    event_bus.subscribe(WaterDeficitEvent, lambda e: events.append(e))

    # Artificially deplete reservoir
    water_sys.reservoirs[0].current_level_kl = water_sys.reservoirs[0].capacity_kl * 0.10
    water_sys.update(step=1)

    assert len(events) >= 1
    assert events[0].reservoir_level_pct < 20.0


def test_drainage_pump_flood_detection():
    """Verify drainage pumps track saturation and detect flood conditions."""
    zones = [Zone(id=0, name="Zone1", population=1000)]
    water_sys = WaterManagementSystem(zones=zones)

    data = water_sys.update(step=14)  # Hour 14 has rain surge
    assert "avg_drainage_load_pct" in data
    assert data["avg_drainage_load_pct"] > 0


# ===========================================================================
# 6. Emergency Services Subsystem Tests
# ===========================================================================

def test_emergency_response_time_scales_with_traffic():
    """Verify emergency response time dynamically worsens under high traffic congestion."""
    zones = [Zone(id=0, name="Zone1", population=2000)]
    ems = EmergencyServicesSystem(zones=zones)

    # Low congestion
    data_low = ems.update(step=0, traffic_congestion=0.1)

    # High congestion
    data_high = ems.update(step=1, traffic_congestion=0.9)

    assert data_high["avg_response_time_min"] > data_low["avg_response_time_min"]


def test_emergency_green_wave_corridor():
    """Verify Green Wave corridor policy improves response times during congestion."""
    zones = [Zone(id=0, name="Zone1", population=2000)]
    ems = EmergencyServicesSystem(zones=zones)

    ems.set_green_wave(False)
    data_no_gw = ems.update(step=0, traffic_congestion=0.8)

    ems.set_green_wave(True)
    data_gw = ems.update(step=1, traffic_congestion=0.8)

    assert data_gw["avg_response_time_min"] < data_no_gw["avg_response_time_min"]


def test_hospital_capacity_tracking():
    """Verify hospital beds and ICU capacities are tracked."""
    zones = [Zone(id=0, name="Zone1", population=2000)]
    ems = EmergencyServicesSystem(zones=zones)

    status = ems.get_status()
    assert status["total_hospitals"] == 1
    assert status["avg_hospital_occupancy"] > 0


# ===========================================================================
# 7. City Controller & Emergent Multi-Subsystem Interactions
# ===========================================================================

def test_city_controller_emergent_policy_lifecycle():
    """Verify emergent behavior: pollution alert triggers odd-even rule & power curtailment."""
    controller = CityController(zones=2)
    event_bus = EventBus()

    assert controller.active_policies["odd_even_rule"] is False
    assert controller.traffic.odd_even_active is False

    # Simulate emergent pollution event (UNHEALTHY)
    event_bus.publish(
        PollutionAlertEvent(
            timestamp=5,
            aqi=125.0,
            high_pollution=True,
            severity="UNHEALTHY",
        )
    )

    # Controller automatically applies restrictions
    assert controller.active_policies["odd_even_rule"] is True
    assert controller.traffic.odd_even_active is True
    assert controller.energy.curtail_nonrenewable is True

    # Simulate air clearing event (GOOD)
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


def test_city_controller_water_rationing_lifecycle():
    """Verify emergent behavior: low reservoir triggers water rationing rule."""
    controller = CityController(zones=2)
    event_bus = EventBus()

    assert controller.active_policies["water_rationing_rule"] is False

    # Simulate water deficit / low reservoir event (< 25%)
    event_bus.publish(
        WaterDeficitEvent(
            timestamp=4,
            deficit_kl=15.0,
            reservoir_level_pct=22.0,
        )
    )

    assert controller.active_policies["water_rationing_rule"] is True
    assert controller.water.rationing_active is True

    # Simulate recovery (> 50%)
    event_bus.publish(
        WaterDeficitEvent(
            timestamp=12,
            deficit_kl=0.0,
            reservoir_level_pct=65.0,
        )
    )

    assert controller.active_policies["water_rationing_rule"] is False
    assert controller.water.rationing_active is False


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
        "green_wave_active": 0,
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
        "water_consumption_kl": 120.0,
        "water_demand_kl": 120.0,
        "water_deficit_kl": 0.0,
        "reservoir_level_pct": 85.0,
        "drainage_overflows": 0,
        "avg_drainage_load_pct": 25.0,
        "water_rationing_active": 0,
        "emergency_incidents": 2,
        "critical_incidents": 0,
        "avg_response_time_min": 7.2,
        "avg_hospital_occupancy": 60.0,
        "overloaded_hospitals": 0,
    }

    logger.log(0, sample_metrics)

    assert csv_file.exists()
    content = csv_file.read_text(encoding="utf-8")
    assert "traffic_congestion" in content
    assert "water_consumption_kl" in content
    assert "avg_response_time_min" in content
    assert "0.35" in content

    assert json_file.exists()
    json_content = json_file.read_text(encoding="utf-8")
    assert '"traffic_congestion": 0.35' in json_content
    assert '"water_consumption_kl": 120.0' in json_content


# ===========================================================================
# 8. Public Transport Subsystem Tests
# ===========================================================================

def test_public_transport_delays_scale_with_traffic():
    """Verify bus transit delays dynamically increase with city traffic congestion."""
    from smart_city_simulator.city.transit import PublicTransportSystem, TransitDelayEvent

    zones = [Zone(id=0, name="Central", population=1500)]
    transit = PublicTransportSystem(zones=zones)

    # Low traffic
    data_low = transit.update(step=8, traffic_congestion=0.1)
    # High traffic
    data_high = transit.update(step=8, traffic_congestion=0.95)

    assert data_high["avg_transit_delay_min"] > data_low["avg_transit_delay_min"]
    assert data_high["total_routes"] > 0
    assert data_high["delayed_routes"] >= data_low["delayed_routes"]


def test_public_transport_event_emission():
    """Verify TransitDelayEvent is published when delays exceed threshold."""
    from smart_city_simulator.city.transit import PublicTransportSystem, TransitDelayEvent

    zones = [Zone(id=0, name="Central", population=1500)]
    transit = PublicTransportSystem(zones=zones)
    event_bus = EventBus()
    events = []

    event_bus.subscribe(TransitDelayEvent, lambda e: events.append(e))

    # Severe congestion triggers delay events
    for _ in range(5):
        transit.update(step=17, traffic_congestion=0.99)

    assert len(events) > 0
    assert events[0].delay_minutes >= 5.0


# ===========================================================================
# 9. CO-3 Generator Tests (yield)
# ===========================================================================

def test_event_generators_yield_events():
    """Verify CO-3 generator functions stream events on demand with yield."""
    from smart_city_simulator.city.concurrency import (
        traffic_event_generator,
        electricity_event_generator,
        water_event_generator,
    )

    zones = [Zone(id=0, name="TestZone", population=1000)]
    traffic = TrafficManagementSystem(zones=zones)
    grid = SmartEnergyGrid(zones=zones)
    water_sys = WaterManagementSystem(zones=zones)

    gen_traffic = traffic_event_generator(traffic, max_steps=5)
    gen_grid = electricity_event_generator(grid, max_steps=5)
    gen_water = water_event_generator(water_sys, max_steps=5)

    # Test that next() yields valid event dicts without computing all steps at once
    item_t = next(gen_traffic)
    assert item_t["subsystem"] == "Traffic"
    assert "data" in item_t
    assert item_t["step"] == 0

    item_e = next(gen_grid)
    assert item_e["subsystem"] == "Electricity"

    item_w = next(gen_water)
    assert item_w["subsystem"] == "Water"


# ===========================================================================
# 10. CO-4 Custom Iterator & Pipeline Tests (__iter__, __next__)
# ===========================================================================

def test_custom_event_stream_iterator_and_pipeline():
    """Verify CO-4 custom iterator protocol and event filtering pipeline."""
    from smart_city_simulator.city.concurrency import (
        EventStreamIterator,
        EventPipeline,
        traffic_event_generator,
    )

    zones = [Zone(id=0, name="TestZone", population=1000)]
    traffic = TrafficManagementSystem(zones=zones)
    gen = traffic_event_generator(traffic, max_steps=10)

    # Custom iterator
    iterator = EventStreamIterator(gen)
    assert iter(iterator) is iterator

    first = next(iterator)
    assert first["subsystem"] == "Traffic"

    # Pipeline processing and consumption
    pipeline = EventPipeline(iterator)
    collected = pipeline.filter_subsystem("Traffic").take(4)
    assert len(collected) == 4
    for event in collected:
        assert event["subsystem"] == "Traffic"


# ===========================================================================
# 11. CO-5 Multithreading & Safe Queue Tests (threading.Thread + Queue)
# ===========================================================================

def test_concurrent_city_engine_multithreading():
    """Verify CO-5 multithreaded subsystem workers populate safe Event Queue."""
    from smart_city_simulator.city.concurrency import ConcurrentCityEngine

    controller = CityController(zones=2)
    engine = ConcurrentCityEngine(controller, event_interval=0.01)

    try:
        engine.start()
        assert engine.is_running() is True
        assert len(engine.threads) == 6  # 6 subsystem producer threads

        # Let worker threads run briefly
        import time
        time.sleep(0.15)

        # Safely drain events from queue
        drained = engine.drain_event_queue()
        assert len(drained) > 0
        subsystems = {item["subsystem"] for item in drained}
        assert len(subsystems) >= 3

    finally:
        engine.stop()
        assert engine.is_running() is False


