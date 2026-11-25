/**
 * Personagens jogáveis: 5 classes (issue #17), cada uma com versão masculina e feminina
 * (modelos 3D da Meshy em apps/game/public/models), e a origem morador/forasteiro (issue #2),
 * que muda só o diálogo.
 */

export const CLASS_IDS = ["peao", "benzedeira", "tropeiro", "cavaleiro", "feiticeiro"] as const;
export type ClassId = (typeof CLASS_IDS)[number];
export type Gender = "m" | "f";
export type Origin = "morador" | "forasteiro";

export type ClassInfo = {
  id: ClassId;
  name: string;
  role: string;
  desc: string;
  /** Gênero do modelo base (sem sufixo); o outro tem sufixo -m ou -f. */
  baseGender: Gender;
};

export const CLASSES: Record<ClassId, ClassInfo> = {
  peao: { id: "peao", name: "Peão", role: "Defesa", desc: "Aguenta pancada e segura os inimigos. Trabalhador de estância, largo e firme, com porrete de lida.", baseGender: "m" },
  benzedeira: { id: "benzedeira", name: "Benzedeira", role: "Cura", desc: "Cura e protege. Rezadeira do interior, com arruda, linha vermelha e fé popular.", baseGender: "f" },
  tropeiro: { id: "tropeiro", name: "Tropeiro", role: "Distância", desc: "Dano de longe com laço e boleadeira. Condutor de tropa, viajado e ágil.", baseGender: "m" },
  cavaleiro: { id: "cavaleiro", name: "Cavaleiro", role: "Corpo a corpo", desc: "Dano corpo a corpo, rápido e móvel. Luta a pé com o facão; o cavalo é só tema.", baseGender: "m" },
  feiticeiro: { id: "feiticeiro", name: "Feiticeiro", role: "Magia em área", desc: "Dano mágico em área. Herdeiro dos segredos da Salamanca do Jarau.", baseGender: "m" },
};

export const CLASS_LABEL: Record<ClassId, Record<Gender, string>> = {
  peao: { m: "Peão", f: "Peoa" },
  benzedeira: { m: "Benzedor", f: "Benzedeira" },
  tropeiro: { m: "Tropeiro", f: "Tropeira" },
  cavaleiro: { m: "Cavaleiro", f: "Amazona" },
  feiticeiro: { m: "Feiticeiro", f: "Feiticeira" },
};

export const ORIGINS: Record<Origin, { name: string; desc: string }> = {
  morador: { name: "Morador", desc: "Nasceu em Taquara. Conhece as ruas e as pessoas, e perdeu gente na Cerração." },
  forasteiro: { name: "Forasteiro", desc: "Chegou de fora dias depois da Cerração. Ninguém confia de cara, mas ninguém mais pode sair." },
};

/** Id do modelo 3D: class-<classe> para o gênero base, class-<classe>-<m|f> para o outro. */
export function classModelId(cls: ClassId, gender: Gender): string {
  return gender === CLASSES[cls].baseGender ? `class-${cls}` : `class-${cls}-${gender}`;
}

/** Personagem criado na tela de seleção. */
export type CharacterProfile = { name: string; cls: ClassId; gender: Gender; origin: Origin; createdAt: number };

export function characterTitle(p: CharacterProfile): string {
  return `${ORIGINS[p.origin].name} · ${CLASS_LABEL[p.cls][p.gender]}`;
}
