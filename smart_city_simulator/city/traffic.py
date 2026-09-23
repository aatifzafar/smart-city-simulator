"""Traffic Management Subsystem.

Models zones, roads, intersections, vehicles, traffic light state machine,
dynamic congestion rerouting via Strategy pattern, and odd-even license plate policies.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from enum import Enum
import random
from typing import Dict, List, Optional, Any

from .base import BaseSubsystem
from .event_bus import EventBus, Event
from ..exceptions import ZeroPopulationZoneError


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class Zone:
    """Represents a municipal zone in the city.

    Attributes:
        id: Unique numeric identifier for the zone.
        name: Human-readable name.
        population: Total residents in the zone (must be > 0).
    """
    id: int
    name: str = ""
    population: int = 1000

    def __post_init__(self) -> None:
        if not self.name:
            self.name = f"Zone-{self.id}"
        if self.population <= 0:
            raise ZeroPopulationZoneError(
                f"Zone '{self.name}' (id={self.id}) has invalid population: {self.population}. "
                f"Population must be strictly positive."
            )


@dataclass
class Vehicle:
    """Represents a simulated vehicle.

    Attributes:
        id: Unique vehicle identifier.
        zone_id: Originating zone.
        is_odd_plate: True if license plate number is odd, False if even.
        assigned_road: The road currently traversed.
    """
    id: str
    zone_id: int
    is_odd_plate: bool
    assigned_road: Optional[str] = None


@dataclass
class Road:
    """Represents a city road segment.

    Attributes:
        id: Road identifier.
        name: Name of the road.
        zone_id: The zone containing this road.
        capacity: Maximum comfortable vehicle throughput.
        current_vehicles: Current number of vehicles on this road.
        is_arterial: Whether this is a major arterial highway or local street.
    """
    id: str
    name: str
    zone_id: int
    capacity: int = 1500
    current_vehicles: int = 0
    is_arterial: bool = True

    @property
    def congestion_level(self) -> float:
        """Congestion ratio between 0.0 and 1.0 (or higher under extreme jam)."""
        if self.capacity <= 0:
            return 1.0
        return min(1.5, self.current_vehicles / self.capacity)

    @property
    def is_congested(self) -> bool:
        """True if congestion exceeds 75% of road capacity."""
        return self.congestion_level >= 0.75


class TrafficLightState(Enum):
    """States for the traffic signal finite state machine."""
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    RED = "RED"


@dataclass
class Intersection:
    """Represents a signalized intersection with a state machine.

    Attributes:
        id: Intersection ID.
        name: Intersection name.
        zone_id: Containing zone ID.
        connected_road_ids: List of road IDs meeting at this intersection.
        state: Current light state (GREEN, YELLOW, RED).
        timer: Step counter for the current state.
        green_duration: Duration of GREEN light in steps.
        yellow_duration: Duration of YELLOW light in steps.
        red_duration: Duration of RED light in steps.
    """
    id: str
    name: str
    zone_id: int
    connected_road_ids: List[str]
    state: TrafficLightState = TrafficLightState.GREEN
    timer: int = 0
    green_duration: int = 3
    yellow_duration: int = 1
    red_duration: int = 3

    def tick(self) -> None:
        """Advance the traffic light state machine by one time step."""
        self.timer += 1
        if self.state == TrafficLightState.GREEN and self.timer >= self.green_duration:
            self.state = TrafficLightState.YELLOW
            self.timer = 0
        elif self.state == TrafficLightState.YELLOW and self.timer >= self.yellow_duration:
            self.state = TrafficLightState.RED
            self.timer = 0
        elif self.state == TrafficLightState.RED and self.timer >= self.red_duration:
            self.state = TrafficLightState.GREEN
            self.timer = 0


# ---------------------------------------------------------------------------
# Events (Observer Pattern)
# ---------------------------------------------------------------------------

@dataclass
class TrafficCongestionEvent(Event):
    """Emitted when road congestion exceeds safe operating thresholds."""
    zone_id: int = 0
    road_id: str = ""
    congestion_level: float = 0.0
    vehicle_count: int = 0


# ---------------------------------------------------------------------------
# Strategy Pattern for Dynamic Rerouting
# ---------------------------------------------------------------------------

class TrafficRoutingStrategy(abc.ABC):
    """Abstract Strategy interface for vehicle routing across roads."""

    @abc.abstractmethod
    def route_vehicles(
        self,
        vehicles: List[Vehicle],
        roads: Dict[str, Road],
        intersections: Dict[str, Intersection],
    ) -> int:
        """Assign vehicles to roads, returning the count of dynamically rerouted vehicles."""
        ...


class StaticRoutingStrategy(TrafficRoutingStrategy):
    """Default baseline strategy: routes vehicles onto their primary road without rerouting."""

    def route_vehicles(
        self,
        vehicles: List[Vehicle],
        roads: Dict[str, Road],
        intersections: Dict[str, Intersection],
    ) -> int:
        for vehicle in vehicles:
            if vehicle.assigned_road and vehicle.assigned_road in roads:
                roads[vehicle.assigned_road].current_vehicles += 1
        return 0


class DynamicCongestionReroutingStrategy(TrafficRoutingStrategy):
    """Smart strategy: detects congested roads and dynamically reroutes vehicles to alternatives."""

    def __init__(self, congestion_threshold: float = 0.70) -> None:
        self.congestion_threshold = congestion_threshold

    def route_vehicles(
        self,
        vehicles: List[Vehicle],
        roads: Dict[str, Road],
        intersections: Dict[str, Intersection],
    ) -> int:
        rerouted_count = 0
        zone_roads: Dict[int, List[Road]] = {}
        for r in roads.values():
            zone_roads.setdefault(r.zone_id, []).append(r)

        for vehicle in vehicles:
            chosen_road = roads.get(vehicle.assigned_road or "")
            # Check if preferred road is congested or blocked by red signal
            if chosen_road and chosen_road.congestion_level >= self.congestion_threshold:
                # Find an alternative road in the same zone with lower congestion
                alternatives = [
                    alt for alt in zone_roads.get(vehicle.zone_id, [])
                    if alt.id != chosen_road.id and alt.congestion_level < self.congestion_threshold
                ]
                if alternatives:
                    # Pick the least congested alternative
                    best_alt = min(alternatives, key=lambda r: r.congestion_level)
                    best_alt.current_vehicles += 1
                    vehicle.assigned_road = best_alt.id
                    rerouted_count += 1
                    continue

            if chosen_road:
                chosen_road.current_vehicles += 1

        return rerouted_count


# ---------------------------------------------------------------------------
# Traffic Management System (Subsystem Implementation)
# ---------------------------------------------------------------------------

class TrafficManagementSystem(BaseSubsystem):
    """Comprehensive Traffic Subsystem managing roads, signals, and routing."""

    def __init__(
        self,
        zones: List[Zone],
        strategy: Optional[TrafficRoutingStrategy] = None,
        odd_even_active: bool = False,
    ) -> None:
        self.zones = zones
        self.strategy = strategy or DynamicCongestionReroutingStrategy()
        self.odd_even_active = odd_even_active
        self._event_bus = EventBus()
        self.roads: Dict[str, Road] = {}
        self.intersections: Dict[str, Intersection] = {}
        self._vehicle_counter = 0
        self._setup_network()

    @property
    def name(self) -> str:
        return "Traffic Management System"

    def _setup_network(self) -> None:
        """Create road segments and signalized intersections for each zone."""
        self.roads.clear()
        self.intersections.clear()
        for zone in self.zones:
            # 2 roads per zone: one arterial, one local bypass
            arterial_id = f"R-{zone.id}-A"
            local_id = f"R-{zone.id}-B"
            self.roads[arterial_id] = Road(
                id=arterial_id,
                name=f"{zone.name} Central Boulevard",
                zone_id=zone.id,
                capacity=max(500, int(zone.population * 0.5)),
                is_arterial=True,
            )
            self.roads[local_id] = Road(
                id=local_id,
                name=f"{zone.name} Ring Road",
                zone_id=zone.id,
                capacity=max(400, int(zone.population * 0.4)),
                is_arterial=False,
            )

            # Intersection connecting them
            inter_id = f"INT-{zone.id}"
            self.intersections[inter_id] = Intersection(
                id=inter_id,
                name=f"{zone.name} Junction",
                zone_id=zone.id,
                connected_road_ids=[arterial_id, local_id],
                state=TrafficLightState.GREEN,
            )

    def set_odd_even(self, active: bool) -> None:
        """Enable or disable the municipal odd-even vehicle rule."""
        self.odd_even_active = active

    def set_strategy(self, strategy: TrafficRoutingStrategy) -> None:
        """Switch the traffic routing strategy at runtime (Strategy Pattern)."""
        self.strategy = strategy

    def reset(self) -> None:
        """Reset traffic state to baseline."""
        for road in self.roads.values():
            road.current_vehicles = 0
        for inter in self.intersections.values():
            inter.state = TrafficLightState.GREEN
            inter.timer = 0
        self.odd_even_active = False

    def get_status(self) -> Dict[str, Any]:
        """Return status summary."""
        avg_congestion = (
            sum(r.congestion_level for r in self.roads.values()) / len(self.roads)
            if self.roads else 0.0
        )
        return {
            "odd_even_active": self.odd_even_active,
            "average_congestion": round(avg_congestion, 3),
            "total_roads": len(self.roads),
            "total_intersections": len(self.intersections),
        }

    def update(self, step: int) -> Dict[str, Any]:
        """Advance the traffic simulation by one step."""
        # 1. Advance traffic lights
        for intersection in self.intersections.values():
            intersection.tick()

        # 2. Reset road vehicle counts for the new time step
        for road in self.roads.values():
            road.current_vehicles = 0

        # 3. Generate vehicles based on zone populations and odd-even rule
        vehicles: List[Vehicle] = []
        is_even_step = (step % 2 == 0)

        for zone in self.zones:
            # Baseline vehicle generation: ~20% of population commuting per step
            base_count = int(zone.population * 0.20 * random.uniform(0.85, 1.15))
            for i in range(base_count):
                self._vehicle_counter += 1
                is_odd = (self._vehicle_counter % 2 != 0)

                # If odd-even rule active:
                # Even step allows only even plates; Odd step allows only odd plates
                if self.odd_even_active:
                    if is_even_step and is_odd:
                        continue  # Restricted!
                    elif (not is_even_step) and (not is_odd):
                        continue  # Restricted!

                primary_road = f"R-{zone.id}-A"
                vehicles.append(
                    Vehicle(
                        id=f"V-{self._vehicle_counter}",
                        zone_id=zone.id,
                        is_odd_plate=is_odd,
                        assigned_road=primary_road,
                    )
                )

        # 4. Apply routing strategy to dispatch vehicles
        rerouted = self.strategy.route_vehicles(vehicles, self.roads, self.intersections)

        # 5. Calculate congestion levels and trigger alerts
        congested_roads = 0
        total_congestion = 0.0
        for road in self.roads.values():
            total_congestion += road.congestion_level
            if road.is_congested:
                congested_roads += 1
                self._event_bus.publish(
                    TrafficCongestionEvent(
                        timestamp=step,
                        zone_id=road.zone_id,
                        road_id=road.id,
                        congestion_level=road.congestion_level,
                        vehicle_count=road.current_vehicles,
                        message=f"Heavy congestion ({road.congestion_level:.1%}) on {road.name}!",
                    )
                )

        avg_congestion = total_congestion / len(self.roads) if self.roads else 0.0

        return {
            "traffic_congestion": round(avg_congestion, 4),
            "total_vehicles": len(vehicles),
            "rerouted_vehicles": rerouted,
            "congested_roads": congested_roads,
            "odd_even_active": self.odd_even_active,
        }
