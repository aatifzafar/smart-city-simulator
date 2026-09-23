"""Energy Grid Subsystem.

Models renewable and non-renewable power plants, residential/commercial/industrial buildings,
load-balancing dispatch logic, emissions tracking, and blackout simulation.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from enum import Enum
import math
import random
from typing import Dict, List, Any, Optional

from .base import BaseSubsystem
from .event_bus import EventBus, Event
from .traffic import Zone


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class PlantType(Enum):
    """Types of power generation facilities."""
    SOLAR = "SOLAR"
    WIND = "WIND"
    NATURAL_GAS = "NATURAL_GAS"
    COAL = "COAL"


@dataclass
class PowerPlant:
    """Represents an electricity generation facility.

    Attributes:
        id: Unique plant ID.
        name: Name of the facility.
        plant_type: Generation technology.
        capacity_mw: Maximum generation capacity in Megawatts.
        operating: Whether the plant is online.
    """
    id: str
    name: str
    plant_type: PlantType
    capacity_mw: float
    operating: bool = True

    @property
    def is_renewable(self) -> bool:
        """Return True if plant is renewable (solar or wind)."""
        return self.plant_type in (PlantType.SOLAR, PlantType.WIND)

    @property
    def emission_factor(self) -> float:
        """Grams of CO2/pollutants per MWh generated."""
        if self.plant_type == PlantType.SOLAR:
            return 0.0
        elif self.plant_type == PlantType.WIND:
            return 0.0
        elif self.plant_type == PlantType.NATURAL_GAS:
            return 450.0  # kg/MWh
        else:  # COAL
            return 950.0  # kg/MWh

    def available_output(self, step: int) -> float:
        """Calculate available power for the current simulation step."""
        if not self.operating:
            return 0.0

        hour_of_day = step % 24

        if self.plant_type == PlantType.SOLAR:
            # Solar peak between 08:00 and 18:00
            if 6 <= hour_of_day <= 18:
                solar_intensity = math.sin((hour_of_day - 6) / 12.0 * math.pi)
                return self.capacity_mw * solar_intensity * random.uniform(0.85, 1.0)
            return 0.0

        elif self.plant_type == PlantType.WIND:
            # Wind fluctuates dynamically
            wind_factor = random.uniform(0.3, 0.95)
            return self.capacity_mw * wind_factor

        else:
            # Thermal / fossil plants can output up to full capacity on demand
            return self.capacity_mw * random.uniform(0.9, 1.0)


class BuildingType(Enum):
    """Consumer building classifications."""
    RESIDENTIAL = "RESIDENTIAL"
    COMMERCIAL = "COMMERCIAL"
    INDUSTRIAL = "INDUSTRIAL"


@dataclass
class Building:
    """Represents an energy consumer unit in a zone.

    Attributes:
        id: Unique building or district ID.
        name: District or building name.
        zone_id: Containing zone.
        building_type: Category of consumer.
        base_demand_mw: Baseline power consumption.
    """
    id: str
    name: str
    zone_id: int
    building_type: BuildingType
    base_demand_mw: float = 1.0

    def current_demand(self, step: int) -> float:
        """Compute demand with diurnal variation based on time of day."""
        hour = step % 24
        if self.building_type == BuildingType.RESIDENTIAL:
            # Peak in morning (07:00-09:00) and evening (18:00-22:00)
            if 7 <= hour <= 9:
                mult = 1.4
            elif 18 <= hour <= 22:
                mult = 1.6
            elif 0 <= hour <= 5:
                mult = 0.5
            else:
                mult = 0.9
        elif self.building_type == BuildingType.COMMERCIAL:
            # Peak during business hours (09:00-17:00)
            mult = 1.5 if 9 <= hour <= 17 else 0.4
        else:  # INDUSTRIAL
            # Steady around the clock with daytime uptick
            mult = 1.2 if 8 <= hour <= 18 else 0.9

        return self.base_demand_mw * mult * random.uniform(0.92, 1.08)


# ---------------------------------------------------------------------------
# Events (Observer Pattern)
# ---------------------------------------------------------------------------

@dataclass
class BlackoutEvent(Event):
    """Emitted when total demand exceeds available energy generation capacity."""
    deficit_mw: float = 0.0
    demand_mw: float = 0.0
    supply_mw: float = 0.0


@dataclass
class LoadBalancingAlert(Event):
    """Emitted when energy grid reserve margin is uncomfortably low."""
    reserve_margin_percent: float = 0.0


# ---------------------------------------------------------------------------
# Smart Energy Grid Subsystem
# ---------------------------------------------------------------------------

class SmartEnergyGrid(BaseSubsystem):
    """Manages city power generation, load-balancing, and green energy dispatch."""

    def __init__(
        self,
        zones: List[Zone],
        curtail_nonrenewable: bool = False,
    ) -> None:
        self.zones = zones
        self.curtail_nonrenewable = curtail_nonrenewable
        self._event_bus = EventBus()
        self.plants: List[PowerPlant] = []
        self.buildings: List[Building] = []
        self._setup_grid()

    @property
    def name(self) -> str:
        return "Smart Energy Grid"

    def _setup_grid(self) -> None:
        """Provision renewable and non-renewable plants scaled to zone populations."""
        self.plants.clear()
        self.buildings.clear()

        for zone in self.zones:
            pop = zone.population
            # Renewable generation
            self.plants.append(
                PowerPlant(
                    id=f"SOLAR-{zone.id}",
                    name=f"{zone.name} Solar Farm",
                    plant_type=PlantType.SOLAR,
                    capacity_mw=max(1.0, pop * 0.0012),
                )
            )
            self.plants.append(
                PowerPlant(
                    id=f"WIND-{zone.id}",
                    name=f"{zone.name} Wind Turbines",
                    plant_type=PlantType.WIND,
                    capacity_mw=max(0.8, pop * 0.0008),
                )
            )
            # Conventional non-renewable generation
            self.plants.append(
                PowerPlant(
                    id=f"GAS-{zone.id}",
                    name=f"{zone.name} Gas Peaker",
                    plant_type=PlantType.NATURAL_GAS,
                    capacity_mw=max(1.5, pop * 0.0015),
                )
            )

            # Consumers
            self.buildings.append(
                Building(
                    id=f"RES-{zone.id}",
                    name=f"{zone.name} Residential Sector",
                    zone_id=zone.id,
                    building_type=BuildingType.RESIDENTIAL,
                    base_demand_mw=max(0.8, pop * 0.0009),
                )
            )
            self.buildings.append(
                Building(
                    id=f"COM-{zone.id}",
                    name=f"{zone.name} Commercial District",
                    zone_id=zone.id,
                    building_type=BuildingType.COMMERCIAL,
                    base_demand_mw=max(0.6, pop * 0.0006),
                )
            )

    def set_curtail_nonrenewable(self, active: bool) -> None:
        """Enable or disable curtailment of non-renewable fossil power plants."""
        self.curtail_nonrenewable = active

    def reset(self) -> None:
        """Reset power plants to operating status."""
        for plant in self.plants:
            plant.operating = True
        self.curtail_nonrenewable = False

    def get_status(self) -> Dict[str, Any]:
        """Return grid capacity metrics."""
        total_cap = sum(p.capacity_mw for p in self.plants)
        renew_cap = sum(p.capacity_mw for p in self.plants if p.is_renewable)
        return {
            "total_capacity_mw": round(total_cap, 2),
            "renewable_capacity_mw": round(renew_cap, 2),
            "renewable_share": round(renew_cap / total_cap, 2) if total_cap > 0 else 0.0,
            "curtail_nonrenewable": self.curtail_nonrenewable,
        }

    def update(self, step: int) -> Dict[str, Any]:
        """Execute load balancing for the step and simulate blackouts if overloaded."""
        total_demand = sum(b.current_demand(step) for b in self.buildings)

        # 1. Harvest renewable energy first (priority merit-order dispatch)
        renewable_available = sum(
            p.available_output(step) for p in self.plants if p.is_renewable
        )
        renewable_dispatched = min(total_demand, renewable_available)
        unmet_demand = max(0.0, total_demand - renewable_dispatched)

        # 2. Dispatch non-renewable plants to satisfy remaining demand
        non_renewable_plants = [p for p in self.plants if not p.is_renewable]
        non_renewable_dispatched = 0.0
        total_emissions = 0.0

        for plant in non_renewable_plants:
            if unmet_demand <= 0.0:
                break
            avail = plant.available_output(step)
            # If curtailment is active due to pollution policy, limit output to 50%
            if self.curtail_nonrenewable:
                avail *= 0.5

            dispatch = min(unmet_demand, avail)
            non_renewable_dispatched += dispatch
            total_emissions += (dispatch * plant.emission_factor)
            unmet_demand -= dispatch

        total_supply = renewable_dispatched + non_renewable_dispatched
        blackout = (total_demand > total_supply + 0.01)

        # 3. Handle blackout condition
        if blackout:
            deficit = total_demand - total_supply
            self._event_bus.publish(
                BlackoutEvent(
                    timestamp=step,
                    deficit_mw=round(deficit, 2),
                    demand_mw=round(total_demand, 2),
                    supply_mw=round(total_supply, 2),
                    message=f"CRITICAL: Grid Blackout at step {step}! Deficit={deficit:.2f} MW.",
                )
            )

        return {
            "energy_usage": round(total_demand, 2),
            "energy_supply": round(total_supply, 2),
            "renewable_mw": round(renewable_dispatched, 2),
            "non_renewable_mw": round(non_renewable_dispatched, 2),
            "emissions_kg": round(total_emissions, 2),
            "blackout": blackout,
        }
