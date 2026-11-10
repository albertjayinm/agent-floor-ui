import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { resolveAvatar } from './avatar';
import type { FloorConfig } from './floors';
import type { Agent, AgentStatus, ArtStyle, Theme, Zone } from './protocol';

export interface SceneOptions { theme: Theme; art: ArtStyle; labels: boolean; motion: boolean; shadows: boolean }
export interface SceneCallbacks { onSelect: (id: string | null) => void; onHover: (id: string | null) => void }
interface Character { group: THREE.Group; torso: THREE.Group; legs: THREE.Group[]; arms: THREE.Group[]; head: THREE.Group; eyes: THREE.Group[]; label: THREE.Sprite; ring: THREE.Mesh; target: THREE.Vector3; agent: Agent; phase: number; signature: string }
type Vec3 = [number, number, number];

export const statusColors: Record<AgentStatus, string> = { working: '#4fae84', thinking: '#e0a440', idle: '#9aa3a6', blocked: '#e0604f' };
const CHARACTER_SCALE = 1.15;
const mix = (color: string, toward: string, amount: number) => `#${new THREE.Color(color).lerp(new THREE.Color(toward), amount).getHexString()}`;
const turn = (from: number, to: number, amount: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * Math.min(1, amount);
const deskLayouts: Record<FloorConfig['desks'], [number, number][]> = {
  2: [[-3.1, 1.2], [-0.1, 1.2]],
  4: [[-3.1, 0.2], [-0.1, 0.2], [-3.1, 2.6], [-0.1, 2.6]],
  6: [[-3.1, -0.3], [-0.1, -0.3], [-3.1, 1.7], [-0.1, 1.7], [-3.1, 3.7], [-0.1, 3.7]],
};
const destinations: Record<Exclude<Zone, 'desks'>, [number, number][]> = {
  meeting: [[-4.1, -2.5], [-2.1, -2.4], [-2.9, -1.2]],
  lounge: [[3.5, 2.5], [5.1, 2.9], [4.1, 1.4]],
  lab: [[3.4, -2.4], [5.3, -2.4], [4.3, -1.2]],
};
const palettes = {
  studio: { floor: '#e3e7e7', tile: '#ced6d5', wall: '#c4d2cc', edge: '#a5b6b0', desk: '#ddbb91', dark: '#293f3c', rug: '#c1cbd4', lounge: '#e7ac88', light: '#fff8ec' },
  midnight: { floor: '#344348', tile: '#465459', wall: '#4b6263', edge: '#243335', desk: '#8a9b91', dark: '#192a2e', rug: '#4d6176', lounge: '#b67c69', light: '#c4e7e2' },
  blueprint: { floor: '#d0e7f2', tile: '#a4ccdf', wall: '#a4c5d6', edge: '#6994af', desk: '#e4eff4', dark: '#27526b', rug: '#aacbdc', lounge: '#7daed0', light: '#f5fbff' },
};

export class FloorScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private world = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 150);
  private controls: OrbitControls;
  private characters = new Map<string, Character>();
  private observer: ResizeObserver;
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private options: SceneOptions;
  private selection: string | null = null;
  private agents: Agent[] = [];
  private raycaster = new THREE.Raycaster();
  private pointerDown = new THREE.Vector2();
  private disposed = false;
  private floor: FloorConfig;
  private callbacks: SceneCallbacks;
  private hovered: string | null = null;
  private anchor: { element: HTMLElement; id: string } | null = null;
  private projected = new THREE.Vector3();

  constructor(container: HTMLElement, options: SceneOptions, floor: FloorConfig, callbacks: SceneCallbacks) {
    this.options = options;
    this.floor = floor;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = options.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D agent workspace');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(15, 17, 20);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 13;
    this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = Math.PI / 2.4;
    this.controls.minPolarAngle = 0.15;
    this.controls.enablePan = false;
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#728d83', 2.5));
    const sun = new THREE.DirectionalLight('#fff1dc', 4);
    sun.position.set(-5, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13 });
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#c4e2ff', 1.5);
    fill.position.set(8, 6, -6);
    this.scene.add(fill);
    this.buildRoom();
    this.observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.resetView();
    });
    this.observer.observe(container);
    this.renderer.domElement.addEventListener('pointerdown', this.handleDown);
    this.renderer.domElement.addEventListener('pointerup', this.handleUp);
    this.renderer.domElement.addEventListener('pointermove', this.handleMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handleLeave);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.animate(0);
  }

  private handleContextLost = (event: Event) => { event.preventDefault(); };
  private handleDown = (event: PointerEvent) => { this.pointerDown.set(event.clientX, event.clientY); };
  private handleUp = (event: PointerEvent) => {
    if (this.pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 6) return;
    this.callbacks.onSelect(this.pick(event.clientX, event.clientY));
  };
  private handleMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.buttons) return;
    this.setHovered(this.pick(event.clientX, event.clientY));
  };
  private handleLeave = () => { this.setHovered(null); };

  private setHovered(id: string | null) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
    this.callbacks.onHover(id);
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.characters.values()].map(item => item.group), true).find(item => !item.object.userData.ignorePick);
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.agentId) object = object.parent;
    return (object?.userData.agentId as string | undefined) ?? null;
  }

  private material(color: string, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness, wireframe: this.options.art === 'wireframe' });
  }

  private box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color));
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private cylinder(parent: THREE.Object3D, radius: number, height: number, position: [number, number, number], color: string, topRadius = radius) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, height, this.options.art === 'voxel' ? 6 : 32), this.material(color));
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private ball(parent: THREE.Object3D, radius: number, position: [number, number, number], color: string) {
    const geometry = this.options.art === 'voxel' ? new THREE.BoxGeometry(radius * 1.65, radius * 1.65, radius * 1.65) : new THREE.SphereGeometry(radius, 24, 18);
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, position: Vec3, color: string | THREE.Material) {
    const mesh = new THREE.Mesh(geometry, typeof color === 'string' ? this.material(color) : color);
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private capsule(parent: THREE.Object3D, radius: number, length: number, position: Vec3, color: string) {
    const geometry = this.options.art === 'voxel' ? new THREE.BoxGeometry(radius * 2, length + radius * 2, radius * 2) : new THREE.CapsuleGeometry(radius, length, 6, 16);
    return this.mesh(parent, geometry, position, color);
  }

  private label(text: string, color = '#3e5b54', width = 384, status?: AgentStatus) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffffed';
    context.beginPath();
    context.roundRect(4, 8, width - 8, 72, 18);
    context.fill();
    context.font = '600 31px sans-serif';
    context.textAlign = 'center';
    if (status) {
      context.fillStyle = statusColors[status];
      context.beginPath();
      context.arc(36, 44, 10, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = color;
    context.fillText(text, width / 2 + (status ? 14 : 0), 55);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, toneMapped: false }));
    sprite.scale.set(width / 190, 96 / 190, 1);
    sprite.userData.ignorePick = true;
    return sprite;
  }

  private plant(parent: THREE.Object3D, x: number, z: number, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    group.scale.setScalar(scale);
    this.cylinder(group, 0.24, 0.42, [0, 0.21, 0], '#e9e9dc', 0.3);
    this.cylinder(group, 0.025, 0.65, [0, 0.65, 0], '#4e7955');
    for (let index = 0; index < 7; index++) {
      const angle = index * 2.4;
      const leaf = this.ball(group, 0.22, [Math.cos(angle) * 0.16, 0.75 + index * 0.07, Math.sin(angle) * 0.16], index % 2 ? '#579369' : '#397352');
      leaf.scale.set(0.7, 1.6, 0.75);
      leaf.rotation.z = Math.cos(angle) * 0.6;
    }
    parent.add(group);
  }

  private desk(x: number, z: number) {
    const palette = palettes[this.options.theme];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.box(group, [2.35, 0.13, 1.05], [0, 0.98, 0], palette.desk);
    for (const legX of [-0.95, 0.95]) for (const legZ of [-0.35, 0.35]) this.box(group, [0.08, 0.9, 0.08], [legX, 0.48, legZ], '#e8eeea');
    this.box(group, [0.83, 0.52, 0.07], [0, 1.43, -0.25], palette.dark);
    this.box(group, [0.73, 0.41, 0.012], [0, 1.43, -0.207], '#84b9b1');
    for (let index = 0; index < 3; index++) this.box(group, [0.28 + index * 0.09, 0.022, 0.016], [-0.12 + index * 0.04, 1.53 - index * 0.09, -0.194], '#d9f0e2');
    this.box(group, [0.07, 0.18, 0.07], [0, 1.13, -0.25], palette.dark);
    this.box(group, [0.58, 0.035, 0.22], [0, 1.07, 0.24], '#eff1e9');
    this.cylinder(group, 0.085, 0.16, [0.82, 1.13, 0.18], '#eee8d8');
    this.box(group, [0.52, 0.12, 0.5], [0, 0.55, 0.95], palette.dark);
    this.box(group, [0.52, 0.55, 0.1], [0, 0.85, 1.16], palette.dark);
    this.cylinder(group, 0.035, 0.4, [0, 0.28, 0.95], '#798680');
    this.box(group, [0.6, 0.06, 0.06], [0, 0.1, 0.95], '#798680');
    this.world.add(group);
  }

  private buildRoom() {
    const palette = palettes[this.options.theme];
    const floor = this.floor;
    const studio = this.options.theme === 'studio';
    const surfaceColors = { tile: palette.floor, wood: '#d4b28a', concrete: '#c6cac8', carpet: floor.accent };
    const base = studio || floor.surface === 'tile' ? surfaceColors[floor.surface] : mix(surfaceColors[floor.surface], palette.floor, 0.55);
    const seam = mix(base, '#000000', floor.surface === 'wood' ? 0.14 : 0.08);
    const wall = studio ? floor.wall : mix(floor.wall, palette.wall, 0.6);
    const accent = studio ? floor.accent : mix(floor.accent, palette.rug, 0.55);
    this.box(this.world, [15, 0.4, 11.6], [0, -0.22, 0], palette.edge);
    this.box(this.world, [14.85, 0.1, 11.45], [0, 0.03, 0], base);
    if (floor.surface === 'tile') {
      for (let index = -7; index <= 7; index++) this.box(this.world, [0.012, 0.006, 11.3], [index, 0.084, 0], palette.tile);
      for (let index = -5; index <= 5; index++) this.box(this.world, [14.7, 0.006, 0.012], [0, 0.084, index], palette.tile);
    } else if (floor.surface === 'wood') {
      for (let row = 0; row < 20; row++) {
        const z = -5.4 + row * 0.57;
        if (row % 2) this.box(this.world, [14.7, 0.004, 0.56], [0, 0.082, z], mix(base, '#ffffff', 0.07));
        this.box(this.world, [14.7, 0.006, 0.014], [0, 0.085, z + 0.285], seam);
        for (let joint = 0; joint < 3; joint++) this.box(this.world, [0.014, 0.006, 0.56], [-6 + joint * 4.6 + (row % 3) * 1.4, 0.085, z], seam);
      }
    } else if (floor.surface === 'concrete') {
      for (const x of [-4.9, -2.45, 0, 2.45, 4.9]) this.box(this.world, [0.02, 0.006, 11.3], [x, 0.084, 0], seam);
      for (const z of [-2.85, 0, 2.85]) this.box(this.world, [14.7, 0.006, 0.02], [0, 0.084, z], seam);
    } else {
      for (let index = -3; index <= 3; index++) this.box(this.world, [0.01, 0.005, 11.3], [index * 2, 0.083, 0], mix(base, '#ffffff', 0.12));
      for (let index = -2; index <= 2; index++) this.box(this.world, [14.7, 0.005, 0.01], [0, 0.083, index * 2.2], mix(base, '#ffffff', 0.12));
    }
    this.box(this.world, [15, 1.75, 0.15], [0, 0.8, -5.7], wall);
    this.box(this.world, [0.15, 1.75, 11.5], [-7.4, 0.8, 0], wall);
    this.box(this.world, [15, 0.08, 0.2], [0, 1.7, -5.7], '#edf1e9');
    this.box(this.world, [0.2, 0.08, 11.5], [-7.4, 1.7, 0], '#edf1e9');
    this.box(this.world, [0.08, 1.1, 3.0], [-7.28, 1.03, 2.4], '#789b9a');
    for (const z of [1.0, 2.4, 3.8]) this.box(this.world, [0.1, 1.2, 0.06], [-7.2, 1.03, z], '#edf1e9');
    this.box(this.world, [0.1, 0.06, 3.0], [-7.2, 1.03, 2.4], '#edf1e9');
    this.box(this.world, [1.6, 1.62, 0.1], [0.3, 0.83, -5.6], mix(wall, '#000000', 0.14));
    for (const side of [-1, 1]) this.box(this.world, [0.68, 1.42, 0.05], [0.3 + side * 0.35, 0.79, -5.53], '#e3e8e6');
    this.box(this.world, [0.012, 1.42, 0.06], [0.3, 0.79, -5.52], '#aab4b1');
    this.box(this.world, [0.36, 0.12, 0.04], [0.3, 1.56, -5.53], '#26332f');
    this.box(this.world, [0.08, 0.05, 0.02], [0.3, 1.56, -5.505], '#7fe0a8');
    if (floor.meeting) {
      this.box(this.world, [3.3, 0.035, 3.5], [-3.6, 0.11, -2.8], '#b6cabf');
      this.cylinder(this.world, 1.12, 0.13, [-3.5, 0.96, -2.9], palette.desk);
      this.cylinder(this.world, 0.22, 0.8, [-3.5, 0.49, -2.9], palette.dark);
      for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI / 2;
        const x = -3.5 + Math.cos(angle) * 1.48;
        const z = -2.9 + Math.sin(angle) * 1.48;
        this.cylinder(this.world, 0.28, 0.16, [x, 0.55, z], '#647c70');
        this.cylinder(this.world, 0.045, 0.45, [x, 0.28, z], '#657b73');
      }
      this.box(this.world, [2.0, 1.0, 0.08], [-3.5, 1.17, -5.55], '#f4f4e9');
      for (let index = 0; index < 5; index++) this.box(this.world, [0.21, 0.2, 0.025], [-4.1 + (index % 3) * 0.43, 1.3 - Math.floor(index / 3) * 0.35, -5.49], index % 2 ? '#f3bb57' : '#79a798');
    }
    const desks = deskLayouts[floor.desks];
    const deskZ = desks.map(([, z]) => z);
    const minZ = Math.min(...deskZ);
    const maxZ = Math.max(...deskZ);
    this.box(this.world, [6.0, 0.035, maxZ - minZ + 2.45], [-1.6, 0.11, (minZ + maxZ) / 2 + 0.45], floor.surface === 'carpet' ? mix(accent, '#ffffff', 0.3) : accent);
    desks.forEach(([x, z]) => this.desk(x, z));
    if (floor.lounge) {
      this.box(this.world, [4.2, 0.04, 3.7], [4.3, 0.12, 2.9], '#d5c6b5');
      this.box(this.world, [2.6, 0.42, 0.9], [4.2, 0.5, 4.0], palette.lounge);
      this.box(this.world, [2.7, 0.6, 0.22], [4.2, 0.92, 4.4], palette.lounge);
      for (const x of [2.8, 5.6]) this.box(this.world, [0.22, 0.6, 1.1], [x, 0.8, 4.0], palette.lounge);
      this.cylinder(this.world, 0.62, 0.1, [4.2, 0.58, 2.5], palette.desk);
      this.cylinder(this.world, 0.07, 0.47, [4.2, 0.3, 2.5], palette.dark);
      this.box(this.world, [0.34, 0.04, 0.25], [4.1, 0.66, 2.5], '#6b8e83');
      this.cylinder(this.world, 0.07, 0.12, [4.45, 0.69, 2.45], '#f7f2e4');
    }
    if (floor.lab) {
      this.box(this.world, [4.0, 0.96, 0.85], [4.4, 0.58, -4.7], palette.desk);
      this.box(this.world, [4.1, 0.12, 0.95], [4.4, 1.1, -4.7], '#e5e9dd');
      for (const x of [3.1, 4.3, 5.5]) {
        this.box(this.world, [0.62, 0.6, 0.38], [x, 1.45, -4.7], palette.dark);
        for (let index = 0; index < 3; index++) this.box(this.world, [0.42, 0.035, 0.02], [x, 1.6 - index * 0.12, -4.5], index === 1 ? '#e5b963' : '#7fbf9c');
      }
    }
    this.box(this.world, [0.95, 1.25, 0.42], [-6.6, 0.72, -3.6], palette.desk);
    for (let shelf = 0; shelf < 3; shelf++) {
      this.box(this.world, [0.95, 0.06, 0.42], [-6.6, 0.25 + shelf * 0.5, -3.6], '#e7ece0');
      for (let book = 0; book < 4; book++) this.box(this.world, [0.1, 0.3, 0.27], [-6.9 + book * 0.2, 0.43 + shelf * 0.5, -3.55], ['#799d8c', '#d2a374', '#e3dbbd', '#6c8797'][book]);
    }
    if (floor.plants) {
      this.plant(this.world, -6.3, -4.8, 1.15);
      this.plant(this.world, -6.5, 4.5, 1.35);
      this.plant(this.world, 6.5, -4.7, 1.25);
      this.plant(this.world, 6.4, 4.6, 1.1);
      this.plant(this.world, 1.8, -4.9, 0.9);
    }
    const zoneLabels: [string, number, number, boolean][] = [['MEETING', -3.5, -4.4, floor.meeting], ['WORKSTATIONS', -1.5, 5.25, true], ['THE LOUNGE', 4.2, 5.2, floor.lounge], ['BUILD LAB', 4.3, -3.5, floor.lab]];
    for (const [text, x, z] of zoneLabels.filter(([, , , enabled]) => enabled)) {
      const sprite = this.label(text, '#536d65');
      sprite.position.set(x, 0.3, z);
      sprite.scale.multiplyScalar(0.8);
      sprite.visible = this.options.labels;
      sprite.userData.zoneLabel = true;
      this.world.add(sprite);
    }
  }

  private agentLabel(agent: Agent) {
    const name = agent.name.length > 14 ? `${agent.name.slice(0, 13)}…` : agent.name;
    const label = this.label(name, '#26403a', 300, agent.status);
    label.position.set(0, 2.32, 0);
    label.scale.multiplyScalar(1.1);
    label.visible = this.options.labels;
    return label;
  }

  private hair(head: THREE.Group, agent: Agent, look: ReturnType<typeof resolveAvatar>) {
    const voxel = this.options.art === 'voxel';
    const capColor = mix(agent.color, '#000000', 0.22);
    const dome = (color = look.hair, radius = 0.445, tilt = -0.42) => {
      const geometry = voxel ? new THREE.BoxGeometry(radius * 1.62, radius * 0.75, radius * 1.55) : new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
      const mesh = this.mesh(head, geometry, voxel ? [0, 0.27, -0.03] : [0, 0.015, -0.025], color);
      if (!voxel) { mesh.rotation.x = tilt; mesh.scale.set(1, 0.98, 0.96); }
      return mesh;
    };
    switch (look.hairStyle) {
      case 'short':
        dome();
        this.ball(head, 0.16, [0.08, 0.24, 0.27], look.hair).scale.set(1.5, 0.45, 0.7);
        break;
      case 'spiky':
        dome();
        for (let index = 0; index < 7; index++) {
          const angle = (index / 7) * Math.PI * 2;
          const spike = this.mesh(head, new THREE.ConeGeometry(0.09, 0.24, voxel ? 4 : 10), [Math.cos(angle) * 0.2, 0.36, Math.sin(angle) * 0.2 - 0.04], look.hair);
          spike.rotation.set(Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5);
        }
        break;
      case 'long': {
        dome();
        const back = this.capsule(head, 0.3, 0.32, [0, -0.2, -0.17], look.hair);
        back.scale.set(1.3, 1, 0.65);
        for (const side of [-1, 1]) this.capsule(head, 0.1, 0.3, [side * 0.37, -0.15, 0.04], look.hair);
        break;
      }
      case 'bun':
        dome();
        this.ball(head, 0.16, [0, 0.43, -0.12], look.hair);
        break;
      case 'cap': {
        dome(capColor, 0.45, -0.5);
        const brim = this.box(head, [0.46, 0.03, 0.3], [0, 0.22, 0.4], capColor);
        brim.rotation.x = 0.18;
        this.ball(head, 0.04, [0, 0.45, 0], mix(capColor, '#ffffff', 0.3));
        for (const side of [-1, 1]) this.ball(head, 0.09, [side * 0.37, 0.02, -0.12], look.hair).scale.set(0.6, 1, 1);
        break;
      }
      case 'hood': {
        const hoodColor = mix(agent.color, '#ffffff', 0.18);
        if (voxel) { dome(hoodColor, 0.5, 0); break; }
        const opening = 0.95;
        const hood = this.mesh(head, new THREE.SphereGeometry(0.53, 32, 20, Math.PI / 2 + opening, Math.PI * 2 - opening * 2), [0, 0.03, -0.03], hoodColor);
        (hood.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        dome(look.hair, 0.43, -0.5);
        break;
      }
      case 'bald':
        this.ball(head, 0.05, [-0.12, 0.3, 0.2], mix(look.skin, '#ffffff', 0.35)).scale.set(1.4, 0.6, 0.6);
        break;
    }
  }

  private accessory(head: THREE.Group, look: ReturnType<typeof resolveAvatar>, faceZ: number) {
    const { accessory } = look;
    const dark = '#2a2f36';
    if (accessory === 'glasses' || accessory === 'glasses-beard') {
      const lens = new THREE.MeshStandardMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.35, roughness: 0.1, wireframe: this.options.art === 'wireframe' });
      for (const side of [-1, 1]) {
        this.mesh(head, new THREE.TorusGeometry(0.08, 0.013, 8, 24), [side * 0.135, 0.02, faceZ + 0.065], dark);
        this.mesh(head, new THREE.CircleGeometry(0.075, 24), [side * 0.135, 0.02, faceZ + 0.063], lens);
        this.box(head, [0.012, 0.014, 0.3], [side * 0.225, 0.04, faceZ - 0.09], dark);
      }
      this.box(head, [0.08, 0.014, 0.014], [0, 0.03, faceZ + 0.07], dark);
    }
    if (accessory === 'beard' || accessory === 'glasses-beard') {
      this.ball(head, 0.3, [0, -0.2, 0.15], look.hair).scale.set(1.12, 0.6, 0.68);
      this.box(head, [0.17, 0.035, 0.04], [0, -0.085, faceZ + 0.005], look.hair);
    }
    if (accessory === 'headset') {
      this.mesh(head, new THREE.TorusGeometry(0.46, 0.028, 8, 32, Math.PI), [0, 0.02, -0.02], dark);
      for (const side of [-1, 1]) this.cylinder(head, 0.1, 0.07, [side * 0.44, 0, -0.02], dark).rotation.z = Math.PI / 2;
      const boom = this.box(head, [0.025, 0.025, 0.5], [-0.28, -0.08, 0.15], dark);
      boom.lookAt(-0.12, -0.16, 0.34);
      this.ball(head, 0.04, [-0.12, -0.16, 0.34], '#46d38b');
    }
  }

  private makeCharacter(agent: Agent, index: number): Character {
    const look = resolveAvatar(agent);
    const voxel = this.options.art === 'voxel';
    const group = new THREE.Group();
    group.userData.agentId = agent.id;
    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    const eyes: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0.5, 0);
      this.capsule(leg, 0.085, 0.2, [0, -0.2, 0], look.pants);
      this.ball(leg, 0.1, [0, -0.39, 0.04], look.shoes).scale.set(1.05, 0.6, 1.5);
      group.add(leg);
      legs.push(leg);
    }
    const torso = new THREE.Group();
    torso.position.y = 0.5;
    group.add(torso);
    this.cylinder(torso, 0.23, 0.14, [0, 0.03, 0], look.pants, 0.24).scale.z = 0.82;
    this.capsule(torso, 0.26, 0.18, [0, 0.27, 0], agent.color).scale.set(1, 1, 0.84);
    this.cylinder(torso, 0.265, 0.05, [0, 0.1, 0], mix(agent.color, '#ffffff', 0.28)).scale.z = 0.84;
    if (look.hairStyle === 'hood') {
      for (const x of [-0.07, 0.07]) {
        this.cylinder(torso, 0.012, 0.18, [x, 0.4, 0.225], '#f5efe4');
        this.ball(torso, 0.026, [x, 0.3, 0.23], '#f5efe4');
      }
    } else {
      this.mesh(torso, new THREE.TorusGeometry(0.15, 0.03, 8, 24), [0, 0.58, 0.02], mix(agent.color, '#000000', 0.15)).rotation.x = Math.PI / 2;
      this.box(torso, [0.09, 0.09, 0.02], [0.11, 0.38, 0.2], '#f6f3ea');
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.3, 1.02, 0);
      arm.rotation.z = side * 0.12;
      this.capsule(arm, 0.085, 0.1, [0, -0.1, 0], agent.color);
      this.capsule(arm, 0.06, 0.12, [0, -0.25, 0], look.skin);
      this.ball(arm, 0.075, [0, -0.38, 0.01], look.skin);
      group.add(arm);
      arms.push(arm);
    }
    const head = new THREE.Group();
    head.position.y = 1.42;
    group.add(head);
    this.ball(head, 0.42, [0, 0, 0], look.skin).scale.set(1, 0.94, 0.92);
    for (const side of [-1, 1]) this.ball(head, 0.08, [side * 0.41, -0.03, 0], look.skin).scale.set(0.55, 1, 0.8);
    const faceZ = voxel ? 0.33 : 0.36;
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.135, 0.02, faceZ);
      head.add(eye);
      eyes.push(eye);
      this.ball(eye, 0.068, [0, 0, 0], '#ffffff').scale.set(1, 1.12, 0.45);
      this.ball(eye, 0.044, [0, -0.008, 0.026], '#1d2124').scale.set(1, 1.15, 0.5);
      this.ball(eye, 0.014, [0.016, 0.018, 0.045], '#ffffff');
      this.box(head, [0.1, 0.022, 0.02], [side * 0.14, 0.12, faceZ - 0.01], look.hair).rotation.z = side * -0.12;
      this.ball(head, 0.05, [side * 0.22, -0.09, faceZ - 0.045], mix(look.skin, '#f0727a', 0.45)).scale.set(1.2, 0.6, 0.3);
    }
    this.mesh(head, new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), [0, -0.12, faceZ + 0.008], '#3a2726').rotation.z = Math.PI;
    this.hair(head, agent, look);
    this.accessory(head, look, faceZ);
    const label = this.agentLabel(agent);
    group.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 48), new THREE.MeshBasicMaterial({ color: agent.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.userData.ignorePick = true;
    ring.visible = agent.id === this.selection;
    group.add(ring);
    const target = this.destination(agent, index);
    group.position.copy(target);
    group.rotation.y = 0.4;
    group.scale.setScalar(CHARACTER_SCALE);
    this.world.add(group);
    const phase = [...agent.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.37;
    return { group, torso, legs, arms, head, eyes, label, ring, target, agent, phase, signature: this.signature(agent) };
  }

  private signature(agent: Agent) { return JSON.stringify([agent.name, agent.color, agent.avatar ?? null]); }

  private destination(agent: Agent, index: number) {
    const points = agent.zone === 'desks' ? deskLayouts[this.floor.desks].map(([x, z]) => [x + 0.4, z + 0.9] as [number, number]) : destinations[agent.zone];
    const [x, z] = points[index % points.length];
    const overflow = Math.floor(index / points.length);
    return new THREE.Vector3(x + (overflow % 2) * 0.45, 0.05, z + Math.floor(overflow / 2) * 0.35);
  }

  private removeCharacter(id: string, character: Character) {
    this.world.remove(character.group);
    this.disposeObject(character.group);
    this.characters.delete(id);
    if (this.hovered === id) this.setHovered(null);
  }

  setAgents(agents: Agent[]) {
    this.agents = agents;
    for (const [id, character] of this.characters) {
      if (!agents.some(agent => agent.id === id)) this.removeCharacter(id, character);
    }
    const zoneCounts: Partial<Record<Zone, number>> = {};
    for (const agent of agents) {
      const index = zoneCounts[agent.zone] ?? 0;
      zoneCounts[agent.zone] = index + 1;
      let character = this.characters.get(agent.id);
      if (character && character.signature !== this.signature(agent)) { this.removeCharacter(agent.id, character); character = undefined; }
      if (!character) { character = this.makeCharacter(agent, index); this.characters.set(agent.id, character); }
      else if (character.agent.status !== agent.status) {
        character.group.remove(character.label);
        this.disposeObject(character.label);
        character.label = this.agentLabel(agent);
        character.group.add(character.label);
      }
      character.agent = agent;
      character.target.copy(this.destination(agent, index));
    }
  }

  setSelection(id: string | null) {
    this.selection = id;
    this.characters.forEach((character, key) => { character.ring.visible = id === key; });
  }

  setFloor(floor: FloorConfig, agents: Agent[]) {
    if (floor === this.floor) { this.setAgents(agents); return; }
    this.floor = floor;
    this.agents = agents;
    this.rebuild();
  }

  // The element is positioned above the character every frame so it follows walking agents and camera moves.
  trackElement(element: HTMLElement | null, id: string | null) {
    this.anchor = element && id ? { element, id } : null;
    this.positionAnchor();
  }

  configure(options: SceneOptions) {
    const rebuild = options.theme !== this.options.theme || options.art !== this.options.art;
    this.options = options;
    this.renderer.shadowMap.enabled = options.shadows;
    if (rebuild) this.rebuild();
    this.characters.forEach(character => { character.label.visible = options.labels; });
    this.world.children.forEach(child => { if (child.userData.zoneLabel) child.visible = options.labels; });
  }

  private rebuild() {
    this.disposeObject(this.world);
    this.world.clear();
    this.characters.clear();
    this.buildRoom();
    this.setAgents(this.agents);
    this.setSelection(this.selection);
    this.world.children.forEach(child => { if (child.userData.zoneLabel) child.visible = this.options.labels; });
  }

  resetView() { this.camera.position.set(15, 17, 20).multiplyScalar(Math.max(1, 0.95 / this.camera.aspect)); this.controls.target.set(0, 0, 0); this.controls.update(); }
  topView() { this.camera.position.set(0.1, 26 * Math.max(1, 0.95 / this.camera.aspect), 0.1); this.controls.target.set(0, 0, 0); this.controls.update(); }
  zoom(direction: number) { const offset = this.camera.position.clone().sub(this.controls.target); offset.multiplyScalar(direction > 0 ? 0.85 : 1.15); offset.clampLength(13, 70); this.camera.position.copy(this.controls.target).add(offset); this.controls.update(); }

  private animate = (now: number) => {
    if (this.disposed) return;
    const delta = Math.min((now - this.previous) / 1000, 0.05);
    this.previous = now;
    if (this.options.motion) this.elapsed += delta;
    for (const character of this.characters.values()) this.animateCharacter(character, delta);
    this.controls.update();
    this.positionAnchor();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };

  private animateCharacter(character: Character, delta: number) {
    const { group, torso, head, legs, arms, eyes, agent, target } = character;
    if (!this.options.motion) { group.position.copy(target); return; }
    const time = this.elapsed * 5 + character.phase;
    const distance = group.position.distanceTo(target);
    if (distance > 0.04) {
      const direction = target.clone().sub(group.position).normalize();
      group.rotation.y = turn(group.rotation.y, Math.atan2(direction.x, direction.z), delta * 10);
      group.position.addScaledVector(direction, Math.min(delta * 1.35, distance));
      const stride = time * 2.2;
      legs.forEach((leg, index) => { leg.rotation.x = Math.sin(stride + index * Math.PI) * 0.6; });
      arms.forEach((arm, index) => { arm.rotation.x = -Math.sin(stride + index * Math.PI) * 0.55; arm.rotation.z = (index ? 1 : -1) * 0.1; });
      torso.position.y = 0.5 + Math.abs(Math.sin(stride)) * 0.035;
      head.position.y = 1.42 + Math.abs(Math.sin(stride)) * 0.05;
      head.rotation.set(0, 0, 0);
    } else {
      group.rotation.y = turn(group.rotation.y, 0.4, delta * 3);
      legs.forEach(leg => { leg.rotation.x *= 0.8; });
      const breathe = Math.sin(time * 0.6);
      torso.position.y = 0.5 + breathe * 0.008;
      head.position.y = 1.42 + breathe * 0.012;
      arms.forEach((arm, index) => {
        const side = index ? 1 : -1;
        if (agent.status === 'working') { arm.rotation.x = -0.95 + Math.sin(time * 3.2 + index * 1.7) * 0.12; arm.rotation.z = side * 0.18; }
        else if (agent.status === 'thinking') { arm.rotation.x = index ? -1.9 : 0.05; arm.rotation.z = index ? -0.55 : side * 0.12; }
        else if (agent.status === 'blocked') { arm.rotation.x = 0; arm.rotation.z = side * (0.45 + Math.sin(time * 0.8) * 0.05); }
        else { arm.rotation.x = Math.sin(time * 0.5 + index) * 0.06; arm.rotation.z = side * 0.12; }
      });
      if (agent.status === 'thinking') head.rotation.set(0.12, 0, 0.1 + Math.sin(time * 0.4) * 0.12);
      else if (agent.status === 'blocked') head.rotation.set(0, Math.sin(time * 0.9) * 0.25, 0);
      else if (agent.status === 'working') head.rotation.set(0.1 + Math.sin(time * 0.7) * 0.03, 0, 0);
      else head.rotation.set(0, Math.sin(time * 0.3) * 0.2, 0);
    }
    const blink = (time * 0.2) % 4 < 0.12;
    eyes.forEach(eye => { eye.scale.y = blink ? 0.12 : 1; });
    character.ring.scale.setScalar(1 + Math.sin(time) * 0.035);
  }

  private positionAnchor() {
    if (!this.anchor) return;
    const { element, id } = this.anchor;
    const character = this.characters.get(id);
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    if (!character || !width) { element.style.visibility = 'hidden'; return; }
    this.projected.copy(character.group.position);
    this.projected.y += 2.62 * CHARACTER_SCALE;
    this.projected.project(this.camera);
    const onScreen = this.projected.z < 1 && Math.abs(this.projected.x) < 1.1 && Math.abs(this.projected.y) < 1.1;
    const halfWidth = element.offsetWidth / 2;
    const x = THREE.MathUtils.clamp((this.projected.x + 1) / 2 * width, halfWidth + 8, width - halfWidth - 8);
    let top = (1 - this.projected.y) / 2 * height - element.offsetHeight;
    // Keep clear of the floor tabs: flip below the character's feet when there is no room above.
    const below = top < 56;
    if (below) {
      this.projected.copy(character.group.position).project(this.camera);
      top = Math.min((1 - this.projected.y) / 2 * height + 14, height - element.offsetHeight - 8);
    }
    element.dataset.placement = below ? 'below' : 'above';
    element.style.transform = `translate(${Math.round(x - halfWidth)}px, ${Math.round(top)}px)`;
    element.style.visibility = onScreen ? 'visible' : 'hidden';
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!(child as THREE.Sprite).isSprite) mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => {
        if (!material) return;
        (material as THREE.MeshStandardMaterial).map?.dispose();
        material.dispose();
      });
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handleUp);
    this.renderer.domElement.removeEventListener('pointermove', this.handleMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handleLeave);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}