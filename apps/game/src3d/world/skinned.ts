import * as THREE from "three";

/**
 * Liga as juntas procedurais do Player ao esqueleto de um modelo da Meshy (nomes de ossos da Meshy:
 * Hips, Spine01, Spine, neck, LeftArm, LeftForeArm, LeftUpLeg, LeftLeg, LeftFoot...).
 *
 * As juntas procedurais têm rotação zero em repouso e eixos alinhados ao personagem (Y para cima,
 * olhando para +Z). Cada rotação r de junta é aplicada no osso no espaço do personagem:
 *   local = L · W⁻¹ · r · W
 * onde L é a rotação local do osso em repouso e W a rotação do osso em repouso no espaço do modelo.
 * Os braços da Meshy vêm em pose A; uma correção C os baixa para junto do corpo, como no Player.
 */
const MAP: Record<string, string> = {
  hips: "Hips",
  spine: "Spine01",
  chest: "Spine",
  neck: "neck",
  shoulderL: "LeftArm",
  elbowL: "LeftForeArm",
  shoulderR: "RightArm",
  elbowR: "RightForeArm",
  thighL: "LeftUpLeg",
  kneeL: "LeftLeg",
  footL: "LeftFoot",
  thighR: "RightUpLeg",
  kneeR: "RightLeg",
  footR: "RightFoot",
};

type Link = { joint: THREE.Object3D; bone: THREE.Object3D; L: THREE.Quaternion; W: THREE.Quaternion; Wi: THREE.Quaternion; C?: THREE.Quaternion; Ci?: THREE.Quaternion; child?: boolean };

export class SkinnedRig {
  private links: Link[] = [];
  readonly handR?: THREE.Object3D;
  readonly handL?: THREE.Object3D;
  private q = new THREE.Quaternion();

  constructor(
    readonly model: THREE.Object3D,
    joints: Record<string, THREE.Object3D>,
  ) {
    model.updateMatrixWorld(true);
    const bones: Record<string, THREE.Object3D> = {};
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.type === "Object3D") bones[o.name] = o;
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
    const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

    // Correção da pose A: leva o braço da direção de repouso para quase junto ao corpo.
    const armFix: Record<string, THREE.Quaternion> = {};
    for (const [side, s] of [["Left", 1], ["Right", -1]] as const) {
      const arm = bones[`${side}Arm`];
      const fore = bones[`${side}ForeArm`];
      if (!arm || !fore) continue;
      const from = wp(fore).sub(wp(arm)).normalize();
      const to = new THREE.Vector3(0.12 * s, -1, 0).normalize();
      armFix[side] = new THREE.Quaternion().setFromUnitVectors(from, to);
    }

    for (const [jn, bn] of Object.entries(MAP)) {
      const joint = joints[jn];
      const bone = bones[bn];
      if (!joint || !bone) continue;
      const W = wq(bone);
      const side = bn.startsWith("Left") ? "Left" : bn.startsWith("Right") ? "Right" : "";
      const C = side && bn.endsWith("Arm") ? armFix[side] : undefined;
      this.links.push({
        joint,
        bone,
        L: bone.quaternion.clone(),
        W,
        Wi: W.clone().invert(),
        C: C ?? (side && bn.endsWith("ForeArm") ? armFix[side] : undefined),
        Ci: (C ?? (side && bn.endsWith("ForeArm") ? armFix[side] : undefined))?.clone().invert(),
        child: bn.endsWith("ForeArm"),
      });
    }

    // Suportes para objetos na mão (facão, lampião): mesma orientação da mão procedural e escala 1.
    const holder = (bn: string, side: string) => {
      const hand = bones[bn];
      if (!hand) return undefined;
      const h = new THREE.Object3D();
      const C = armFix[side] ?? new THREE.Quaternion();
      h.quaternion.copy(wq(hand).invert().multiply(C.clone().invert()));
      const sc = hand.getWorldScale(new THREE.Vector3());
      h.scale.set(1 / sc.x, 1 / sc.y, 1 / sc.z);
      hand.add(h);
      return h;
    };
    this.handR = holder("RightHand", "Right");
    this.handL = holder("LeftHand", "Left");
  }

  /** Copia a pose das juntas procedurais para os ossos. Chamar a cada quadro. */
  apply() {
    for (const k of this.links) {
      const r = this.q.copy(k.joint.quaternion);
      if (k.child && k.C && k.Ci) r.premultiply(k.Ci).multiply(k.C); // C⁻¹ · r · C
      else if (k.C) r.multiply(k.C); // r · C
      k.bone.quaternion.copy(k.L).multiply(k.Wi).multiply(r).multiply(k.W);
    }
  }
}
