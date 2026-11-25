import * as THREE from "three";
import { instantiate, loadModel } from "./models";
import { SkinnedRig } from "./skinned";

/** Sobreviventes do refúgio (issue #6): modelos da Meshy, parados em roda, olhando quem chega perto. */
export const SURVIVORS: { id: string; name: string }[] = [
  { id: "npc-comerciante", name: "Dona do armazém" },
  { id: "npc-padre", name: "Padre da matriz" },
  { id: "npc-enfermeira", name: "Enfermeira do posto" },
  { id: "npc-tradicionalista", name: "Velho do CTG" },
  { id: "npc-estudante", name: "Estudante" },
  { id: "npc-guarda", name: "Guarda municipal" },
  { id: "npc-agricultor", name: "Colono" },
  { id: "npc-crianca", name: "Criança perdida" },
];

const JOINTS = ["hips", "spine", "chest", "neck", "shoulderL", "elbowL", "shoulderR", "elbowR", "thighL", "kneeL", "footL", "thighR", "kneeR", "footR"];
const LOOK_M = 7;

/**
 * Um sobrevivente parado. Usa as mesmas juntas do Player (SkinnedRig), então os braços saem da
 * pose A da Meshy e ficam junto ao corpo; respira, muda o peso de perna e vira a cabeça para o jogador.
 */
class Survivor {
  readonly root = new THREE.Group();
  private j: Record<string, THREE.Object3D> = {};
  private rig: SkinnedRig;
  private t = Math.random() * 20;
  private look = 0;

  constructor(
    model: THREE.Object3D,
    readonly name: string,
    pos: THREE.Vector3,
    private facing: number,
  ) {
    for (const n of JOINTS) this.j[n] = new THREE.Object3D();
    this.rig = new SkinnedRig(model, this.j);
    this.root.add(model);
    this.root.position.copy(pos);
    this.root.rotation.y = facing;
  }

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    const t = this.t;
    // Respiração e troca de peso devagar.
    this.j.chest!.rotation.x = Math.sin(t * 1.6) * 0.025;
    this.j.hips!.rotation.z = Math.sin(t * 0.35) * 0.04;
    this.j.spine!.rotation.z = -Math.sin(t * 0.35) * 0.03;
    this.j.shoulderL!.rotation.z = 0.05 + Math.sin(t * 1.6) * 0.02;
    this.j.shoulderR!.rotation.z = -0.05 - Math.sin(t * 1.6) * 0.02;
    this.j.elbowL!.rotation.x = -0.15;
    this.j.elbowR!.rotation.x = -0.15;
    // Vira a cabeça (e um pouco o tronco) para o jogador quando ele chega perto.
    const dx = player.x - this.root.position.x;
    const dz = player.z - this.root.position.z;
    let want = 0;
    if (dx * dx + dz * dz < LOOK_M * LOOK_M) {
      let a = Math.atan2(dx, dz) - this.facing;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      want = THREE.MathUtils.clamp(a, -1.3, 1.3);
    }
    this.look += (want - this.look) * (1 - Math.exp(-dt * 4));
    this.j.neck!.rotation.y = this.look * 0.6;
    this.j.chest!.rotation.y = this.look * 0.3;
    this.rig.apply();
  }
}

export class Survivors {
  readonly group = new THREE.Group();
  private list: Survivor[] = [];

  /** Põe os sobreviventes em roda em volta do refúgio, em lugares livres, virados para o centro. */
  async spawn(center: THREE.Vector3, isBlocked: (x: number, z: number) => boolean) {
    const assets = await Promise.all(SURVIVORS.map((s) => loadModel(s.id, false).catch(() => undefined)));
    SURVIVORS.forEach((s, i) => {
      const asset = assets[i];
      if (!asset) return;
      for (let tries = 0; tries < 24; tries++) {
        const a = (i / SURVIVORS.length) * Math.PI * 2 + tries * 0.37;
        const r = 4.5 + (i % 2) * 1.5 + tries * 0.4;
        const x = center.x + Math.sin(a) * r;
        const z = center.z + Math.cos(a) * r;
        if (isBlocked(x, z)) continue;
        const npc = new Survivor(instantiate(asset), s.name, new THREE.Vector3(x, 0, z), Math.atan2(center.x - x, center.z - z));
        this.list.push(npc);
        this.group.add(npc.root);
        return;
      }
    });
  }

  update(dt: number, player: THREE.Vector3) {
    for (const n of this.list) n.update(dt, player);
  }
}
