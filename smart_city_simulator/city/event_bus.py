"""EventBus implementing the Observer pattern for decoupled city event notifications."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Type, TypeVar, Any
import threading

@dataclass
class Event:
    """Base event class.

    Attributes:
        timestamp: Simulation step when the event was emitted.
        message: Descriptive string of the event.
    """
    timestamp: int
    message: str = ""


T = TypeVar("T", bound=Event)


class EventBus:
    """A thread-safe singleton event bus enabling the Observer pattern.

    Subsystems publish events to notify interested listeners (such as the CityController
    or other subsystems) without tight coupling.
    """

    _instance: EventBus | None = None
    _lock = threading.Lock()

    def __new__(cls) -> EventBus:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._subscribers: Dict[Type[Event], List[Callable[[Any], None]]] = {}
            return cls._instance

    def subscribe(self, event_type: Type[T], callback: Callable[[T], None]) -> None:
        """Register a callback for an event type."""
        with self._lock:
            self._subscribers.setdefault(event_type, []).append(callback)

    def unsubscribe(self, event_type: Type[T], callback: Callable[[T], None]) -> None:
        """Remove a previously registered callback."""
        with self._lock:
            if event_type in self._subscribers and callback in self._subscribers[event_type]:
                self._subscribers[event_type].remove(callback)

    def publish(self, event: Event) -> None:
        """Publish an event to all subscribed callbacks."""
        subscribers: List[Callable[[Any], None]] = []
        with self._lock:
            # Match exact type and base types
            for registered_type, callbacks in self._subscribers.items():
                if isinstance(event, registered_type):
                    subscribers.extend(callbacks)

        for callback in subscribers:
            callback(event)

    def clear(self) -> None:
        """Remove all subscribers (useful for testing)."""
        with self._lock:
            self._subscribers.clear()
