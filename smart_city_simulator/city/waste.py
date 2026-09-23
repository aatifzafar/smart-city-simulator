"""Waste Management Subsystem.

Models municipal waste generation per zone, collection routes via GarbageTrucks,
and automated bin-overflow alerts via the Observer pattern.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
import random
from typing import Dict, List, Any

from .base import BaseSubsystem
from .event_bus import EventBus, Event
from .traffic import Zone


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class WasteBin:
    """Represents a municipal waste collection bin in a zone.

    Attributes:
        id: Unique bin ID.
        zone_id: Containing zone ID.
        capacity_kg: Maximum storage capacity before overflowing.
        current_load_kg: Current volume of waste stored.
    """
    id: str
    zone_id: int
    capacity_kg: float = 600.0
    current_load_kg: float = 0.0

    @property
    def is_overflow(self) -> bool:
        """True if waste load exceeds bin capacity."""
        return self.current_load_kg >= self.capacity_kg

    @property
    def fullness_percent(self) -> float:
        """Fraction of capacity currently filled (0.0 - 1.0+)."""
        if self.capacity_kg <= 0:
            return 1.0
        return self.current_load_kg / self.capacity_kg

    def add_waste(self, amount_kg: float) -> None:
        """Add generated waste to the bin."""
        self.current_load_kg += max(0.0, amount_kg)

    def empty(self) -> float:
        """Empty the bin and return the kilograms collected."""
        collected = self.current_load_kg
        self.current_load_kg = 0.0
        return collected


@dataclass
class GarbageTruck:
    """Represents a municipal refuse collection vehicle traversing a route.

    Attributes:
        id: Unique truck ID.
        name: Vehicle identifier.
        capacity_kg: Maximum carrying capacity before visiting the landfill/depot.
        current_load_kg: Current payload.
        route_zone_ids: Ordered sequence of zone IDs in its collection route.
        current_route_index: Current stop along the route.
    """
    id: str
    name: str
    capacity_kg: float = 3000.0
    current_load_kg: float = 0.0
    route_zone_ids: List[int] = field(default_factory=list)
    current_route_index: int = 0

    def current_zone(self) -> int | None:
        """Return the zone ID the truck is currently servicing."""
        if not self.route_zone_ids:
            return None
        return self.route_zone_ids[self.current_route_index % len(self.route_zone_ids)]

    def collect(self, bin_: WasteBin) -> float:
        """Collect waste from a bin up to the truck's remaining capacity."""
        remaining_space = max(0.0, self.capacity_kg - self.current_load_kg)
        if remaining_space <= 0.0:
            return 0.0

        collect_amount = min(bin_.current_load_kg, remaining_space)
        bin_.current_load_kg -= collect_amount
        self.current_load_kg += collect_amount

        # If truck is virtually full, unload at depot
        if self.current_load_kg >= self.capacity_kg * 0.95:
            self.unload_at_depot()

        return collect_amount

    def advance_route(self) -> None:
        """Move the truck to the next zone stop in its route."""
        if self.route_zone_ids:
            self.current_route_index = (self.current_route_index + 1) % len(self.route_zone_ids)

    def unload_at_depot(self) -> float:
        """Dump payload at central processing plant/depot."""
        payload = self.current_load_kg
        self.current_load_kg = 0.0
        return payload


# ---------------------------------------------------------------------------
# Events (Observer Pattern)
# ---------------------------------------------------------------------------

@dataclass
class WasteOverflowEvent(Event):
    """Emitted when a municipal waste bin exceeds capacity."""
    zone_id: int = 0
    bin_id: str = ""
    current_load_kg: float = 0.0
    capacity_kg: float = 0.0


# ---------------------------------------------------------------------------
# Waste Management Subsystem
# ---------------------------------------------------------------------------

class WasteManagementSystem(BaseSubsystem):
    """Manages waste generation, collection routes, and overflow alerts."""

    def __init__(
        self,
        zones: List[Zone],
        collection_interval: int = 4,
    ) -> None:
        self.zones = zones
        self.collection_interval = collection_interval
        self._event_bus = EventBus()
        self.bins: Dict[int, WasteBin] = {}
        self.trucks: List[GarbageTruck] = []
        self._setup_waste_infrastructure()

    @property
    def name(self) -> str:
        return "Waste Management System"

    def _setup_waste_infrastructure(self) -> None:
        """Set up municipal bins and collection routes."""
        self.bins.clear()
        self.trucks.clear()

        zone_ids = [z.id for z in self.zones]
        for zone in self.zones:
            self.bins[zone.id] = WasteBin(
                id=f"BIN-{zone.id}",
                zone_id=zone.id,
                capacity_kg=max(400.0, zone.population * 0.45),
            )

        # Create collection trucks traversing the circular route across zones
        if zone_ids:
            self.trucks.append(
                GarbageTruck(
                    id="TRUCK-1",
                    name="Fleet Alpha Truck",
                    capacity_kg=max(2000.0, sum(z.population for z in self.zones) * 0.6),
                    route_zone_ids=list(zone_ids),
                )
            )

    def reset(self) -> None:
        """Clear all bins and reset trucks."""
        for b in self.bins.values():
            b.empty()
        for t in self.trucks:
            t.unload_at_depot()
            t.current_route_index = 0

    def get_status(self) -> Dict[str, Any]:
        """Return status summary."""
        total_load = sum(b.current_load_kg for b in self.bins.values())
        total_cap = sum(b.capacity_kg for b in self.bins.values())
        return {
            "total_bins": len(self.bins),
            "overflow_bins": sum(1 for b in self.bins.values() if b.is_overflow),
            "avg_fill_percent": round(total_load / total_cap * 100, 1) if total_cap > 0 else 0.0,
        }

    def update(self, step: int) -> Dict[str, Any]:
        """Advance waste generation, route collection, and alert monitoring."""
        step_waste_generated = 0.0
        collected_this_step = 0.0

        # 1. Generate waste based on population (~0.05 kg per capita per hour)
        for zone in self.zones:
            gen_rate = zone.population * 0.05 * random.uniform(0.85, 1.15)
            self.bins[zone.id].add_waste(gen_rate)
            step_waste_generated += gen_rate

        # 2. Garbage trucks advance and collect from bins on their route
        for truck in self.trucks:
            target_zone = truck.current_zone()
            if target_zone is not None and target_zone in self.bins:
                target_bin = self.bins[target_zone]
                collected = truck.collect(target_bin)
                collected_this_step += collected
            truck.advance_route()

        # 3. Check for overflowing bins and publish alerts
        overflow_count = 0
        for b in self.bins.values():
            if b.is_overflow:
                overflow_count += 1
                self._event_bus.publish(
                    WasteOverflowEvent(
                        timestamp=step,
                        zone_id=b.zone_id,
                        bin_id=b.id,
                        current_load_kg=round(b.current_load_kg, 1),
                        capacity_kg=round(b.capacity_kg, 1),
                        message=f"WARNING: Waste bin {b.id} in Zone {b.zone_id} is overflowing ({b.fullness_percent:.1%})!",
                    )
                )

        return {
            "total_waste_kg": round(step_waste_generated, 2),
            "collected_waste_kg": round(collected_this_step, 2),
            "overflow_bins": overflow_count,
        }
