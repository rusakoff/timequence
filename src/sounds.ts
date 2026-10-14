import { sampleMetadata } from "./sample-metadata.ts";

export const MAX_SOUND_DURATION = 3;

export type SynthSoundId =
  "bell" | "pulse" | "wood" | "bowl" | "air" | "chime" | "tick" | "tick-accent";
export type SampleSoundId = keyof typeof sampleMetadata;
export type SoundId = SynthSoundId | SampleSoundId;
export type SoundIcon = "bell" | "pulse" | "wood" | "bowl" | "air" | "chime";
export interface SoundDefinition {
  id: SoundId;
  name: string;
  detail: string;
  color: string;
  icon: SoundIcon;
  kind: "sample" | "synth";
  file?: string;
  duration: number;
  waveform?: readonly number[];
}

const recordings: {
  id: SampleSoundId;
  name: string;
  detail: string;
  color: string;
  icon: SoundIcon;
}[] = [
  {
    id: "nepal-bell",
    name: "Непальский колокольчик",
    detail: "Короткий металлический звон",
    color: "ink",
    icon: "bell",
  },
  {
    id: "hand-chime",
    name: "Ручной колокол",
    detail: "Мягкий металлический тон",
    color: "sage",
    icon: "bell",
  },
  {
    id: "glockenspiel",
    name: "Глокеншпиль",
    detail: "Звонкая металлическая нота",
    color: "blue",
    icon: "chime",
  },
  {
    id: "vibraphone",
    name: "Вибрафон",
    detail: "Низкий тон, мягкая палочка",
    color: "sand",
    icon: "bowl",
  },
  {
    id: "marimba",
    name: "Маримба",
    detail: "Тёплая деревянная нота",
    color: "clay",
    icon: "wood",
  },
  {
    id: "woodblock",
    name: "Вудблок",
    detail: "Короткий деревянный удар",
    color: "clay",
    icon: "wood",
  },
  {
    id: "claves",
    name: "Клавес",
    detail: "Чёткий щелчок двух палочек",
    color: "orange",
    icon: "pulse",
  },
  {
    id: "triangle",
    name: "Треугольник",
    detail: "Лёгкий серебристый звон",
    color: "sage",
    icon: "chime",
  },
  {
    id: "gong",
    name: "Гонг",
    detail: "Глубокий низкий удар",
    color: "sand",
    icon: "bowl",
  },
  {
    id: "tubular-bell",
    name: "Трубчатый колокол",
    detail: "Объёмный, насыщенный звон",
    color: "ink",
    icon: "bell",
  },
  {
    id: "shaker",
    name: "Шейкер",
    detail: "Короткий шорох",
    color: "blue",
    icon: "air",
  },
  {
    id: "bell-tree",
    name: "Перелив колокольчиков",
    detail: "Россыпь звенящих нот",
    color: "orange",
    icon: "chime",
  },
];

const publicBase = import.meta.env?.BASE_URL ?? "/";

export const sounds: SoundDefinition[] = [
  ...recordings.map((sound): SoundDefinition => ({
    ...sound,
    kind: "sample",
    file: `${publicBase}audio/vcsl/${sound.id}.mp3?v=short-3s`,
    ...sampleMetadata[sound.id],
  })),
  {
    id: "tick",
    name: "Тик секундомера",
    detail: "Тихий короткий щелчок",
    color: "ink",
    icon: "pulse",
    kind: "synth",
    duration: 0.04,
  },
  {
    id: "tick-accent",
    name: "Отсечка секундомера",
    detail: "Чуть более звонкий щелчок",
    color: "sand",
    icon: "pulse",
    kind: "synth",
    duration: 0.07,
  },
  {
    id: "bell",
    name: "Мягкий звон",
    detail: "Чистый и лёгкий",
    color: "ink",
    icon: "bell",
    kind: "synth",
    duration: 0.65,
  },
  {
    id: "pulse",
    name: "Пульс",
    detail: "Короткий электронный сигнал",
    color: "orange",
    icon: "pulse",
    kind: "synth",
    duration: 0.65,
  },
  {
    id: "bowl",
    name: "Глубокий тон",
    detail: "Тёплый и объёмный",
    color: "sand",
    icon: "bowl",
    kind: "synth",
    duration: 0.65,
  },
  {
    id: "chime",
    name: "Колокольчики",
    detail: "Светлое созвучие",
    color: "sage",
    icon: "chime",
    kind: "synth",
    duration: 0.65,
  },
  {
    id: "wood",
    name: "Деревянный щелчок",
    detail: "Сухой и мягкий",
    color: "clay",
    icon: "wood",
    kind: "synth",
    duration: 0.65,
  },
  {
    id: "air",
    name: "Воздух",
    detail: "Плавный шумовой звук",
    color: "blue",
    icon: "air",
    kind: "synth",
    duration: 0.65,
  },
];

export function getSound(id: SoundId): SoundDefinition {
  return sounds.find((sound) => sound.id === id)!;
}
