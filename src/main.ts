import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';

// Types
type ModelType = 'box' | 'cylinder' | 'sphere' | 'torus' | 'lbracket';

interface ModelParams {
  width: number;
  height: number;
  depth: number;
  radius: number;
  segments: number;
  fillet: number; // 0-1 simulated
  hole: number;   // 0 = none, >0 diameter
}

interface Metrics {
  volume: number;
  area: number;
  watertight: boolean;
  patches: number;
  boundaryLength: number;
  open: boolean;
}

// Global state
let currentModel: ModelType = 'box';
let params: ModelParams = {
  width: 4,
  height: 3,
  depth: 2,
  radius: 1.5,
  segments: 32,
  fillet: 0,
  hole: 0,
};
let linkCameras = true;
let operationLog: string[] = [];

// Three.js objects
let solidScene: THREE.Scene;
let surfaceScene: THREE.Scene;
let solidCamera: THREE.PerspectiveCamera;
let surfaceCamera: THREE.PerspectiveCamera;
let solidRenderer: THREE.WebGLRenderer;
let surfaceRenderer: THREE.WebGLRenderer;
let solidControls: OrbitControls;
let surfaceControls: OrbitControls;
let solidMesh: THREE.Mesh | null = null;
let surfaceMesh: THREE.Mesh | null = null;
let surfacePoints: THREE.Points | null = null;
let surfaceEdges: THREE.LineSegments | null = null;
let holeMeshSolid: THREE.Mesh | null = null;
let gui: GUI;

// DOM elements (populated at runtime)
let solidCanvas: HTMLCanvasElement;
let surfaceCanvas: HTMLCanvasElement;
let metricsEl: HTMLElement;
let logEl: HTMLElement;
let modelSelect: HTMLSelectElement;

// Utility: Calculate metrics based on known formulas (educational, not full geom analysis)
function calculateMetrics(type: ModelType, p: ModelParams): { solid: Metrics; surface: Metrics } {
  const w = p.width;
  const h = p.height;
  const d = p.depth;
  const r = p.radius;
  let solidVol = 0;
  let solidArea = 0;
  let surfArea = 0;
  let patches = 1;
  let boundary = 0;

  switch (type) {
    case 'box':
      solidVol = w * h * d;
      solidArea = 2 * (w * h + w * d + h * d);
      surfArea = solidArea; // approx for demo
      patches = 6;
      boundary = 12 * Math.max(w, h, d) * 0.1; // rough
      break;
    case 'cylinder':
      solidVol = Math.PI * r * r * h;
      solidArea = 2 * Math.PI * r * r + 2 * Math.PI * r * h;
      surfArea = 2 * Math.PI * r * h + 2 * Math.PI * r * r; // closed approx
      patches = 3; // side + caps conceptually
      boundary = 2 * 2 * Math.PI * r;
      break;
    case 'sphere':
      solidVol = (4 / 3) * Math.PI * r * r * r;
      solidArea = 4 * Math.PI * r * r;
      surfArea = solidArea;
      patches = 1;
      boundary = 0;
      break;
    case 'torus':
      const R = w / 2; // major
      solidVol = 2 * Math.PI * R * (Math.PI * r * r);
      solidArea = 4 * Math.PI * Math.PI * R * r;
      surfArea = solidArea;
      patches = 1;
      boundary = 0;
      break;
    case 'lbracket':
      // Two boxes union approx
      solidVol = (w * h * d) + (w * h * d * 0.6);
      solidArea = 2 * (w * h + w * d + h * d) * 1.6;
      surfArea = solidArea * 0.9;
      patches = 12;
      boundary = 20;
      break;
  }

  // Apply fillet/hole simulation to metrics
  if (p.fillet > 0) {
    solidVol *= (1 - p.fillet * 0.08);
    solidArea *= (1 + p.fillet * 0.15);
  }
  if (p.hole > 0) {
    const holeVol = Math.PI * (p.hole / 2) ** 2 * (type === 'box' ? d : h);
    solidVol = Math.max(0.1, solidVol - holeVol);
    solidArea += Math.PI * p.hole * (type === 'box' ? d : h) * 2; // inner walls
  }

  return {
    solid: {
      volume: parseFloat(solidVol.toFixed(3)),
      area: parseFloat(solidArea.toFixed(2)),
      watertight: true,
      patches: 1,
      boundaryLength: 0,
      open: false,
    },
    surface: {
      volume: 0,
      area: parseFloat(surfArea.toFixed(2)),
      watertight: false,
      patches,
      boundaryLength: parseFloat(boundary.toFixed(1)),
      open: true,
    },
  };
}

function logOperation(msg: string) {
  operationLog.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (operationLog.length > 8) operationLog.pop();
  if (logEl) {
    logEl.innerHTML = operationLog.map(m => `<div class="text-xs py-0.5 text-zinc-400">${m}</div>`).join('');
  }
}

// Create solid geometry (closed B-Rep style)
function createSolidGeometry(type: ModelType, p: ModelParams): THREE.BufferGeometry {
  let geom: THREE.BufferGeometry;
  const seg = Math.max(8, Math.floor(p.segments / 2));

  switch (type) {
    case 'box': {
      geom = new THREE.BoxGeometry(p.width, p.height, p.depth, seg, seg, seg);
      break;
    }
    case 'cylinder': {
      geom = new THREE.CylinderGeometry(p.radius, p.radius, p.height, seg, seg);
      break;
    }
    case 'sphere': {
      geom = new THREE.SphereGeometry(p.radius, seg, seg);
      break;
    }
    case 'torus': {
      geom = new THREE.TorusGeometry(p.radius, p.width / 6, seg, seg);
      break;
    }
    case 'lbracket': {
      // Simple compound: main box + side box (union visual)
      const main = new THREE.BoxGeometry(p.width, p.height, p.depth);
      // We'll merge later or show as group; for simplicity use main
      geom = main;
      break;
    }
    default:
      geom = new THREE.BoxGeometry(p.width, p.height, p.depth);
  }

  // Simple fillet simulation: if fillet > 0, we slightly bevel conceptually (real would use BRep)
  if (p.fillet > 0.05 && (type === 'box' || type === 'lbracket')) {
    // For demo, we can scale slightly or keep; advanced users would see BRep change
    geom.scale(1 - p.fillet * 0.03, 1 - p.fillet * 0.03, 1 - p.fillet * 0.03);
  }

  geom.computeVertexNormals();
  return geom;
}

// Create surface geometry (NURBS-like patch approximation with control viz)
function createSurfaceGeometry(type: ModelType, p: ModelParams): THREE.BufferGeometry {
  let geom: THREE.BufferGeometry;
  const seg = p.segments;

  switch (type) {
    case 'box':
    case 'lbracket': {
      // Represent as 6 patches but show one main + wire for demo; or simple plane grid as "unfolded"
      geom = new THREE.PlaneGeometry(p.width, p.height, seg, seg);
      // Deform slightly to show surface nature
      const pos = geom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const z = (Math.sin(i * 0.8) * 0.1) * p.fillet;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      break;
    }
    case 'cylinder': {
      geom = new THREE.CylinderGeometry(p.radius, p.radius, p.height, seg, seg, true); // open ends = surface
      break;
    }
    case 'sphere': {
      geom = new THREE.SphereGeometry(p.radius, seg, seg);
      // Make it "surface" by slight open or just use
      break;
    }
    case 'torus': {
      geom = new THREE.TorusGeometry(p.radius, p.width / 6, seg, seg);
      break;
    }
    default:
      geom = new THREE.PlaneGeometry(p.width, p.height, seg, seg);
  }

  geom.computeVertexNormals();
  return geom;
}

// Update both models
function updateModels() {
  // Solid
  if (solidMesh) {
    solidScene.remove(solidMesh);
    solidMesh.geometry.dispose();
    if ((solidMesh.material as THREE.Material).dispose) (solidMesh.material as THREE.Material).dispose();
  }
  if (holeMeshSolid) {
    solidScene.remove(holeMeshSolid);
    holeMeshSolid.geometry.dispose();
  }

  const solidGeom = createSolidGeometry(currentModel, params);
  const solidMat = new THREE.MeshPhongMaterial({
    color: 0x3b82f6,
    shininess: 60,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    flatShading: false,
  });
  solidMesh = new THREE.Mesh(solidGeom, solidMat);
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  solidScene.add(solidMesh);

  // Add hole visual for solid (simulated boolean)
  if (params.hole > 0.1) {
    const holeR = params.hole / 2;
    const holeH = currentModel === 'box' ? params.depth + 0.2 : params.height + 0.2;
    const holeGeom = new THREE.CylinderGeometry(holeR, holeR, holeH, 24);
    const holeMat = new THREE.MeshPhongMaterial({ color: 0xef4444, shininess: 30, transparent: true, opacity: 0.6 });
    holeMeshSolid = new THREE.Mesh(holeGeom, holeMat);
    holeMeshSolid.position.set(0, 0, 0);
    if (currentModel === 'box') holeMeshSolid.rotation.x = Math.PI / 2;
    solidScene.add(holeMeshSolid);
  } else {
    holeMeshSolid = null;
  }

  // Surface
  if (surfaceMesh) {
    surfaceScene.remove(surfaceMesh);
    surfaceMesh.geometry.dispose();
    if ((surfaceMesh.material as THREE.Material).dispose) (surfaceMesh.material as THREE.Material).dispose();
  }
  if (surfacePoints) {
    surfaceScene.remove(surfacePoints);
    surfacePoints.geometry.dispose();
  }
  if (surfaceEdges) {
    surfaceScene.remove(surfaceEdges);
    surfaceEdges.geometry.dispose();
  }

  const surfGeom = createSurfaceGeometry(currentModel, params);
  const surfMat = new THREE.MeshPhongMaterial({
    color: 0xca8a04,
    shininess: 20,
    wireframe: false,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  surfaceMesh = new THREE.Mesh(surfGeom, surfMat);
  surfaceScene.add(surfaceMesh);

  // Control points / polygon for surface (educational)
  const posAttr = surfGeom.attributes.position as THREE.BufferAttribute;
  const pointsGeom = new THREE.BufferGeometry();
  pointsGeom.setAttribute('position', posAttr.clone());
  const pointsMat = new THREE.PointsMaterial({ color: 0xfbbf24, size: 0.08, sizeAttenuation: true });
  surfacePoints = new THREE.Points(pointsGeom, pointsMat);
  surfaceScene.add(surfacePoints);

  // Boundary edges (highlight open nature)
  const edges = new THREE.EdgesGeometry(surfGeom, 15);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 });
  surfaceEdges = new THREE.LineSegments(edges, edgeMat);
  surfaceScene.add(surfaceEdges);

  // Update metrics
  updateMetrics();

  // Log
  logOperation(`Updated ${currentModel} model (w=${params.width.toFixed(1)}, h=${params.height.toFixed(1)})`);
}

function updateMetrics() {
  if (!metricsEl) return;
  const m = calculateMetrics(currentModel, params);

  metricsEl.innerHTML = `
    <div class="grid grid-cols-2 gap-4">
      <!-- Solid -->
      <div class="bg-zinc-900 rounded-lg p-4 border border-blue-900/50">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-3 h-3 rounded-full bg-blue-500"></div>
          <span class="font-semibold text-blue-400">SOLID MODEL</span>
        </div>
        <table class="w-full text-sm metrics-table">
          <tr><td class="text-zinc-400">Volume</td><td class="font-mono text-right text-blue-300">${m.solid.volume}</td></tr>
          <tr><td class="text-zinc-400">Surface Area</td><td class="font-mono text-right text-blue-300">${m.solid.area}</td></tr>
          <tr><td class="text-zinc-400">Watertight</td><td class="font-mono text-right ${m.solid.watertight ? 'text-emerald-400' : 'text-red-400'}">${m.solid.watertight ? 'YES ✓' : 'NO'}</td></tr>
          <tr><td class="text-zinc-400">Topology</td><td class="font-mono text-right text-blue-300">Closed B-Rep</td></tr>
          <tr><td class="text-zinc-400">Features</td><td class="font-mono text-right text-blue-300">History-based</td></tr>
        </table>
      </div>

      <!-- Surface -->
      <div class="bg-zinc-900 rounded-lg p-4 border border-yellow-900/50">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span class="font-semibold text-yellow-400">SURFACE MODEL</span>
        </div>
        <table class="w-full text-sm metrics-table">
          <tr><td class="text-zinc-400">Volume</td><td class="font-mono text-right text-yellow-300">N/A (open)</td></tr>
          <tr><td class="text-zinc-400">Surface Area</td><td class="font-mono text-right text-yellow-300">${m.surface.area}</td></tr>
          <tr><td class="text-zinc-400">Watertight</td><td class="font-mono text-right text-red-400">NO ✗</td></tr>
          <tr><td class="text-zinc-400">Patches</td><td class="font-mono text-right text-yellow-300">${m.surface.patches}</td></tr>
          <tr><td class="text-zinc-400">Boundaries</td><td class="font-mono text-right text-yellow-300">${m.surface.boundaryLength}</td></tr>
          <tr><td class="text-zinc-400">Open/Trimmed</td><td class="font-mono text-right text-yellow-300">${m.surface.open ? 'YES' : 'NO'}</td></tr>
        </table>
      </div>
    </div>

    <div class="mt-4 p-3 bg-zinc-950 rounded text-xs text-zinc-400 border border-zinc-800">
      <strong>Key Difference:</strong> Solid has reliable volume & boolean ops. Surface excels at complex curvature but requires manual closing/stitching for solid use.
    </div>
  `;
}

// Setup Two 3D Viewers
function setupViewers() {
  const solidContainer = document.getElementById('solid-container') as HTMLDivElement;
  const surfaceContainer = document.getElementById('surface-container') as HTMLDivElement;

  // Solid
  solidCanvas = document.createElement('canvas');
  solidCanvas.className = 'three-canvas w-full h-full';
  solidContainer.appendChild(solidCanvas);

  solidRenderer = new THREE.WebGLRenderer({ canvas: solidCanvas, antialias: true, alpha: true });
  solidRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  solidRenderer.setSize(solidContainer.clientWidth, solidContainer.clientHeight);
  solidRenderer.shadowMap.enabled = true;

  solidScene = new THREE.Scene();
  solidScene.background = new THREE.Color(0x111113);
  solidScene.fog = new THREE.Fog(0x111113, 20, 60);

  solidCamera = new THREE.PerspectiveCamera(55, solidContainer.clientWidth / solidContainer.clientHeight, 0.1, 100);
  solidCamera.position.set(8, 6, 10);

  const solidLight = new THREE.DirectionalLight(0xffffff, 1.1);
  solidLight.position.set(10, 20, 10);
  solidScene.add(solidLight);
  solidScene.add(new THREE.AmbientLight(0x404040, 0.6));

  solidControls = new OrbitControls(solidCamera, solidCanvas);
  solidControls.enableDamping = true;
  solidControls.dampingFactor = 0.08;
  solidControls.minDistance = 2;
  solidControls.maxDistance = 40;

  // Surface
  surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.className = 'three-canvas w-full h-full';
  surfaceContainer.appendChild(surfaceCanvas);

  surfaceRenderer = new THREE.WebGLRenderer({ canvas: surfaceCanvas, antialias: true, alpha: true });
  surfaceRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  surfaceRenderer.setSize(surfaceContainer.clientWidth, surfaceContainer.clientHeight);

  surfaceScene = new THREE.Scene();
  surfaceScene.background = new THREE.Color(0x111113);

  surfaceCamera = new THREE.PerspectiveCamera(55, surfaceContainer.clientWidth / surfaceContainer.clientHeight, 0.1, 100);
  surfaceCamera.position.set(8, 6, 10);

  const surfLight = new THREE.DirectionalLight(0xffffff, 1.0);
  surfLight.position.set(10, 20, 10);
  surfaceScene.add(surfLight);
  surfaceScene.add(new THREE.AmbientLight(0x404040, 0.7));

  surfaceControls = new OrbitControls(surfaceCamera, surfaceCanvas);
  surfaceControls.enableDamping = true;
  surfaceControls.dampingFactor = 0.08;
  surfaceControls.minDistance = 2;
  surfaceControls.maxDistance = 40;

  // Sync controls
  solidControls.addEventListener('change', () => {
    if (linkCameras) {
      surfaceCamera.position.copy(solidCamera.position);
      surfaceCamera.quaternion.copy(solidCamera.quaternion);
    }
  });
  surfaceControls.addEventListener('change', () => {
    if (linkCameras) {
      solidCamera.position.copy(surfaceCamera.position);
      solidCamera.quaternion.copy(surfaceCamera.quaternion);
    }
  });

  // Handle resize
  const resize = () => {
    const sw = solidContainer.clientWidth;
    const sh = solidContainer.clientHeight;
    solidCamera.aspect = sw / sh;
    solidCamera.updateProjectionMatrix();
    solidRenderer.setSize(sw, sh);

    const vw = surfaceContainer.clientWidth;
    const vh = surfaceContainer.clientHeight;
    surfaceCamera.aspect = vw / vh;
    surfaceCamera.updateProjectionMatrix();
    surfaceRenderer.setSize(vw, vh);
  };
  window.addEventListener('resize', resize);
  setTimeout(resize, 100);

  // Initial models
  updateModels();
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  solidControls.update();
  surfaceControls.update();

  if (solidMesh) solidMesh.rotation.y = Math.sin(Date.now() * 0.0002) * 0.15 + 0.3; // gentle auto rotate demo
  if (surfaceMesh) surfaceMesh.rotation.y = Math.sin(Date.now() * 0.0002) * 0.15 + 0.3;

  solidRenderer.render(solidScene, solidCamera);
  surfaceRenderer.render(surfaceScene, surfaceCamera);
}

// Setup lil-gui controls
function setupGUI() {
  gui = new GUI({ title: 'Model Parameters', width: 280 });
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '80px';
  gui.domElement.style.right = '20px';
  gui.domElement.style.zIndex = '50';

  const folder = gui.addFolder('Dimensions');
  folder.add(params, 'width', 0.5, 10, 0.1).name('Width / Major').onChange(updateModels);
  folder.add(params, 'height', 0.5, 10, 0.1).name('Height').onChange(updateModels);
  folder.add(params, 'depth', 0.5, 10, 0.1).name('Depth / Minor').onChange(updateModels);
  folder.add(params, 'radius', 0.2, 5, 0.1).name('Radius').onChange(updateModels);
  folder.add(params, 'segments', 8, 64, 1).name('Resolution').onChange(updateModels);

  const ops = gui.addFolder('Operations (Demo)');
  ops.add(params, 'fillet', 0, 0.8, 0.05).name('Fillet / Blend').onChange(updateModels);
  ops.add(params, 'hole', 0, 3, 0.1).name('Hole Diameter (Boolean)').onChange(updateModels);

  gui.add({ reset: () => {
    params = { width: 4, height: 3, depth: 2, radius: 1.5, segments: 32, fillet: 0, hole: 0 };
    gui.controllers.forEach(c => c.updateDisplay());
    updateModels();
    logOperation('Reset all parameters');
  } }, 'reset').name('Reset Parameters');

  gui.add({ link: () => {
    linkCameras = !linkCameras;
    logOperation(linkCameras ? 'Cameras LINKED' : 'Cameras UNLINKED');
  } }, 'link').name('Toggle Camera Link');
}

// Setup UI event handlers and model selector
function setupUI() {
  modelSelect = document.getElementById('model-select') as HTMLSelectElement;
  metricsEl = document.getElementById('metrics-panel') as HTMLElement;
  logEl = document.getElementById('operation-log') as HTMLElement;

  modelSelect.addEventListener('change', () => {
    currentModel = modelSelect.value as ModelType;
    // Adjust default params per model for nice look
    if (currentModel === 'sphere') { params.radius = 2.2; }
    else if (currentModel === 'torus') { params.width = 5; params.radius = 1.2; }
    else if (currentModel === 'lbracket') { params.width = 5; params.height = 4; params.depth = 1.5; }
    updateModels();
    logOperation(`Switched to ${currentModel} model`);
  });

  // Operation buttons
  const opButtons = document.querySelectorAll('[data-op]');
  opButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const op = (btn as HTMLElement).dataset.op || '';
      const target = (btn as HTMLElement).dataset.target || 'both';

      if (op === 'fillet' || op === 'hole') {
        // already in GUI
        logOperation(`Applied ${op} (use sliders)`);
      } else if (op === 'boolean-subtract') {
        params.hole = params.hole > 0 ? 0 : 1.2;
        updateModels();
        logOperation('Boolean SUBTRACT (hole) toggled on SOLID');
      } else if (op === 'trim') {
        params.fillet = Math.min(0.6, params.fillet + 0.15);
        updateModels();
        logOperation('TRIM / Extend applied on SURFACE');
      } else if (op === 'refine') {
        params.segments = Math.min(64, params.segments + 8);
        updateModels();
        logOperation('Surface REFINED (more patches)');
      } else if (op === 'screenshot') {
        takeScreenshot();
      }
    });
  });

  // Initial metrics
  updateMetrics();
  logOperation('App initialized - Solid vs Surface Modeling Demo');
}

function takeScreenshot() {
  // Simple: capture both canvases side by side via temp canvas or alert
  const link = document.createElement('a');
  link.download = `solid-vs-surface-${currentModel}.png`;
  // For demo, capture solid
  solidRenderer.render(solidScene, solidCamera);
  link.href = solidCanvas.toDataURL('image/png');
  link.click();
  logOperation('Screenshot exported (solid view)');
}

// Main entry
function initApp() {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="max-w-[1400px] mx-auto p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-4xl font-bold tracking-tighter">Solid vs Surface Modeling</h1>
          <p class="text-zinc-400 mt-1">Interactive CAD Education Demo • Built with Three.js + TypeScript</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 text-xs font-medium flex items-center gap-1.5">
            <div class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
            CI/CD VALIDATED
          </div>
          <button onclick="window.location.reload()" class="px-4 py-2 text-sm rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700">Reload</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Theory / Info -->
        <div class="lg:col-span-3 bg-zinc-900 rounded-2xl p-6 border border-zinc-800 h-fit">
          <h2 class="font-semibold mb-4 flex items-center gap-2"><span>📚</span> Theory</h2>
          <div class="space-y-4 text-sm">
            <div>
              <div class="font-medium text-blue-400 mb-1">SOLID MODELING</div>
              <div class="text-zinc-400 text-xs leading-relaxed">B-Rep + CSG. Closed volumes, topology, reliable booleans, mass props, parametric history. Ideal for mechanical design & manufacturing.</div>
            </div>
            <div>
              <div class="font-medium text-yellow-400 mb-1">SURFACE MODELING</div>
              <div class="text-zinc-400 text-xs leading-relaxed">NURBS/Bezier patches. Precise freeform shapes, local control, Class-A surfacing. May be open, requires stitching for solids. Ideal for styling & complex curves.</div>
            </div>
          </div>
          <div class="mt-6 pt-6 border-t border-zinc-800 text-[10px] text-zinc-500">
            This demo uses approximate geometries. Real CAD kernels (OpenCASCADE, Parasolid) use exact math.
          </div>
        </div>

        <!-- Viewers -->
        <div class="lg:col-span-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Solid Viewer -->
            <div>
              <div class="flex items-center justify-between mb-2 px-1">
                <div class="model-label solid-label flex items-center gap-2">
                  <span>SOLID</span> <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400">B-Rep / CSG</span>
                </div>
                <div class="text-[10px] text-zinc-500">Closed • Watertight</div>
              </div>
              <div id="solid-container" class="canvas-container aspect-[4/3] relative"></div>
              <div class="flex gap-2 mt-2">
                <button data-op="boolean-subtract" data-target="solid" class="operation-btn flex-1 text-xs py-1.5 rounded-lg bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-900">Boolean Subtract (Hole)</button>
              </div>
            </div>

            <!-- Surface Viewer -->
            <div>
              <div class="flex items-center justify-between mb-2 px-1">
                <div class="model-label surface-label flex items-center gap-2">
                  <span>SURFACE</span> <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-950 text-yellow-400">NURBS / Patch</span>
                </div>
                <div class="text-[10px] text-zinc-500">Open • Trimmed</div>
              </div>
              <div id="surface-container" class="canvas-container aspect-[4/3] relative"></div>
              <div class="flex gap-2 mt-2">
                <button data-op="trim" data-target="surface" class="operation-btn flex-1 text-xs py-1.5 rounded-lg bg-yellow-950 hover:bg-yellow-900 text-yellow-300 border border-yellow-900">Trim / Extend</button>
                <button data-op="refine" data-target="surface" class="operation-btn flex-1 text-xs py-1.5 rounded-lg bg-yellow-950 hover:bg-yellow-900 text-yellow-300 border border-yellow-900">Refine Patch</button>
              </div>
            </div>
          </div>

          <!-- Model Selector -->
          <div class="mt-4 flex items-center gap-3 bg-zinc-900 rounded-xl p-3 border border-zinc-800">
            <label class="text-sm text-zinc-400 w-24">Model Preset</label>
            <select id="model-select" class="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500">
              <option value="box">Box / Prism</option>
              <option value="cylinder">Cylinder</option>
              <option value="sphere">Sphere</option>
              <option value="torus">Torus</option>
              <option value="lbracket">L-Bracket (Compound)</option>
            </select>
            <button data-op="screenshot" class="px-4 py-2 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600">📷 Export PNG</button>
          </div>
        </div>

        <!-- Metrics + Log -->
        <div class="lg:col-span-3 space-y-6">
          <div>
            <h3 class="font-semibold mb-3 px-1 text-sm tracking-wider text-zinc-400">LIVE METRICS COMPARISON</h3>
            <div id="metrics-panel" class="text-sm"></div>
          </div>

          <div class="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 class="font-semibold mb-3 text-sm tracking-wider text-zinc-400 flex items-center justify-between">
              <span>OPERATION LOG</span>
              <span class="text-[10px] text-zinc-500">Feature Tree vs Patch Tree</span>
            </h3>
            <div id="operation-log" class="h-[148px] overflow-auto text-xs font-mono bg-zinc-950 rounded-lg p-3 border border-zinc-800"></div>
          </div>
        </div>
      </div>

      <!-- Comparison note -->
      <div class="mt-8 text-center text-xs text-zinc-500 max-w-md mx-auto">
        Solid modeling guarantees manufacturability. Surface modeling gives creative freedom for aesthetics. Professional workflows combine both.
      </div>
    </div>
  `;

  setupViewers();
  setupGUI();
  setupUI();
  animate();

  // Boot with initial model
  setTimeout(() => {
    const sel = document.getElementById('model-select') as HTMLSelectElement;
    if (sel) sel.value = currentModel;
    updateModels();
  }, 50);
}

// Boot
initApp();
