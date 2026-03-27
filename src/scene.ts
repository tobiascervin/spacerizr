import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { C4Element, C4Relationship, ViewState } from "./types";
import { gridLayout, LayoutNode } from "./layout";
import { settings, getTheme, getElementPalette } from "./settings";

const meshToElement = new Map<string, C4Element>();
const elementToGroup = new Map<string, THREE.Group>();
const hitboxMeshes: THREE.Mesh[] = [];
let relationshipObjects: THREE.Group[] = [];
let hoveredGroup: THREE.Group | null = null;

// Spotlight state
let spotlightIds3D: Set<string> = new Set();
let presentationModeActive = false;

// Stored scene objects for theme switching
let sceneGround: THREE.Mesh | null = null;
let sceneDotGrid: THREE.Points | null = null;
let storedScene: THREE.Scene | null = null;

// ── Label creation ──

function createLabel(
  text: string,
  fontSize: number,
  color: string,
  maxWidth: number
): THREE.Sprite {
  const theme = getTheme();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const scale = 2;
  canvas.width = 512 * scale;
  canvas.height = 128 * scale;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = theme.labelShadow;
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1 * scale;

  ctx.font = `${fontSize * scale}px "Inter", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(maxWidth, maxWidth / 4, 1);
  return sprite;
}

// ── Sketch edge outlines ──

function addSketchEdges(group: THREE.Group, geometry: THREE.BufferGeometry, borderColor: string, yOffset = 0): void {
  const edges = new THREE.EdgesGeometry(geometry, 15);
  const lineMat = new THREE.LineBasicMaterial({
    color: borderColor,
    transparent: true,
    opacity: 0.7,
  });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.userData.isEdge = true;
  wireframe.position.y = yOffset;
  group.add(wireframe);
}

// ── Element mesh ──

function createElementMesh(element: C4Element): THREE.Group {
  const group = new THREE.Group();
  const pal = getElementPalette(element);
  const theme = getTheme();
  const fillColor = new THREE.Color(pal.fill);

  let geometry: THREE.BufferGeometry;
  let meshYOffset = 0;

  if (element.type === "person") {
    const headGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({
      color: fillColor,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: 0.95,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.0;
    group.add(head);
    addSketchEdges(group, headGeo, pal.border, 1.0);

    geometry = new THREE.CapsuleGeometry(0.4, 0.6, 6, 12);
    meshYOffset = 0.2;
  } else if (
    element.technology?.toLowerCase().includes("sql") ||
    element.technology?.toLowerCase().includes("database") ||
    element.technology?.toLowerCase().includes("postgres") ||
    element.technology?.toLowerCase().includes("mysql") ||
    element.technology?.toLowerCase().includes("redis")
  ) {
    geometry = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16);
  } else {
    geometry = new THREE.BoxGeometry(2.2, 1.0, 1.4);
  }

  const material = new THREE.MeshStandardMaterial({
    color: fillColor,
    roughness: 0.85,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = meshYOffset;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  addSketchEdges(group, geometry, pal.border, meshYOffset);

  // Shadow plane
  const shadowGeo = new THREE.PlaneGeometry(2.8, 1.8);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: theme.shadowOpacity,
    side: THREE.DoubleSide,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -0.49;
  group.add(shadowPlane);

  // Labels
  const labelY = element.type === "person" ? 1.8 : 1.0;
  const nameLabel = createLabel(element.name, 30, pal.text, 3.5);
  nameLabel.position.y = labelY;
  group.add(nameLabel);

  const typeText = element.technology ?? element.type.replace(/([A-Z])/g, " $1").trim();
  const typeLabel = createLabel(`[${typeText}]`, 20, pal.border, 3);
  typeLabel.position.y = labelY - 0.4;
  group.add(typeLabel);

  // Drill-down ring
  if (element.children && element.children.length > 0) {
    const ringGeo = new THREE.RingGeometry(1.3, 1.36, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pal.border),
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.48;
    ring.userData.isRing = true;
    group.add(ring);
  }

  group.userData.hitbox = mesh;
  return group;
}

// ── Relationship ──

function createRelationship(
  from: THREE.Vector3,
  to: THREE.Vector3,
  relationship: C4Relationship,
  perpOffset: number = 0,
  labelT: number = 0.5
): THREE.Group {
  const group = new THREE.Group();
  group.userData.sourceId = relationship.sourceId;
  group.userData.destinationId = relationship.destinationId;
  const theme = getTheme();

  // Calculate perpendicular direction (in XZ plane) for offsetting parallel edges
  const dir = new THREE.Vector3().subVectors(to, from);
  const perpDir = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

  const offsetFrom = from.clone().add(perpDir.clone().multiplyScalar(perpOffset));
  const offsetTo = to.clone().add(perpDir.clone().multiplyScalar(perpOffset));

  const mid = new THREE.Vector3().addVectors(offsetFrom, offsetTo).multiplyScalar(0.5);
  mid.y += 1.0;

  const curve = new THREE.QuadraticBezierCurve3(offsetFrom.clone(), mid, offsetTo.clone());
  const points = curve.getPoints(50);
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);

  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  lineGeo.setAttribute("lineDistance", new THREE.BufferAttribute(new Float32Array(distances), 1));

  const lineMat = new THREE.LineDashedMaterial({
    color: theme.relLineColor,
    transparent: true,
    opacity: theme.relLineOpacity,
    dashSize: 0.15,
    gapSize: 0.1,
  });
  const line = new THREE.Line(lineGeo, lineMat);
  line.computeLineDistances();
  group.add(line);

  // Particles
  const particleCount = 5;
  for (let i = 0; i < particleCount; i++) {
    const dotGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: theme.particleColor,
      transparent: true,
      opacity: 0.6,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.userData.curveOffset = i / particleCount;
    dot.userData.curve = curve;
    group.add(dot);
  }

  // Arrow
  const tangent = curve.getTangent(0.95);
  const endPoint = curve.getPoint(0.95);
  const arrowHelper = new THREE.ArrowHelper(tangent, endPoint, 0.3, theme.relLineColor, 0.2, 0.1);
  group.add(arrowHelper);

  // Label — placed at labelT along the curve instead of always at 0.5
  if (relationship.description) {
    const labelPos = curve.getPoint(labelT);
    labelPos.y += 0.4;
    const label = createLabel(relationship.description, 20, theme.relLabelColor, 3);
    label.position.copy(labelPos);
    group.add(label);
  }

  group.userData.relationship = relationship;
  return group;
}

// ── Dot grid ──

function createDotGrid(size: number, spacing: number, color: number): THREE.Points {
  const dots: number[] = [];
  const half = size / 2;
  for (let x = -half; x <= half; x += spacing) {
    for (let z = -half; z <= half; z += spacing) {
      dots.push(x, 0, z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
  const material = new THREE.PointsMaterial({ color, size: 3, sizeAttenuation: false });
  return new THREE.Points(geometry, material);
}

// ── Scene ──

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  container: HTMLElement;
  onElementClick: (element: C4Element, event?: MouseEvent) => void;
  onElementHover: (element: C4Element | null, event: MouseEvent) => void;
}

export function createScene(
  container: HTMLElement,
  onElementClick: (element: C4Element, event?: MouseEvent) => void,
  onElementHover: (element: C4Element | null, event: MouseEvent) => void
): SceneContext {
  const theme = getTheme();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.bg);
  scene.fog = new THREE.FogExp2(theme.bg, theme.fogDensity);
  storedScene = scene;

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 120);
  camera.position.set(0, 9, 14);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.style.display = "none"; // Hidden until show3D() is called
  container.appendChild(renderer.domElement);

  // Lighting — works for both themes
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(4, 12, 6);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 40;
  dirLight.shadow.camera.left = -15;
  dirLight.shadow.camera.right = 15;
  dirLight.shadow.camera.top = 15;
  dirLight.shadow.camera.bottom = -15;
  dirLight.shadow.radius = 4;
  scene.add(dirLight);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xccccdd, 0.4));

  // Ground
  const groundGeo = new THREE.PlaneGeometry(60, 60);
  const groundMat = new THREE.MeshStandardMaterial({ color: theme.groundColor, roughness: 1.0, metalness: 0 });
  sceneGround = new THREE.Mesh(groundGeo, groundMat);
  sceneGround.rotation.x = -Math.PI / 2;
  sceneGround.position.y = -0.5;
  sceneGround.receiveShadow = true;
  scene.add(sceneGround);

  sceneDotGrid = createDotGrid(60, 1.5, theme.gridColor);
  sceneDotGrid.position.y = -0.49;
  scene.add(sceneDotGrid);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 3;
  controls.maxDistance = 35;
  controls.rotateSpeed = 0.5;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const ctx: SceneContext = {
    scene, camera, renderer, controls, raycaster, mouse,
    container, onElementClick, onElementHover,
  };

  renderer.domElement.addEventListener("mousemove", (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(hitboxMeshes, false);

    if (intersects.length > 0) {
      const parentGroup = intersects[0].object.parent as THREE.Group;
      if (hoveredGroup !== parentGroup) {
        if (hoveredGroup) setGroupHover(hoveredGroup, false);
        hoveredGroup = parentGroup;
        setGroupHover(parentGroup, true);
        renderer.domElement.style.cursor = "pointer";
      }
      const element = meshToElement.get(parentGroup.uuid);
      if (element) onElementHover(element, event);
    } else {
      if (hoveredGroup) {
        setGroupHover(hoveredGroup, false);
        hoveredGroup = null;
        renderer.domElement.style.cursor = "default";
      }
      onElementHover(null, event);
    }
  });

  renderer.domElement.addEventListener("click", (e) => {
    if (hoveredGroup) {
      const element = meshToElement.get(hoveredGroup.uuid);
      if (element) onElementClick(element, e);
    } else if (spotlightIds3D.size > 0) {
      // Click on empty space clears spotlight
      clearSpotlight3D();
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return ctx;
}

/** Update scene background/ground/grid when theme changes */
export function applyTheme(ctx: SceneContext): void {
  const theme = getTheme();
  ctx.scene.background = new THREE.Color(theme.bg);
  (ctx.scene.fog as THREE.FogExp2).color.set(theme.bg);
  (ctx.scene.fog as THREE.FogExp2).density = theme.fogDensity;

  if (sceneGround) {
    (sceneGround.material as THREE.MeshStandardMaterial).color.set(theme.groundColor);
  }
  if (sceneDotGrid && storedScene) {
    storedScene.remove(sceneDotGrid);
    sceneDotGrid = createDotGrid(60, 1.5, theme.gridColor);
    sceneDotGrid.position.y = -0.49;
    storedScene.add(sceneDotGrid);
  }
}

function setGroupHover(group: THREE.Group, hovered: boolean): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial && !child.userData.isEdge) {
      child.material.opacity = hovered ? 1.0 : 0.92;
    }
    if (child instanceof THREE.LineSegments && child.userData.isEdge) {
      (child.material as THREE.LineBasicMaterial).opacity = hovered ? 1.0 : 0.7;
    }
  });
  group.scale.setScalar(hovered ? 1.04 : 1.0);
}

// ── Clear / render ──

function clearElements(scene: THREE.Scene): void {
  for (const [, group] of elementToGroup) scene.remove(group);
  for (const obj of relationshipObjects) scene.remove(obj);
  meshToElement.clear();
  elementToGroup.clear();
  hitboxMeshes.length = 0;
  relationshipObjects = [];
  hoveredGroup = null;
  basePositions.clear();
}

export function renderView(ctx: SceneContext, viewState: ViewState): void {
  clearElements(ctx.scene);
  const nodes = gridLayout(viewState.visibleElements, viewState.visibleRelationships);

  for (const node of nodes) {
    const group = createElementMesh(node.element);
    group.position.copy(node.position);
    ctx.scene.add(group);
    meshToElement.set(group.uuid, node.element);
    elementToGroup.set(node.element.id, group);
    const hitbox = group.userData.hitbox as THREE.Mesh;
    if (hitbox) hitboxMeshes.push(hitbox);
  }

  // Count edges between same node pairs for perpendicular offset
  const edgeCounts = new Map<string, number>();
  const edgeIndex = new Map<string, number>();
  for (const rel of viewState.visibleRelationships) {
    const key = [rel.sourceId, rel.destinationId].sort().join(":");
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }

  // Label t-values to spread labels along the curve
  const labelTValues = [0.5, 0.35, 0.65, 0.25, 0.75];

  for (const rel of viewState.visibleRelationships) {
    const fromGroup = elementToGroup.get(rel.sourceId);
    const toGroup = elementToGroup.get(rel.destinationId);
    if (fromGroup && toGroup) {
      const key = [rel.sourceId, rel.destinationId].sort().join(":");
      const total = edgeCounts.get(key) ?? 1;
      const idx = edgeIndex.get(key) ?? 0;
      edgeIndex.set(key, idx + 1);

      // Perpendicular offset so parallel edges don't overlap
      const perpOffset = (idx - (total - 1) / 2) * 0.6;
      // Spread labels along different points on the curve
      const labelT = labelTValues[idx % labelTValues.length];

      const relGroup = createRelationship(
        fromGroup.position.clone(), toGroup.position.clone(), rel, perpOffset, labelT
      );
      ctx.scene.add(relGroup);
      relationshipObjects.push(relGroup);
    }
  }

  animateCamera(ctx, nodes);
}

function animateCamera(ctx: SceneContext, nodes: LayoutNode[]): void {
  if (nodes.length === 0) return;
  const box = new THREE.Box3();
  for (const node of nodes) box.expandByPoint(node.position);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, 4);
  const distance = maxDim * 1.4 + 5;

  const targetPos = new THREE.Vector3(center.x + distance * 0.1, distance * 0.55, center.z + distance * 0.75);
  const startPos = ctx.camera.position.clone();
  const startTarget = ctx.controls.target.clone();
  let t = 0;

  function step() {
    t++;
    const frames = presentationModeActive ? 80 : 50;
    const progress = Math.min(t / frames, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    ctx.camera.position.lerpVectors(startPos, targetPos, ease);
    ctx.controls.target.lerpVectors(startTarget, center, ease);
    ctx.controls.update();
    if (progress < 1) requestAnimationFrame(step);
  }
  step();
}

// ── Render loop ──

const basePositions = new Map<string, number>();

export function startRenderLoop(ctx: SceneContext): void {
  function loop() {
    requestAnimationFrame(loop);
    ctx.controls.update();
    const time = performance.now() * 0.001;

    for (const [id, group] of elementToGroup) {
      if (!basePositions.has(id)) basePositions.set(id, group.position.y);
      const baseY = basePositions.get(id)!;
      const offset = id.charCodeAt(0) * 0.7 + id.length * 0.3;

      if (settings.floatingEnabled) {
        const speed = settings.floatSpeed;
        group.position.y = baseY + Math.sin(time * 0.8 * speed + offset) * 0.08 * speed;
      } else {
        group.position.y = baseY;
      }

      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.isRing) {
          (child.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(time * 2 + offset) * 0.08;
        }
      });
    }

    for (const relGroup of relationshipObjects) {
      relGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.curve) {
          if (settings.particlesEnabled) {
            child.visible = true;
            const curve = child.userData.curve as THREE.QuadraticBezierCurve3;
            const baseOffset = child.userData.curveOffset as number;
            const speed = settings.particleSpeed;
            const t = ((time * 0.3 * speed + baseOffset) % 1);
            child.position.copy(curve.getPoint(t));
            (child.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.sin(t * Math.PI);
          } else {
            child.visible = false;
          }
        }
      });
    }

    for (const relGroup of relationshipObjects) {
      relGroup.traverse((child) => {
        if (child instanceof THREE.Sprite) child.visible = settings.showRelationshipLabels;
      });
    }

    // Spotlight: dim non-spotlighted elements
    const hasSpotlight3D = spotlightIds3D.size > 0;
    for (const [id, group] of elementToGroup) {
      const isDimmed = hasSpotlight3D && !spotlightIds3D.has(id);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.opacity = isDimmed ? 0.12 : 0.92;
          child.material.emissiveIntensity = (!isDimmed && hasSpotlight3D) ? 0.25 : 0;
        }
      });
    }
    // Dim relationships not connected to spotlight
    if (hasSpotlight3D) {
      for (const relGroup of relationshipObjects) {
        const srcId = relGroup.userData.sourceId;
        const dstId = relGroup.userData.destinationId;
        const connected = spotlightIds3D.has(srcId) || spotlightIds3D.has(dstId);
        relGroup.traverse((child) => {
          if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
            (child.material as THREE.LineDashedMaterial).opacity = connected ? 0.5 : 0.05;
          }
        });
      }
    }

    ctx.renderer.render(ctx.scene, ctx.camera);
  }
  loop();
}

export function show3D(ctx: SceneContext): void {
  ctx.renderer.domElement.style.display = "block";
}

export function hide3D(ctx: SceneContext): void {
  ctx.renderer.domElement.style.display = "none";
}

// ── Spotlight ──

export function setSpotlight3D(ids: string[]): void {
  spotlightIds3D = new Set(ids);
}

export function clearSpotlight3D(): void {
  spotlightIds3D.clear();
}

export function getSpotlightIds3D(): Set<string> {
  return spotlightIds3D;
}

// ── Presentation mode ──

export function setPresentationMode(enabled: boolean): void {
  presentationModeActive = enabled;
}
