/**
 * Configurações do jogador, salvas no navegador: gráficos, câmera, interface e teclas.
 * As teclas trocadas funcionam por tradução: a tecla escolhida vira, para o resto do jogo,
 * a tecla padrão daquela ação. Assim main.ts e combat.ts continuam lendo os códigos padrão.
 */

export type ActionId =
  | "up" | "down" | "left" | "right" | "run" | "dodge"
  | "skill1" | "skill2" | "skill3" | "skill4"
  | "camLeft" | "camRight" | "zoom"
  | "map" | "streets" | "builder"
  | "phase" | "cerracao";

export type ActionInfo = { id: ActionId; label: string; group: string; code: string };

/** Ações de teclado que podem ser trocadas, com a tecla padrão (KeyboardEvent.code). */
export const ACTIONS: ActionInfo[] = [
  { id: "up", label: "Andar para a frente", group: "Movimento", code: "KeyW" },
  { id: "down", label: "Andar para trás", group: "Movimento", code: "KeyS" },
  { id: "left", label: "Andar para a esquerda", group: "Movimento", code: "KeyA" },
  { id: "right", label: "Andar para a direita", group: "Movimento", code: "KeyD" },
  { id: "run", label: "Correr (segurar)", group: "Movimento", code: "ShiftLeft" },
  { id: "dodge", label: "Esquiva", group: "Movimento", code: "Space" },
  { id: "skill1", label: "Habilidade 1", group: "Combate", code: "Digit1" },
  { id: "skill2", label: "Habilidade 2", group: "Combate", code: "Digit2" },
  { id: "skill3", label: "Habilidade 3", group: "Combate", code: "Digit3" },
  { id: "skill4", label: "Habilidade 4", group: "Combate", code: "Digit4" },
  { id: "camLeft", label: "Girar câmera para a esquerda", group: "Câmera", code: "KeyQ" },
  { id: "camRight", label: "Girar câmera para a direita", group: "Câmera", code: "KeyE" },
  { id: "zoom", label: "Zoom perto ↔ cidade toda", group: "Câmera", code: "KeyZ" },
  { id: "map", label: "Mapa da cidade", group: "Interface", code: "KeyM" },
  { id: "streets", label: "Nomes das ruas", group: "Interface", code: "KeyN" },
  { id: "builder", label: "Builder de cenário", group: "Interface", code: "KeyB" },
  { id: "phase", label: "Próxima fase do dia (teste)", group: "Teste", code: "KeyT" },
  { id: "cerracao", label: "Cerração auto/ligada/desligada (teste)", group: "Teste", code: "KeyC" },
];

/** Controles fixos, só para mostrar na tela. */
export const FIXED_CONTROLS: [string, string][] = [
  ["Botão esquerdo (E)", "Golpe na direção do ponteiro"],
  ["Botão direito (D)", "Golpe pesado"],
  ["E E E", "Arremate"],
  ["E D", "Estocada"],
  ["E E D", "Talho cruzado"],
  ["D E", "Rasteira"],
  ["D D", "Golpe de terra"],
  ["Golpe + 1–4", "Habilidade encadeada (mais forte)"],
  ["Roda do mouse", "Zoom (8 m até 1,5 km)"],
  ["Setas", "Andar (alternativa ao WASD)"],
  ["Esc", "Pausa / fechar janela"],
  ["Minimapa: clique / botão direito", "Marcar ponto / apagar marca"],
];

export type HudKey = "minimap" | "clock" | "where" | "help" | "combos" | "damage" | "enemyBars" | "places" | "streets";
export const HUD_LABEL: Record<HudKey, string> = {
  minimap: "Minimapa",
  clock: "Relógio e fase do dia",
  where: "Nome da cidade e da rua",
  help: "Dicas de controle no rodapé",
  combos: "Lista de golpes",
  damage: "Números de dano",
  enemyBars: "Vida das crias",
  places: "Nomes dos lugares",
  streets: "Nomes das ruas (N)",
};

export type Settings = {
  /** Resolução em relação à tela (0,5 a 1). */
  resolution: number;
  shadows: boolean;
  bloom: boolean;
  mist: boolean;
  vignette: boolean;
  fov: number;
  /** Força do tremor da câmera nos impactos (0 a 1). */
  shake: number;
  pauseOnBlur: boolean;
  hud: Record<HudKey, boolean>;
  keys: Record<ActionId, string>;
};

export const DEFAULTS: Settings = {
  resolution: 1,
  shadows: true,
  bloom: true,
  mist: true,
  vignette: true,
  fov: 38,
  shake: 1,
  pauseOnBlur: true,
  hud: { minimap: true, clock: true, where: true, help: true, combos: true, damage: true, enemyBars: true, places: true, streets: true },
  keys: Object.fromEntries(ACTIONS.map((a) => [a.id, a.code])) as Record<ActionId, string>,
};

const KEY = "bigriver:settings";

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Settings> | null;
    if (!raw) return structuredClone(DEFAULTS);
    return { ...structuredClone(DEFAULTS), ...raw, hud: { ...DEFAULTS.hud, ...raw.hud }, keys: { ...DEFAULTS.keys, ...raw.keys } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** Nome legível de uma tecla. */
export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const names: Record<string, string> = {
    Space: "Espaço", ShiftLeft: "Shift esq.", ShiftRight: "Shift dir.", ControlLeft: "Ctrl esq.", ControlRight: "Ctrl dir.",
    AltLeft: "Alt esq.", AltRight: "Alt dir.", Tab: "Tab", CapsLock: "Caps Lock", Enter: "Enter", Backspace: "Backspace",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Semicolon: "Ç / ;", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
  };
  return names[code] ?? code;
}

/** O `key` que o jogo espera para um código padrão (combat.ts lê e.key nas habilidades). */
function keyFor(code: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return " ";
  if (code.startsWith("Shift")) return "Shift";
  return code;
}

type Listener = (s: Settings) => void;

export class SettingsStore {
  values: Settings = load();
  private listeners: Listener[] = [];
  /** Tecla apertada → tecla padrão que o jogo entende. */
  private remap = new Map<string, string>();
  private defaults = new Set(ACTIONS.map((a) => a.code));

  constructor() {
    this.rebuild();
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
    fn(this.values);
  }

  set<K extends keyof Settings>(k: K, v: Settings[K]) {
    this.values[k] = v;
    this.commit();
  }

  setHud(k: HudKey, v: boolean) {
    this.values.hud[k] = v;
    this.commit();
  }

  /** Troca a tecla de uma ação. Se a tecla já era de outra ação, as duas trocam entre si. */
  bind(action: ActionId, code: string) {
    const keys = this.values.keys;
    const other = (Object.keys(keys) as ActionId[]).find((a) => a !== action && keys[a] === code);
    if (other) keys[other] = keys[action];
    keys[action] = code;
    this.commit();
  }

  resetKeys() {
    this.values.keys = structuredClone(DEFAULTS.keys);
    this.commit();
  }

  resetAll() {
    this.values = structuredClone(DEFAULTS);
    this.commit();
  }

  private commit() {
    this.rebuild();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Sem armazenamento (aba privada): vale só nesta sessão.
    }
    for (const fn of this.listeners) fn(this.values);
  }

  private rebuild() {
    this.remap.clear();
    for (const a of ACTIONS) this.remap.set(this.values.keys[a.id], a.code);
  }

  /**
   * Para onde vai uma tecla física: o código padrão que o jogo entende, ou null se a tecla
   * padrão foi trocada por outra e não deve fazer nada. Teclas sem ação passam como estão.
   */
  translate(code: string): string | null {
    const t = this.remap.get(code);
    if (t) return t;
    return this.defaults.has(code) ? null : code;
  }

  /** Cria um evento de teclado com o código padrão, para os ouvintes do jogo. */
  synth(type: "keydown" | "keyup", code: string, repeat: boolean) {
    return new KeyboardEvent(type, { code, key: keyFor(code), repeat, bubbles: true, cancelable: true });
  }

  /** Tecla atual de uma ação, legível (para dicas na tela). */
  label(action: ActionId) {
    return keyName(this.values.keys[action]);
  }
}
