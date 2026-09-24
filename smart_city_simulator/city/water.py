"""Smart Water & Drainage Subsystem.

Models municipal water storage, diurnal consumption demand, filtration/recycling,
drainage capacity, flood risk detection, and emergency rationing policies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import math
import random
from typing import Any, Dict, List, Optional

from .base import BaseSubsystem
from .event_bus import EventBus, Event
from .traffic import Zone


# ---------------------------------------------------------------------------
# Domain Models & Events
# ---------------------------------------------------------------------------

@dataclass
class WaterReservoir:
    """Municipal water storage reservoir."""
    id: str
    name: str
    capacity_kl: float          # Capacity in kiloliters (kL)
    current_level_kl: float     # Current water level in kL
    replenishment_rate_kl: float = 50.0  # Base natural/treatment inflow per hour

    @property
    def level_percentage(self) -> float:
        """Return percentage of capacity remaining."""
        if self.capacity_kl <= 0:
            return 0.0
        return max(0.0, min(100.0, (self.current_level_kl / self.capacity_kl) * 100.0))


@dataclass
class DrainagePumpStation:
    """Smart stormwater drainage pump station for flood prevention."""
    id: str
    name: str
    zone_id: int
    max_flow_rate_kl: float     # Max runoff discharge rate
    current_load_kl: float = 0.0
    gate_open: bool = False

    @property
    def load_percentage(self) -> float:
        """Return drainage saturation level (0.0 to 100.0)."""
        if self.max_flow_rate_kl <= 0:
            return 0.0
        return max(0.0, min(100.0, (self.current_load_kl / self.max_flow_rate_kl) * 100.0))


@dataclass
class WaterDeficitEvent(Event):
    """Emitted when municipal water demand exceeds supply or reservoir is depleted."""
    deficit_kl: float = 0.0
    reservoir_level_pct: float = 0.0


@dataclass
class DrainageOverflowEvent(Event):
    """Emitted when urban stormwater drainage exceeds safe capacity (flood risk)."""
    zone_id: int = 0
    drainage_load_pct: float = 0.0


# ---------------------------------------------------------------------------
# Water Management Subsystem
# ---------------------------------------------------------------------------

class WaterManagementSystem(BaseSubsystem):
    """Manages urban water distribution, reservoir storage, and flood drainage."""

    # Diurnal water demand multiplier by hour of the day (0-23)
    # Peaks in morning (7-9 AM: showers/cooking) and evening (6-9 PM: dinner/gardening)
    HOURLY_DEMAND_CURVE: List[float] = [
        0.35, 0.25, 0.20, 0.20, 0.30, 0.55,  # 00:00 - 05:00 (Night)
        0.90, 1.45, 1.60, 1.30, 1.05, 0.95,  # 06:00 - 11:00 (Morning Peak)
        0.90, 0.85, 0.80, 0.85, 1.00, 1.35,  # 12:00 - 17:00 (Afternoon)
        1.55, 1.50, 1.30, 1.00, 0.70, 0.45,  # 18:00 - 23:00 (Evening Peak)
    ]

    def __init__(
        self,
        zones: List[Zone],
        rationing_active: bool = False,
    ) -> None:
        self.zones = zones
        self.rationing_active = rationing_active
        self._event_bus = EventBus()
        self.reservoirs: List[WaterReservoir] = []
        self.pump_stations: Dict[int, DrainagePumpStation] = {}
        self._setup_water_grid()

    @property
    def name(self) -> str:
        return "Smart Water & Drainage Subsystem"

    def _setup_water_grid(self) -> None:
        """Initialize central reservoir and zone drainage stations."""
        self.reservoirs.clear()
        self.pump_stations.clear()

        total_population = sum(z.population for z in self.zones)
        # Reservoir sized to hold ~3 days of baseline municipal supply
        capacity = max(10000.0, total_population * 2.5)

        self.reservoirs.append(
            WaterReservoir(
                id="RES-MAIN",
                name="Central Aqueduct Reservoir",
                capacity_kl=capacity,
                current_level_kl=capacity * 0.85,  # Start at 85% full
                replenishment_rate_kl=total_population * 0.08,
            )
        )

        for zone in self.zones:
            self.pump_stations[zone.id] = DrainagePumpStation(
                id=f"PUMP-{zone.id}",
                name=f"{zone.name} Drainage Station",
                zone_id=zone.id,
                max_flow_rate_kl=max(500.0, zone.population * 0.35),
            )

    def set_rationing(self, active: bool) -> None:
        """Toggle emergency water conservation / rationing policy."""
        self.rationing_active = active

    def reset(self) -> None:
        """Reset water grid to initial baseline conditions."""
        self.rationing_active = False
        self._setup_water_grid()

    def get_status(self) -> Dict[str, Any]:
        """Return status summary."""
        res = self.reservoirs[0] if self.reservoirs else None
        avg_drainage = (
            sum(p.load_percentage for p in self.pump_stations.values()) / len(self.pump_stations)
            if self.pump_stations else 0.0
        )
        return {
            "reservoir_level_pct": round(res.level_percentage if res else 0.0, 1),
            "reservoir_level_kl": round(res.current_level_kl if res else 0.0, 1),
            "rationing_active": self.rationing_active,
            "avg_drainage_load_pct": round(avg_drainage, 1),
        }

    def update(self, step: int) -> Dict[str, Any]:
        """Advance water consumption and drainage simulation by one hour."""
        hour = step % 24
        demand_factor = self.HOURLY_DEMAND_CURVE[hour]

        total_population = sum(z.population for z in self.zones)
        # Base consumption: ~0.07 kL per person per hour modulated by diurnal curve
        gross_demand_kl = total_population * 0.07 * demand_factor * random.uniform(0.92, 1.08)

        # If water rationing is active, cut consumption by 35% through conservation
        if self.rationing_active:
            gross_demand_kl *= 0.65

        res = self.reservoirs[0]
        # Inflow (treatment plant + natural groundwater)
        res.current_level_kl += res.replenishment_rate_kl

        # Supply water from reservoir
        water_supplied_kl = min(gross_demand_kl, res.current_level_kl)
        res.current_level_kl = max(0.0, res.current_level_kl - gross_demand_kl)
        # Ensure reservoir does not exceed capacity
        res.current_level_kl = min(res.capacity_kl, res.current_level_kl)

        water_deficit_kl = gross_demand_kl - water_supplied_kl

        # Check for water deficit or critically low reservoir (< 20%)
        if water_deficit_kl > 1.0 or res.level_percentage < 20.0:
            self._event_bus.publish(
                WaterDeficitEvent(
                    timestamp=step,
                    message=(
                        f"Water deficit alert at step {step}: "
                        f"Deficit={water_deficit_kl:.1f} kL, Reservoir at {res.level_percentage:.1f}%"
                    ),
                    deficit_kl=round(water_deficit_kl, 2),
                    reservoir_level_pct=round(res.level_percentage, 1),
                )
            )

        # -----------------------------------------------------------------
        # Stormwater & Drainage Simulation
        # -----------------------------------------------------------------
        drainage_overflows = 0
        total_drainage_load = 0.0

        for zone in self.zones:
            pump = self.pump_stations[zone.id]
            # Stormwater / runoff simulation: base runoff + occasional rain bursts
            rain_surge = 1.8 if (step % 24 in [14, 15, 16] and step % 48 < 24) else 0.8
            runoff_kl = (zone.population * 0.12 * rain_surge) * random.uniform(0.85, 1.15)
            pump.current_load_kl = runoff_kl

            # Smart valve opening when load > 75%
            if pump.load_percentage > 75.0:
                pump.gate_open = True
            else:
                pump.gate_open = False

            # Flood warning if load > 90%
            if pump.load_percentage > 90.0:
                drainage_overflows += 1
                self._event_bus.publish(
                    DrainageOverflowEvent(
                        timestamp=step,
                        message=(
                            f"High drainage flood risk in {zone.name} at step {step} "
                            f"({pump.load_percentage:.1f}% capacity)"
                        ),
                        zone_id=zone.id,
                        drainage_load_pct=round(pump.load_percentage, 1),
                    )
                )

            total_drainage_load += pump.load_percentage

        avg_drainage_pct = total_drainage_load / len(self.pump_stations) if self.pump_stations else 0.0

        return {
            "water_consumption_kl": round(water_supplied_kl, 1),
            "water_demand_kl": round(gross_demand_kl, 1),
            "water_deficit_kl": round(water_deficit_kl, 1),
            "reservoir_level_pct": round(res.level_percentage, 1),
            "reservoir_level_kl": round(res.current_level_kl, 1),
            "drainage_overflows": drainage_overflows,
            "avg_drainage_load_pct": round(avg_drainage_pct, 1),
            "rationing_active": self.rationing_active,
        }
