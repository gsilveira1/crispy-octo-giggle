/**
 * Relógio do mundo e clima. Funções puras: o servidor e o cliente chegam ao mesmo céu
 * a partir do mesmo instante, sem precisar trocar mensagens além do horário.
 */

/** Quantos minutos reais dura um dia do jogo (1 hora do jogo = 1 minuto real). */
export const GAME_DAY_MINUTES = 24;

export const PHASES = ["amanhecer", "dia", "entardecer", "noite", "noite_escura"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  amanhecer: "Amanhecer",
  dia: "Dia",
  entardecer: "Entardecer",
  noite: "Noite",
  noite_escura: "Noite escura",
};

/** Hora (0–24) em que cada fase começa, em ordem. A noite escura é a madrugada, sem lua. */
export const PHASE_START: Record<Phase, number> = {
  noite_escura: 0,
  amanhecer: 5,
  dia: 7,
  entardecer: 17,
  noite: 19,
};

export function phaseAt(hour: number): Phase {
  const h = ((hour % 24) + 24) % 24;
  if (h < PHASE_START.amanhecer) return "noite_escura";
  if (h < PHASE_START.dia) return "amanhecer";
  if (h < PHASE_START.entardecer) return "dia";
  if (h < PHASE_START.noite) return "entardecer";
  return h >= 23.5 ? "noite_escura" : "noite";
}

/** Dia do jogo (inteiro) e hora (0–24, fracionária) num instante real em ms. */
export function worldClock(nowMs: number, offsetHours = 0): { day: number; hour: number } {
  const totalHours = (nowMs / 60000 / GAME_DAY_MINUTES) * 24 + offsetHours;
  const day = Math.floor(totalHours / 24);
  return { day, hour: totalHours - day * 24 };
}

function rand(day: number, salt: number): number {
  let h = Math.imul(day | 0, 2654435761) ^ Math.imul(salt, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Cerração: a névoa sobrenatural não é uma fase do relógio, é um evento que entra e sai.
 * Em cerca de 40% das noites ela sobe entre 21h e 1h e só dissipa de manhã;
 * em alguns dias (~15%) fica parada também de tarde. Devolve a força de 0 a 1.
 */
export function cerracaoAt(day: number, hour: number): number {
  const ramp = (h: number, start: number, end: number) => {
    const rise = Math.min(1, Math.max(0, (h - start) / 1.5));
    const fall = Math.min(1, Math.max(0, (end - h) / 1.5));
    return Math.min(rise, fall);
  };
  let v = 0;
  // Noite que começou neste dia (até 9h do dia seguinte, contado como 24+9).
  const nightOf = (d: number, h: number) => {
    if (rand(d, 1) >= 0.4) return 0;
    const start = 21 + rand(d, 2) * 4;
    const end = 24 + 7 + rand(d, 3) * 2;
    return ramp(h, start, end);
  };
  v = Math.max(v, nightOf(day, hour), nightOf(day - 1, hour + 24));
  if (rand(day, 4) < 0.15) v = Math.max(v, ramp(hour, 13 + rand(day, 5) * 2, 18.5));
  return v;
}
