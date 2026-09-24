/**
 * Mini Smart City Simulator — 3D WebGL Digital Twin Engine
 * Built with Three.js (r128) & OrbitControls
 * 
 * Renders a living, interactive, procedural 3D smart city driven
 * directly by the discrete-event simulation backend.
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

    // Moving Entities
    this.vehicles = [];
    this.ambulance = null;
    this.garbageTrucks = [];
    this.windTurbines = [];
    this.smokeParticles = [];
    this.energyPulses = [];

    // Lighting References for Day/Night Cycle
    this.sunLight = null;
    this.moonLight = null;
    this.hemiLight = null;
    this.ambientLight = null;
    this.streetLights = [];
    this.windowMaterials = [];
    this.smogMesh = null;
    this.waterMesh = null;

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
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Do not go below ground
      this.controls.minDistance = 30;
      this.controls.maxDistance = 600;
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

    // 6. Build World
    this.setupLighting();
    this.buildCityTerrain();
    this.buildRoadNetwork();
    this.buildDistrictsAndBuildings();
    this.buildInfrastructure();
    this.buildVehicleFleet();
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
    // Ambient Light
    this.ambientLight = new THREE.AmbientLight(0xddeeff, 0.4);
    this.lightsGroup.add(this.ambientLight);

    // Hemisphere Sky/Ground Light
    this.hemiLight = new THREE.HemisphereLight(0x7090b0, 0x101520, 0.45);
    this.hemiLight.position.set(0, 200, 0);
    this.lightsGroup.add(this.hemiLight);

    // Sun (Directional Light with Shadows)
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

    // Moon Light (Subtle blue illumination at night)
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
    // Hour is 0.0 to 23.99
    // Sun trajectory angle
    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const sunDist = 320;
    const sunY = Math.sin(sunAngle) * sunDist;
    const sunX = Math.cos(sunAngle) * sunDist;

    this.sunLight.position.set(sunX, Math.max(10, sunY), 120);

    const isDay = hour >= 6 && hour <= 19;
    const dayProgress = (hour - 6) / 13; // 0 at dawn, 0.5 at noon, 1.0 at dusk

    if (isDay) {
      // Daytime brightness modulated by sun elevation
      const elevationFactor = Math.sin(dayProgress * Math.PI);
      this.sunLight.intensity = 0.4 + elevationFactor * 1.1;
      this.sunLight.color.setHSL(0.12 - (1 - elevationFactor) * 0.06, 0.4, 0.95);
      this.ambientLight.intensity = 0.35 + elevationFactor * 0.3;
      this.hemiLight.intensity = 0.4 + elevationFactor * 0.3;
      this.moonLight.intensity = 0.0;
      this.scene.fog.color.setHex(0x0a101d);

      // Turn off street lamps & window glows
      this.setStreetLightsState(false);
      this.setWindowGlowState(0.15);
    } else {
      // Nighttime
      this.sunLight.intensity = 0.0;
      this.moonLight.intensity = 0.4;
      this.ambientLight.intensity = 0.15;
      this.hemiLight.intensity = 0.18;
      this.scene.fog.color.setHex(0x04060a);

      // Turn on street lamps & windows
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
    // Base Ground Plate
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

    // Decorative City Base Bevel Rim
    const rimGeo = new THREE.BoxGeometry(606, 12, 606);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x070b12,
      roughness: 0.7,
      metalness: 0.3,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -6;
    this.groundGroup.add(rim);

    // Sub-district Zone Ground Tiles with subtle glowing boundaries
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

    // Arterial Dashed Center Stripes
    for (let x = -260; x <= 260; x += 16) {
      const stripeGeo = new THREE.PlaneGeometry(8, 0.8);
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.12, 0);
      this.roadsGroup.add(stripe);
    }

    // Arterial Sidewalks
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

      // Sidewalks for N-S avenues
      [-10, 10].forEach((offsetX) => {
        const walkGeo = new THREE.BoxGeometry(2, 0.6, 480);
        const walk = new THREE.Mesh(walkGeo, sidewalkMat);
        walk.position.set(posX + offsetX, 0.3, 0);
        walk.receiveShadow = true;
        this.roadsGroup.add(walk);
      });

      // Traffic Signal Junction at the intersection
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
      if (Math.abs(x) === 160 || x === 0) continue; // Skip intersection centers
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

    // Lamp Head
    const headGeo = new THREE.BoxGeometry(2, 0.6, 1.2);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d4 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x + (z > 0 ? -1 : 1), 12, z);
    this.roadsGroup.add(head);

    // PointLight
    const pLight = new THREE.PointLight(0xffeedd, 0.0, 45, 1.8);
    pLight.position.set(x, 11.5, z);
    this.lightsGroup.add(pLight);
    this.streetLights.push(pLight);
  }

  createTrafficSignalJunction(x, z, intersectionId) {
    const junctionGroup = new THREE.Group();
    junctionGroup.position.set(x, 0, z);

    // 4 Corner Traffic Light Posts
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

      // Signal Housing Box
      const boxGeo = new THREE.BoxGeometry(2.2, 5.5, 1.8);
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(c.dx, 12.5, c.dz);
      box.rotation.y = c.rotY;
      junctionGroup.add(box);

      // Green, Yellow, Red Light Bulbs
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
    // District 1: Residential & Mixed Urban (North-West)
    this.buildResidentialBlock(-160, 110, 10);

    // District 2: Downtown Commercial & Office High-Rises (North & Center)
    this.buildCommercialSkyscrapers(0, 110, 12);

    // District 3: Industrial District (North-East)
    this.buildIndustrialBlock(160, 110, 8);

    // District 4: Parks & South Residential Neighborhoods
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

      // Rooftop Utility Unit / AC box
      const acGeo = new THREE.BoxGeometry(width * 0.35, 2.5, depth * 0.35);
      const acMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(bx, height + 1.25, bz);
      this.buildingsGroup.add(ac);

      // Illuminated Window Panels (Emissive for night cycle)
      this.createWindowMesh(bx, height, bz, width, depth);

      // Add small trees around residential buildings
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
      const height = 45 + Math.random() * 70; // Tall sleek towers

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

      // Rooftop Spire or Helipad on tallest towers
      if (height > 75) {
        const spireGeo = new THREE.ConeGeometry(1.2, 18, 8);
        const spireMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 });
        const spire = new THREE.Mesh(spireGeo, spireMat);
        spire.position.set(bx, height + 9, bz);
        this.buildingsGroup.add(spire);

        // Blinking aviation beacon light atop tower
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

      // Industrial Cylindrical Silos/Tanks
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

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2;
    treeGroup.add(trunk);

    // Foliage Cone
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

    // Trees inside park
    for (let i = 0; i < 14; i++) {
      const tx = centerX + (Math.random() - 0.5) * 65;
      const tz = centerZ + (Math.random() - 0.5) * 55;
      this.createTree(tx, tz);
    }
  }

  // ---------------------------------------------------------------------------
  // Major Infrastructure Assets (Clickable / Interactive)
  // ---------------------------------------------------------------------------

  buildInfrastructure() {
    this.buildHospital(-120, -110);
    this.buildSolarFarm(-160, 180);
    this.buildGasPowerPlant(160, 180);
    this.buildWaterReservoir(130, -130);
  }

  buildHospital(x, z) {
    const hospGroup = new THREE.Group();
    hospGroup.position.set(x, 0, z);

    // Main Hospital Modern White/Cyan Building
    const mainGeo = new THREE.BoxGeometry(42, 28, 30);
    const mainMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.3 });
    const mainBuilding = new THREE.Mesh(mainGeo, mainMat);
    mainBuilding.position.y = 14;
    mainBuilding.castShadow = true;
    mainBuilding.receiveShadow = true;
    hospGroup.add(mainBuilding);

    // Hospital Glowing Red Cross Logo (3D)
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 0.5), crossMat);
    crossV.position.set(0, 22, 15.3);
    hospGroup.add(crossV);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 0.5), crossMat);
    crossH.position.set(0, 22, 15.3);
    hospGroup.add(crossH);

    // Helipad on Rooftop
    const heliGeo = new THREE.CylinderGeometry(8, 8, 0.5, 24);
    const heliMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const helipad = new THREE.Mesh(heliGeo, heliMat);
    helipad.position.set(0, 28.3, 0);
    hospGroup.add(helipad);

    // Ambulance Emergency Bay
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

    // Ground Plate
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 60),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.1;
    solarGroup.add(base);

    // Array of Tilted Blue Solar PV Panels
    const panelGeo = new THREE.BoxGeometry(7, 0.3, 5);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      metalness: 0.9,
      roughness: 0.1,
    });

    for (let r = -20; r <= 20; r += 10) {
      for (let c = -30; c <= 30; c += 10) {
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.rotation.x = -Math.PI / 6; // Angled towards sun
        panel.position.set(c, 2.5, r);
        panel.castShadow = true;
        solarGroup.add(panel);
      }
    }

    // Two Clean Energy Wind Turbines
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

    // Tower
    const towerGeo = new THREE.CylinderGeometry(0.6, 1.2, 38, 12);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.y = 19;
    turbineGroup.add(tower);

    // Nacelle (Generator hub)
    const nacelleGeo = new THREE.BoxGeometry(2, 2, 4);
    const nacelle = new THREE.Mesh(nacelleGeo, towerMat);
    nacelle.position.set(0, 38, 0);
    turbineGroup.add(nacelle);

    // 3 Rotor Blades
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

    // Heavy Industrial Facility Block
    const mainBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(45, 18, 35),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.6 })
    );
    mainBuilding.position.y = 9;
    mainBuilding.castShadow = true;
    plantGroup.add(mainBuilding);

    // 3 Tall Thermal Exhaust Chimneys
    this.chimneys = [];
    [-12, 0, 12].forEach((cx) => {
      const chimGeo = new THREE.CylinderGeometry(2, 2.8, 36, 16);
      const chimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 });
      const chimney = new THREE.Mesh(chimGeo, chimMat);
      chimney.position.set(cx, 18, -10);
      chimney.castShadow = true;
      plantGroup.add(chimney);

      // Red Hazard Bands on top
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

  buildWaterReservoir(x, z) {
    const waterGroup = new THREE.Group();
    waterGroup.position.set(x, 0, z);

    // Concrete Basin Wall Perimeter
    const wallGeo = new THREE.BoxGeometry(84, 8, 74);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 3;
    waterGroup.add(wall);

    // Animated Reflective Water Surface
    const waterGeo = new THREE.PlaneGeometry(76, 66, 32, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(0, 5.8, 0); // Max height @ 5.8
    waterGroup.add(this.waterMesh);

    // Pumping Station Control Tower
    const pumpTower = new THREE.Mesh(
      new THREE.BoxGeometry(16, 14, 16),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.5 })
    );
    pumpTower.position.set(-32, 7, 0);
    waterGroup.add(pumpTower);

    waterGroup.userData = {
      type: "WATER_RESERVOIR",
      id: "RES-MAIN",
      name: "Central Aqueduct & Stormwater Reservoir",
      capacity: "15,000 kL",
    };

    this.waterGroup.add(waterGroup);
    this.interactiveObjects.push(waterGroup);
  }

  // ---------------------------------------------------------------------------
  // Moving Vehicles, Ambulances & Fleet Simulation
  // ---------------------------------------------------------------------------

  buildVehicleFleet() {
    this.vehicles = [];

    // Commuter Car Palette
    const carColors = [0x38bdf8, 0xf43f5e, 0x10b981, 0xfbbf24, 0xe2e8f0, 0x9333ea, 0x475569];

    // Spawn commuter cars along roads
    for (let i = 0; i < 28; i++) {
      const isEastWest = i % 2 === 0;
      const isOddPlate = i % 2 !== 0;

      const carGroup = new THREE.Group();

      // Car Body
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

      // Cabin Roof
      const cabinGeo = new THREE.BoxGeometry(2.4, 1.1, 1.8);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(-0.2, 2.0, 0);
      carGroup.add(cabin);

      // Headlights (Lit at night)
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

    // Spawn Emergency Ambulance
    this.buildAmbulance();

    // Spawn Waste Garbage Trucks
    this.buildGarbageTrucks();
  }

  buildAmbulance() {
    const ambGroup = new THREE.Group();

    // Ambulance Box Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 2.4), bodyMat);
    body.position.y = 1.4;
    body.castShadow = true;
    ambGroup.add(body);

    // Red Cross Decals
    const redCrossMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 2.5), redCrossMat);
    cross.position.set(0, 1.6, 0);
    ambGroup.add(cross);

    // Flashing Siren Bar
    const sirenGeo = new THREE.BoxGeometry(1.2, 0.5, 1.6);
    this.sirenMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const siren = new THREE.Mesh(sirenGeo, this.sirenMat);
    siren.position.set(0, 2.8, 0);
    ambGroup.add(siren);

    // Flashing PointLight
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

      // Green Waste Truck Body
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 2.8), bodyMat);
      body.position.y = 1.8;
      body.castShadow = true;
      truckGroup.add(body);

      // Cab
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
  // Interactive Raycasting & Context HUD Selection
  // ---------------------------------------------------------------------------

  setupSelectionIndicator() {
    // Glowing Ring below selected building
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
        // Find topmost registered group
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
  // Camera Presets & Smooth Interpolation
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
        targetPos.set(0, 95, 230);
        targetLook.set(0, 0, 180);
        break;
      case "WATER":
        targetPos.set(130, 75, -50);
        targetLook.set(130, 0, -130);
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

    // 1. Update Day/Night Atmosphere
    this.updateDayNightCycle(this.simState.hour);

    // 2. Update Water Reservoir Mesh Level
    if (this.waterMesh) {
      const minWaterY = 0.8;
      const maxWaterY = 5.8;
      const targetY = minWaterY + (this.simState.reservoirLevelPct / 100) * (maxWaterY - minWaterY);
      this.waterMesh.position.y = targetY;
    }

    // 3. Update AQI Smog Haze Opacity & Color
    if (this.smogMesh) {
      if (this.simState.aqi > 75) {
        const opacity = Math.min(0.45, ((this.simState.aqi - 75) / 90) * 0.45);
        this.smogMesh.material.opacity = opacity;
        if (this.simState.aqi > 110) {
          this.smogMesh.material.color.setHex(0xf43f5e); // Alert red haze
        } else {
          this.smogMesh.material.color.setHex(0xf59e0b); // Moderate amber haze
        }
      } else {
        this.smogMesh.material.opacity = 0.0; // Crystal clear
      }
    }

    // 4. Update Traffic Signal Light Colors
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

    // 5. Activate Ambulance on Critical Incidents or Green Wave
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
  // 60 FPS Animation Loop
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

    // 2. Rotate Wind Turbines
    const windSpeed = 1.8;
    this.windTurbines.forEach((rotor) => {
      rotor.rotation.z += delta * windSpeed;
    });

    // 3. Animate Reflective Water Ripples
    if (this.waterMesh) {
      this.waterMesh.material.opacity = 0.82 + Math.sin(elapsedTime * 2.0) * 0.06;
    }

    // 4. Move Commuter Vehicles along Roads
    // Congestion slows down cars
    const speedFactor = Math.max(0.15, 1.0 - this.simState.congestion * 0.85);

    this.vehicles.forEach((car) => {
      // If Odd-Even rule active and this is an odd plate on even step, stop/hide car
      const isRestricted = this.simState.oddEvenActive && car.isOddPlate;
      if (isRestricted) {
        car.mesh.visible = false;
        return;
      }
      car.mesh.visible = true;

      // Advance along road line
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

    // 5. Animate Ambulance with Flashing Red/Blue Light Bar
    if (this.ambulance) {
      if (this.ambulance.active) {
        this.ambulance.mesh.visible = true;
        this.ambulance.progress += delta * this.ambulance.speed * 0.25;
        if (this.ambulance.progress > 1.0) this.ambulance.progress = 0.0;

        // Drive along main arterial corridor
        const ax = (this.ambulance.progress - 0.5) * 480;
        this.ambulance.mesh.position.set(ax, 1.4, 4.5);
        this.ambulance.mesh.rotation.y = 0;

        // Flashing Siren
        const flash = Math.sin(elapsedTime * 14.0) > 0;
        this.sirenLight.intensity = flash ? 3.5 : 0.2;
        this.sirenMat.color.setHex(flash ? 0xf43f5e : 0x0284c7);
      } else {
        // Parked at hospital bay
        this.ambulance.mesh.position.set(-120, 1.4, -94);
        this.ambulance.mesh.rotation.y = Math.PI;
        this.sirenLight.intensity = 0.0;
      }
    }

    // 6. Animate Garbage Trucks on Ring Perimeter
    this.garbageTrucks.forEach((truck) => {
      truck.progress += delta * truck.speed * 0.04;
      if (truck.progress > 1.0) truck.progress = 0.0;

      const angle = truck.progress * Math.PI * 2;
      const tx = Math.cos(angle) * truck.radius;
      const tz = Math.sin(angle) * truck.radius;
      truck.mesh.position.set(tx, 1.8, tz);
      truck.mesh.rotation.y = -angle + Math.PI / 2;
    });

    // 7. Pulse Selection Highlight Ring
    if (this.highlightRing && this.highlightRing.visible) {
      this.highlightRing.scale.setScalar(1.0 + Math.sin(elapsedTime * 4.0) * 0.08);
    }

    // 8. Render WebGL Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Global Export
window.City3DEngine = City3DEngine;
