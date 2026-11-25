import * as THREE from "three";
import { cerracaoAt, PHASE_START, PHASES, phaseAt, worldClock, type Phase } from "@bigriver/shared";

/** Tudo o que muda com a hora e com a Cerração. */
export type SkyParams = {
  fog: THREE.Color;
  density: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
  lamps: number;
  windows: number;
  exposure: number;
  mist: number;
  bloom: number;
  vignette: number;
  lantern: number;
};

type Key = { h: number; fog: number; density: number; hemiSky: number; hemiGround: number; hemi: number; sun: number; sunI: number; lamps: number; windows: number; exposure: number; mist: number; bloom: number; vignette: number; lantern: number };

const ESCURA = { fog: 0x07090d, density: 0.017, hemiSky: 0x1a2236, hemiGround: 0x040507, hemi: 0.4, sun: 0x6f82b0, sunI: 0.35, lamps: 1, windows: 0.45, exposure: 0.95, mist: 0.07, bloom: 0.55, vignette: 1, lantern: 1.2 };
const NOITE = { fog: 0x161d29, density: 0.011, hemiSky: 0x3d4c6e, hemiGround: 0x0e1016, hemi: 0.9, sun: 0x9fb4e0, sunI: 2.8, lamps: 1, windows: 1, exposure: 1, mist: 0.09, bloom: 0.45, vignette: 1, lantern: 1 };
const AMANHECER = { fog: 0x857c8c, density: 0.009, hemiSky: 0xa4abc8, hemiGround: 0x2c2724, hemi: 1.3, sun: 0xffb486, sunI: 2.2, lamps: 0.25, windows: 0.25, exposure: 1, mist: 0.13, bloom: 0.3, vignette: 0.6, lantern: 0.4 };
const DIA = { fog: 0xa9b8c8, density: 0.0055, hemiSky: 0xcfdcf2, hemiGround: 0x4d453a, hemi: 1.7, sun: 0xfff0da, sunI: 3.6, lamps: 0, windows: 0, exposure: 1, mist: 0.035, bloom: 0.12, vignette: 0.35, lantern: 0 };
const ENTARDECER = { fog: 0x7d5c5a, density: 0.009, hemiSky: 0xb48f86, hemiGround: 0x2a2020, hemi: 1.15, sun: 0xff8a4a, sunI: 2.5, lamps: 0.6, windows: 0.6, exposure: 1, mist: 0.08, bloom: 0.35, vignette: 0.7, lantern: 0.6 };

/** Pontos de controle ao longo das 24 h; entre eles a luz é interpolada. */
const KEYS: Key[] = [
  { h: 0, ...ESCURA },
  { h: 4.5, ...ESCURA },
  { h: 6, ...AMANHECER },
  { h: 8, ...DIA },
  { h: 16, ...DIA },
  { h: 18, ...ENTARDECER },
  { h: 19.7, ...NOITE },
  { h: 22.8, ...NOITE },
  { h: 24, ...ESCURA },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const CERRACAO_DAY = new THREE.Color(0x98a0a6);
const CERRACAO_NIGHT = new THREE.Color(0x3a434c);

/**
 * Céu do jogo: relógio (1 h do jogo = 1 min real, o mesmo para todos) e Cerração.
 * `T` pula para a próxima fase e `C` alterna a Cerração (auto → ligada → desligada), para testar.
 */
export class Sky {
  /** Horas somadas ao relógio do mundo (atalho de teste). */
  offsetHours = 0;
  /** null = segue o relógio; true/false = forçada. */
  forcedCerracao: boolean | null = null;
  readonly p: SkyParams = {
    fog: new THREE.Color(), density: 0, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemi: 0,
    sun: new THREE.Color(), sunI: 0, lamps: 0, windows: 0, exposure: 1, mist: 0, bloom: 0, vignette: 1, lantern: 1,
  };
  hour = 0;
  day = 0;
  phase: Phase = "noite";
  cerracao = 0;
  private cerracaoShown = 0;

  constructor(startHour?: number) {
    if (startHour !== undefined) this.offsetHours = startHour - worldClock(Date.now()).hour;
  }

  /** Avança até o começo da próxima fase. */
  nextPhase() {
    const order = [...PHASES].sort((a, b) => PHASE_START[a] - PHASE_START[b]);
    const i = order.indexOf(this.phase === "noite_escura" && this.hour > 12 ? "noite" : this.phase);
    const next = order[(i + 1) % order.length]!;
    let target = PHASE_START[next] + 0.6;
    if (target <= this.hour) target += 24;
    this.offsetHours += target - this.hour;
  }

  cycleCerracao() {
    this.forcedCerracao = this.forcedCerracao === null ? true : this.forcedCerracao ? false : null;
  }

  update(nowMs: number, dt: number) {
    const { day, hour } = worldClock(nowMs, this.offsetHours);
    this.day = day;
    this.hour = hour;
    this.phase = phaseAt(hour);
    this.cerracao = this.forcedCerracao === null ? cerracaoAt(day, hour) : this.forcedCerracao ? 1 : 0;
    // A névoa entra e sai devagar, mesmo quando forçada pelo atalho.
    this.cerracaoShown += (this.cerracao - this.cerracaoShown) * Math.min(1, dt * 0.8);

    let i = 0;
    while (KEYS[i + 1]!.h <= hour) i++;
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    const f = THREE.MathUtils.smoothstep(hour, a.h, b.h);
    const p = this.p;
    const num = (k: keyof Key) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * f;
    const col = (out: THREE.Color, k: "fog" | "hemiSky" | "hemiGround" | "sun") => out.copy(tmpA.setHex(a[k])).lerp(tmpB.setHex(b[k]), f);
    col(p.fog, "fog");
    col(p.hemiSky, "hemiSky");
    col(p.hemiGround, "hemiGround");
    col(p.sun, "sun");
    for (const k of ["density", "hemi", "sunI", "lamps", "windows", "exposure", "mist", "bloom", "vignette", "lantern"] as const) p[k] = num(k);

    // Cerração por cima: neblina densa e cinzenta, sol abafado, postes com halo.
    const c = this.cerracaoShown;
    if (c > 0.001) {
      const daylight = this.daylight;
      tmpA.copy(CERRACAO_NIGHT).lerp(CERRACAO_DAY, daylight);
      p.fog.lerp(tmpA, c);
      p.hemiSky.lerp(tmpA, c * 0.6);
      p.density += (0.06 - p.density) * c;
      p.sunI *= 1 - 0.7 * c;
      p.hemi *= 1 - 0.15 * c;
      p.mist += (0.4 - p.mist) * c;
      p.bloom += 0.2 * c * (1 - daylight);
      p.vignette = Math.max(p.vignette, 0.8 * c);
      p.lamps = Math.max(p.lamps, 0.5 * c);
      p.lantern = Math.max(p.lantern, c);
    }
  }

  /** 1 com o sol alto, 0 à noite. */
  get daylight() {
    const h = this.hour;
    return THREE.MathUtils.smoothstep(h, 5, 7.5) * (1 - THREE.MathUtils.smoothstep(h, 17.5, 19.5));
  }

  /** Posição relativa da luz que faz sombra: sol de leste (+x) a oeste durante o dia, lua fixa à noite. */
  lightOffset(out: THREE.Vector3) {
    const a = THREE.MathUtils.clamp((this.hour - 6) / 12, 0, 1) * Math.PI;
    const sun = tmpV.set(Math.cos(a) * 55, 25 + Math.sin(a) * 45, -22);
    return out.set(-30, 60, -22).lerp(sun, this.daylight);
  }

  get clockText() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
}
const tmpV = new THREE.Vector3();
