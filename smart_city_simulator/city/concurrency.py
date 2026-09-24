"""Course Outcomes Module: Generators, Iterators, and Multithreading.

Implements the academic syllabus requirements for Mini Smart City Simulator:
1. CO-3: Generator Functions (yield) for streaming real-time subsystem events on-demand.
2. CO-4: Iterator Protocol (__iter__, __next__) for memory-efficient stream processing.
3. CO-5: Multithreading (threading.Thread + queue.Queue) for concurrent subsystem execution.
"""

from __future__ import annotations

import queue
import random
import threading
import time
from typing import Any, Callable, Dict, Generator, Iterator, List, Optional

from .traffic import TrafficManagementSystem
from .energy import SmartEnergyGrid
from .water import WaterManagementSystem
from .emergency import EmergencyServicesSystem
from .waste import WasteManagementSystem
from .transit import PublicTransportSystem


# ===========================================================================
# CO-3: Generator Functions (yield) for Continuous Event Streams
# ===========================================================================

def traffic_event_generator(
    traffic_system: TrafficManagementSystem,
    start_step: int = 0,
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Generator function yielding continuous traffic event streams on-demand.

    Satisfies CO-3 by producing events using Python's yield keyword without
    pre-allocating the entire history in memory.
    """
    step = start_step
    while max_steps is None or step < start_step + max_steps:
        data = traffic_system.update(step)
        congestion = data["traffic_congestion"]

        severity = "NORMAL"
        event_type = "TRAFFIC_FLOW_UPDATE"
        if congestion >= 0.75:
            severity = "CRITICAL"
            event_type = "TRAFFIC_GRIDLOCK_ALERT"
        elif congestion >= 0.50:
            severity = "WARNING"
            event_type = "TRAFFIC_CONGESTION_WARNING"

        event = {
            "timestamp": step,
            "step": step,
            "subsystem": "Traffic",
            "sector": f"Sector-{random.choice(traffic_system.zones).id + 1}",
            "event_type": event_type,
            "severity": severity,
            "message": f"Avg Congestion: {congestion * 100:.1f}%, Active Vehicles: {data['total_vehicles']}",
            "data": data,
        }
        yield event
        step += 1


def electricity_event_generator(
    energy_grid: SmartEnergyGrid,
    start_step: int = 0,
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Generator function yielding power grid and generation events."""
    step = start_step
    while max_steps is None or step < start_step + max_steps:
        data = energy_grid.update(step)
        blackout = data["blackout"]
        renewable_share = (
            (data["renewable_mw"] / data["energy_usage"] * 100)
            if data["energy_usage"] > 0 else 100.0
        )

        severity = "NORMAL"
        event_type = "GRID_DISPATCH_UPDATE"
        if blackout:
            severity = "CRITICAL"
            event_type = "GRID_BLACKOUT_ALERT"
        elif renewable_share < 30.0:
            severity = "WARNING"
            event_type = "FOSSIL_PEAKER_SPIKE"

        event = {
            "timestamp": step,
            "step": step,
            "subsystem": "Electricity",
            "sector": f"Sector-{random.choice(energy_grid.zones).id + 1}",
            "event_type": event_type,
            "severity": severity,
            "message": f"Demand: {data['energy_usage']:.1f} MW, Supply: {data['energy_supply']:.1f} MW, Clean: {renewable_share:.0f}%",
            "data": data,
        }
        yield event
        step += 1


def water_event_generator(
    water_system: WaterManagementSystem,
    start_step: int = 0,
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Generator function yielding municipal water and flood drainage events."""
    step = start_step
    while max_steps is None or step < start_step + max_steps:
        data = water_system.update(step)
        res_pct = data["reservoir_level_pct"]
        drainage_pct = data["avg_drainage_load_pct"]

        severity = "NORMAL"
        event_type = "WATER_SUPPLY_UPDATE"
        if res_pct < 25.0:
            severity = "CRITICAL"
            event_type = "RESERVOIR_SHORTAGE_WARNING"
        elif drainage_pct > 80.0:
            severity = "WARNING"
            event_type = "DRAINAGE_FLOOD_RISK"

        event = {
            "timestamp": step,
            "step": step,
            "subsystem": "Water",
            "sector": f"Sector-{random.choice(water_system.zones).id + 1}",
            "event_type": event_type,
            "severity": severity,
            "message": f"Reservoir Level: {res_pct:.1f}%, Drainage Load: {drainage_pct:.1f}%",
            "data": data,
        }
        yield event
        step += 1


def emergency_event_generator(
    emergency_system: EmergencyServicesSystem,
    start_step: int = 0,
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Generator function yielding EMS incident and hospital triage events."""
    step = start_step
    while max_steps is None or step < start_step + max_steps:
        data = emergency_system.update(step)
        critical_count = data["critical_incidents"]
        resp_time = data["avg_response_time_min"]

        severity = "NORMAL"
        event_type = "EMS_STATUS_UPDATE"
        if critical_count > 0:
            severity = "CRITICAL"
            event_type = "CRITICAL_TRAUMA_DISPATCH"
        elif resp_time > 12.0:
            severity = "WARNING"
            event_type = "RESPONSE_TIME_DELAY"

        event = {
            "timestamp": step,
            "step": step,
            "subsystem": "Emergency",
            "sector": f"Sector-{random.choice(emergency_system.zones).id + 1}",
            "event_type": event_type,
            "severity": severity,
            "message": f"Incidents: {data['emergency_incidents']}, Avg Response: {resp_time:.1f} min",
            "data": data,
        }
        yield event
        step += 1


def waste_event_generator(
    waste_system: WasteManagementSystem,
    start_step: int = 0,
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Generator function yielding garbage collection and overflow events."""
    step = start_step
    while max_steps is None or step < start_step + max_steps:
        data = waste_system.update(step)
        overflows = data["overflow_bins"]

        severity = "NORMAL"
        event_type = "WASTE_LOGISTICS_UPDATE"
        if overflows > 0:
            severity = "CRITICAL"
            event_type = "GARBAGE_BIN_OVERFLOW"

        event = {
            "timestamp": step,
            "step": step,
            "subsystem": "Waste",
            "sector": f"Sector-{random.choice(waste_system.zones).id + 1}",
            "event_type": event_type,
            "severity": severity,
            "message": f"Refuse Generated: {data['total_waste_kg']:.0f} kg, Overflows: {overflows}",
            "data": data,
        }
        yield event
        step += 1


def transit_event_generator(
    transit_system: PublicTransportSystem,
    start_step: int = 0,
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Generator function yielding public transport schedule delay events."""
    step = start_step
    while max_steps is None or step < start_step + max_steps:
        data = transit_system.update(step)
        delayed = data["delayed_routes"]

        severity = "NORMAL"
        event_type = "TRANSIT_FLEET_UPDATE"
        if delayed > 0:
            severity = "WARNING" if data["avg_transit_delay_min"] < 10 else "CRITICAL"
            event_type = "BUS_SCHEDULE_DELAY"

        event = {
            "timestamp": step,
            "step": step,
            "subsystem": "PublicTransport",
            "sector": f"Sector-{random.choice(transit_system.zones).id + 1}",
            "event_type": event_type,
            "severity": severity,
            "message": f"Delayed Lines: {delayed}/{data['total_routes']}, On-Time: {data['on_time_performance_pct']:.0f}%",
            "data": data,
        }
        yield event
        step += 1


# ===========================================================================
# CO-4: Custom Iterator Class (Iterator Protocol __iter__, __next__)
# ===========================================================================

class EventStreamIterator:
    """Custom Iterator implementing Python's Iterator Protocol (__iter__, __next__).

    Satisfies CO-4 by processing and consuming streamed generator events on-demand
    in a memory-efficient manner.
    """

    def __init__(self, generator_func: Generator[Dict[str, Any], None, None], limit: Optional[int] = None) -> None:
        self._gen = generator_func
        self._limit = limit
        self._count = 0

    def __iter__(self) -> Iterator[Dict[str, Any]]:
        """Return self to satisfy iterator protocol."""
        return self

    def __next__(self) -> Dict[str, Any]:
        """Fetch the next event from the generator on-demand."""
        if self._limit is not None and self._count >= self._limit:
            raise StopIteration

        try:
            event = next(self._gen)
            self._count += 1
            return event
        except StopIteration:
            raise StopIteration


class EventPipeline:
    """Iterator-driven pipeline for filtering, transforming, and processing event streams."""

    def __init__(self, source_iterator: Iterator[Dict[str, Any]]) -> None:
        self.source = source_iterator

    def __iter__(self) -> Iterator[Dict[str, Any]]:
        return self.source

    def __next__(self) -> Dict[str, Any]:
        return next(self.source)

    def filter_by_severity(self, allowed_severities: List[str]) -> EventPipeline:
        """Filter streamed events by severity level using generator expression."""
        gen = (event for event in self.source if event.get("severity") in allowed_severities)
        return EventPipeline(gen)

    def filter_by_subsystem(self, subsystem_name: str) -> EventPipeline:
        """Filter streamed events by subsystem name."""
        gen = (event for event in self.source if event.get("subsystem") == subsystem_name)
        return EventPipeline(gen)

    def filter_subsystem(self, subsystem_name: str) -> EventPipeline:
        """Alias for filter_by_subsystem."""
        return self.filter_by_subsystem(subsystem_name)

    def take(self, n: int) -> List[Dict[str, Any]]:
        """Consume up to N events from the pipeline."""
        results = []
        for _ in range(n):
            try:
                results.append(next(self.source))
            except StopIteration:
                break
        return results

    def process_n_events(self, n: int, callback: Callable[[Dict[str, Any]], None]) -> List[Dict[str, Any]]:
        """Consume exactly N events one-by-one and process through a callback."""
        consumed = []
        for _ in range(n):
            try:
                event = next(self.source)
                callback(event)
                consumed.append(event)
            except StopIteration:
                break
        return consumed


# ===========================================================================
# CO-5: Multithreading & Thread-Safe Queue for Concurrent Subsystems
# ===========================================================================

class SubsystemWorkerThread(threading.Thread):
    """Worker thread running an independent subsystem event generator loop.

    Satisfies CO-5 by executing each city subsystem concurrently in its own
    thread and safely posting events to a thread-safe queue.Queue.
    """

    def __init__(
        self,
        subsystem_name: str,
        generator_func: Generator[Dict[str, Any], None, None],
        event_queue: queue.Queue,
        interval_sec: float = 0.5,
    ) -> None:
        super().__init__(name=f"WorkerThread-{subsystem_name}", daemon=True)
        self.subsystem_name = subsystem_name
        self.generator_func = generator_func
        self.event_queue = event_queue
        self.interval_sec = interval_sec
        self.is_running = False
        self._stop_event = threading.Event()

    def run(self) -> None:
        """Continuously generate events and enqueue them safely."""
        self.is_running = True
        while not self._stop_event.is_set():
            try:
                event = next(self.generator_func)
                # Thread-safe queue insertion
                self.event_queue.put(event)
                time.sleep(self.interval_sec)
            except StopIteration:
                break
            except Exception as err:
                print(f"[Thread Error: {self.subsystem_name}]: {err}")
                break
        self.is_running = False

    def stop(self) -> None:
        """Signal thread to gracefully terminate."""
        self._stop_event.set()


class ConcurrentCityEngine:
    """Manages multi-threaded concurrent execution across all 6 city subsystems."""

    def __init__(self, controller: Any, event_interval: float = 0.4) -> None:
        self.controller = controller
        self.event_interval = event_interval
        self.event_queue: queue.Queue = queue.Queue(maxsize=500)
        self.workers: Dict[str, SubsystemWorkerThread] = {}
        self._is_running = False

    @property
    def threads(self) -> Dict[str, SubsystemWorkerThread]:
        """Return dict of worker threads."""
        return self.workers

    def is_running(self) -> bool:
        """Check if concurrent workers are active."""
        return self._is_running

    def start(self) -> None:
        """Alias for start_concurrent_simulation."""
        self.start_concurrent_simulation()

    def stop(self) -> None:
        """Alias for stop_concurrent_simulation."""
        self.stop_concurrent_simulation()

    def drain_event_queue(self, max_events: int = 50) -> List[Dict[str, Any]]:
        """Safely drain all pending events from the queue."""
        events = []
        while not self.event_queue.empty() and len(events) < max_events:
            try:
                event = self.event_queue.get_nowait()
                events.append(event)
                self.event_queue.task_done()
            except queue.Empty:
                break
        return events

    def start_concurrent_simulation(self) -> None:
        """Launch 6 concurrent threads running each subsystem independently."""
        ctrl = self.controller
        self.workers = {
            "Traffic": SubsystemWorkerThread(
                "Traffic",
                traffic_event_generator(ctrl.traffic),
                self.event_queue,
                self.event_interval * 0.9,
            ),
            "Electricity": SubsystemWorkerThread(
                "Electricity",
                electricity_event_generator(ctrl.energy),
                self.event_queue,
                self.event_interval * 1.1,
            ),
            "Water": SubsystemWorkerThread(
                "Water",
                water_event_generator(ctrl.water),
                self.event_queue,
                self.event_interval * 1.2,
            ),
            "Emergency": SubsystemWorkerThread(
                "Emergency",
                emergency_event_generator(ctrl.emergency),
                self.event_queue,
                self.event_interval * 0.8,
            ),
            "Waste": SubsystemWorkerThread(
                "Waste",
                waste_event_generator(ctrl.waste),
                self.event_queue,
                self.event_interval * 1.4,
            ),
            "Transit": SubsystemWorkerThread(
                "Transit",
                transit_event_generator(getattr(ctrl, "transit", PublicTransportSystem(ctrl.zones))),
                self.event_queue,
                self.event_interval * 1.0,
            ),
        }

        self._is_running = True
        for worker in self.workers.values():
            worker.start()

    def consume_events(self, max_events: int = 10, timeout: float = 0.1) -> List[Dict[str, Any]]:
        """Safely dequeue events on the main thread without race conditions."""
        events = []
        for _ in range(max_events):
            try:
                event = self.event_queue.get(timeout=timeout)
                events.append(event)
                self.event_queue.task_done()
            except queue.Empty:
                break
        return events

    def stop_concurrent_simulation(self) -> None:
        """Stop all running worker threads."""
        for worker in self.workers.values():
            worker.stop()
        for worker in self.workers.values():
            worker.join(timeout=1.0)
        self._is_running = False

