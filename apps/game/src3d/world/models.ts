import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * Modelos 3D dos personagens (gerados na Meshy, ver packages/meshy) em public/models/<id>.glb,
 * com as animações de andar e correr em <id>.walking.glb e <id>.running.glb (só esqueleto).
 *
 * VITE_MODEL_EXT troca a extensão dos arquivos em builds que não servem .glb
 * (a build de testes publica como .wasm; o conteúdo é o mesmo glTF binário).
 */
const EXT = import.meta.env.VITE_MODEL_EXT ?? ".glb";
const loader = new GLTFLoader();

export type ModelAsset = { scene: THREE.Object3D; walk?: THREE.AnimationClip; run?: THREE.AnimationClip };

const cache = new Map<string, Promise<ModelAsset>>();

export function modelUrl(id: string, anim?: "walking" | "running") {
  return `models/${id}${anim ? `.${anim}` : ""}${EXT}`;
}

/** Carrega um modelo (uma vez) com as animações, se houver. */
export function loadModel(id: string, anims = true): Promise<ModelAsset> {
  let p = cache.get(id);
  if (!p) {
    const clip = (a: "walking" | "running") =>
      anims
        ? loader
            .loadAsync(modelUrl(id, a))
            .then((g) => g.animations[0])
            .catch(() => undefined)
        : Promise.resolve(undefined);
    p = Promise.all([loader.loadAsync(modelUrl(id)), clip("walking"), clip("running")]).then(([g, walk, run]) => ({ scene: g.scene, walk, run }));
    cache.set(id, p);
  }
  return p;
}

/** Cópia independente (esqueleto próprio, materiais próprios para piscar ao levar dano). */
export function instantiate(asset: ModelAsset): THREE.Object3D {
  const o = SkeletonUtils.clone(asset.scene);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
    m.material = (m.material as THREE.Material).clone();
  });
  return o;
}

/** Materiais padrão de um modelo, para mexer no brilho (dano, aviso de ataque). */
export function materialsOf(o: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && "emissive" in m) out.push(m);
  });
  return out;
}

/** Acha um osso pelo nome (nomes da Meshy: Hips, Spine, neck, Head, LeftArm...). */
export function bone(o: THREE.Object3D, name: string) {
  return o.getObjectByName(name);
}

const _q = new THREE.Quaternion();
const _w = new THREE.Quaternion();
const _root = new THREE.Quaternion();

/**
 * Gira um osso por `r`, com r dado nos eixos do personagem (Y para cima, olhando para +Z),
 * por cima da pose atual (por exemplo depois do AnimationMixer).
 */
export function rotateBoneInModelFrame(model: THREE.Object3D, b: THREE.Object3D, r: THREE.Quaternion) {
  model.getWorldQuaternion(_root).invert();
  b.getWorldQuaternion(_w).premultiply(_root); // rotação do osso no espaço do modelo
  _q.copy(_w).invert().multiply(r).multiply(_w);
  b.quaternion.multiply(_q);
}
