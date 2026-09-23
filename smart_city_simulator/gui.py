"""Interactive Graphical User Interface (GUI) Dashboard for Mini Smart City Simulator.

Built with Python's built-in Tkinter and Matplotlib canvas, providing live step-by-step
controls, parameter sliders, real-time subsystem metric gauges, and visual logs.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk, messagebox
from typing import Optional
import random

import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt

from smart_city_simulator.city.controller import CityController
from smart_city_simulator.city.traffic import DynamicCongestionReroutingStrategy
from smart_city_simulator.city.event_bus import EventBus
from smart_city_simulator.city.environment import PollutionAlertEvent
from smart_city_simulator.city.energy import BlackoutEvent
from smart_city_simulator.city.waste import WasteOverflowEvent


class SmartCityDashboard(tk.Tk):
    """Interactive Tkinter GUI Dashboard for the Smart City Simulator."""

    def __init__(self, initial_zones: int = 3, initial_steps: int = 48) -> None:
        super().__init__()
        self.title("🌆 Mini Smart City Simulator — Interactive Dashboard")
        self.geometry("1100x820")
        self.minsize(950, 700)

        self.initial_zones = initial_zones
        self.total_steps = initial_steps
        self.current_step = 0
        self.is_running = False
        self.speed_ms = 350

        self.controller: Optional[CityController] = None
        self._init_controller(self.initial_zones)

        self._setup_ui()
        self._subscribe_ui_events()
        self._render_plot()

    def _init_controller(self, zones: int) -> None:
        """Instantiate or re-instantiate the city controller."""
        CityController.reset_instance()
        EventBus().clear()
        self.controller = CityController(zones=zones)
        self.current_step = 0

    def _setup_ui(self) -> None:
        """Build layout panels, control bars, and plot canvases."""
        # Top Header
        header_frame = ttk.Frame(self, padding="10 10 10 5")
        header_frame.pack(fill=tk.X)

        title_label = ttk.Label(
            header_frame,
            text="Mini Smart City Simulator",
            font=("Helvetica", 18, "bold"),
        )
        title_label.pack(side=tk.LEFT)

        subtitle_label = ttk.Label(
            header_frame,
            text="Autonomous Multi-Subsystem Simulation & Emergent Policy Engine",
            font=("Helvetica", 11, "italic"),
            foreground="#555555",
        )
        subtitle_label.pack(side=tk.LEFT, padx=15, pady=4)

        # Control Toolbar
        controls_frame = ttk.LabelFrame(self, text="Simulation Controls", padding="10")
        controls_frame.pack(fill=tk.X, padx=10, pady=5)

        # Buttons
        self.btn_play = ttk.Button(controls_frame, text="▶ Run / Pause", command=self.toggle_run)
        self.btn_play.pack(side=tk.LEFT, padx=4)

        self.btn_step = ttk.Button(controls_frame, text="⏭ Step (1h)", command=self.step_simulation)
        self.btn_step.pack(side=tk.LEFT, padx=4)

        self.btn_reset = ttk.Button(controls_frame, text="🔄 Reset", command=self.reset_simulation)
        self.btn_reset.pack(side=tk.LEFT, padx=4)

        ttk.Separator(controls_frame, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=10)

        # Zones selector
        ttk.Label(controls_frame, text="Zones:").pack(side=tk.LEFT, padx=3)
        self.zones_var = tk.IntVar(value=self.initial_zones)
        self.zones_spin = ttk.Spinbox(
            controls_frame, from_=1, to=8, width=4, textvariable=self.zones_var
        )
        self.zones_spin.pack(side=tk.LEFT, padx=3)

        self.btn_apply_zones = ttk.Button(controls_frame, text="Apply", command=self.apply_zones)
        self.btn_apply_zones.pack(side=tk.LEFT, padx=4)

        ttk.Separator(controls_frame, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=10)

        # Speed slider
        ttk.Label(controls_frame, text="Speed:").pack(side=tk.LEFT, padx=3)
        self.speed_scale = ttk.Scale(
            controls_frame, from_=50, to=800, orient=tk.HORIZONTAL, value=self.speed_ms
        )
        self.speed_scale.pack(side=tk.LEFT, padx=5)

        # Status Cards Panel
        cards_frame = ttk.Frame(self, padding="10 5")
        cards_frame.pack(fill=tk.X)

        self.lbl_step = ttk.Label(cards_frame, text="Step: 0 / 48 (00:00)", font=("Helvetica", 11, "bold"))
        self.lbl_step.pack(side=tk.LEFT, padx=10)

        self.lbl_traffic = ttk.Label(cards_frame, text="Traffic: 0% Congestion", font=("Helvetica", 11))
        self.lbl_traffic.pack(side=tk.LEFT, padx=10)

        self.lbl_energy = ttk.Label(cards_frame, text="Energy: 0.0 MW", font=("Helvetica", 11))
        self.lbl_energy.pack(side=tk.LEFT, padx=10)

        self.lbl_aqi = ttk.Label(cards_frame, text="AQI: 30 (GOOD)", font=("Helvetica", 11, "bold"), foreground="#2ca02c")
        self.lbl_aqi.pack(side=tk.LEFT, padx=10)

        self.lbl_policy = ttk.Label(cards_frame, text="Policy: Normal", font=("Helvetica", 11, "bold"), foreground="#1f77b4")
        self.lbl_policy.pack(side=tk.LEFT, padx=10)

        # Main Central Area: Plot on left, Event Log on right
        main_paned = ttk.PanedWindow(self, orient=tk.HORIZONTAL)
        main_paned.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Plot Frame
        plot_frame = ttk.Frame(main_paned)
        main_paned.add(plot_frame, weight=3)

        self.fig, self.axes = plt.subplots(3, 1, figsize=(7, 6), sharex=True)
        self.fig.tight_layout(pad=2.0)
        self.canvas = FigureCanvasTkAgg(self.fig, master=plot_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        # Event Log Frame
        log_frame = ttk.LabelFrame(main_paned, text="Municipal Event Log", padding="5")
        main_paned.add(log_frame, weight=1)

        self.log_text = tk.Text(log_frame, wrap=tk.WORD, font=("Courier", 9), height=15)
        log_scroll = ttk.Scrollbar(log_frame, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scroll.set)
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scroll.pack(side=tk.RIGHT, fill=tk.Y)

    def _subscribe_ui_events(self) -> None:
        """Listen to event bus for real-time console messages."""
        EventBus().subscribe(PollutionAlertEvent, self._on_pollution_event)
        EventBus().subscribe(BlackoutEvent, self._on_blackout_event)

    def _on_pollution_event(self, event: PollutionAlertEvent) -> None:
        if event.high_pollution:
            self._add_log(f"[Step {event.timestamp:02d}] ⚠️ AQI {event.aqi:.1f} (UNHEALTHY) -> Odd-Even rule active!")

    def _on_blackout_event(self, event: BlackoutEvent) -> None:
        self._add_log(f"[Step {event.timestamp:02d}] ⚡ Blackout alert! Deficit {event.deficit_mw:.1f} MW")

    def _add_log(self, text: str) -> None:
        self.log_text.insert(tk.END, text + "\n")
        self.log_text.see(tk.END)

    def apply_zones(self) -> None:
        """Apply new zone configuration."""
        z = self.zones_var.get()
        if z <= 0:
            messagebox.showerror("Error", "Zones must be greater than 0")
            return
        self.reset_simulation(new_zones=z)

    def toggle_run(self) -> None:
        """Start or pause continuous automatic simulation."""
        self.is_running = not self.is_running
        if self.is_running:
            self.btn_play.configure(text="⏸ Pause")
            self._run_loop()
        else:
            self.btn_play.configure(text="▶ Run")

    def _run_loop(self) -> None:
        """Timer loop advancing simulation."""
        if not self.is_running:
            return
        if self.current_step >= self.total_steps:
            self.is_running = False
            self.btn_play.configure(text="▶ Run")
            self._add_log(f"✅ Simulation reached step limit ({self.total_steps}).")
            return

        self.step_simulation()
        delay = int(self.speed_scale.get())
        self.after(delay, self._run_loop)

    def step_simulation(self) -> None:
        """Advance simulation by a single hour."""
        if not self.controller or self.current_step >= self.total_steps:
            return

        step = self.current_step
        self.current_step += 1

        # Advance Subsystems
        traffic_data = self.controller.traffic.update(step)
        energy_data = self.controller.energy.update(step)
        waste_data = self.controller.waste.update(step)
        env_data = self.controller.environment.update(
            step=step,
            traffic_congestion=traffic_data["traffic_congestion"],
            total_vehicles=traffic_data["total_vehicles"],
            non_renewable_mw=energy_data["non_renewable_mw"],
        )

        record = {
            "step": step,
            "traffic_congestion": traffic_data["traffic_congestion"],
            "total_vehicles": traffic_data["total_vehicles"],
            "energy_usage": energy_data["energy_usage"],
            "energy_supply": energy_data["energy_supply"],
            "renewable_mw": energy_data["renewable_mw"],
            "non_renewable_mw": energy_data["non_renewable_mw"],
            "blackout": 1 if energy_data["blackout"] else 0,
            "aqi": env_data["aqi"],
            "high_pollution": 1 if env_data["high_pollution"] else 0,
            "odd_even_active": 1 if self.controller.active_policies["odd_even_rule"] else 0,
        }
        self.controller.time_series.append(record)

        # Update HUD Labels
        hour = step % 24
        self.lbl_step.configure(text=f"Step: {step + 1} / {self.total_steps} ({hour:02d}:00)")
        self.lbl_traffic.configure(text=f"Traffic: {traffic_data['traffic_congestion']:.1%} Congestion ({traffic_data['total_vehicles']} cars)")
        self.lbl_energy.configure(text=f"Energy: {energy_data['energy_usage']:.1f} MW (Clean: {energy_data['renewable_mw']:.1f})")

        aqi_val = env_data["aqi"]
        if aqi_val < 80:
            self.lbl_aqi.configure(text=f"AQI: {aqi_val:.1f} (GOOD)", foreground="#2ca02c")
        elif aqi_val < 110:
            self.lbl_aqi.configure(text=f"AQI: {aqi_val:.1f} (MODERATE)", foreground="#ff7f0e")
        else:
            self.lbl_aqi.configure(text=f"AQI: {aqi_val:.1f} (UNHEALTHY)", foreground="#d62728")

        if self.controller.active_policies["odd_even_rule"]:
            self.lbl_policy.configure(text="Policy: Odd-Even Active", foreground="#d62728")
        else:
            self.lbl_policy.configure(text="Policy: Normal", foreground="#1f77b4")

        # Refresh Charts periodically
        if (step % 2 == 0) or (step == self.total_steps - 1):
            self._render_plot()

    def reset_simulation(self, new_zones: Optional[int] = None) -> None:
        """Reset simulation state and clear display."""
        self.is_running = False
        self.btn_play.configure(text="▶ Run")
        zones = new_zones if new_zones is not None else self.zones_var.get()
        self._init_controller(zones)
        self._subscribe_ui_events()
        self.log_text.delete("1.0", tk.END)
        self._add_log(f"Initialized new simulation with {zones} zones.")
        self.lbl_step.configure(text="Step: 0 / 48 (00:00)")
        self.lbl_traffic.configure(text="Traffic: 0% Congestion")
        self.lbl_energy.configure(text="Energy: 0.0 MW")
        self.lbl_aqi.configure(text="AQI: 30 (GOOD)", foreground="#2ca02c")
        self.lbl_policy.configure(text="Policy: Normal", foreground="#1f77b4")
        self._render_plot()

    def _render_plot(self) -> None:
        """Draw current time series in the embedded matplotlib axes."""
        for ax in self.axes:
            ax.clear()

        history = self.controller.time_series if self.controller else []
        if not history:
            self.axes[0].set_title("Traffic Congestion (0.0 - 1.0)", fontsize=10)
            self.axes[1].set_title("Energy Demand & Dispatched Supply (MW)", fontsize=10)
            self.axes[2].set_title("Air Quality Index (AQI)", fontsize=10)
            self.canvas.draw()
            return

        steps = [r["step"] for r in history]
        congestion = [r["traffic_congestion"] for r in history]
        energy_demand = [r["energy_usage"] for r in history]
        energy_supply = [r["energy_supply"] for r in history]
        aqi = [r["aqi"] for r in history]
        odd_even = [r.get("odd_even_active", 0) for r in history]

        # Axis 0: Traffic
        self.axes[0].plot(steps, congestion, color="#3182bd", lw=1.8, label="Congestion")
        self.axes[0].axhline(0.75, color="#de2d26", ls="--", alpha=0.5, label="Alert")
        self.axes[0].set_ylim(0, max(1.0, max(congestion) * 1.1))
        self.axes[0].set_ylabel("Congestion", fontsize=8)
        self.axes[0].grid(True, alpha=0.3)
        self.axes[0].legend(loc="upper left", fontsize=7)

        # Highlight odd-even
        for i, s in enumerate(steps):
            if odd_even[i]:
                self.axes[0].axvspan(s - 0.5, s + 0.5, color="#fee6ce", alpha=0.4)

        # Axis 1: Energy
        self.axes[1].plot(steps, energy_demand, color="#fdae6b", lw=1.8, label="Demand")
        self.axes[1].plot(steps, energy_supply, color="#31a354", lw=1.8, label="Supply")
        self.axes[1].set_ylabel("MW", fontsize=8)
        self.axes[1].grid(True, alpha=0.3)
        self.axes[1].legend(loc="upper left", fontsize=7)

        # Axis 2: AQI
        self.axes[2].plot(steps, aqi, color="#e6550d", lw=2.0, label="AQI")
        self.axes[2].axhline(110.0, color="#de2d26", ls="--", alpha=0.6, label="Alert (110)")
        self.axes[2].axhline(80.0, color="#31a354", ls=":", alpha=0.6, label="Safe (80)")
        self.axes[2].set_ylabel("AQI", fontsize=8)
        self.axes[2].set_xlabel("Step (Hour)", fontsize=8)
        self.axes[2].grid(True, alpha=0.3)
        self.axes[2].legend(loc="upper left", fontsize=7)

        self.fig.tight_layout(pad=1.5)
        self.canvas.draw()


def launch_gui(initial_zones: int = 3, initial_steps: int = 48) -> None:
    """Launch the Tkinter GUI dashboard application."""
    app = SmartCityDashboard(initial_zones=initial_zones, initial_steps=initial_steps)
    app.mainloop()


if __name__ == "__main__":
    launch_gui()
