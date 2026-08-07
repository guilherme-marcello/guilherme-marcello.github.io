import * as THREE from './vendor/three.module.min.js';

const container = document.getElementById('scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// Colors come from the stylesheet so the scene follows the page theme.
function palette() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return { bg: v('--bg'), fg: v('--fg'), muted: v('--muted'), link: v('--link') };
}

function init() {
  let colors = palette();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(colors.bg, 5, 16);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.0, 3.85);
  camera.lookAt(0, 0.05, 0);

  // Hidden-line look: faces filled with the page background, edges drawn on top.
  const fill = new THREE.MeshBasicMaterial({
    color: colors.bg,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const line = new THREE.LineBasicMaterial({ color: colors.fg });
  const accent = new THREE.LineBasicMaterial({ color: colors.link, transparent: true, opacity: 0.55 });
  const dots = new THREE.PointsMaterial({ color: colors.muted, size: 0.035, sizeAttenuation: true });

  function solid(geo, parent, [x, y, z] = [0, 0, 0], ry = 0) {
    const mesh = new THREE.Mesh(geo, fill);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), line);
    for (const o of [mesh, edges]) {
      o.position.set(x, y, z);
      o.rotation.y = ry;
      parent.add(o);
    }
  }

  // --- drone -------------------------------------------------------------
  const drone = new THREE.Group();

  solid(new THREE.BoxGeometry(0.92, 0.24, 0.52), drone);          // fuselage
  solid(new THREE.BoxGeometry(0.42, 0.16, 0.34), drone, [0.06, 0.19, 0]); // canopy
  solid(new THREE.BoxGeometry(2.0, 0.07, 0.07), drone, [0, 0, 0], 0.7);   // arm
  solid(new THREE.BoxGeometry(2.0, 0.07, 0.07), drone, [0, 0, 0], -0.7);  // arm

  const rotors = [];
  for (const x of [0.766, -0.766]) {
    for (const z of [0.643, -0.643]) {
      solid(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 8), drone, [x, 0.05, z]);

      const hub = new THREE.Group();
      hub.position.set(x, 0.17, z);
      drone.add(hub);
      rotors.push(hub);

      const ring = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        ring.push(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      }
      hub.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ring, 3)),
        accent,
      ));
      hub.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
          [-0.38, 0, 0, 0.38, 0, 0, 0, 0, -0.38, 0, 0, 0.38], 3,
        )),
        line,
      ));
    }
  }

  // landing skids
  for (const z of [0.24, -0.24]) {
    solid(new THREE.BoxGeometry(0.7, 0.045, 0.05), drone, [0, -0.3, z]);
    for (const x of [0.26, -0.26]) {
      solid(new THREE.BoxGeometry(0.05, 0.21, 0.05), drone, [x, -0.21, z]);
    }
  }

  scene.add(drone);

  // --- ground ------------------------------------------------------------
  const SPACING = 0.9;
  const grid = [];
  for (let x = -14; x <= 14; x += SPACING) {
    for (let z = -14; z <= 14; z += SPACING) grid.push(x, -1.5, z);
  }
  const ground = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(grid, 3)),
    dots,
  );
  scene.add(ground);

  // --- theme ------------------------------------------------------------
  function applyTheme() {
    colors = palette();
    scene.fog.color.set(colors.bg);
    fill.color.set(colors.bg);
    line.color.set(colors.fg);
    accent.color.set(colors.link);
    dots.color.set(colors.muted);
    render();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // --- loop --------------------------------------------------------------
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  new ResizeObserver(resize).observe(container);

  function render() {
    renderer.render(scene, camera);
  }

  const clock = new THREE.Clock();
  let running = false;
  let frame = 0;

  function tick() {
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    drone.position.y = Math.sin(t * 0.9) * 0.11;
    drone.rotation.y = Math.sin(t * 0.25) * 0.35;
    drone.rotation.z = Math.sin(t * 0.7) * 0.035;
    drone.rotation.x = Math.sin(t * 0.5) * 0.025 + 0.04;

    for (let i = 0; i < rotors.length; i++) {
      rotors[i].rotation.y += dt * (i % 2 ? -17 : 17);
    }
    ground.position.z = (t * 1.1) % SPACING;

    render();
  }

  function start() {
    if (running || reduced.matches) return;
    running = true;
    clock.getDelta(); // drop time spent paused
    tick();
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
  }

  // Only animate while visible — off-screen or background tabs cost nothing.
  let onScreen = false;
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    onScreen && !document.hidden ? start() : stop();
  }).observe(container);
  document.addEventListener('visibilitychange', () => {
    !document.hidden && onScreen ? start() : stop();
  });
  reduced.addEventListener('change', () => (reduced.matches ? stop() : start()));

  resize();
}

// Decorative only: if WebGL is unavailable, drop the band and leave the page as-is.
try {
  init();
} catch (err) {
  container.hidden = true;
}
