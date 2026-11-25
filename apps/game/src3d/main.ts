import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { TileManifest } from "@bigriver/shared";
import { occlusion } from "./world/buildings";
import { Chunks3D } from "./world/chunks";
import { Combat } from "./combat/combat";
import { Player } from "./world/player";
import { hash, radialTexture } from "./world/util";

const city = new URLSearchParams(location.search).get("city") ?? "taquara";
const FOG = 0x161d29;
/** Inclinação da câmera em relação ao chão (90° = vista de cima). */
const PITCH = THREE.MathUtils.degToRad(62);
/** Quantas luzes de poste reais acompanham o jogador; o resto é só a poça de luz pintada. */
const LAMP_LIGHTS = 8;

async function main() {
  const manifest = (await (await fetch(`maps/${city}/manifest.json`)).json()) as TileManifest;
  const m = manifest.metersPerTile;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById("game")!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.011);

  // Noite da Cerração: céu azulado fraco, lua fria fazendo as sombras e postes quentes.
  scene.add(new THREE.HemisphereLight(0x3d4c6e, 0x0e1016, 0.9));
  const moon = new THREE.DirectionalLight(0x9fb4e0, 2.8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.04;
  scene.add(moon, moon.target);
  const lampLights = Array.from({ length: LAMP_LIGHTS }, () => {
    const l = new THREE.PointLight(0xffa860, 0, 16, 1.7);
    scene.add(l);
    return l;
  });

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 400);
  const chunks = new Chunks3D(scene, manifest, `maps/${city}`);
  const [sc, sr] = manifest.spawn;
  await chunks.preload(sc * m, sr * m);
  const player = new Player(sc * m, sr * m, chunks.isBlocked);
  scene.add(player.root);
  player.attachTrail(scene);
  const refuge = player.position.clone();
  const combat = new Combat(scene, player, refuge, chunks.isBlocked);
  combat.spawnPacks(refuge);
  // Luz de recorte fraca vinda da câmera, só para o personagem ler bem contra o fundo escuro.
  const rim = new THREE.PointLight(0xb8c8ff, 3, 6, 1.5);
  scene.add(rim);

  // Névoa rasteira: placas grandes e transparentes que derivam devagar em volta do jogador.
  const mistTex = radialTexture("rgba(170,185,210,0.5)", "rgba(170,185,210,0)");
  const mist = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.09, depthWrite: false, fog: false }),
    70,
  );
  mist.renderOrder = 2;
  scene.add(mist);
  const mistSeeds = Array.from({ length: mist.count }, (_, i) => ({ x: hash(i, 1) * 90 - 45, z: hash(i, 2) * 90 - 45, y: 0.4 + hash(i, 3) * 2.2, s: 8 + hash(i, 4) * 14, v: 0.3 + hash(i, 5) * 0.6 }));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  // Controles: WASD anda (relativo à câmera), Q/E giram 45°, roda aproxima. O mouse só golpeia.
  const keys = new Set<string>();
  addEventListener("keydown", (e) => keys.add(e.code));
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  let distance = 17;
  let yaw = 0;
  let yawTarget = 0;
  addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      // Esquiva na direção das teclas (ou para a frente).
      const ix = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
      const iy = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
      if (combat.alive) player.dodge(new THREE.Vector2(ix * Math.cos(yaw) + iy * Math.sin(yaw), -ix * Math.sin(yaw) + iy * Math.cos(yaw)));
    }
    if (e.code === "KeyQ") yawTarget -= Math.PI / 4;
    if (e.code === "KeyE") yawTarget += Math.PI / 4;
  });
  renderer.domElement.addEventListener("wheel", (e) => {
    distance = THREE.MathUtils.clamp(distance * (e.deltaY > 0 ? 1.1 : 0.9), 10, 70);
    e.preventDefault();
  }, { passive: false });
  // Mouse: só golpes. Esquerdo = E, direito = D; a mira é o ponto do chão sob o ponteiro.
  const pointer = new THREE.Vector2();
  const canvasEl = renderer.domElement;
  canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());
  canvasEl.addEventListener("pointerdown", (e) => {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (e.button === 0) combat.press("E");
    else if (e.button === 2) combat.press("D");
  });
  canvasEl.addEventListener("pointermove", (e) => pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  const camTarget = player.position.clone();
  const dir = new THREE.Vector2();
  const clock = new THREE.Timer();
  let lampTimer = 0;

  const where = document.querySelector("#where span")!;
  document.querySelector("#where b")!.textContent = manifest.name;
  document.getElementById("credit")!.textContent = manifest.attribution.join(" · ");
  const labelsEl = document.getElementById("labels")!;
  const landmarks = manifest.pois
    .filter((p) => p.name && ["civic", "religious", "education", "leisure", "health"].includes(p.category))
    .map((p) => {
      const el = document.createElement("div");
      el.className = "poi";
      el.textContent = p.name!;
      el.style.display = "none";
      labelsEl.appendChild(el);
      return { pos: new THREE.Vector3((p.tile[0] + 0.5) * m, 9, (p.tile[1] + 0.5) * m), el };
    });

  const tmp = new THREE.Vector3();
  const o = new THREE.Object3D();
  let streetTimer = 0;

  function frame() {
    clock.update();
    const realDt = Math.min(clock.getDelta(), 0.1);
    // Pausa curta no impacto: o mundo quase para por alguns centésimos de segundo.
    const dt = combat.hitStop > 0 ? realDt * 0.08 : realDt;
    if (combat.hitStop > 0) combat.hitStop = Math.max(0, combat.hitStop - realDt);
    const t = clock.getElapsed();

    // Direção pedida, convertida para o mundo pela rotação da câmera.
    const sx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    const sy = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    dir.set(0, 0);
    if (!combat.alive) {
      // Caído: não anda até voltar ao refúgio.
    } else if (sx || sy) {
      const l = Math.hypot(sx, sy);
      const fx = sx / l;
      const fy = sy / l;
      dir.set(fx * Math.cos(yaw) + fy * Math.sin(yaw), -fx * Math.sin(yaw) + fy * Math.cos(yaw));
    }
    // Mira: onde o ponteiro toca o chão, no máximo a 12 m do jogador.
    ray.setFromCamera(pointer, camera);
    if (ray.ray.intersectPlane(groundPlane, hit)) {
      tmp.subVectors(hit, player.position).setY(0);
      if (tmp.length() > 12) tmp.setLength(12);
      combat.aim.copy(player.position).add(tmp).setY(0);
    }
    player.update(dt, dir, keys.has("ShiftLeft") || keys.has("ShiftRight"), t);
    chunks.update(player.position.x, player.position.z);
    combat.update(dt, camera);

    // Câmera: segue com atraso suave, inclinada e um pouco à frente de onde o jogador anda.
    yaw += (yawTarget - yaw) * Math.min(1, dt * 8);
    camTarget.lerp(tmp.set(player.position.x + dir.x * 1.5, 0.9, player.position.z + dir.y * 1.5), Math.min(1, dt * 4));
    const back = distance * Math.cos(PITCH);
    camera.position.set(camTarget.x + Math.sin(yaw) * back, camTarget.y + distance * Math.sin(PITCH), camTarget.z + Math.cos(yaw) * back);
    if (combat.shake > 0) {
      const a = combat.shake * combat.shake * 2.5;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      camera.position.z += (Math.random() - 0.5) * a;
    }
    camera.lookAt(camTarget);
    occlusion.uCam.value.copy(camera.position);
    occlusion.uPlayer.value.set(player.position.x, 1.0, player.position.z);

    rim.position.set(player.position.x + Math.sin(yaw) * 2, 2.6, player.position.z + Math.cos(yaw) * 2);
    moon.position.set(player.position.x - 30, 60, player.position.z - 22);
    moon.target.position.copy(player.position);

    // As luzes reais vão para os postes mais perto do jogador.
    lampTimer -= dt;
    if (lampTimer <= 0) {
      lampTimer = 0.25;
      const near = chunks.lamps
        .map((l) => ({ l, d: (l.x - player.position.x) ** 2 + (l.z - player.position.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, LAMP_LIGHTS);
      lampLights.forEach((light, i) => {
        const n = near[i];
        light.intensity = n ? 16 : 0;
        if (n) light.position.set(n.l.x, n.l.y - 0.3, n.l.z);
      });
    }

    mistSeeds.forEach((s, i) => {
      const x = ((s.x + t * s.v - player.position.x) % 90 + 135) % 90 - 45 + player.position.x;
      const z = ((s.z - player.position.z) % 90 + 135) % 90 - 45 + player.position.z;
      o.position.set(x, s.y, z);
      o.scale.set(s.s, 1, s.s);
      o.updateMatrix();
      mist.setMatrixAt(i, o.matrix);
    });
    mist.instanceMatrix.needsUpdate = true;

    for (const lm of landmarks) {
      const d = lm.pos.distanceTo(player.position);
      if (d > 55) {
        lm.el.style.display = "none";
        continue;
      }
      tmp.copy(lm.pos).project(camera);
      lm.el.style.display = tmp.z < 1 ? "block" : "none";
      lm.el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
      lm.el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
      lm.el.style.opacity = String(Math.min(1, (55 - d) / 15));
    }

    streetTimer -= dt;
    if (streetTimer <= 0) {
      streetTimer = 0.5;
      const c = player.position.x / m;
      const r = player.position.z / m;
      let best: string | undefined;
      let bd = 8;
      for (const s of manifest.streets)
        for (const [pc, pr] of s.points) {
          const d = Math.hypot(pc - c, pr - r);
          if (d < bd) [best, bd] = [s.name, d];
        }
      where.textContent = best ?? "";
    }

    composer.render();
    requestAnimationFrame(frame);
  }
  frame();
  const loading = document.getElementById("loading")!;
  loading.style.opacity = "0";
  setTimeout(() => loading.remove(), 700);
  // Exposto para testes automatizados e depuração no console.
  Object.assign(window, { __world: { player, chunks, camera, renderer, combat, setDistance: (d: number) => (distance = d) } });
}

main().catch((err) => {
  console.error(err);
  document.getElementById("loading")!.textContent = "Erro ao carregar: " + String(err);
});
