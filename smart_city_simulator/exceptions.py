"""Custom exception classes for the Mini Smart City Simulator.

Defines a hierarchy of exceptions for handling invalid configurations,
zero-population zones, subsystem runtime errors, and unexpected simulation states.
"""

class SmartCityError(Exception):
    """Base exception for all errors raised by the Smart City Simulator."""


class InvalidConfigError(SmartCityError):
    """Raised when simulation configuration parameters are invalid."""


class ZeroPopulationZoneError(SmartCityError):
    """Raised when a zone is configured or encounters zero or negative population."""


class SubsystemError(SmartCityError):
    """Raised when an internal error occurs within a city subsystem."""
