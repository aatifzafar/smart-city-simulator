/**
 * Mini Smart City Simulator — Frontend Client & Canvas Visualization Engine
 */

class SmartCityApp {
  constructor() {
    this.state = {
      step: 0,
      hour: 0,
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
      },
      layers: {
        vehicles: true,
        signals: true,
        power: true,
        haze: true,
      },
    };

    this.timerId = null;
    this.animationFrameId = null;
    this.particleTime = 0;

    // DOM Elements
    this.dom = {
      simClock: document.getElementById('sim-clock'),
      policyBadge: document.getElementById('policy-badge'),
      policyText: document.getElementById('policy-text'),
      aqiBadge: document.getElementById('aqi-badge'),
      aqiText: document.getElementById('aqi-text'),
      gridBadge: document.getElementById('grid-badge'),
      gridText: document.getElementById('grid-text'),

      // KPI Elements
      metricCongestion: document.getElementById('metric-congestion'),
      congestionBar: document.getElementById('congestion-bar'),
      valVehicles: document.getElementById('val-vehicles'),
      valRerouted: document.getElementById('val-rerouted'),
      trafficBadge: document.getElementById('traffic-percent-badge'),

      metricDemand: document.getElementById('metric-demand'),
      energyBar: document.getElementById('energy-bar'),
      valSupply: document.getElementById('val-supply'),
      valEmissions: document.getElementById('val-emissions'),
      energyCleanBadge: document.getElementById('energy-clean-badge'),

      metricAqi: document.getElementById('metric-aqi'),
      aqiBar: document.getElementById('aqi-bar'),
      valAqiTraffic: document.getElementById('val-aqi-traffic'),
      valAqiEnergy: document.getElementById('val-aqi-energy'),
      aqiCatBadge: document.getElementById('aqi-category-badge'),

      metricWaste: document.getElementById('metric-waste'),
      wasteBar: document.getElementById('waste-bar'),
      valWasteCollected: document.getElementById('val-waste-collected'),
      valOverflow: document.getElementById('val-overflow'),
      wasteBadge: document.getElementById('waste-badge'),

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
      eventsStream: document.getElementById('events-stream'),
      btnClearEvents: document.getElementById('btn-clear-events'),

      // Subsystem health
      statStrategy: document.getElementById('stat-strategy'),
      statRenewShare: document.getElementById('stat-renew-share'),
      statFleet: document.getElementById('stat-fleet'),
      statEmergency: document.getElementById('stat-emergency'),

      // Canvases
      cityCanvas: document.getElementById('city-canvas'),
      telemetryCanvas: document.getElementById('telemetry-chart'),
    };

    this.cityCtx = this.dom.cityCanvas.getContext('2d');
    this.chartCtx = this.dom.telemetryCanvas.getContext('2d');

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupCanvasDPI(this.dom.cityCanvas, this.cityCtx);
    this.setupCanvasDPI(this.dom.telemetryCanvas, this.chartCtx);

    await this.fetchLayout();
    await this.fetchStatus();
    await this.fetchHistory();

    // Start 60fps canvas animation loop
    this.startCanvasAnimation();
  }

  setupCanvasDPI(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', () => {
      this.setupCanvasDPI(this.dom.cityCanvas, this.cityCtx);
      this.setupCanvasDPI(this.dom.telemetryCanvas, this.chartCtx);
      this.renderTelemetryChart();
    });

    // Play/Pause
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

    // Policy Toggles
    this.dom.toggleOddEven.addEventListener('change', (e) => {
      this.setPolicy('odd_even_rule', e.target.checked);
    });
    this.dom.toggleCurtail.addEventListener('change', (e) => {
      this.setPolicy('curtail_nonrenewable', e.target.checked);
    });

    // Clear Events
    this.dom.btnClearEvents.addEventListener('click', () => {
      this.dom.eventsStream.innerHTML = '';
    });

    // Layer Toggles
    document.getElementById('layer-vehicles').addEventListener('change', (e) => {
      this.state.layers.vehicles = e.target.checked;
    });
    document.getElementById('layer-signals').addEventListener('change', (e) => {
      this.state.layers.signals = e.target.checked;
    });
    document.getElementById('layer-power').addEventListener('change', (e) => {
      this.state.layers.power = e.target.checked;
    });
    document.getElementById('layer-haze').addEventListener('change', (e) => {
      this.state.layers.haze = e.target.checked;
    });

    // Chart Tabs
    document.querySelectorAll('.chart-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.chart-tab').forEach((t) => t.classList.remove('active'));
        e.target.classList.add('active');
        this.state.activeChartTab = e.target.dataset.chart;
        this.renderTelemetryChart();
      });
    });
  }

  // -------------------------------------------------------------------------
  // API Network Calls
  // -------------------------------------------------------------------------

  async fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.state.step = data.step;
      this.state.hour = data.hour_of_day;
      this.state.activePolicies = data.active_policies || {};
      this.state.latestMetrics = data.latest_metrics || {};

      this.updateHUD(data);
    } catch (err) {
      console.error('Status fetch error:', err);
    }
  }

  async fetchLayout() {
    try {
      const res = await fetch('/api/city_layout');
      this.state.layout = await res.json();
    } catch (err) {
      console.error('Layout fetch error:', err);
    }
  }

  async fetchHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      this.state.history = data.history || [];
      this.renderTelemetryChart();
    } catch (err) {
      console.error('History fetch error:', err);
    }
  }

  async step() {
    try {
      const res = await fetch('/api/step', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.record) {
        this.state.history.push(data.record);
        this.state.latestMetrics = data.record;
        this.state.step = data.total_steps;
        this.state.hour = data.record.hour_of_day;

        // Process any new events
        if (data.recent_events) {
          data.recent_events.forEach((evt) => this.pushEventLog(evt));
        }

        await this.fetchLayout();
        await this.fetchStatus();
        this.renderTelemetryChart();
      }
    } catch (err) {
      console.error('Step error:', err);
    }
  }

  togglePlay() {
    this.state.isPlaying = !this.state.isPlaying;
    if (this.state.isPlaying) {
      this.dom.btnPlay.classList.add('btn-danger');
      this.dom.btnPlay.classList.remove('btn-primary');
      this.dom.btnPlayText.textContent = 'Pause';
      this.startPlayLoop();
    } else {
      this.dom.btnPlay.classList.remove('btn-danger');
      this.dom.btnPlay.classList.add('btn-primary');
      this.dom.btnPlayText.textContent = 'Run Auto';
      this.stopPlayLoop();
    }
  }

  startPlayLoop() {
    this.timerId = setInterval(async () => {
      if (!this.state.isPlaying) return;
      await this.step();
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
    if (this.state.isPlaying) {
      this.startPlayLoop();
    }
  }

  async resetSimulation(zones = null) {
    this.stopPlayLoop();
    this.state.isPlaying = false;
    this.dom.btnPlay.classList.remove('btn-danger');
    this.dom.btnPlay.classList.add('btn-primary');
    this.dom.btnPlayText.textContent = 'Run Auto';

    const count = zones || this.state.zonesCount;
    this.state.zonesCount = count;

    try {
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zones: count }),
      });
      this.state.history = [];
      this.pushEventLog({
        type: 'SYSTEM',
        timestamp: 0,
        message: `City simulation reset with ${count} municipal zones.`,
      });

      await this.fetchLayout();
      await this.fetchStatus();
      this.renderTelemetryChart();
    } catch (err) {
      console.error('Reset error:', err);
    }
  }

  async setPolicy(policyName, active) {
    try {
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: policyName, active: active }),
      });
      const data = await res.json();
      if (data.active_policies) {
        this.state.activePolicies = data.active_policies;
        this.pushEventLog({
          type: 'POLICY_MANUAL',
          timestamp: this.state.step,
          message: `Manual override: ${policyName} set to ${active ? 'ACTIVE' : 'OFF'}.`,
        });
        await this.fetchStatus();
      }
    } catch (err) {
      console.error('Policy toggle error:', err);
    }
  }

  // -------------------------------------------------------------------------
  // HUD & UI Updates
  // -------------------------------------------------------------------------

  updateHUD(statusData) {
    const m = statusData.latest_metrics || {};
    const step = statusData.step || 0;
    const hour = statusData.hour_of_day || 0;
    const day = Math.floor(step / 24) + 1;

    // Top Clock
    this.dom.simClock.innerHTML = `Step ${String(step).padStart(2, '0')} <small>(${String(hour).padStart(2, '0')}:00 - Day ${day})</small>`;

    // Policy Pill Badge
    const oddEvenActive = this.state.activePolicies.odd_even_rule;
    if (oddEvenActive) {
      this.dom.policyBadge.className = 'status-pill pill-alert';
      this.dom.policyText.textContent = 'Odd-Even Rule: ACTIVE';
      this.dom.toggleOddEven.checked = true;
    } else {
      this.dom.policyBadge.className = 'status-pill pill-normal';
      this.dom.policyText.textContent = 'Traffic: Standard';
      this.dom.toggleOddEven.checked = false;
    }

    // Grid Status Pill
    const blackout = m.blackout;
    if (blackout) {
      this.dom.gridBadge.className = 'status-pill pill-alert';
      this.dom.gridText.textContent = 'Grid: BLACKOUT!';
    } else {
      this.dom.gridBadge.className = 'status-pill pill-normal';
      this.dom.gridText.textContent = 'Grid: Balanced';
    }

    // Curtail switch
    this.dom.toggleCurtail.checked = !!this.state.activePolicies.curtail_nonrenewable;

    // Card 1: Traffic
    const congestion = m.traffic_congestion || 0;
    const congestionPct = (congestion * 100).toFixed(1);
    this.dom.metricCongestion.textContent = `${congestionPct}%`;
    this.dom.congestionBar.style.width = `${Math.min(100, congestion * 100)}%`;
    this.dom.trafficBadge.textContent = `${congestionPct}%`;
    this.dom.valVehicles.textContent = m.total_vehicles || 0;
    this.dom.valRerouted.textContent = m.rerouted_vehicles || 0;

    // Card 2: Energy
    const demand = m.energy_usage || 0;
    const supply = m.energy_supply || 0;
    const renew = m.renewable_mw || 0;
    const cleanPct = demand > 0 ? Math.min(100, Math.round((renew / demand) * 100)) : 0;
    this.dom.metricDemand.innerHTML = `${demand.toFixed(1)} <small>MW</small>`;
    this.dom.energyBar.style.width = `${cleanPct}%`;
    this.dom.energyCleanBadge.textContent = `${cleanPct}% Clean`;
    this.dom.valSupply.textContent = `${supply.toFixed(1)} MW`;
    this.dom.valEmissions.textContent = `${Math.round(m.emissions_kg || 0)} kg`;
    this.dom.statRenewShare.textContent = `${cleanPct}%`;

    // Card 3: AQI
    const aqi = m.aqi || 30.0;
    const aqiFormatted = aqi.toFixed(1);
    this.dom.metricAqi.textContent = aqiFormatted;
    this.dom.aqiBar.style.width = `${Math.min(100, (aqi / 160) * 100)}%`;
    this.dom.valAqiTraffic.textContent = (m.traffic_congestion * 60 || 0).toFixed(1);
    this.dom.valAqiEnergy.textContent = (m.non_renewable_mw * 12 || 0).toFixed(1);

    if (aqi < 80) {
      this.dom.aqiBadge.className = 'status-pill pill-good';
      this.dom.aqiBadge.innerHTML = `<span class="pill-dot"></span><span>AQI ${aqiFormatted} • GOOD</span>`;
      this.dom.aqiCatBadge.className = 'kpi-badge badge-emerald';
      this.dom.aqiCatBadge.textContent = 'GOOD';
      this.dom.statEmergency.textContent = 'Normal';
      this.dom.statEmergency.className = 'text-green';
    } else if (aqi < 110) {
      this.dom.aqiBadge.className = 'status-pill pill-normal';
      this.dom.aqiBadge.innerHTML = `<span class="pill-dot"></span><span>AQI ${aqiFormatted} • MODERATE</span>`;
      this.dom.aqiCatBadge.className = 'kpi-badge badge-blue';
      this.dom.aqiCatBadge.textContent = 'MODERATE';
      this.dom.statEmergency.textContent = 'Elevated';
      this.dom.statEmergency.className = 'text-accent';
    } else {
      this.dom.aqiBadge.className = 'status-pill pill-alert';
      this.dom.aqiBadge.innerHTML = `<span class="pill-dot"></span><span>AQI ${aqiFormatted} • UNHEALTHY</span>`;
      this.dom.aqiCatBadge.className = 'kpi-badge badge-alert';
      this.dom.aqiCatBadge.textContent = 'UNHEALTHY';
      this.dom.statEmergency.textContent = 'EMERGENCY ACTIVE';
      this.dom.statEmergency.className = 'text-muted' + ' font-bold';
    }

    // Card 4: Waste
    const wasteGen = m.total_waste_kg || 0;
    const wasteCol = m.collected_waste_kg || 0;
    const overflows = m.overflow_bins || 0;
    this.dom.metricWaste.innerHTML = `${Math.round(wasteGen)} <small>kg</small>`;
    this.dom.valWasteCollected.textContent = `${Math.round(wasteCol)} kg`;
    this.dom.valOverflow.textContent = overflows;
    if (overflows > 0) {
      this.dom.wasteBadge.className = 'kpi-badge badge-alert';
      this.dom.wasteBadge.textContent = `${overflows} Overflows`;
    } else {
      this.dom.wasteBadge.className = 'kpi-badge badge-purple';
      this.dom.wasteBadge.textContent = 'Normal';
    }
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
    } else if (event.type === 'PolicyChangeEvent' || event.type === 'POLICY_MANUAL') {
      badgeClass = 'event-policy';
      typeName = 'POLICY';
    }

    entry.className = `event-entry ${badgeClass}`;
    entry.innerHTML = `
      <span class="event-time">${timeStr}</span>
      <span class="event-badge">${typeName}</span>
      <span class="event-msg">${event.message || 'System state update'}</span>
    `;

    this.dom.eventsStream.insertBefore(entry, this.dom.eventsStream.firstChild);

    // Trim excess entries
    if (this.dom.eventsStream.children.length > 50) {
      this.dom.eventsStream.removeChild(this.dom.eventsStream.lastChild);
    }
  }

  // -------------------------------------------------------------------------
  // Canvas City Map Visualizer (60fps Animation Loop)
  // -------------------------------------------------------------------------

  startCanvasAnimation() {
    const render = () => {
      this.particleTime += 0.02;
      this.renderCityMap();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  renderCityMap() {
    const ctx = this.cityCtx;
    const canvas = this.dom.cityCanvas;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Draw Subtle Tech Grid Background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!this.state.layout || !this.state.layout.zones) return;

    const zones = this.state.layout.zones;
    const numZones = zones.length;

    // Calculate zone positions in a pleasant circular or multi-column layout
    const zonePositions = [];
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.35;

    for (let i = 0; i < numZones; i++) {
      const angle = (i / numZones) * Math.PI * 2 - Math.PI / 2;
      const zx = centerX + Math.cos(angle) * radius;
      const zy = centerY + Math.sin(angle) * radius;
      zonePositions.push({ x: zx, y: zy, zone: zones[i] });
    }

    // 1. Draw Roads between Zones
    this.renderRoads(ctx, zonePositions);

    // 2. Draw Zones (Districts)
    this.renderZones(ctx, zonePositions);

    // 3. Draw Municipal Infrastructure (Power plants, Solar, Wind)
    if (this.state.layers.power) {
      this.renderInfrastructure(ctx, zonePositions);
    }

    // 4. Draw Animated Vehicles
    if (this.state.layers.vehicles) {
      this.renderVehicles(ctx, zonePositions);
    }

    // 5. Draw Signals
    if (this.state.layers.signals) {
      this.renderSignals(ctx, zonePositions);
    }

    // 6. Draw Refuse Collection Trucks
    this.renderGarbageTrucks(ctx, zonePositions);

    // 7. Draw Atmospheric Pollution Haze Overlay
    if (this.state.layers.haze) {
      this.renderPollutionHaze(ctx, w, h);
    }
  }

  renderRoads(ctx, positions) {
    const num = positions.length;
    if (num < 2) return;

    const congestion = this.state.latestMetrics.traffic_congestion || 0.2;

    // Ring road connecting adjacent zones
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    for (let i = 0; i < num; i++) {
      const p1 = positions[i];
      const p2 = positions[(i + 1) % num];
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Arterial roads radiating from center to each zone
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    for (let i = 0; i < num; i++) {
      const p = positions[i];
      ctx.moveTo(ctx.canvas.width / 4, ctx.canvas.height / 4); // virtual center
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Road glowing active neon lane
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = congestion > 0.7 ? '#f43f5e' : '#38bdf8';
    ctx.shadowColor = congestion > 0.7 ? '#f43f5e' : '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < num; i++) {
      const p1 = positions[i];
      const p2 = positions[(i + 1) % num];
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
  }

  renderZones(ctx, positions) {
    positions.forEach((pos, idx) => {
      const z = pos.zone;

      // Glow area
      const grad = ctx.createRadialGradient(pos.x, pos.y, 10, pos.x, pos.y, 65);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 65, 0, Math.PI * 2);
      ctx.fill();

      // Core Zone Hub Circle
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // District Icon
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏢', pos.x, pos.y - 2);

      // District Label
      ctx.font = '600 11px Outfit, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(z.name, pos.x, pos.y + 45);

      ctx.font = '400 9px JetBrains Mono, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Pop: ${z.population}`, pos.x, pos.y + 58);
    });
  }

  renderInfrastructure(ctx, positions) {
    positions.forEach((pos, idx) => {
      // Solar Farm Icon offset
      const sx = pos.x + 44;
      const sy = pos.y - 35;
      ctx.font = '14px sans-serif';
      ctx.fillText('☀️', sx, sy);

      // Wind Farm offset with rotation
      const wx = pos.x - 44;
      const wy = pos.y - 35;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(this.particleTime * 2);
      ctx.fillText('💨', 0, 0);
      ctx.restore();

      // Gas Plant offset
      const gx = pos.x;
      const gy = pos.y - 48;
      ctx.fillText('🏭', gx, gy);
    });
  }

  renderVehicles(ctx, positions) {
    const num = positions.length;
    if (num < 2) return;

    const vehiclesCount = Math.min(24, Math.max(8, Math.floor((this.state.latestMetrics.total_vehicles || 500) / 70)));
    const oddEvenActive = this.state.activePolicies.odd_even_rule;

    for (let v = 0; v < vehiclesCount; v++) {
      const fromIdx = v % num;
      const toIdx = (fromIdx + 1) % num;
      const p1 = positions[fromIdx];
      const p2 = positions[toIdx];

      // Calculate position along edge
      const speedFactor = 0.3;
      const progress = (this.particleTime * speedFactor + (v / vehiclesCount)) % 1.0;
      const vx = p1.x + (p2.x - p1.x) * progress;
      const vy = p1.y + (p2.y - p1.y) * progress;

      // Draw Vehicle Node
      const isOddPlate = (v % 2 !== 0);
      const isRestricted = oddEvenActive && isOddPlate;

      if (isRestricted) {
        // Vehicle pulled over / barred
        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(vx + 6, vy + 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(vx, vy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  renderSignals(ctx, positions) {
    const intersections = (this.state.layout && this.state.layout.intersections) || [];
    positions.forEach((pos, idx) => {
      const inter = intersections[idx] || { state: 'GREEN' };
      const color = inter.state === 'GREEN' ? '#10b981' : inter.state === 'YELLOW' ? '#f59e0b' : '#f43f5e';

      // Draw signal indicator dot
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pos.x + 24, pos.y + 24, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  renderGarbageTrucks(ctx, positions) {
    const num = positions.length;
    if (num < 2) return;

    // Garbage truck circulating routes
    const progress = (this.particleTime * 0.15) % 1.0;
    const currentEdge = Math.floor(this.particleTime * 0.15 * num) % num;
    const nextEdge = (currentEdge + 1) % num;

    const p1 = positions[currentEdge];
    const p2 = positions[nextEdge];
    const localProg = (this.particleTime * 0.15 * num) % 1.0;

    const tx = p1.x + (p2.x - p1.x) * localProg;
    const ty = p1.y + (p2.y - p1.y) * localProg;

    ctx.font = '15px sans-serif';
    ctx.fillText('🚛', tx, ty);
  }

  renderPollutionHaze(ctx, w, h) {
    const aqi = this.state.latestMetrics.aqi || 30.0;
    if (aqi <= 50) return; // Clean air

    const opacity = Math.min(0.45, Math.max(0.05, (aqi - 50) / 140));
    const isUnhealthy = aqi >= 110;

    // Haze tint: amber to red-orange
    const hazeColor = isUnhealthy ? `rgba(239, 68, 68, ${opacity})` : `rgba(245, 158, 11, ${opacity * 0.7})`;

    ctx.fillStyle = hazeColor;
    ctx.fillRect(0, 0, w, h);

    // If unhealthy, draw floating particulate motes
    if (isUnhealthy) {
      ctx.fillStyle = 'rgba(254, 202, 202, 0.4)';
      for (let i = 0; i < 20; i++) {
        const px = ((i * 67 + this.particleTime * 15) % w);
        const py = ((i * 43 + this.particleTime * 10) % h);
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Telemetry Chart Rendering (Canvas Multi-Series)
  // -------------------------------------------------------------------------

  renderTelemetryChart() {
    const ctx = this.chartCtx;
    const canvas = this.dom.telemetryCanvas;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const history = this.state.history;
    if (!history || history.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Advancing simulation will generate live multi-subsystem telemetry curves...', w / 2, h / 2);
      return;
    }

    const padLeft = 45;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const maxSteps = Math.max(history.length - 1, 24);
    const getX = (idx) => padLeft + (idx / maxSteps) * plotW;

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let s = 0; s <= 4; s++) {
      const y = padTop + (s / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
    }

    // Highlight Odd-Even Restriction Active spans
    for (let i = 0; i < history.length; i++) {
      if (history[i].odd_even_active) {
        const xStart = getX(Math.max(0, i - 0.5));
        const xEnd = getX(Math.min(maxSteps, i + 0.5));
        ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
        ctx.fillRect(xStart, padTop, xEnd - xStart, plotH);
      }
    }

    const tab = this.state.activeChartTab;

    // Series 1: Traffic Congestion (0.0 - 1.0) -> scaled to 0-100%
    if (tab === 'all' || tab === 'traffic') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      history.forEach((rec, idx) => {
        const x = getX(idx);
        const y = padTop + (1 - Math.min(1.0, rec.traffic_congestion)) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Series 2: Energy Demand (MW)
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

    // Series 3: Air Quality Index (0 - 160)
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
      ctx.setLineDash([]); // Reset
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

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SmartCityApp();
});
