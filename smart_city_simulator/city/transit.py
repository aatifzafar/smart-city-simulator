"""Public Transport & Transit Subsystem.

Models municipal bus fleets, routes across sectors, passenger capacity,
traffic-induced schedule delays, and public transit events.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import random
from typing import Any, Dict, List, Optional

from .base import BaseSubsystem
from .event_bus import EventBus, Event
from .traffic import Zone


@dataclass
class TransitRoute:
    """A public transport route connecting city sectors."""
    id: str
    name: str
    origin_zone: int
    destination_zone: int
    assigned_buses: int = 4
    base_travel_time_min: float = 15.0
    current_delay_min: float = 0.0
    passenger_load: int = 0
    max_capacity: int = 200

    @property
    def is_delayed(self) -> bool:
        return self.current_delay_min > 5.0


@dataclass
class TransitDelayEvent(Event):
    """Emitted when public transport route encounters significant delays."""
    route_id: str = ""
    route_name: str = ""
    delay_minutes: float = 0.0
    affected_sector: int = 0
    severity: str = "WARNING"


class PublicTransportSystem(BaseSubsystem):
    """Manages citywide public bus/transit network, schedule delays, and fleet capacity."""

    def __init__(self, zones: List[Zone]) -> None:
        self.zones = zones
        self._event_bus = EventBus()
        self.routes: Dict[str, TransitRoute] = {}
        self._setup_transit_network()

    @property
    def name(self) -> str:
        return "Public Transport & Transit System"

    def _setup_transit_network(self) -> None:
        """Create transit routes connecting adjacent and arterial city sectors."""
        self.routes.clear()
        for i, zone in enumerate(self.zones):
            next_zone = self.zones[(i + 1) % len(self.zones)]
            route_id = f"BUS-RT-{zone.id}-{next_zone.id}"
            self.routes[route_id] = TransitRoute(
                id=route_id,
                name=f"Metro Express Line {i + 1} ({zone.name} ↔ {next_zone.name})",
                origin_zone=zone.id,
                destination_zone=next_zone.id,
                assigned_buses=max(2, int(zone.population * 0.002)),
                max_capacity=max(150, int(zone.population * 0.15)),
            )

    def reset(self) -> None:
        """Reset transit network to baseline."""
        self._setup_transit_network()

    def get_status(self) -> Dict[str, Any]:
        """Return status summary."""
        delayed_routes = sum(1 for r in self.routes.values() if r.is_delayed)
        avg_delay = (
            sum(r.current_delay_min for r in self.routes.values()) / len(self.routes)
            if self.routes else 0.0
        )
        return {
            "total_routes": len(self.routes),
            "delayed_routes": delayed_routes,
            "avg_delay_min": round(avg_delay, 1),
            "on_time_performance_pct": round(
                ((len(self.routes) - delayed_routes) / len(self.routes)) * 100
                if self.routes else 100.0,
                1,
            ),
        }

    def update(self, step: int, traffic_congestion: float = 0.25) -> Dict[str, Any]:
        """Advance transit simulation by one hour.

        Args:
            step: Simulation step index.
            traffic_congestion: City road congestion (0.0 to 1.0).
        """
        delayed_count = 0
        total_delay = 0.0
        total_passengers = 0

        for route in self.routes.values():
            # Passenger load based on hour (morning and evening commuter peaks)
            hour = step % 24
            commuter_peak = 1.6 if hour in [8, 9, 17, 18, 19] else 0.8
            zone_pop = self.zones[route.origin_zone].population if route.origin_zone < len(self.zones) else 1000
            route.passenger_load = min(
                route.max_capacity,
                int(zone_pop * 0.06 * commuter_peak * random.uniform(0.85, 1.15)),
            )
            total_passengers += route.passenger_load

            # Delay scales dynamically with traffic congestion
            # 0% congestion -> ~0 delay; 80% congestion -> ~12 min delay
            route.current_delay_min = round(traffic_congestion * 16.0 * random.uniform(0.7, 1.3), 1)
            total_delay += route.current_delay_min

            if route.is_delayed:
                delayed_count += 1
                self._event_bus.publish(
                    TransitDelayEvent(
                        timestamp=step,
                        message=(
                            f"🚌 Schedule Delay on {route.name}: "
                            f"{route.current_delay_min:.1f} min delay due to sector congestion."
                        ),
                        route_id=route.id,
                        route_name=route.name,
                        delay_minutes=route.current_delay_min,
                        affected_sector=route.origin_zone,
                        severity="WARNING" if route.current_delay_min < 10 else "CRITICAL",
                    )
                )

        avg_delay = total_delay / len(self.routes) if self.routes else 0.0
        ontime_pct = ((len(self.routes) - delayed_count) / len(self.routes)) * 100 if self.routes else 100.0

        return {
            "total_routes": len(self.routes),
            "delayed_routes": delayed_count,
            "avg_transit_delay_min": round(avg_delay, 1),
            "transit_passengers": total_passengers,
            "on_time_performance_pct": round(ontime_pct, 1),
        }
