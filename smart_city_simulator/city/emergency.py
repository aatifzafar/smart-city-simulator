"""Emergency Services & Public Safety Subsystem.

Models municipal hospitals, ICU capacity, ambulance fleet dispatch,
traffic-congestion-dependent emergency response times, and green-wave corridor policies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import random
from typing import Any, Dict, List, Optional

from .base import BaseSubsystem
from .event_bus import EventBus, Event
from .traffic import Zone


# ---------------------------------------------------------------------------
# Enums and Domain Models
# ---------------------------------------------------------------------------

class IncidentSeverity(Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class Hospital:
    """Municipal hospital tracking beds, ICU capacity, and patient triage."""
    id: str
    name: str
    zone_id: int
    total_beds: int
    icu_beds: int
    occupied_beds: int = 0
    occupied_icu: int = 0

    @property
    def occupancy_rate(self) -> float:
        """Return percentage of total beds occupied (0.0 to 100.0)."""
        if self.total_beds <= 0:
            return 0.0
        return max(0.0, min(100.0, (self.occupied_beds / self.total_beds) * 100.0))

    @property
    def is_overloaded(self) -> bool:
        """True if occupancy exceeds 90%."""
        return self.occupancy_rate >= 90.0


@dataclass
class EmergencyIncident:
    """An emergency incident requiring EMS dispatch."""
    id: str
    zone_id: int
    severity: IncidentSeverity
    response_time_minutes: float
    resolved: bool = False


@dataclass
class EmergencyCorridorEvent(Event):
    """Emitted when critical emergencies require green-wave signal prioritization."""
    zone_id: int = 0
    severity: str = "CRITICAL"
    incident_id: str = ""


@dataclass
class HospitalOverloadEvent(Event):
    """Emitted when hospital beds or ICU capacity exceed safe operational thresholds."""
    hospital_id: str = ""
    occupancy_pct: float = 0.0


# ---------------------------------------------------------------------------
# Emergency Services Subsystem
# ---------------------------------------------------------------------------

class EmergencyServicesSystem(BaseSubsystem):
    """Orchestrates hospital triage, EMS dispatches, and emergency corridors."""

    def __init__(
        self,
        zones: List[Zone],
        green_wave_active: bool = False,
    ) -> None:
        self.zones = zones
        self.green_wave_active = green_wave_active
        self._event_bus = EventBus()
        self.hospitals: Dict[int, Hospital] = {}
        self.total_ambulances: int = len(zones) * 4
        self.available_ambulances: int = self.total_ambulances
        self._incident_counter: int = 0
        self._setup_emergency_network()

    @property
    def name(self) -> str:
        return "Emergency Services & Public Safety"

    def _setup_emergency_network(self) -> None:
        """Initialize hospital infrastructure in each zone."""
        self.hospitals.clear()
        for zone in self.zones:
            beds = max(50, int(zone.population * 0.05))
            icu = max(10, int(beds * 0.20))
            self.hospitals[zone.id] = Hospital(
                id=f"HOSP-{zone.id}",
                name=f"{zone.name} General Hospital",
                zone_id=zone.id,
                total_beds=beds,
                icu_beds=icu,
                occupied_beds=int(beds * 0.60),  # Baseline 60% occupancy
                occupied_icu=int(icu * 0.40),
            )

    def set_green_wave(self, active: bool) -> None:
        """Enable or disable traffic green wave priority for emergency vehicles."""
        self.green_wave_active = active

    def reset(self) -> None:
        """Reset emergency services to initial state."""
        self.green_wave_active = False
        self._incident_counter = 0
        self._setup_emergency_network()

    def get_status(self) -> Dict[str, Any]:
        """Return status summary."""
        avg_occupancy = (
            sum(h.occupancy_rate for h in self.hospitals.values()) / len(self.hospitals)
            if self.hospitals else 0.0
        )
        return {
            "green_wave_active": self.green_wave_active,
            "avg_hospital_occupancy": round(avg_occupancy, 1),
            "total_hospitals": len(self.hospitals),
            "available_ambulances": self.available_ambulances,
        }

    def update(self, step: int, traffic_congestion: float = 0.3) -> Dict[str, Any]:
        """Advance emergency subsystem by one hour.

        Args:
            step: Current simulation step.
            traffic_congestion: Citywide average road congestion (0.0 to 1.0).
        """
        # 1. Discharge some patients from previous hours (turnover)
        for hosp in self.hospitals.values():
            discharge_count = int(hosp.occupied_beds * 0.08)
            hosp.occupied_beds = max(int(hosp.total_beds * 0.3), hosp.occupied_beds - discharge_count)

        # 2. Generate new emergency incidents
        # Baseline incident rate proportional to population
        total_pop = sum(z.population for z in self.zones)
        incident_count = max(1, int((total_pop / 1000) * random.uniform(0.6, 1.4)))

        incidents: List[EmergencyIncident] = []
        critical_count = 0
        response_times: List[float] = []

        for _ in range(incident_count):
            self._incident_counter += 1
            zone = random.choice(self.zones)

            # Determine severity
            r = random.random()
            if r < 0.15:
                sev = IncidentSeverity.CRITICAL
                critical_count += 1
            elif r < 0.40:
                sev = IncidentSeverity.HIGH
            elif r < 0.75:
                sev = IncidentSeverity.MEDIUM
            else:
                sev = IncidentSeverity.LOW

            # Base response time: 6 to 10 minutes
            base_time = random.uniform(6.0, 9.0)

            # Dynamic coupling: response time lengthens with traffic congestion
            # 0% congestion -> 1.0x time; 100% congestion -> 3.2x time
            congestion_multiplier = 1.0 + (traffic_congestion * 2.2)

            # If Green Wave corridor policy is active, bypass traffic delay by 45%
            if self.green_wave_active:
                congestion_multiplier = max(1.0, congestion_multiplier * 0.55)

            actual_response_time = base_time * congestion_multiplier
            response_times.append(actual_response_time)

            incident = EmergencyIncident(
                id=f"INC-{self._incident_counter}",
                zone_id=zone.id,
                severity=sev,
                response_time_minutes=round(actual_response_time, 1),
            )
            incidents.append(incident)

            # Admit patient to zone hospital
            hosp = self.hospitals[zone.id]
            if hosp.occupied_beds < hosp.total_beds:
                hosp.occupied_beds += 1

            # Emit EmergencyCorridorEvent if critical
            if sev == IncidentSeverity.CRITICAL:
                self._event_bus.publish(
                    EmergencyCorridorEvent(
                        timestamp=step,
                        message=(
                            f"🚨 CRITICAL EMS Incident in {zone.name}! "
                            f"Est. Response Time: {actual_response_time:.1f} min. Green wave requested."
                        ),
                        zone_id=zone.id,
                        severity=sev.value,
                        incident_id=incident.id,
                    )
                )

        # 3. Check for Hospital Overload
        overload_count = 0
        for hosp in self.hospitals.values():
            if hosp.is_overloaded:
                overload_count += 1
                self._event_bus.publish(
                    HospitalOverloadEvent(
                        timestamp=step,
                        message=(
                            f"⚠️ Hospital Overcrowding at {hosp.name}: "
                            f"{hosp.occupancy_rate:.1f}% beds occupied!"
                        ),
                        hospital_id=hosp.id,
                        occupancy_pct=round(hosp.occupancy_rate, 1),
                    )
                )

        avg_resp_time = sum(response_times) / len(response_times) if response_times else 7.0
        avg_occupancy = sum(h.occupancy_rate for h in self.hospitals.values()) / len(self.hospitals)

        return {
            "emergency_incidents": len(incidents),
            "critical_incidents": critical_count,
            "avg_response_time_min": round(avg_resp_time, 1),
            "avg_hospital_occupancy": round(avg_occupancy, 1),
            "overloaded_hospitals": overload_count,
            "green_wave_active": self.green_wave_active,
        }
