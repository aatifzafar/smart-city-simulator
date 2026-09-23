"""Abstract base class definition for all smart city subsystems."""

from __future__ import annotations

import abc
from typing import Dict, Any


class BaseSubsystem(abc.ABC):
    """Abstract base class that all city subsystems must implement.

    Ensures a consistent interface across Traffic, Energy, Waste, and
    Environment subsystems, supporting polymorphism throughout the simulation.
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Human-readable name of the subsystem."""
        ...

    @abc.abstractmethod
    def update(self, step: int) -> Dict[str, Any]:
        """Advance the subsystem by one simulation time step.

        Args:
            step: The current simulation step index (e.g. simulated hour).

        Returns:
            Dict[str, Any]: A mapping of metric keys to numeric values or states.
        """
        ...

    @abc.abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Return the current internal status and health metrics of the subsystem."""
        ...

    @abc.abstractmethod
    def reset(self) -> None:
        """Reset the subsystem to its initial baseline state."""
        ...
