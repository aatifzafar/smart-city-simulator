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

      // 2D City Map Canvas
      city2dCanvas: document.getElementById('city-2d-canvas'),

      // Charts Modal
      btnToggleCharts: document.getElementById('btn-toggle-charts'),
      chartsModal: document.getElementById('charts-modal'),
      btnCloseCharts: document.getElementById('btn-close-charts'),
      telemetryCanvas: document.getElementById('telemetry-chart'),
    };

    if (this.dom.telemetryCanvas) {
      this.chartCtx = this.dom.telemetryCanvas.getContext('2d');
    }

    if (this.dom.city2dCanvas) {
      this.map2dCtx = this.dom.city2dCanvas.getContext('2d');
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

    // 3. Start 2D Map Continuous Render Loop
    this.start2DMapLoop();

    // 4. Initial Fetch
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

  // -------------------------------------------------------------------------
  // 2D City Blueprint Minimap Engine
  // -------------------------------------------------------------------------

  start2DMapLoop() {
    if (!this.dom.city2dCanvas || !this.map2dCtx) return;

    // Attach click interaction on 2D map to inspect objects / focus camera
    this.dom.city2dCanvas.addEventListener('click', (e) => this.handle2DMapClick(e));

    const loop = () => {
      this.render2DMap();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  render2DMap() {
    const canvas = this.dom.city2dCanvas;
    const ctx = this.map2dCtx;
    if (!canvas || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const time = Date.now() * 0.003;

    // 1. Clear background
    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, w, h);

    // 2. Blueprint Radar Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Coordinate conversion helper: 3D world [-240, 240] -> 2D Canvas [0, w] & [0, h]
    const to2D = (wx, wz) => {
      return {
        x: w / 2 + (wx / 260) * (w * 0.44),
        y: h / 2 + (wz / 260) * (h * 0.44),
      };
    };

    // 3. District Zone Boundaries
    const districts = [
      { name: "D1 Res", x: -130, z: 100, color: "rgba(56, 189, 248, 0.07)" },
      { name: "D2 Downtown", x: 0, z: 100, color: "rgba(2, 132, 199, 0.09)" },
      { name: "D3 Ind", x: 130, z: 100, color: "rgba(100, 116, 139, 0.08)" },
      { name: "D4 Parks", x: -60, z: -100, color: "rgba(16, 185, 129, 0.07)" },
    ];

    districts.forEach((d) => {
      const p = to2D(d.x, d.z);
      ctx.fillStyle = d.color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(p.x - 24, p.y - 18, 48, 36, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.font = "8px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(d.name, p.x, p.y + 3);
    });

    // 4. Perimeter Ring Road
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const ringCenter = to2D(0, 0);
    const ringRx = (230 / 260) * (w * 0.44);
    const ringRy = (230 / 260) * (h * 0.44);
    ctx.ellipse(ringCenter.x, ringCenter.y, ringRx, ringRy, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Arterial Boulevard & Cross Avenues
    const congestion = this.state.latestMetrics.traffic_congestion || 0.2;
    let roadColor = '#10b981'; // Green
    if (congestion > 0.7) roadColor = '#f43f5e'; // Red
    else if (congestion > 0.4) roadColor = '#f59e0b'; // Amber

    // Main Arterial Boulevard (East-West)
    const pW = to2D(-240, 0);
    const pE = to2D(240, 0);
    ctx.strokeStyle = roadColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pW.x, pW.y);
    ctx.lineTo(pE.x, pE.y);
    ctx.stroke();

    // North-South Avenues
    [-160, 0, 160].forEach((ax) => {
      const pN = to2D(ax, 210);
      const pS = to2D(ax, -210);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pN.x, pN.y);
      ctx.lineTo(pS.x, pS.y);
      ctx.stroke();
    });

    // 6. Power Grid Transmission Lines (Dashed Gold/Green)
    const pSolar = to2D(-160, 180);
    const pSub = to2D(0, 150);
    const pGas = to2D(160, 180);
    const pDowntown = to2D(0, 60);

    ctx.strokeStyle = this.state.latestMetrics.blackout ? '#f43f5e' : 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pSolar.x, pSolar.y);
    ctx.lineTo(pSub.x, pSub.y);
    ctx.lineTo(pGas.x, pGas.y);
    ctx.moveTo(pSub.x, pSub.y);
    ctx.lineTo(pDowntown.x, pDowntown.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 7. Water Aqueduct Lines (Dashed Cyan)
    const pRes = to2D(130, -130);
    const pPumpJunc = to2D(0, -60);
    const pHosp = to2D(-120, -110);

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(pRes.x, pRes.y);
    ctx.lineTo(pPumpJunc.x, pPumpJunc.y);
    ctx.lineTo(pHosp.x, pHosp.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 8. Key Infrastructure Nodes & Icons
    // Solar Park
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(pSolar.x, pSolar.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText('☀️ Solar', pSolar.x, pSolar.y - 6);

    // Gas Peaker Plant
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(pGas.x, pGas.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.fillText('🏭 Gas', pGas.x, pGas.y - 6);

    // Substation
    ctx.fillStyle = this.state.latestMetrics.blackout ? '#f43f5e' : '#38bdf8';
    ctx.beginPath();
    ctx.rect(pSub.x - 3, pSub.y - 3, 6, 6);
    ctx.fill();
    ctx.fillStyle = '#bae6fd';
    ctx.fillText('⚡ Grid', pSub.x, pSub.y - 6);

    // Water Reservoir Basin
    const resLevel = this.state.latestMetrics.reservoir_level_pct !== undefined ? this.state.latestMetrics.reservoir_level_pct : 85;
    ctx.fillStyle = resLevel < 25 ? 'rgba(217, 119, 6, 0.5)' : 'rgba(2, 132, 199, 0.6)';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(pRes.x - 14, pRes.y - 12, 28, 24, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText(`💧 ${Math.round(resLevel)}%`, pRes.x, pRes.y + 3);

    // General Hospital
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(pHosp.x, pHosp.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('🏥 Hospital', pHosp.x, pHosp.y - 6);

    // 9. Traffic Signal Junction Indicators
    [-160, 0, 160].forEach((ix) => {
      const pInt = to2D(ix, 0);
      const isGreen = this.state.activePolicies.emergency_green_wave || Math.sin(time + ix) > 0;
      ctx.fillStyle = isGreen ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(pInt.x, pInt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 10. Moving Commuter Vehicle Dots
    if (this.city3d && this.city3d.vehicles) {
      this.city3d.vehicles.forEach((car) => {
        if (!car.mesh.visible) return;
        const pCar = to2D(car.mesh.position.x, car.mesh.position.z);
        ctx.fillStyle = car.isOddPlate ? '#38bdf8' : '#fbbf24';
        ctx.beginPath();
        ctx.arc(pCar.x, pCar.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 11. Emergency Ambulance Radar Pulse Dot
    if (this.city3d && this.city3d.ambulance && this.city3d.ambulance.active) {
      const pAmb = to2D(this.city3d.ambulance.mesh.position.x, this.city3d.ambulance.mesh.position.z);
      
      // Radar ring pulse
      const pulseRad = 3 + (Math.sin(time * 6) + 1) * 3;
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pAmb.x, pAmb.y, pulseRad, 0, Math.PI * 2);
      ctx.stroke();

      // Flashing ambulance dot
      ctx.fillStyle = Math.sin(time * 10) > 0 ? '#f43f5e' : '#ffffff';
      ctx.beginPath();
      ctx.arc(pAmb.x, pAmb.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  handle2DMapClick(event) {
    const canvas = this.dom.city2dCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const w = canvas.width;
    const h = canvas.height;

    // Convert 2D click back to world approx
    const worldX = ((clickX - w / 2) / (w * 0.44)) * 260;
    const worldZ = ((clickY - h / 2) / (h * 0.44)) * 260;

    // Check proximity to key nodes and trigger inspection / 3D camera
    if (Math.hypot(worldX - 130, worldZ - (-130)) < 40) {
      if (this.city3d) this.city3d.setCameraPreset("WATER");
      this.handleObjectSelected({ type: "WATER_RESERVOIR", name: "Central Aqueduct & Stormwater Reservoir", capacity: "15,000 kL" });
    } else if (Math.hypot(worldX - (-160), worldZ - 180) < 40) {
      if (this.city3d) this.city3d.setCameraPreset("POWER");
      this.handleObjectSelected({ type: "SOLAR_FARM", name: "Helios Renewable Solar & Wind Park" });
    } else if (Math.hypot(worldX - 160, worldZ - 180) < 40) {
      if (this.city3d) this.city3d.setCameraPreset("POWER");
      this.handleObjectSelected({ type: "GAS_POWER_PLANT", name: "Vulcan Natural Gas Peaker Plant" });
    } else if (Math.hypot(worldX - 0, worldZ - 150) < 35) {
      if (this.city3d) this.city3d.setCameraPreset("POWER");
      this.handleObjectSelected({ type: "GRID_SUBSTATION", name: "Central Municipal Power Substation" });
    } else if (Math.hypot(worldX - (-120), worldZ - (-110)) < 40) {
      if (this.city3d) this.city3d.setCameraPreset("EMERGENCY");
      this.handleObjectSelected({ type: "HOSPITAL", name: "Metro General Hospital & Trauma Center" });
    } else {
      if (this.city3d) this.city3d.setCameraPreset("TRAFFIC");
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SmartCityApp();
});
