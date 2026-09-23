"""Pollution & Environmental Monitoring Subsystem.

Calculates the citywide Air Quality Index (AQI) derived from traffic congestion
and fossil energy generation, triggering alerts and emergent policy changes.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Dict, Any, Optional

from .base import BaseSubsystem
from .event_bus import EventBus, Event


# ---------------------------------------------------------------------------
# Events (Observer Pattern)
# ---------------------------------------------------------------------------

@dataclass
class PollutionAlertEvent(Event):
    """Emitted when AQI exceeds unhealthy thresholds."""
    aqi: float = 0.0
    high_pollution: bool = False
    severity: str = "GOOD"
    traffic_contribution: float = 0.0
    energy_contribution: float = 0.0


@dataclass
class PolicyChangeEvent(Event):
    """Emitted when municipal policies change automatically in response to events."""
    policy_name: str = ""
    status: str = "ACTIVATED"
    trigger_reason: str = ""


# ---------------------------------------------------------------------------
# Environment Monitor Subsystem
# ---------------------------------------------------------------------------

class EnvironmentMonitor(BaseSubsystem):
    """Computes citywide AQI and manages environmental alerting thresholds."""

    AQI_ALERT_THRESHOLD = 110.0
    AQI_CLEAR_THRESHOLD = 80.0

    def __init__(self, alert_threshold: float = AQI_ALERT_THRESHOLD) -> None:
        self.alert_threshold = alert_threshold
        self._event_bus = EventBus()
        self._current_aqi: float = 30.0
        self._emergency_mode: bool = False

    @property
    def name(self) -> str:
        return "Environmental Monitoring System"

    def reset(self) -> None:
        """Reset environmental metrics to baseline."""
        self._current_aqi = 30.0
        self._emergency_mode = False

    def get_status(self) -> Dict[str, Any]:
        """Return current status of environmental indicators."""
        return {
            "current_aqi": round(self._current_aqi, 2),
            "emergency_mode": self._emergency_mode,
            "threshold": self.alert_threshold,
        }

    def compute_aqi(
        self,
        traffic_congestion: float,
        total_vehicles: int,
        non_renewable_mw: float,
    ) -> tuple[float, float, float]:
        """Calculate the Air Quality Index based on subsystem metrics.

        Returns:
            Tuple of (total_aqi, traffic_component, energy_component).
        """
        # Baseline background pollution (pollen, dust, ambient): 25.0
        base_aqi = 25.0

        # Traffic component: heavily influenced by congestion factor and vehicle volume
        traffic_component = (traffic_congestion * 60.0) + (total_vehicles * 0.03)

        # Energy component: thermal/gas power generation output
        energy_component = non_renewable_mw * 12.0

        # Smooth transition with previous step (ambient air dispersion)
        target_aqi = base_aqi + traffic_component + energy_component
        smooth_aqi = (0.35 * self._current_aqi) + (0.65 * target_aqi)

        return smooth_aqi, traffic_component, energy_component

    def update(
        self,
        step: int,
        traffic_congestion: float = 0.0,
        total_vehicles: int = 0,
        non_renewable_mw: float = 0.0,
    ) -> Dict[str, Any]:
        """Update environmental readings and trigger policy events if necessary."""
        aqi, traffic_comp, energy_comp = self.compute_aqi(
            traffic_congestion=traffic_congestion,
            total_vehicles=total_vehicles,
            non_renewable_mw=non_renewable_mw,
        )
        self._current_aqi = aqi

        # Determine severity category
        if aqi < 50:
            severity = "GOOD"
        elif aqi < 100:
            severity = "MODERATE"
        elif aqi < 150:
            severity = "UNHEALTHY"
        else:
            severity = "HAZARDOUS"

        high_pollution = aqi >= self.alert_threshold

        # Publish pollution status event
        self._event_bus.publish(
            PollutionAlertEvent(
                timestamp=step,
                aqi=round(aqi, 2),
                high_pollution=high_pollution,
                severity=severity,
                traffic_contribution=round(traffic_comp, 2),
                energy_contribution=round(energy_comp, 2),
                message=f"Air Quality Index at step {step}: {aqi:.1f} ({severity})",
            )
        )

        return {
            "aqi": round(aqi, 2),
            "high_pollution": high_pollution,
            "severity": severity,
            "traffic_pollution_share": round(traffic_comp, 2),
            "energy_pollution_share": round(energy_comp, 2),
        }
