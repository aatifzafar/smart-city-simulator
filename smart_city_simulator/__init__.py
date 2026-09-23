"""Mini Smart City Simulator Package.

An advanced object-oriented multi-subsystem simulation modeling urban traffic,
energy grid, waste management, environmental pollution, and automated policies.
"""

from .city.controller import CityController
from .exceptions import (
    SmartCityError,
    InvalidConfigError,
    ZeroPopulationZoneError,
    SubsystemError,
)

__version__ = "1.0.0"
__all__ = [
    "CityController",
    "SmartCityError",
    "InvalidConfigError",
    "ZeroPopulationZoneError",
    "SubsystemError",
]
