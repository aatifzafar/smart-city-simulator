/**
 * Mini Smart City Simulator — Frontend Application Controller
 * Orchestrates REST API polling, simulation loop, UI telemetry HUDs,
 * and synchronizes state with the Three.js 3D WebGL Digital Twin Engine.
 */

class SmartCityApp {
  constructor() {
    this.state = {
      step: 0,
      hour: 12,
      isPlaying: false,
      speedMs: 350,
      activeChartTab: 'all',
      zonesCount: 3,
      latestMetrics: {},
      history: [],
      layout: null,
      activePolicies: {
        odd_even_rule: false,
        curtail_nonrenewable: false,
        water_rationing_rule: false,
        emergency_green_wave: false,
      },
    };

    this.timerId = null;
    this.city3d = null;

    // DOM Elements Mapping
    this.dom = {
      // 3D Viewport
      viewport3d: document.getElementById('city-3d-viewport'),

      // Top Bar Status Pills
      simClock: document.getElementById('sim-clock'),
      policyBadge: document.getElementById('policy-badge'),
      policyText: document.getElementById('policy-text'),
      aqiBadge: document.getElementById('aqi-badge'),
      aqiText: document.getElementById('aqi-text'),
      gridBadge: document.getElementById('grid-badge'),
      gridText: document.getElementById('grid-text'),
      waterBadgeTop: document.getElementById('water-badge-top'),
      waterTextTop: document.getElementById('water-text-top'),
      emsBadgeTop: document.getElementById('ems-badge-top'),
      emsTextTop: document.getElementById('ems-text-top'),

      // Controls
      btnPlay: document.getElementById('btn-play'),
      btnPlayText: document.getElementById('btn-play-text'),
      btnStep: document.getElementById('btn-step'),
      btnReset: document.getElementById('btn-reset'),
      sliderSpeed: document.getElementById('slider-speed'),
      speedDisplay: document.getElementById('speed-display'),
      inputZones: document.getElementById('input-zones'),
      btnApplyConfig: document.getElementById('btn-apply-config'),
      toggleOddEven: document.getElementById('toggle-odd-even'),
      toggleCurtail: document.getElementById('toggle-curtail'),
      toggleWaterRationing: document.getElementById('toggle-water-rationing'),
      toggleGreenWave: document.getElementById('toggle-green-wave'),
      eventsStream: document.getElementById('events-stream'),
      btnClearEvents: document.getElementById('btn-clear-events'),

      // Context Inspect HUD
      inspectCard: document.getElementById('inspect-card'),
      inspectName: document.getElementById('inspect-name'),
      inspectType: document.getElementById('inspect-type'),
      inspectIcon: document.getElementById('inspect-icon'),
      inspectVal1: document.getElementById('inspect-val-1'),
      inspectVal2: document.getElementById('inspect-val-2'),
      inspectVal3: document.getElementById('inspect-val-3'),
      btnCloseInspect: document.getElementById('btn-close-inspect'),

      // Bottom Dock KPIs
      valCongestionPct: document.getElementById('val-congestion-pct'),
      barCongestion: document.getElementById('bar-congestion'),
      valVehicles: document.getElementById('val-vehicles'),
      valRerouted: document.getElementById('val-rerouted'),

      valCleanPct: document.getElementById('val-clean-pct'),
      barEnergy: document.getElementById('bar-energy'),
      valDemand: document.getElementById('val-demand'),
      valEmissions: document.getElementById('val-emissions'),

      valAqiNum: document.getElementById('val-aqi-num'),
      barAqi: document.getElementById('bar-aqi'),
      valAqiStatus: document.getElementById('val-aqi-status'),

      valWaterResPct: document.getElementById('val-water-res-pct'),
      barWater: document.getElementById('bar-water'),
      valWaterDemand: document.getElementById('val-water-demand'),
      valDrainageLoad: document.getElementById('val-drainage-load'),

      valEmsTime: document.getElementById('val-ems-time'),
      barEms: document.getElementById('bar-ems'),
      valIncidents: document.getElementById('val-incidents'),
      valHospitalBeds: document.getElementById('val-hospital-beds'),

      valWasteStatus: document.getElementById('val-waste-status'),
      barWaste: document.getElementById('bar-waste'),
      valWasteGen: document.getElementById('val-waste-gen'),
      valOverflow: document.getElementById('val-overflow'),

      // Charts Modal
      btnToggleCharts: document.getElementById('btn-toggle-charts'),
      chartsModal: document.getElementById('charts-modal'),
      btnCloseCharts: document.getElementById('btn-close-charts'),
      telemetryCanvas: document.getElementById('telemetry-chart'),
    };

    if (this.dom.telemetryCanvas) {
      this.chartCtx = this.dom.telemetryCanvas.getContext('2d');
    }

    this.init();
  }

  async init() {
    // 1. Initialize 3D Digital Twin Engine
    if (window.City3DEngine) {
      this.city3d = new window.City3DEngine(
        this.dom.viewport3d,
        (objectData, simState) => this.handleObjectSelected(objectData, simState)
      );
    }

    // 2. Setup Event Listeners
    this.setupEventListeners();

    // 3. Initial Fetch
    await this.fetchLayout();
    await this.fetchStatus();
    await this.fetchHistory();
  }

  setupEventListeners() {
    // Play/Pause & Step
    this.dom.btnPlay.addEventListener('click', () => this.togglePlay());
    this.dom.btnStep.addEventListener('click', () => this.step());
    this.dom.btnReset.addEventListener('click', () => this.resetSimulation());

    // Speed Slider
    this.dom.sliderSpeed.addEventListener('input', (e) => {
      this.state.speedMs = parseInt(e.target.value, 10);
      this.dom.speedDisplay.textContent = `${this.state.speedMs} ms`;
      if (this.state.isPlaying) {
        this.restartPlayLoop();
      }
    });

    // Apply Zones Scale
    this.dom.btnApplyConfig.addEventListener('click', () => {
      const z = parseInt(this.dom.inputZones.value, 10);
      if (z > 0 && z <= 8) {
        this.resetSimulation(z);
      }
    });

    // Camera Preset Buttons
    document.querySelectorAll('.btn-cam').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-cam').forEach((b) => b.classList.remove('active'));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        const preset = targetBtn.getAttribute('data-preset');
        if (this.city3d) {
          this.city3d.setCameraPreset(preset);
        }
      });
    });

    // 3D Layer Visibility Switches
    ['traffic', 'power', 'water', 'emergency', 'pollution', 'waste'].forEach((layer) => {
      const el = document.getElementById(`layer-${layer}`);
      if (el) {
        el.addEventListener('change', (e) => {
          if (this.city3d) {
            this.city3d.setLayerVisibility(layer, e.target.checked);
          }
        });
      }
    });

    // Policy Toggles
    this.dom.toggleOddEven.addEventListener('change', (e) => {
      this.setPolicy('odd_even_rule', e.target.checked);
    });
    this.dom.toggleCurtail.addEventListener('change', (e) => {
      this.setPolicy('curtail_nonrenewable', e.target.checked);
    });
    this.dom.toggleWaterRationing.addEventListener('change', (e) => {
      this.setPolicy('water_rationing_rule', e.target.checked);
    });
    this.dom.toggleGreenWave.addEventListener('change', (e) => {
      this.setPolicy('emergency_green_wave', e.target.checked);
    });

    // Clear Events
    this.dom.btnClearEvents.addEventListener('click', () => {
      this.dom.eventsStream.innerHTML = '';
    });

    // Close Inspect Card
    this.dom.btnCloseInspect.addEventListener('click', () => {
      this.dom.inspectCard.classList.add('hidden');
      if (this.city3d && this.city3d.highlightRing) {
        this.city3d.highlightRing.visible = false;
      }
    });

    // Toggle Charts Modal
    this.dom.btnToggleCharts.addEventListener('click', () => {
      this.dom.chartsModal.classList.toggle('hidden');
      if (!this.dom.chartsModal.classList.contains('hidden')) {
        this.renderTelemetryChart();
      }
    });
    this.dom.btnCloseCharts.addEventListener('click', () => {
      this.dom.chartsModal.classList.add('hidden');
    });

    // Chart Tabs
    document.querySelectorAll('.chart-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.chart-tab').forEach((t) => t.classList.remove('active'));
        e.target.classList.add('active');
        this.state.activeChartTab = e.target.getAttribute('data-chart');
        this.renderTelemetryChart();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Contextual Raycast Selection Handler
  // -------------------------------------------------------------------------

  handleObjectSelected(data, simState) {
    if (!data) return;

    this.dom.inspectName.textContent = data.name || "Municipal Infrastructure";
    this.dom.inspectType.textContent = (data.type || "INFRASTRUCTURE").replace(/_/g, " ");

    if (data.type === "HOSPITAL") {
      this.dom.inspectIcon.textContent = "🏥";
      this.dom.inspectVal1.textContent = "100% Operational (ICU Ready)";
      this.dom.inspectVal1.className = "text-green";
      this.dom.inspectVal2.textContent = `${this.state.latestMetrics.avg_hospital_occupancy || 60}% Beds Occupied`;
      this.dom.inspectVal3.textContent = `Avg Response: ${this.state.latestMetrics.avg_response_time_min || 7.5} min`;
    } else if (data.type === "SOLAR_FARM") {
      this.dom.inspectIcon.textContent = "☀️";
      this.dom.inspectVal1.textContent = `${this.state.latestMetrics.renewable_mw || 3.5} MW Clean Output`;
      this.dom.inspectVal1.className = "text-green";
      this.dom.inspectVal2.textContent = "Zero Carbon Emissions";
      this.dom.inspectVal3.textContent = `Supply Share: ${this.state.latestMetrics.energy_supply ? Math.round((this.state.latestMetrics.renewable_mw / this.state.latestMetrics.energy_supply) * 100) : 40}%`;
    } else if (data.type === "GAS_POWER_PLANT") {
      this.dom.inspectIcon.textContent = "🏭";
      const curtailed = this.state.activePolicies.curtail_nonrenewable;
      this.dom.inspectVal1.textContent = curtailed ? "CURTAILED (50% Cap)" : "Active Peaker (Standard)";
      this.dom.inspectVal1.className = curtailed ? "text-rose" : "text-accent";
      this.dom.inspectVal2.textContent = `Output: ${this.state.latestMetrics.non_renewable_mw || 2.5} MW`;
      this.dom.inspectVal3.textContent = `Hourly Emissions: ${Math.round(this.state.latestMetrics.emissions_kg || 0)} kg`;
    } else if (data.type === "WATER_RESERVOIR") {
      this.dom.inspectIcon.textContent = "💧";
      const resPct = this.state.latestMetrics.reservoir_level_pct !== undefined ? this.state.latestMetrics.reservoir_level_pct : 85.0;
      this.dom.inspectVal1.textContent = `${resPct.toFixed(1)}% Capacity (${data.capacity || "15,000 kL"})`;
      this.dom.inspectVal1.className = resPct < 25 ? "text-rose" : "text-cyan";
      this.dom.inspectVal2.textContent = `Consumption: ${Math.round(this.state.latestMetrics.water_consumption_kl || 0)} kL/hr`;
      this.dom.inspectVal3.textContent = `Drainage Load: ${this.state.latestMetrics.avg_drainage_load_pct || 25}%`;
    } else if (data.type === "GRID_SUBSTATION") {
      this.dom.inspectIcon.textContent = "⚡";
      const blackout = !!this.state.latestMetrics.blackout;
      this.dom.inspectVal1.textContent = blackout ? "GRID BLACKOUT (DEFICIT)" : "Active Substation (Balanced)";
      this.dom.inspectVal1.className = blackout ? "text-rose" : "text-green";
      this.dom.inspectVal2.textContent = `Supply: ${(this.state.latestMetrics.energy_supply || 6.0).toFixed(1)} MW / Demand: ${(this.state.latestMetrics.energy_usage || 5.8).toFixed(1)} MW`;
      this.dom.inspectVal3.textContent = `Clean Energy Share: ${this.state.latestMetrics.energy_supply ? Math.round(((this.state.latestMetrics.renewable_mw || 3.5) / this.state.latestMetrics.energy_supply) * 100) : 55}%`;
    } else if (data.type === "GRID_PYLON") {
      this.dom.inspectIcon.textContent = "🗼";
      this.dom.inspectVal1.textContent = "220 kV High-Voltage Line";
      this.dom.inspectVal1.className = "text-accent";
      this.dom.inspectVal2.textContent = "Transmitting Power to Districts";
      this.dom.inspectVal3.textContent = `Grid Frequency: 50.0 Hz (Synchronized)`;
    } else if (data.type === "DRAINAGE_PUMP") {
      this.dom.inspectIcon.textContent = "🌀";
      const load = this.state.latestMetrics.avg_drainage_load_pct || 25;
      this.dom.inspectVal1.textContent = `${load}% Saturation (${data.capacity || "3,000 kL/hr"})`;
      this.dom.inspectVal1.className = load > 75 ? "text-rose" : "text-cyan";
      this.dom.inspectVal2.textContent = "Stormwater Flood Prevention Active";
      this.dom.inspectVal3.textContent = `Pumps: 2 High-Flow Turbines Operational`;
    } else if (data.type === "TRAFFIC_SIGNAL") {
      this.dom.inspectIcon.textContent = "🚦";
      const state = this.state.activePolicies.emergency_green_wave ? "GREEN (EMS Corridor Override)" : data.state || "GREEN";
      this.dom.inspectVal1.textContent = `Signal State: ${state}`;
      this.dom.inspectVal1.className = state.includes("GREEN") ? "text-green" : "text-rose";
      this.dom.inspectVal2.textContent = `Congestion: ${(this.state.latestMetrics.traffic_congestion * 100 || 0).toFixed(1)}%`;
      this.dom.inspectVal3.textContent = `Active Commuters: ${this.state.latestMetrics.total_vehicles || 0}`;
    }

    this.dom.inspectCard.classList.remove('hidden');
  }

  // -------------------------------------------------------------------------
  // REST API Actions
  // -------------------------------------------------------------------------

  async fetchLayout() {
    try {
      const res = await fetch('/api/city_layout');
      if (res.ok) {
        this.state.layout = await res.json();
      }
    } catch (err) {
      console.warn('Failed to fetch layout:', err);
    }
  }

  async fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        this.state.step = data.step;
        this.state.hour = data.hour_of_day;
        this.state.latestMetrics = data.latest_metrics || {};
        this.state.activePolicies = data.active_policies || this.state.activePolicies;

        this.updateHUD(data);

        if (this.city3d) {
          this.city3d.syncSimulationState(this.state.latestMetrics, this.state.layout, data);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch status:', err);
    }
  }

  async fetchHistory() {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        this.state.history = data.history || [];
        this.renderTelemetryChart();
      }
    } catch (err) {
      console.warn('Failed to fetch history:', err);
    }
  }

  async step() {
    try {
      const res = await fetch('/api/step', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.state.latestMetrics = data.record;
        this.state.history.push(data.record);
        this.state.step = data.record.step;
        this.state.hour = data.record.hour_of_day;

        if (data.recent_events && data.recent_events.length > 0) {
          data.recent_events.forEach((evt) => this.pushEventLog(evt));
        }

        await this.fetchStatus();
        this.renderTelemetryChart();
      }
    } catch (err) {
      console.error('Simulation step failed:', err);
    }
  }

  async setPolicy(policyName, active) {
    try {
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: policyName, active: active }),
      });
      if (res.ok) {
        const data = await res.json();
        this.state.activePolicies = data.active_policies || this.state.activePolicies;
        this.pushEventLog({
          timestamp: this.state.step,
          type: 'POLICY',
          message: `Manual policy override: ${policyName} -> ${active ? 'ENABLED' : 'DISABLED'}`,
        });
        await this.fetchStatus();
      }
    } catch (err) {
      console.error('Failed to toggle policy:', err);
    }
  }

  async resetSimulation(zones = 3) {
    if (this.state.isPlaying) {
      this.togglePlay();
    }
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zones: zones, seed: 42 }),
      });
      if (res.ok) {
        this.state.history = [];
        this.dom.eventsStream.innerHTML = '';
        this.pushEventLog({
          timestamp: 0,
          type: 'SYSTEM',
          message: `3D Digital Twin reset to Step 00 with ${zones} districts.`,
        });
        await this.fetchLayout();
        await this.fetchStatus();
        await this.fetchHistory();
      }
    } catch (err) {
      console.error('Failed to reset simulation:', err);
    }
  }

  togglePlay() {
    this.state.isPlaying = !this.state.isPlaying;
    if (this.state.isPlaying) {
      this.dom.btnPlay.classList.add('playing');
      this.dom.btnPlayText.textContent = 'Pause';
      this.dom.btnPlay.querySelector('.btn-icon').textContent = '⏸';
      this.startPlayLoop();
    } else {
      this.dom.btnPlay.classList.remove('playing');
      this.dom.btnPlayText.textContent = 'Run Auto';
      this.dom.btnPlay.querySelector('.btn-icon').textContent = '▶';
      this.stopPlayLoop();
    }
  }

  startPlayLoop() {
    this.timerId = setInterval(() => {
      this.step();
    }, this.state.speedMs);
  }

  stopPlayLoop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  restartPlayLoop() {
    this.stopPlayLoop();
    this.startPlayLoop();
  }

  // -------------------------------------------------------------------------
  // HUD Telemetry Updates
  // -------------------------------------------------------------------------

  updateHUD(statusData) {
    const m = statusData.latest_metrics || {};
    const step = statusData.step || 0;
    const hour = statusData.hour_of_day !== undefined ? statusData.hour_of_day : 12;
    const day = Math.floor(step / 24) + 1;

    // Top Clock Pill
    this.dom.simClock.innerHTML = `Step ${String(step).padStart(2, '0')} <small>(${String(hour).padStart(2, '0')}:00 Day ${day})</small>`;

    // Policy Pill
    const oddEvenActive = this.state.activePolicies.odd_even_rule;
    if (oddEvenActive) {
      this.dom.policyBadge.className = 'telemetry-pill pill-alert';
      this.dom.policyText.textContent = 'ODD-EVEN ACTIVE';
      this.dom.toggleOddEven.checked = true;
    } else {
      this.dom.policyBadge.className = 'telemetry-pill pill-normal';
      this.dom.policyText.textContent = 'TRAFFIC: NORMAL';
      this.dom.toggleOddEven.checked = false;
    }

    // Grid Pill
    if (m.blackout) {
      this.dom.gridBadge.className = 'telemetry-pill pill-alert';
      this.dom.gridText.textContent = 'GRID: BLACKOUT!';
    } else {
      this.dom.gridBadge.className = 'telemetry-pill pill-normal';
      this.dom.gridText.textContent = 'GRID: BALANCED';
    }

    // Water Top Pill
    const resLevel = m.reservoir_level_pct !== undefined ? m.reservoir_level_pct : 85.0;
    this.dom.waterTextTop.textContent = `RESERVES: ${resLevel.toFixed(0)}%`;
    this.dom.waterBadgeTop.className = resLevel < 25 ? 'telemetry-pill pill-alert' : 'telemetry-pill pill-cyan';

    // EMS Top Pill
    const greenWave = this.state.activePolicies.emergency_green_wave;
    if (greenWave || (m.critical_incidents && m.critical_incidents > 0)) {
      this.dom.emsBadgeTop.className = 'telemetry-pill pill-alert';
      this.dom.emsTextTop.textContent = 'EMS: GREEN WAVE ACTIVE';
    } else {
      this.dom.emsBadgeTop.className = 'telemetry-pill pill-rose';
      this.dom.emsTextTop.textContent = 'EMS: STANDBY';
    }

    // Policy Switch Checkboxes
    this.dom.toggleCurtail.checked = !!this.state.activePolicies.curtail_nonrenewable;
    this.dom.toggleWaterRationing.checked = !!this.state.activePolicies.water_rationing_rule;
    this.dom.toggleGreenWave.checked = !!this.state.activePolicies.emergency_green_wave;

    // Subsystem 1: Traffic Dock
    const congestion = m.traffic_congestion || 0;
    const congestionPct = (congestion * 100).toFixed(1);
    this.dom.valCongestionPct.textContent = `${congestionPct}%`;
    this.dom.barCongestion.style.width = `${Math.min(100, congestion * 100)}%`;
    this.dom.valVehicles.textContent = m.total_vehicles || 0;
    this.dom.valRerouted.textContent = m.rerouted_vehicles || 0;

    // Subsystem 2: Energy Dock
    const demand = m.energy_usage || 0;
    const renew = m.renewable_mw || 0;
    const cleanPct = demand > 0 ? Math.min(100, Math.round((renew / demand) * 100)) : 0;
    this.dom.valCleanPct.textContent = `${cleanPct}% Clean`;
    this.dom.barEnergy.style.width = `${cleanPct}%`;
    this.dom.valDemand.textContent = `${demand.toFixed(1)} MW`;
    this.dom.valEmissions.textContent = `${Math.round(m.emissions_kg || 0)} kg`;

    // Subsystem 3: AQI Dock
    const aqi = m.aqi || 35.0;
    this.dom.valAqiNum.textContent = aqi.toFixed(1);
    this.dom.barAqi.style.width = `${Math.min(100, (aqi / 160) * 100)}%`;
    if (aqi < 80) {
      this.dom.aqiBadge.className = 'telemetry-pill pill-good';
      this.dom.aqiText.textContent = `AQI ${aqi.toFixed(1)} • GOOD`;
      this.dom.valAqiStatus.textContent = 'GOOD';
      this.dom.valAqiStatus.className = 'text-green';
    } else if (aqi < 110) {
      this.dom.aqiBadge.className = 'telemetry-pill pill-normal';
      this.dom.aqiText.textContent = `AQI ${aqi.toFixed(1)} • MODERATE`;
      this.dom.valAqiStatus.textContent = 'MODERATE';
      this.dom.valAqiStatus.className = 'text-accent';
    } else {
      this.dom.aqiBadge.className = 'telemetry-pill pill-alert';
      this.dom.aqiText.textContent = `AQI ${aqi.toFixed(1)} • UNHEALTHY`;
      this.dom.valAqiStatus.textContent = 'UNHEALTHY';
      this.dom.valAqiStatus.className = 'text-rose';
    }

    // Subsystem 4: Water Dock
    this.dom.valWaterResPct.textContent = `${resLevel.toFixed(1)}%`;
    this.dom.barWater.style.width = `${Math.min(100, resLevel)}%`;
    this.dom.valWaterDemand.textContent = `${Math.round(m.water_consumption_kl || 0)} kL`;
    this.dom.valDrainageLoad.textContent = `${(m.avg_drainage_load_pct || 25).toFixed(0)}%`;

    // Subsystem 5: EMS Dock
    const respTime = m.avg_response_time_min || 7.5;
    this.dom.valEmsTime.textContent = `${respTime.toFixed(1)} min`;
    this.dom.barEms.style.width = `${Math.min(100, (respTime / 20) * 100)}%`;
    this.dom.valIncidents.textContent = m.emergency_incidents || 0;
    this.dom.valHospitalBeds.textContent = `${(m.avg_hospital_occupancy || 60).toFixed(0)}%`;

    // Subsystem 6: Waste Dock
    const overflows = m.overflow_bins || 0;
    this.dom.valWasteStatus.textContent = overflows > 0 ? `${overflows} Overflows` : 'Normal';
    this.dom.valWasteStatus.className = overflows > 0 ? 'text-rose' : 'text-purple';
    this.dom.barWaste.style.width = `${Math.min(100, 20 + overflows * 20)}%`;
    this.dom.valWasteGen.textContent = `${Math.round(m.total_waste_kg || 0)} kg`;
    this.dom.valOverflow.textContent = overflows;
  }

  pushEventLog(event) {
    const entry = document.createElement('div');
    const timeStr = `Step ${String(event.timestamp).padStart(2, '0')}`;
    let badgeClass = 'event-info';
    let typeName = event.type || 'EVENT';

    if (event.high_pollution || (event.aqi && event.aqi >= 110)) {
      badgeClass = 'event-alert';
      typeName = 'POLLUTION';
    } else if (event.type === 'BlackoutEvent' || event.deficit_mw) {
      badgeClass = 'event-blackout';
      typeName = 'BLACKOUT';
    } else if (event.type === 'WaterDeficitEvent') {
      badgeClass = 'event-alert';
      typeName = 'WATER';
    } else if (event.type === 'DrainageOverflowEvent') {
      badgeClass = 'event-alert';
      typeName = 'FLOOD';
    } else if (event.type === 'EmergencyCorridorEvent') {
      badgeClass = 'event-alert';
      typeName = 'EMS';
    } else if (event.type === 'PolicyChangeEvent' || event.type === 'POLICY') {
      badgeClass = 'event-policy';
      typeName = 'AUTONOMOUS';
    }

    entry.className = `event-entry ${badgeClass}`;
    entry.innerHTML = `
      <span class="event-time">${timeStr}</span>
      <span class="event-badge">${typeName}</span>
      <span class="event-msg">${event.message || 'Subsystem state changed'}</span>
    `;

    this.dom.eventsStream.insertBefore(entry, this.dom.eventsStream.firstChild);

    if (this.dom.eventsStream.children.length > 50) {
      this.dom.eventsStream.removeChild(this.dom.eventsStream.lastChild);
    }
  }

  renderTelemetryChart() {
    if (!this.chartCtx || !this.dom.telemetryCanvas) return;

    const ctx = this.chartCtx;
    const canvas = this.dom.telemetryCanvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const history = this.state.history;
    if (!history || history.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Advancing simulation generates live multi-subsystem telemetry curves...', w / 2, h / 2);
      return;
    }

    const padLeft = 50;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const maxSteps = Math.max(history.length - 1, 24);
    const getX = (idx) => padLeft + (idx / maxSteps) * plotW;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let s = 0; s <= 4; s++) {
      const y = padTop + (s / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
    }

    // Highlight Odd-Even Policy Active spans
    for (let i = 0; i < history.length; i++) {
      if (history[i].odd_even_active) {
        const xStart = getX(Math.max(0, i - 0.5));
        const xEnd = getX(Math.min(maxSteps, i + 0.5));
        ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
        ctx.fillRect(xStart, padTop, xEnd - xStart, plotH);
      }
    }

    const tab = this.state.activeChartTab;

    // Series 1: Traffic Congestion (Blue)
    if (tab === 'all' || tab === 'traffic') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      history.forEach((rec, idx) => {
        const x = getX(idx);
        const y = padTop + (1 - Math.min(1.0, rec.traffic_congestion || 0)) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Series 2: Energy Demand (Green)
    if (tab === 'all' || tab === 'energy') {
      const maxEnergy = Math.max(...history.map((r) => r.energy_usage || 5), 10);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      history.forEach((rec, idx) => {
        const x = getX(idx);
        const val = (rec.energy_usage || 0) / maxEnergy;
        const y = padTop + (1 - Math.min(1.0, val)) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Series 3: Air Quality Index (Amber)
    if (tab === 'all' || tab === 'aqi') {
      const maxAqi = 160;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      history.forEach((rec, idx) => {
        const x = getX(idx);
        const val = (rec.aqi || 30) / maxAqi;
        const y = padTop + (1 - Math.min(1.0, val)) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Alert threshold line @ AQI 110
      const alertY = padTop + (1 - 110 / maxAqi) * plotH;
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, alertY);
      ctx.lineTo(w - padRight, alertY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Series 4: Water Reservoir % (Cyan)
    if (tab === 'all' || tab === 'water') {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      history.forEach((rec, idx) => {
        const x = getX(idx);
        const val = (rec.reservoir_level_pct !== undefined ? rec.reservoir_level_pct : 85) / 100;
        const y = padTop + (1 - Math.min(1.0, val)) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Series 5: EMS Response Time (Rose)
    if (tab === 'all' || tab === 'emergency') {
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      history.forEach((rec, idx) => {
        const x = getX(idx);
        const val = (rec.avg_response_time_min || 7.5) / 20.0;
        const y = padTop + (1 - Math.min(1.0, val)) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Axis Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('100%', padLeft - 6, padTop + 8);
    ctx.fillText('50%', padLeft - 6, padTop + plotH / 2 + 4);
    ctx.fillText('0%', padLeft - 6, padTop + plotH);

    ctx.textAlign = 'center';
    ctx.fillText('0h', padLeft, h - 10);
    ctx.fillText(`${Math.floor(maxSteps / 2)}h`, padLeft + plotW / 2, h - 10);
    ctx.fillText(`${maxSteps}h`, w - padRight, h - 10);
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SmartCityApp();
});
