/**
 * Mini Smart City Simulator — 3D WebGL Digital Twin Engine
 * Built with Three.js (r128) & OrbitControls
 * 
 * Renders a living, interactive, procedural 3D smart city driven
 * directly by the discrete-event simulation backend with fully functional
 * Power Grid (transmission lines, energy pulses, transformers, smoke plumes)
 * and Reservoir Water Network (dynamic water levels, pipelines, pumps, cascades).
 */

class City3DEngine {
  constructor(containerElement, onObjectSelectCallback) {
    this.container = containerElement;
    this.onObjectSelect = onObjectSelectCallback;

    // Simulation State Reference
    this.simState = {
      step: 0,
      hour: 12,
      congestion: 0.2,
      totalVehicles: 150,
      oddEvenActive: false,
      greenWaveActive: false,
      blackout: false,
      curtailActive: false,
      aqi: 35.0,
      reservoirLevelPct: 85.0,
      waterRationingActive: false,
      criticalIncident: false,
      activeIncidentId: null,
      emergencyZoneId: 0,
      intersections: {},
      powerPlants: [],
      hospitals: [],
      reservoirs: [],
      renewableMw: 3.5,
      nonRenewableMw: 2.5,
      energySupply: 6.0,
      energyUsage: 5.8,
      waterConsumptionKl: 120.0,
      avgDrainageLoadPct: 25.0,
    };

    // Layer Visibility
    this.layers = {
      traffic: true,
      power: true,
      water: true,
      emergency: true,
      pollution: true,
      waste: true,
      signals: true,
      infrastructure: true,
    };

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Scene Groups
    this.groundGroup = new THREE.Group();
    this.roadsGroup = new THREE.Group();
    this.buildingsGroup = new THREE.Group();
    this.vehiclesGroup = new THREE.Group();
    this.signalsGroup = new THREE.Group();
    this.powerGroup = new THREE.Group();
    this.waterGroup = new THREE.Group();
    this.emergencyGroup = new THREE.Group();
    this.wasteGroup = new THREE.Group();
    this.particlesGroup = new THREE.Group();
    this.lightsGroup = new THREE.Group();

    // Interactive Objects Registry
    this.interactiveObjects = [];
    this.selectedObject = null;
    this.highlightRing = null;

    // Moving Entities & Animated Systems
    this.vehicles = [];
    this.ambulance = null;
    this.garbageTrucks = [];
    this.windTurbines = [];
    this.solarPanels = [];
    this.chimneys = [];
    this.smokeParticles = [];
    this.powerTransmissionCurves = [];
    this.powerPulses = [];
    this.waterPipelineCurves = [];
    this.waterPulses = [];
    this.waterSplashParticles = [];
    this.substationLights = [];
    this.drainagePumps = [];

    // Lighting References for Day/Night Cycle
    this.sunLight = null;
    this.moonLight = null;
    this.hemiLight = null;
    this.ambientLight = null;
    this.streetLights = [];
    this.windowMaterials = [];
    this.smogMesh = null;
    this.waterMesh = null;
    this.waterLevelIndicator = null;
    this.substationBeacon = null;
    this.reservoirDeficitBeacon = null;

    // Animation & Camera Transition
    this.clock = new THREE.Clock();
    this.cameraTargetPos = null;
    this.cameraTargetLook = null;
    this.isTransitioningCamera = false;

    this.init();
  }

  // ---------------------------------------------------------------------------
  // Initialization & Setup
  // ---------------------------------------------------------------------------

  init() {
    // 1. Scene & Background
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06090e);
    this.scene.fog = new THREE.FogExp2(0x0a0f19, 0.0018);

    // 2. Camera Setup
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    this.camera.position.set(0, 220, 320);

    // 3. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls Setup
    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
      this.controls.minDistance = 30;
      this.controls.maxDistance = 650;
      this.controls.target.set(0, 0, 0);
    }

    // 5. Add Scene Groups
    this.scene.add(this.groundGroup);
    this.scene.add(this.roadsGroup);
    this.scene.add(this.buildingsGroup);
    this.scene.add(this.vehiclesGroup);
    this.scene.add(this.signalsGroup);
    this.scene.add(this.powerGroup);
    this.scene.add(this.waterGroup);
    this.scene.add(this.emergencyGroup);
    this.scene.add(this.wasteGroup);
    this.scene.add(this.particlesGroup);
    this.scene.add(this.lightsGroup);

    // 6. Build World Systems
    this.setupLighting();
    this.buildCityTerrain();
    this.buildRoadNetwork();
    this.buildDistrictsAndBuildings();
    this.buildInfrastructure();
    this.buildPowerGrid();
    this.buildWaterNetwork();
    this.buildVehicleFleet();
    this.setupSmokeParticles();
    this.setupWaterSplashParticles();
    this.setupSelectionIndicator();
    this.setupEventListeners();

    // 7. Start Render Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // ---------------------------------------------------------------------------
  // Lighting & Day/Night System
  // ---------------------------------------------------------------------------

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xddeeff, 0.4);
    this.lightsGroup.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x7090b0, 0x101520, 0.45);
    this.hemiLight.position.set(0, 200, 0);
    this.lightsGroup.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    this.sunLight.position.set(150, 300, 150);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 800;
    const d = 260;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.lightsGroup.add(this.sunLight);

    this.moonLight = new THREE.DirectionalLight(0x406090, 0.0);
    this.moonLight.position.set(-150, 250, -150);
    this.lightsGroup.add(this.moonLight);

    // Atmospheric Smog Layer (Pollution Haze)
    const smogGeo = new THREE.SphereGeometry(380, 32, 16);
    const smogMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.0,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.smogMesh = new THREE.Mesh(smogGeo, smogMat);
    this.smogMesh.position.set(0, 0, 0);
    this.scene.add(this.smogMesh);
  }

  updateDayNightCycle(hour) {
    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const sunDist = 320;
    const sunY = Math.sin(sunAngle) * sunDist;
    const sunX = Math.cos(sunAngle) * sunDist;

    this.sunLight.position.set(sunX, Math.max(10, sunY), 120);

    const isDay = hour >= 6 && hour <= 19;
    const dayProgress = (hour - 6) / 13;

    // Track solar panels towards sun elevation
    if (this.solarPanels.length > 0) {
      const panelTilt = isDay ? -Math.PI / 6 + (dayProgress - 0.5) * 0.4 : -Math.PI / 6;
      this.solarPanels.forEach((p) => {
        p.rotation.x = panelTilt;
      });
    }

    if (this.simState.blackout) {
      // Blackout cuts all civil lights
      this.setStreetLightsState(false);
      this.setWindowGlowState(0.0);
      this.ambientLight.intensity = isDay ? 0.35 : 0.08;
      this.hemiLight.intensity = isDay ? 0.35 : 0.10;
      return;
    }

    if (isDay) {
      const elevationFactor = Math.sin(dayProgress * Math.PI);
      this.sunLight.intensity = 0.4 + elevationFactor * 1.1;
      this.sunLight.color.setHSL(0.12 - (1 - elevationFactor) * 0.06, 0.4, 0.95);
      this.ambientLight.intensity = 0.35 + elevationFactor * 0.3;
      this.hemiLight.intensity = 0.4 + elevationFactor * 0.3;
      this.moonLight.intensity = 0.0;
      this.scene.fog.color.setHex(0x0a101d);

      this.setStreetLightsState(false);
      this.setWindowGlowState(0.15);
    } else {
      this.sunLight.intensity = 0.0;
      this.moonLight.intensity = 0.4;
      this.ambientLight.intensity = 0.15;
      this.hemiLight.intensity = 0.18;
      this.scene.fog.color.setHex(0x04060a);

      this.setStreetLightsState(true);
      this.setWindowGlowState(0.9);
    }
  }

  setStreetLightsState(active) {
    this.streetLights.forEach((light) => {
      light.intensity = active ? 1.8 : 0.0;
    });
  }

  setWindowGlowState(emissiveIntensity) {
    this.windowMaterials.forEach((mat) => {
      mat.emissiveIntensity = emissiveIntensity;
    });
  }

  // ---------------------------------------------------------------------------
  // Procedural 3D City Builder
  // ---------------------------------------------------------------------------

  buildCityTerrain() {
    const groundGeo = new THREE.PlaneGeometry(600, 600, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0c131f,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.groundGroup.add(ground);

    const rimGeo = new THREE.BoxGeometry(606, 12, 606);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x070b12,
      roughness: 0.7,
      metalness: 0.3,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -6;
    this.groundGroup.add(rim);

    const zoneColors = [0x111b2b, 0x142033, 0x162438, 0x121e30, 0x152236];
    for (let i = 0; i < 5; i++) {
      const tileGeo = new THREE.PlaneGeometry(160, 160);
      const tileMat = new THREE.MeshStandardMaterial({
        color: zoneColors[i % zoneColors.length],
        roughness: 0.85,
      });
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.y = 0.05;
      
      const angle = (i / 5) * Math.PI * 2;
      const rad = 130;
      tile.position.x = Math.cos(angle) * rad;
      tile.position.z = Math.sin(angle) * rad;
      tile.receiveShadow = true;
      this.groundGroup.add(tile);
    }
  }

  buildRoadNetwork() {
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1b2330,
      roughness: 0.8,
      metalness: 0.15,
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x273449, roughness: 0.9 });

    // 1. Central Arterial Grand Boulevard (East-West)
    const arterialGeo = new THREE.PlaneGeometry(540, 24);
    const arterial = new THREE.Mesh(arterialGeo, roadMat);
    arterial.rotation.x = -Math.PI / 2;
    arterial.position.set(0, 0.1, 0);
    arterial.receiveShadow = true;
    this.roadsGroup.add(arterial);

    for (let x = -260; x <= 260; x += 16) {
      const stripeGeo = new THREE.PlaneGeometry(8, 0.8);
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.12, 0);
      this.roadsGroup.add(stripe);
    }

    [-13, 13].forEach((offsetY) => {
      const walkGeo = new THREE.BoxGeometry(540, 0.6, 2.5);
      const walk = new THREE.Mesh(walkGeo, sidewalkMat);
      walk.position.set(0, 0.3, offsetY);
      walk.receiveShadow = true;
      this.roadsGroup.add(walk);
    });

    // 2. North-South Secondary Avenues
    [-160, 0, 160].forEach((posX, idx) => {
      const avenueGeo = new THREE.PlaneGeometry(18, 480);
      const avenue = new THREE.Mesh(avenueGeo, roadMat);
      avenue.rotation.x = -Math.PI / 2;
      avenue.position.set(posX, 0.08, 0);
      avenue.receiveShadow = true;
      this.roadsGroup.add(avenue);

      [-10, 10].forEach((offsetX) => {
        const walkGeo = new THREE.BoxGeometry(2, 0.6, 480);
        const walk = new THREE.Mesh(walkGeo, sidewalkMat);
        walk.position.set(posX + offsetX, 0.3, 0);
        walk.receiveShadow = true;
        this.roadsGroup.add(walk);
      });

      this.createTrafficSignalJunction(posX, 0, `INT-ZONE-${idx + 1}`);
    });

    // 3. Outer Ring Road (Perimeter Loop)
    const ringRadius = 230;
    const ringSegments = 64;
    const ringShape = new THREE.Shape();
    ringShape.absarc(0, 0, ringRadius + 9, 0, Math.PI * 2, false);
    const ringHole = new THREE.Path();
    ringHole.absarc(0, 0, ringRadius - 9, 0, Math.PI * 2, true);
    ringShape.holes.push(ringHole);

    const ringGeo = new THREE.ShapeGeometry(ringShape, ringSegments);
    const ringRoad = new THREE.Mesh(ringGeo, roadMat);
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.06;
    ringRoad.receiveShadow = true;
    this.roadsGroup.add(ringRoad);

    // Street Lamps along roads
    for (let x = -240; x <= 240; x += 60) {
      if (Math.abs(x) === 160 || x === 0) continue;
      this.createStreetLamp(x, 15);
      this.createStreetLamp(x, -15);
    }
  }

  createStreetLamp(x, z) {
    const poleGeo = new THREE.CylinderGeometry(0.3, 0.4, 12, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 6, z);
    pole.castShadow = true;
    this.roadsGroup.add(pole);

    const headGeo = new THREE.BoxGeometry(2, 0.6, 1.2);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d4 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x + (z > 0 ? -1 : 1), 12, z);
    this.roadsGroup.add(head);

    const pLight = new THREE.PointLight(0xffeedd, 0.0, 45, 1.8);
    pLight.position.set(x, 11.5, z);
    this.lightsGroup.add(pLight);
    this.streetLights.push(pLight);
  }

  createTrafficSignalJunction(x, z, intersectionId) {
    const junctionGroup = new THREE.Group();
    junctionGroup.position.set(x, 0, z);

    const corners = [
      { dx: -11, dz: -13, rotY: 0 },
      { dx: 11, dz: 13, rotY: Math.PI },
      { dx: 11, dz: -13, rotY: Math.PI / 2 },
      { dx: -11, dz: 13, rotY: -Math.PI / 2 },
    ];

    const signalLights = [];

    corners.forEach((c) => {
      const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 14, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(c.dx, 7, c.dz);
      junctionGroup.add(post);

      const boxGeo = new THREE.BoxGeometry(2.2, 5.5, 1.8);
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(c.dx, 12.5, c.dz);
      box.rotation.y = c.rotY;
      junctionGroup.add(box);

      const bulbGeo = new THREE.SphereGeometry(0.6, 12, 12);
      
      const redMat = new THREE.MeshBasicMaterial({ color: 0x330505 });
      const redBulb = new THREE.Mesh(bulbGeo, redMat);
      redBulb.position.set(c.dx, 14, c.dz + (c.dz > 0 ? -1 : 1) * 0.9);
      junctionGroup.add(redBulb);

      const yellowMat = new THREE.MeshBasicMaterial({ color: 0x332205 });
      const yellowBulb = new THREE.Mesh(bulbGeo, yellowMat);
      yellowBulb.position.set(c.dx, 12.5, c.dz + (c.dz > 0 ? -1 : 1) * 0.9);
      junctionGroup.add(yellowBulb);

      const greenMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const greenBulb = new THREE.Mesh(bulbGeo, greenMat);
      greenBulb.position.set(c.dx, 11, c.dz + (c.dz > 0 ? -1 : 1) * 0.9);
      junctionGroup.add(greenBulb);

      signalLights.push({ red: redMat, yellow: yellowMat, green: greenMat });
    });

    junctionGroup.userData = {
      type: "TRAFFIC_SIGNAL",
      id: intersectionId,
      name: `Intersection ${intersectionId}`,
      state: "GREEN",
      signalLights: signalLights,
    };

    this.signalsGroup.add(junctionGroup);
    this.interactiveObjects.push(junctionGroup);
  }

  // ---------------------------------------------------------------------------
  // Distinct Urban Districts & Procedural Buildings
  // ---------------------------------------------------------------------------

  buildDistrictsAndBuildings() {
    this.buildResidentialBlock(-160, 110, 10);
    this.buildCommercialSkyscrapers(0, 110, 12);
    this.buildIndustrialBlock(160, 110, 8);
    this.buildResidentialBlock(-160, -110, 8);
    this.buildUrbanPark(-60, -110);
    this.buildUrbanPark(60, -110);
  }

  buildResidentialBlock(centerX, centerZ, count) {
    const bldgColors = [0x334155, 0x475569, 0x1e293b, 0x3b4252, 0x2e3440];
    
    for (let i = 0; i < count; i++) {
      const offX = ((i % 4) - 1.5) * 26 + (Math.random() - 0.5) * 6;
      const offZ = (Math.floor(i / 4) - 1) * 32 + (Math.random() - 0.5) * 6;
      const bx = centerX + offX;
      const bz = centerZ + offZ;

      const width = 14 + Math.random() * 8;
      const depth = 14 + Math.random() * 8;
      const height = 18 + Math.random() * 32;

      const bldgMat = new THREE.MeshStandardMaterial({
        color: bldgColors[Math.floor(Math.random() * bldgColors.length)],
        roughness: 0.65,
        metalness: 0.25,
      });

      const bldgGeo = new THREE.BoxGeometry(width, height, depth);
      const building = new THREE.Mesh(bldgGeo, bldgMat);
      building.position.set(bx, height / 2, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      this.buildingsGroup.add(building);

      const acGeo = new THREE.BoxGeometry(width * 0.35, 2.5, depth * 0.35);
      const acMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(bx, height + 1.25, bz);
      this.buildingsGroup.add(ac);

      this.createWindowMesh(bx, height, bz, width, depth);

      if (Math.random() > 0.4) {
        this.createTree(bx + width / 2 + 3, bz + depth / 2 + 3);
      }
    }
  }

  buildCommercialSkyscrapers(centerX, centerZ, count) {
    const glassColors = [0x0284c7, 0x0369a1, 0x0f766e, 0x1d4ed8, 0x334155];

    for (let i = 0; i < count; i++) {
      const offX = ((i % 4) - 1.5) * 32;
      const offZ = (Math.floor(i / 4) - 1) * 36;
      const bx = centerX + offX;
      const bz = centerZ + offZ;

      const width = 18 + Math.random() * 8;
      const depth = 18 + Math.random() * 8;
      const height = 45 + Math.random() * 70;

      const glassMat = new THREE.MeshStandardMaterial({
        color: glassColors[Math.floor(Math.random() * glassColors.length)],
        roughness: 0.15,
        metalness: 0.85,
      });

      const bldgGeo = new THREE.BoxGeometry(width, height, depth);
      const skyscraper = new THREE.Mesh(bldgGeo, glassMat);
      skyscraper.position.set(bx, height / 2, bz);
      skyscraper.castShadow = true;
      skyscraper.receiveShadow = true;
      this.buildingsGroup.add(skyscraper);

      if (height > 75) {
        const spireGeo = new THREE.ConeGeometry(1.2, 18, 8);
        const spireMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 });
        const spire = new THREE.Mesh(spireGeo, spireMat);
        spire.position.set(bx, height + 9, bz);
        this.buildingsGroup.add(spire);

        const beaconGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(bx, height + 18, bz);
        this.buildingsGroup.add(beacon);
      }

      this.createWindowMesh(bx, height, bz, width, depth);
    }
  }

  buildIndustrialBlock(centerX, centerZ, count) {
    for (let i = 0; i < count; i++) {
      const offX = ((i % 3) - 1) * 36;
      const offZ = (Math.floor(i / 3) - 0.5) * 40;
      const bx = centerX + offX;
      const bz = centerZ + offZ;

      const width = 24 + Math.random() * 8;
      const depth = 20 + Math.random() * 6;
      const height = 14 + Math.random() * 12;

      const indMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, metalness: 0.4 });
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), indMat);
      building.position.set(bx, height / 2, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      this.buildingsGroup.add(building);

      const tankGeo = new THREE.CylinderGeometry(5, 5, height * 1.3, 16);
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
      const tank = new THREE.Mesh(tankGeo, tankMat);
      tank.position.set(bx + width / 2 + 7, (height * 1.3) / 2, bz);
      this.buildingsGroup.add(tank);
    }
  }

  createWindowMesh(x, height, z, w, d) {
    const winGeo = new THREE.BoxGeometry(w + 0.1, height * 0.9, d + 0.1);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x050a14,
      emissive: 0xfef08a,
      emissiveIntensity: 0.15,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.85,
    });
    const winMesh = new THREE.Mesh(winGeo, winMat);
    winMesh.position.set(x, height / 2, z);
    this.buildingsGroup.add(winMesh);
    this.windowMaterials.push(winMat);
  }

  createTree(x, z) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, 0, z);

    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2;
    treeGroup.add(trunk);

    const foliageGeo = new THREE.ConeGeometry(2.8, 7, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 6.5;
    foliage.castShadow = true;
    treeGroup.add(foliage);

    this.groundGroup.add(treeGroup);
  }

  buildUrbanPark(centerX, centerZ) {
    const parkGeo = new THREE.PlaneGeometry(80, 70);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.9 });
    const park = new THREE.Mesh(parkGeo, parkMat);
    park.rotation.x = -Math.PI / 2;
    park.position.set(centerX, 0.15, centerZ);
    this.groundGroup.add(park);

    for (let i = 0; i < 14; i++) {
      const tx = centerX + (Math.random() - 0.5) * 65;
      const tz = centerZ + (Math.random() - 0.5) * 55;
      this.createTree(tx, tz);
    }
  }

  // ---------------------------------------------------------------------------
  // Major Infrastructure Assets
  // ---------------------------------------------------------------------------

  buildInfrastructure() {
    this.buildHospital(-120, -110);
    this.buildSolarFarm(-160, 180);
    this.buildGasPowerPlant(160, 180);
  }

  buildHospital(x, z) {
    const hospGroup = new THREE.Group();
    hospGroup.position.set(x, 0, z);

    const mainGeo = new THREE.BoxGeometry(42, 28, 30);
    const mainMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.3 });
    const mainBuilding = new THREE.Mesh(mainGeo, mainMat);
    mainBuilding.position.y = 14;
    mainBuilding.castShadow = true;
    mainBuilding.receiveShadow = true;
    hospGroup.add(mainBuilding);

    const crossMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 0.5), crossMat);
    crossV.position.set(0, 22, 15.3);
    hospGroup.add(crossV);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 0.5), crossMat);
    crossH.position.set(0, 22, 15.3);
    hospGroup.add(crossH);

    const heliGeo = new THREE.CylinderGeometry(8, 8, 0.5, 24);
    const heliMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const helipad = new THREE.Mesh(heliGeo, heliMat);
    helipad.position.set(0, 28.3, 0);
    hospGroup.add(helipad);

    const bayGeo = new THREE.BoxGeometry(20, 6, 8);
    const bayMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
    const bay = new THREE.Mesh(bayGeo, bayMat);
    bay.position.set(0, 3, 16);
    hospGroup.add(bay);

    hospGroup.userData = {
      type: "HOSPITAL",
      id: "HOSP-MAIN",
      name: "Metro General Hospital & Trauma Center",
      zone: "District 1 (Healthcare & Residential)",
    };

    this.emergencyGroup.add(hospGroup);
    this.interactiveObjects.push(hospGroup);
  }

  buildSolarFarm(x, z) {
    const solarGroup = new THREE.Group();
    solarGroup.position.set(x, 0, z);

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(85, 65),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.1;
    solarGroup.add(base);

    const panelGeo = new THREE.BoxGeometry(7, 0.3, 5);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
      metalness: 0.9,
      roughness: 0.1,
    });

    for (let r = -20; r <= 20; r += 10) {
      for (let c = -30; c <= 30; c += 10) {
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.rotation.x = -Math.PI / 6;
        panel.position.set(c, 2.5, r);
        panel.castShadow = true;
        solarGroup.add(panel);
        this.solarPanels.push(panel);
      }
    }

    [-35, 35].forEach((tx) => {
      const turbine = this.createWindTurbine(tx, -15);
      solarGroup.add(turbine);
    });

    solarGroup.userData = {
      type: "SOLAR_FARM",
      id: "SOLAR-PARK",
      name: "Helios Renewable Solar & Wind Park",
      capacity: "12.0 MW",
      typeDesc: "Clean Zero-Emission Generation",
    };

    this.powerGroup.add(solarGroup);
    this.interactiveObjects.push(solarGroup);
  }

  createWindTurbine(x, z) {
    const turbineGroup = new THREE.Group();
    turbineGroup.position.set(x, 0, z);

    const towerGeo = new THREE.CylinderGeometry(0.6, 1.2, 38, 12);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.y = 19;
    turbineGroup.add(tower);

    const nacelleGeo = new THREE.BoxGeometry(2, 2, 4);
    const nacelle = new THREE.Mesh(nacelleGeo, towerMat);
    nacelle.position.set(0, 38, 0);
    turbineGroup.add(nacelle);

    const rotorHub = new THREE.Group();
    rotorHub.position.set(0, 38, 2);

    for (let b = 0; b < 3; b++) {
      const bladeGeo = new THREE.BoxGeometry(0.5, 14, 0.2);
      const blade = new THREE.Mesh(bladeGeo, towerMat);
      blade.position.y = 7;
      const bladeHolder = new THREE.Group();
      bladeHolder.rotation.z = (b / 3) * Math.PI * 2;
      bladeHolder.add(blade);
      rotorHub.add(bladeHolder);
    }

    turbineGroup.add(rotorHub);
    this.windTurbines.push(rotorHub);

    return turbineGroup;
  }

  buildGasPowerPlant(x, z) {
    const plantGroup = new THREE.Group();
    plantGroup.position.set(x, 0, z);

    const mainBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(45, 18, 35),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.6 })
    );
    mainBuilding.position.y = 9;
    mainBuilding.castShadow = true;
    plantGroup.add(mainBuilding);

    this.chimneys = [];
    [-12, 0, 12].forEach((cx) => {
      const chimGeo = new THREE.CylinderGeometry(2, 2.8, 36, 16);
      const chimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 });
      const chimney = new THREE.Mesh(chimGeo, chimMat);
      chimney.position.set(cx, 18, -10);
      chimney.castShadow = true;
      plantGroup.add(chimney);

      const bandGeo = new THREE.CylinderGeometry(2.05, 2.05, 3, 16);
      const bandMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(cx, 34, -10);
      plantGroup.add(band);

      this.chimneys.push({ x: x + cx, y: 36, z: z - 10 });
    });

    plantGroup.userData = {
      type: "GAS_POWER_PLANT",
      id: "GAS-PEAKER",
      name: "Vulcan Natural Gas Peaker Plant",
      capacity: "15.0 MW",
      typeDesc: "Conventional Dispatchable Generation",
    };

    this.powerGroup.add(plantGroup);
    this.interactiveObjects.push(plantGroup);
  }

  // ---------------------------------------------------------------------------
  // High-Voltage Power Grid, Transmission Towers, Substation & Energy Pulses
  // ---------------------------------------------------------------------------

  buildPowerGrid() {
    // 1. Central Distribution Substation Facility
    this.buildSubstation(0, 150);

    // 2. High-Voltage Transmission Pylons
    const pylonNodes = [
      { id: "P1", x: -160, z: 180, name: "Solar Generation Substation Tower" },
      { id: "P2", x: -80, z: 160, name: "West Transmission Pylon" },
      { id: "P3", x: 0, z: 150, name: "Central Grid Infeed Tower" },
      { id: "P4", x: 80, z: 160, name: "East Transmission Pylon" },
      { id: "P5", x: 160, z: 180, name: "Gas Peaker Infeed Tower" },
      { id: "P6", x: 0, z: 60, name: "Downtown Distribution Pylon" },
      { id: "P7", x: -120, z: 40, name: "West Residential Grid Step-down" },
      { id: "P8", x: 120, z: 40, name: "East Industrial Grid Step-down" },
    ];

    pylonNodes.forEach((node) => {
      this.buildTransmissionPylon(node.x, node.z, node.name);
    });

    // 3. Power Cable Transmission Lines & Pulse Paths
    this.powerTransmissionCurves = [];
    this.powerPulses = [];

    const lineSegments = [
      // Renewable Solar to Substation
      {
        from: new THREE.Vector3(-160, 28, 180),
        mid: new THREE.Vector3(-120, 22, 170),
        to: new THREE.Vector3(-80, 28, 160),
        type: "RENEWABLE",
      },
      {
        from: new THREE.Vector3(-80, 28, 160),
        mid: new THREE.Vector3(-40, 22, 155),
        to: new THREE.Vector3(0, 28, 150),
        type: "RENEWABLE",
      },
      // Conventional Peaker to Substation
      {
        from: new THREE.Vector3(160, 28, 180),
        mid: new THREE.Vector3(120, 22, 170),
        to: new THREE.Vector3(80, 28, 160),
        type: "CONVENTIONAL",
      },
      {
        from: new THREE.Vector3(80, 28, 160),
        mid: new THREE.Vector3(40, 22, 155),
        to: new THREE.Vector3(0, 28, 150),
        type: "CONVENTIONAL",
      },
      // Substation into Downtown & Districts
      {
        from: new THREE.Vector3(0, 28, 150),
        mid: new THREE.Vector3(0, 20, 105),
        to: new THREE.Vector3(0, 28, 60),
        type: "DISTRIBUTION",
      },
      {
        from: new THREE.Vector3(0, 28, 60),
        mid: new THREE.Vector3(-60, 18, 50),
        to: new THREE.Vector3(-120, 24, 40),
        type: "DISTRIBUTION",
      },
      {
        from: new THREE.Vector3(0, 28, 60),
        mid: new THREE.Vector3(60, 18, 50),
        to: new THREE.Vector3(120, 24, 40),
        type: "DISTRIBUTION",
      },
    ];

    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.2,
    });

    lineSegments.forEach((seg, idx) => {
      // Create CatmullRomCurve3 with natural sag
      const curve = new THREE.CatmullRomCurve3([seg.from, seg.mid, seg.to]);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.25, 8, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, cableMat);
      this.powerGroup.add(tubeMesh);

      this.powerTransmissionCurves.push({ curve: curve, type: seg.type });

      // Create 2 animated glowing energy pulses per cable segment
      for (let p = 0; p < 2; p++) {
        const pulseGeo = new THREE.SphereGeometry(0.8, 12, 12);
        const pulseMat = new THREE.MeshBasicMaterial({
          color: seg.type === "RENEWABLE" ? 0x10b981 : seg.type === "CONVENTIONAL" ? 0xf59e0b : 0x38bdf8,
        });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        pulseMesh.position.copy(curve.getPoint(p * 0.5));
        this.powerGroup.add(pulseMesh);

        this.powerPulses.push({
          mesh: pulseMesh,
          mat: pulseMat,
          curve: curve,
          type: seg.type,
          progress: (idx * 0.3 + p * 0.5) % 1.0,
          speed: 0.45,
        });
      }
    });
  }

  buildTransmissionPylon(x, z, name) {
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(x, 0, z);

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.85,
      roughness: 0.3,
    });

    // 4 Corner Legs forming lattice tower
    const legGeo = new THREE.CylinderGeometry(0.2, 0.45, 28, 6);
    const corners = [
      { dx: -2.2, dz: -2.2, rx: 0.08, rz: -0.08 },
      { dx: 2.2, dz: -2.2, rx: 0.08, rz: 0.08 },
      { dx: 2.2, dz: 2.2, rx: -0.08, rz: 0.08 },
      { dx: -2.2, dz: 2.2, rx: -0.08, rz: -0.08 },
    ];

    corners.forEach((c) => {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(c.dx, 14, c.dz);
      leg.rotation.x = c.rx;
      leg.rotation.z = c.rz;
      pylonGroup.add(leg);
    });

    // Cross-arm beams
    const armGeo1 = new THREE.BoxGeometry(16, 0.6, 1.2);
    const arm1 = new THREE.Mesh(armGeo1, metalMat);
    arm1.position.set(0, 24, 0);
    pylonGroup.add(arm1);

    const armGeo2 = new THREE.BoxGeometry(12, 0.6, 1.2);
    const arm2 = new THREE.Mesh(armGeo2, metalMat);
    arm2.position.set(0, 28, 0);
    pylonGroup.add(arm2);

    // Ceramic Insulator Strings
    const insMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1 });
    [-7, -3.5, 3.5, 7].forEach((ox) => {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 8), insMat);
      ins.position.set(ox, 22.8, 0);
      pylonGroup.add(ins);
    });

    // Pylon Red Aviation Warning Light
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    beacon.position.set(0, 29, 0);
    pylonGroup.add(beacon);

    pylonGroup.userData = {
      type: "GRID_PYLON",
      id: `PYLON-${Math.round(x)}-${Math.round(z)}`,
      name: name || "High-Voltage Transmission Pylon",
      voltage: "220 kV Municipal Grid",
    };

    this.powerGroup.add(pylonGroup);
    this.interactiveObjects.push(pylonGroup);
  }

  buildSubstation(x, z) {
    const subGroup = new THREE.Group();
    subGroup.position.set(x, 0, z);

    // Gravel base yard
    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 45),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 })
    );
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = 0.12;
    subGroup.add(yard);

    // 2 High-Voltage Core Transformers
    [-14, 14].forEach((tx) => {
      const transBox = new THREE.Mesh(
        new THREE.BoxGeometry(14, 9, 12),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 })
      );
      transBox.position.set(tx, 4.5, 0);
      transBox.castShadow = true;
      subGroup.add(transBox);

      // Cooling radiator fins
      for (let f = -5; f <= 5; f += 2) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 7, 13),
          new THREE.MeshStandardMaterial({ color: 0x475569 })
        );
        fin.position.set(tx + f, 4.5, 0);
        subGroup.add(fin);
      }

      // Bushing insulators
      [-3, 0, 3].forEach((bx) => {
        const bushing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.6, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2 })
        );
        bushing.position.set(tx + bx, 10.5, 0);
        subGroup.add(bushing);
      });
    });

    // Control Building
    const ctrlBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(18, 7, 10),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.4, roughness: 0.5 })
    );
    ctrlBuilding.position.set(0, 3.5, -14);
    subGroup.add(ctrlBuilding);

    // Blackout / Status Beacon
    this.substationBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    this.substationBeacon.position.set(0, 8.5, -14);
    subGroup.add(this.substationBeacon);

    subGroup.userData = {
      type: "GRID_SUBSTATION",
      id: "SUBSTATION-CENTRAL",
      name: "Central Municipal Power Substation & Load Balancer",
      capacity: "27.0 MW Merged Capacity",
    };

    this.powerGroup.add(subGroup);
    this.interactiveObjects.push(subGroup);
  }

  // ---------------------------------------------------------------------------
  // Smart Reservoir, Dynamic Water Level, Cascades & Aqueduct Pipeline Network
  // ---------------------------------------------------------------------------

  buildWaterNetwork() {
    // 1. Major Reservoir & Pumping Complex
    this.buildWaterReservoir(130, -130);

    // 2. Stormwater Drainage Pump Station in District 4
    this.buildDrainagePumpStation(-60, -150);

    // 3. Municipal Water Aqueduct Pipeline Network
    this.waterPipelineCurves = [];
    this.waterPulses = [];

    const pipeSegments = [
      // From Reservoir Pumping Tower to East District
      {
        from: new THREE.Vector3(98, 4, -130),
        mid: new THREE.Vector3(50, 4, -90),
        to: new THREE.Vector3(0, 4, -60),
      },
      // From Central Junction to North Commercial Skyscrapers
      {
        from: new THREE.Vector3(0, 4, -60),
        mid: new THREE.Vector3(0, 3, 30),
        to: new THREE.Vector3(0, 3, 90),
      },
      // From Central Junction to West Residential & Hospital
      {
        from: new THREE.Vector3(0, 4, -60),
        mid: new THREE.Vector3(-60, 3, -80),
        to: new THREE.Vector3(-120, 3, -100),
      },
    ];

    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.85,
      roughness: 0.25,
    });

    pipeSegments.forEach((seg, idx) => {
      const curve = new THREE.CatmullRomCurve3([seg.from, seg.mid, seg.to]);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.8, 12, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, pipeMat);
      this.waterGroup.add(tubeMesh);

      // Support pylons for elevated aqueduct sections
      [0.2, 0.5, 0.8].forEach((t) => {
        const pt = curve.getPoint(t);
        const pylon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, pt.y, 8),
          new THREE.MeshStandardMaterial({ color: 0x334155 })
        );
        pylon.position.set(pt.x, pt.y / 2, pt.z);
        this.waterGroup.add(pylon);
      });

      this.waterPipelineCurves.push(curve);

      // Create 3 animated glowing cyan fluid pulses per pipeline
      for (let p = 0; p < 3; p++) {
        const pulseGeo = new THREE.SphereGeometry(1.0, 12, 12);
        const pulseMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        pulseMesh.position.copy(curve.getPoint(p * 0.33));
        this.waterGroup.add(pulseMesh);

        this.waterPulses.push({
          mesh: pulseMesh,
          mat: pulseMat,
          curve: curve,
          progress: (idx * 0.35 + p * 0.33) % 1.0,
          speed: 0.35,
        });
      }
    });
  }

  buildWaterReservoir(x, z) {
    const waterGroup = new THREE.Group();
    waterGroup.position.set(x, 0, z);

    // Deep Concrete Basin Retaining Wall (Open top basin)
    const basinMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.75,
      metalness: 0.2,
    });

    // Outer concrete foundation
    const baseFloor = new THREE.Mesh(new THREE.BoxGeometry(86, 2, 76), basinMat);
    baseFloor.position.y = 0;
    waterGroup.add(baseFloor);

    // 4 Perimeter Walls
    const wallHeight = 10;
    const wallThick = 4;

    // North & South walls
    [-36, 36].forEach((wz) => {
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(86, wallHeight, wallThick), basinMat);
      wMesh.position.set(0, wallHeight / 2, wz);
      wMesh.castShadow = true;
      waterGroup.add(wMesh);
    });

    // East & West walls
    [-41, 41].forEach((wx) => {
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, 68), basinMat);
      wMesh.position.set(wx, wallHeight / 2, 0);
      wMesh.castShadow = true;
      waterGroup.add(wMesh);
    });

    // Inner Terraced Stepped Reservoir Floor
    for (let s = 1; s <= 3; s++) {
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(78 - s * 14, 1.5, 68 - s * 14),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
      );
      stepMesh.position.y = (4 - s) * 0.6;
      waterGroup.add(stepMesh);
    }

    // Dynamic Reflective Translucent Water Surface
    const waterGeo = new THREE.PlaneGeometry(76, 66, 32, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25,
      roughness: 0.08,
      metalness: 0.92,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(0, 7.5, 0); // Max high-water line @ 7.5
    waterGroup.add(this.waterMesh);

    // Physical Capacity Graduated Depth Gauge Pillar
    const gaugePillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 10, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5 })
    );
    gaugePillar.position.set(36, 5, -30);
    waterGroup.add(gaugePillar);

    // Gauge LED Level Bar
    this.waterLevelIndicator = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 8, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    this.waterLevelIndicator.position.set(36, 5, -29);
    waterGroup.add(this.waterLevelIndicator);

    // Pumping Station Control Tower & Suction Intake
    const pumpTower = new THREE.Mesh(
      new THREE.BoxGeometry(18, 14, 18),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6, roughness: 0.3 })
    );
    pumpTower.position.set(-32, 7, 0);
    pumpTower.castShadow = true;
    waterGroup.add(pumpTower);

    // Suction intake pipes dipping into water
    [-4, 4].forEach((pz) => {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 10, 12),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 })
      );
      pipe.position.set(-20, 4, pz);
      waterGroup.add(pipe);
    });

    // Inflow Aerator Fountain Cascade Head
    const fountainHead = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2.0, 3, 12),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.7 })
    );
    fountainHead.position.set(20, 8.5, 0);
    waterGroup.add(fountainHead);

    // Emergency Water Deficit Warning Beacon atop tower
    this.reservoirDeficitBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    this.reservoirDeficitBeacon.position.set(-32, 15, 0);
    waterGroup.add(this.reservoirDeficitBeacon);

    waterGroup.userData = {
      type: "WATER_RESERVOIR",
      id: "RES-MAIN",
      name: "Central Aqueduct & Stormwater Reservoir",
      capacity: "15,000 kL",
    };

    this.waterGroup.add(waterGroup);
    this.interactiveObjects.push(waterGroup);
  }

  buildDrainagePumpStation(x, z) {
    const drainGroup = new THREE.Group();
    drainGroup.position.set(x, 0, z);

    // Concrete base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(32, 4, 24),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
    );
    base.position.y = 2;
    drainGroup.add(base);

    // Pump Turbine housings
    [-6, 6].forEach((px) => {
      const turbineMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(3.5, 3.5, 5, 16),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.7 })
      );
      turbineMesh.position.set(px, 5.5, 0);
      drainGroup.add(turbineMesh);
      this.drainagePumps.push(turbineMesh);
    });

    // Drainage Flood Warning Light
    const floodBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    floodBeacon.position.set(0, 9, 0);
    drainGroup.add(floodBeacon);

    drainGroup.userData = {
      type: "DRAINAGE_PUMP",
      id: "DRAIN-ZONE-4",
      name: "South Stormwater Drainage & Flood Pump Station",
      capacity: "3,000 kL/hr Discharge Rate",
    };

    this.waterGroup.add(drainGroup);
    this.interactiveObjects.push(drainGroup);
  }

  // ---------------------------------------------------------------------------
  // Smoke & Water Splash Particle Systems
  // ---------------------------------------------------------------------------

  setupSmokeParticles() {
    this.smokeParticles = [];
    const smokeGeo = new THREE.SphereGeometry(1.8, 8, 8);

    for (let i = 0; i < 35; i++) {
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.0,
      });
      const mesh = new THREE.Mesh(smokeGeo, smokeMat);
      this.particlesGroup.add(mesh);

      this.smokeParticles.push({
        mesh: mesh,
        mat: smokeMat,
        chimneyIdx: i % 3,
        life: Math.random(),
        speedY: 0.25 + Math.random() * 0.35,
        driftX: (Math.random() - 0.5) * 0.15,
        driftZ: (Math.random() - 0.5) * 0.15,
      });
    }
  }

  setupWaterSplashParticles() {
    this.waterSplashParticles = [];
    const splashGeo = new THREE.SphereGeometry(0.5, 6, 6);

    for (let i = 0; i < 20; i++) {
      const splashMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(splashGeo, splashMat);
      mesh.position.set(150, 7, -130);
      this.particlesGroup.add(mesh);

      this.waterSplashParticles.push({
        mesh: mesh,
        mat: splashMat,
        origin: new THREE.Vector3(150, 8.5, -130),
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, -Math.random() * 5 - 2, (Math.random() - 0.5) * 4),
        life: Math.random(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Moving Vehicles & Fleets
  // ---------------------------------------------------------------------------

  buildVehicleFleet() {
    this.vehicles = [];
    const carColors = [0x38bdf8, 0xf43f5e, 0x10b981, 0xfbbf24, 0xe2e8f0, 0x9333ea, 0x475569];

    for (let i = 0; i < 28; i++) {
      const isEastWest = i % 2 === 0;
      const isOddPlate = i % 2 !== 0;

      const carGroup = new THREE.Group();

      const bodyGeo = new THREE.BoxGeometry(4.2, 1.6, 2.2);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: carColors[i % carColors.length],
        roughness: 0.3,
        metalness: 0.7,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      carGroup.add(body);

      const cabinGeo = new THREE.BoxGeometry(2.4, 1.1, 1.8);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(-0.2, 2.0, 0);
      carGroup.add(cabin);

      const lightGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
      [-0.7, 0.7].forEach((oz) => {
        const headLight = new THREE.Mesh(lightGeo, lightMat);
        headLight.position.set(2.1, 0.8, oz);
        carGroup.add(headLight);
      });

      const carData = {
        mesh: carGroup,
        isEastWest: isEastWest,
        isOddPlate: isOddPlate,
        speed: 0.4 + Math.random() * 0.3,
        direction: Math.random() > 0.5 ? 1 : -1,
        progress: Math.random(),
        laneOffset: (Math.random() > 0.5 ? 1 : -1) * (isEastWest ? 4 : 3),
        fixedAxis: isEastWest ? 0 : [-160, 0, 160][Math.floor(Math.random() * 3)],
      };

      this.vehiclesGroup.add(carGroup);
      this.vehicles.push(carData);
    }

    this.buildAmbulance();
    this.buildGarbageTrucks();
  }

  buildAmbulance() {
    const ambGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 2.4), bodyMat);
    body.position.y = 1.4;
    body.castShadow = true;
    ambGroup.add(body);

    const redCrossMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 2.5), redCrossMat);
    cross.position.set(0, 1.6, 0);
    ambGroup.add(cross);

    const sirenGeo = new THREE.BoxGeometry(1.2, 0.5, 1.6);
    this.sirenMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const siren = new THREE.Mesh(sirenGeo, this.sirenMat);
    siren.position.set(0, 2.8, 0);
    ambGroup.add(siren);

    this.sirenLight = new THREE.PointLight(0xf43f5e, 0.0, 35, 2);
    this.sirenLight.position.set(0, 3.2, 0);
    ambGroup.add(this.sirenLight);

    this.ambulance = {
      mesh: ambGroup,
      progress: 0.0,
      speed: 0.9,
      active: false,
    };

    this.emergencyGroup.add(ambGroup);
  }

  buildGarbageTrucks() {
    this.garbageTrucks = [];
    [-1, 1].forEach((dir, idx) => {
      const truckGroup = new THREE.Group();

      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 2.8), bodyMat);
      body.position.y = 1.8;
      body.castShadow = true;
      truckGroup.add(body);

      const cabMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.6), cabMat);
      cab.position.set(3.2, 1.5, 0);
      truckGroup.add(cab);

      const truckData = {
        mesh: truckGroup,
        progress: idx * 0.5,
        speed: 0.25,
        radius: 230,
      };

      this.wasteGroup.add(truckGroup);
      this.garbageTrucks.push(truckData);
    });
  }

  // ---------------------------------------------------------------------------
  // Interactive Raycasting & Selection HUD
  // ---------------------------------------------------------------------------

  setupSelectionIndicator() {
    const ringGeo = new THREE.RingGeometry(12, 14, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.highlightRing = new THREE.Mesh(ringGeo, ringMat);
    this.highlightRing.rotation.x = -Math.PI / 2;
    this.highlightRing.position.y = 0.2;
    this.highlightRing.visible = false;
    this.scene.add(this.highlightRing);
  }

  setupEventListeners() {
    window.addEventListener("resize", () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    this.container.addEventListener("pointerdown", (event) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

      if (intersects.length > 0) {
        let hitObject = intersects[0].object;
        while (hitObject.parent && !hitObject.userData.type) {
          hitObject = hitObject.parent;
        }

        if (hitObject && hitObject.userData && hitObject.userData.type) {
          this.selectInteractiveObject(hitObject);
        }
      }
    });
  }

  selectInteractiveObject(object) {
    this.selectedObject = object;
    const pos = object.position;
    this.highlightRing.position.set(pos.x, 0.2, pos.z);
    this.highlightRing.visible = true;

    if (this.onObjectSelect) {
      this.onObjectSelect(object.userData, this.simState);
    }
  }

  // ---------------------------------------------------------------------------
  // Camera Presets
  // ---------------------------------------------------------------------------

  setCameraPreset(presetName) {
    this.isTransitioningCamera = true;
    let targetPos = new THREE.Vector3(0, 220, 320);
    let targetLook = new THREE.Vector3(0, 0, 0);

    switch (presetName.toUpperCase()) {
      case "OVERVIEW":
        targetPos.set(0, 240, 340);
        targetLook.set(0, 0, 0);
        break;
      case "TRAFFIC":
        targetPos.set(0, 45, 90);
        targetLook.set(0, 0, 0);
        break;
      case "POWER":
        targetPos.set(0, 110, 250);
        targetLook.set(0, 15, 150);
        break;
      case "WATER":
        targetPos.set(130, 90, -40);
        targetLook.set(130, 5, -130);
        break;
      case "EMERGENCY":
        targetPos.set(-120, 65, -40);
        targetLook.set(-120, 0, -110);
        break;
      default:
        targetPos.set(0, 220, 320);
        targetLook.set(0, 0, 0);
    }

    this.cameraTargetPos = targetPos;
    this.cameraTargetLook = targetLook;
  }

  // ---------------------------------------------------------------------------
  // Live Simulation Sync
  // ---------------------------------------------------------------------------

  syncSimulationState(record, layout, statusData) {
    if (!record) return;

    this.simState.step = record.step || 0;
    this.simState.hour = record.hour_of_day !== undefined ? record.hour_of_day : 12;
    this.simState.congestion = record.traffic_congestion || 0.2;
    this.simState.totalVehicles = record.total_vehicles || 150;
    this.simState.oddEvenActive = !!record.odd_even_active;
    this.simState.greenWaveActive = !!record.green_wave_active;
    this.simState.blackout = !!record.blackout;
    this.simState.curtailActive = !!(statusData && statusData.active_policies && statusData.active_policies.curtail_nonrenewable);
    this.simState.aqi = record.aqi || 35.0;
    this.simState.reservoirLevelPct = record.reservoir_level_pct !== undefined ? record.reservoir_level_pct : 85.0;
    this.simState.waterRationingActive = !!record.water_rationing_active;
    this.simState.criticalIncident = (record.critical_incidents || 0) > 0;
    this.simState.renewableMw = record.renewable_mw || 3.5;
    this.simState.nonRenewableMw = record.non_renewable_mw || 2.5;
    this.simState.energySupply = record.energy_supply || 6.0;
    this.simState.energyUsage = record.energy_usage || 5.8;
    this.simState.waterConsumptionKl = record.water_consumption_kl || 120.0;
    this.simState.avgDrainageLoadPct = record.avg_drainage_load_pct || 25.0;

    // 1. Update Day/Night Atmosphere & Blackout State
    this.updateDayNightCycle(this.simState.hour);

    // 2. Update Dynamic Water Reservoir Height & Color
    if (this.waterMesh) {
      const minWaterY = 1.2; // Dry reservoir floor
      const maxWaterY = 7.5; // Full high-water line
      const targetY = minWaterY + (this.simState.reservoirLevelPct / 100) * (maxWaterY - minWaterY);
      this.waterMesh.position.y = targetY;

      // Dynamic water color: Cyan when full, Amber/Teal when depleted
      if (this.simState.reservoirLevelPct < 25) {
        this.waterMesh.material.color.setHex(0xd97706);
        this.waterMesh.material.emissive.setHex(0xb45309);
        if (this.reservoirDeficitBeacon) {
          this.reservoirDeficitBeacon.material.color.setHex(0xf43f5e); // Red warning beacon
        }
      } else {
        this.waterMesh.material.color.setHex(0x0284c7);
        this.waterMesh.material.emissive.setHex(0x0369a1);
        if (this.reservoirDeficitBeacon) {
          this.reservoirDeficitBeacon.material.color.setHex(0x10b981); // Normal green beacon
        }
      }
    }

    // 3. Update Substation Status Beacon
    if (this.substationBeacon) {
      if (this.simState.blackout) {
        this.substationBeacon.material.color.setHex(0xf43f5e); // Critical Red
      } else if (this.simState.curtailActive) {
        this.substationBeacon.material.color.setHex(0xf59e0b); // Warning Amber
      } else {
        this.substationBeacon.material.color.setHex(0x10b981); // Balanced Green
      }
    }

    // 4. Update AQI Smog Haze Opacity & Color
    if (this.smogMesh) {
      if (this.simState.aqi > 75) {
        const opacity = Math.min(0.45, ((this.simState.aqi - 75) / 90) * 0.45);
        this.smogMesh.material.opacity = opacity;
        this.smogMesh.material.color.setHex(this.simState.aqi > 110 ? 0xf43f5e : 0xf59e0b);
      } else {
        this.smogMesh.material.opacity = 0.0;
      }
    }

    // 5. Update Traffic Signal Light Colors
    if (layout && layout.intersections) {
      layout.intersections.forEach((interData) => {
        const signalObj = this.signalsGroup.children.find((s) => s.userData.id === interData.id);
        if (signalObj && signalObj.userData.signalLights) {
          signalObj.userData.state = interData.state;
          const state = this.simState.greenWaveActive ? "GREEN" : interData.state;

          signalObj.userData.signalLights.forEach((bulbPair) => {
            if (state === "GREEN") {
              bulbPair.green.color.setHex(0x10b981);
              bulbPair.yellow.color.setHex(0x332205);
              bulbPair.red.color.setHex(0x330505);
            } else if (state === "YELLOW") {
              bulbPair.green.color.setHex(0x053315);
              bulbPair.yellow.color.setHex(0xf59e0b);
              bulbPair.red.color.setHex(0x330505);
            } else {
              bulbPair.green.color.setHex(0x053315);
              bulbPair.yellow.color.setHex(0x332205);
              bulbPair.red.color.setHex(0xf43f5e);
            }
          });
        }
      });
    }

    // 6. Activate Ambulance on Critical Incidents or Green Wave
    if (this.ambulance) {
      this.ambulance.active = this.simState.greenWaveActive || this.simState.criticalIncident;
    }
  }

  // ---------------------------------------------------------------------------
  // Layer Visibility Toggles
  // ---------------------------------------------------------------------------

  setLayerVisibility(layerName, visible) {
    this.layers[layerName] = visible;
    switch (layerName) {
      case "traffic":
        this.vehiclesGroup.visible = visible;
        this.signalsGroup.visible = visible;
        break;
      case "power":
        this.powerGroup.visible = visible;
        break;
      case "water":
        this.waterGroup.visible = visible;
        break;
      case "emergency":
        this.emergencyGroup.visible = visible;
        break;
      case "waste":
        this.wasteGroup.visible = visible;
        break;
      case "pollution":
        if (this.smogMesh) this.smogMesh.visible = visible;
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // 60 FPS Continuous Render & Physics Animation Loop
  // ---------------------------------------------------------------------------

  animate() {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Smooth Camera Preset Interpolation
    if (this.isTransitioningCamera && this.cameraTargetPos && this.cameraTargetLook) {
      this.camera.position.lerp(this.cameraTargetPos, 0.06);
      if (this.controls) {
        this.controls.target.lerp(this.cameraTargetLook, 0.06);
      }
      if (this.camera.position.distanceTo(this.cameraTargetPos) < 1.0) {
        this.isTransitioningCamera = false;
      }
    }

    if (this.controls) {
      this.controls.update();
    }

    // 2. Rotate Clean Energy Wind Turbines
    const windSpeed = 1.8 + (this.simState.renewableMw / 12.0) * 2.0;
    this.windTurbines.forEach((rotor) => {
      rotor.rotation.z += delta * windSpeed;
    });

    // 3. Rotate Stormwater Drainage Pump Turbines
    this.drainagePumps.forEach((pump) => {
      pump.rotation.y += delta * 4.0;
    });

    // 4. Animate Power Grid Energy Pulses
    const blackout = this.simState.blackout;
    this.powerPulses.forEach((pulse) => {
      if (blackout) {
        // Red flashing error pulse during blackout
        pulse.mat.color.setHex(Math.sin(elapsedTime * 12.0) > 0 ? 0xf43f5e : 0x330505);
      } else {
        pulse.progress += delta * pulse.speed;
        if (pulse.progress > 1.0) pulse.progress = 0.0;
        
        const pt = pulse.curve.getPoint(pulse.progress);
        pulse.mesh.position.copy(pt);

        if (pulse.type === "RENEWABLE") {
          pulse.mat.color.setHex(0x10b981);
        } else if (pulse.type === "CONVENTIONAL") {
          pulse.mat.color.setHex(this.simState.curtailActive ? 0xf59e0b : 0xfbbf24);
        } else {
          pulse.mat.color.setHex(0x38bdf8);
        }
      }
    });

    // 5. Animate Water Distribution Pipeline Pulses
    const waterRationing = this.simState.waterRationingActive;
    const waterSpeedMultiplier = waterRationing ? 0.45 : 1.0;

    this.waterPulses.forEach((pulse) => {
      pulse.progress += delta * pulse.speed * waterSpeedMultiplier;
      if (pulse.progress > 1.0) pulse.progress = 0.0;

      const pt = pulse.curve.getPoint(pulse.progress);
      pulse.mesh.position.copy(pt);

      if (waterRationing) {
        pulse.mat.color.setHex(0xf59e0b); // Amber rationing flow
      } else {
        pulse.mat.color.setHex(0x38bdf8); // Cyan standard flow
      }
    });

    // 6. Animate Reflective Water Ripples
    if (this.waterMesh) {
      this.waterMesh.material.opacity = 0.84 + Math.sin(elapsedTime * 2.5) * 0.06;
    }

    // 7. Animate Reservoir Aerator Water Splash Particles
    this.waterSplashParticles.forEach((p) => {
      p.life += delta * 1.6;
      if (p.life > 1.0) {
        p.life = 0.0;
        p.mesh.position.copy(p.origin);
      } else {
        p.mesh.position.x += p.vel.x * delta;
        p.mesh.position.y += p.vel.y * delta;
        p.mesh.position.z += p.vel.z * delta;
        p.mat.opacity = (1.0 - p.life) * 0.85;
      }
    });

    // 8. Animate Thermal Smoke Particles from Power Plant Chimneys
    const nonRenewableOutput = this.simState.nonRenewableMw || 2.5;
    const smokeIntensity = Math.min(1.0, nonRenewableOutput / 15.0);

    this.smokeParticles.forEach((sp) => {
      sp.life += delta * sp.speedY * (0.6 + smokeIntensity * 0.8);
      if (sp.life > 1.0) {
        sp.life = 0.0;
        const chim = this.chimneys[sp.chimneyIdx] || { x: 160, y: 36, z: 170 };
        sp.mesh.position.set(chim.x, chim.y, chim.z);
        sp.mesh.scale.setScalar(0.8);
      } else {
        sp.mesh.position.y += delta * 7.0;
        sp.mesh.position.x += sp.driftX * delta * 20.0;
        sp.mesh.position.z += sp.driftZ * delta * 20.0;
        sp.mesh.scale.setScalar(0.8 + sp.life * 3.2);

        // Alpha fade out as smoke rises
        sp.mat.opacity = (1.0 - sp.life) * 0.45 * smokeIntensity;
      }
    });

    // 9. Move Commuter Vehicles along Roads
    const speedFactor = Math.max(0.15, 1.0 - this.simState.congestion * 0.85);

    this.vehicles.forEach((car) => {
      const isRestricted = this.simState.oddEvenActive && car.isOddPlate;
      if (isRestricted) {
        car.mesh.visible = false;
        return;
      }
      car.mesh.visible = true;

      car.progress += delta * car.speed * speedFactor * 0.12 * car.direction;
      if (car.progress > 1.0) car.progress = 0.0;
      if (car.progress < 0.0) car.progress = 1.0;

      if (car.isEastWest) {
        const x = (car.progress - 0.5) * 500;
        car.mesh.position.set(x, 0.9, car.laneOffset);
        car.mesh.rotation.y = car.direction > 0 ? 0 : Math.PI;
      } else {
        const z = (car.progress - 0.5) * 440;
        car.mesh.position.set(car.fixedAxis + car.laneOffset, 0.9, z);
        car.mesh.rotation.y = car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    });

    // 10. Animate Ambulance with Flashing Red/Blue Siren Bar
    if (this.ambulance) {
      if (this.ambulance.active) {
        this.ambulance.mesh.visible = true;
        this.ambulance.progress += delta * this.ambulance.speed * 0.25;
        if (this.ambulance.progress > 1.0) this.ambulance.progress = 0.0;

        const ax = (this.ambulance.progress - 0.5) * 480;
        this.ambulance.mesh.position.set(ax, 1.4, 4.5);
        this.ambulance.mesh.rotation.y = 0;

        const flash = Math.sin(elapsedTime * 14.0) > 0;
        this.sirenLight.intensity = flash ? 3.5 : 0.2;
        this.sirenMat.color.setHex(flash ? 0xf43f5e : 0x0284c7);
      } else {
        this.ambulance.mesh.position.set(-120, 1.4, -94);
        this.ambulance.mesh.rotation.y = Math.PI;
        this.sirenLight.intensity = 0.0;
      }
    }

    // 11. Animate Garbage Trucks on Ring Perimeter
    this.garbageTrucks.forEach((truck) => {
      truck.progress += delta * truck.speed * 0.04;
      if (truck.progress > 1.0) truck.progress = 0.0;

      const angle = truck.progress * Math.PI * 2;
      const tx = Math.cos(angle) * truck.radius;
      const tz = Math.sin(angle) * truck.radius;
      truck.mesh.position.set(tx, 1.8, tz);
      truck.mesh.rotation.y = -angle + Math.PI / 2;
    });

    // 12. Pulse Selection Highlight Ring
    if (this.highlightRing && this.highlightRing.visible) {
      this.highlightRing.scale.setScalar(1.0 + Math.sin(elapsedTime * 4.0) * 0.08);
    }

    // 13. Render WebGL Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Global Export
window.City3DEngine = City3DEngine;
