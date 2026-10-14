import { CUES, type CueName, type CategoryName } from "uisfx";
import { glassDurations } from "./glass-durations.ts";

export const SOUND_PACK = "glass";
export const DEFAULT_SOUND: SoundId = "notification";
export const TICK_SOUND: SoundId = "typing";
export const MAX_SOUND_DURATION = 3;
export type SoundId = CueName;
export type SoundIcon = "bell" | "pulse" | "wood" | "bowl" | "air" | "chime";
export interface SoundDefinition {
  id: SoundId;
  name: string;
  detail: string;
  color: string;
  icon: SoundIcon;
  duration: number;
}

const names: Record<SoundId, string> = {
  hover: "Наведение", press: "Нажатие", release: "Отпускание",
  "double-click": "Двойной щелчок", focus: "Фокус", "long-press": "Удержание",
  select: "Выбор", deselect: "Снятие выбора", "toggle-on": "Включение",
  "toggle-off": "Выключение", check: "Отметка", uncheck: "Снятие отметки",
  delete: "Удаление", cancel: "Отмена", undo: "Шаг назад", redo: "Повтор действия",
  copy: "Копирование", paste: "Вставка", open: "Открытие", close: "Закрытие",
  back: "Назад", forward: "Вперёд", expand: "Разворачивание", collapse: "Сворачивание",
  "drag-start": "Подхват", drop: "Приземление", snap: "Фиксация", swipe: "Смахивание",
  reorder: "Перестановка", "invalid-drop": "Неверное положение",
  send: "Отправка", receive: "Получение", notification: "Уведомление",
  mention: "Упоминание", typing: "Печатный щелчок", reaction: "Реакция",
  success: "Успех", error: "Ошибка", warning: "Предупреждение", info: "Информация",
  blocked: "Запрет", retry: "Повторная попытка", start: "Старт", stop: "Остановка",
  "progress-step": "Шаг прогресса", complete: "Завершение", queued: "Очередь",
  checkpoint: "Контрольная точка", loading: "Загрузка", processing: "Обработка",
  recording: "Запись", connecting: "Подключение", scanning: "Сканирование",
  streaming: "Трансляция", play: "Воспроизведение", pause: "Пауза", seek: "Перемотка",
  "volume-change": "Громкость", "skip-next": "Следующий трек",
  "skip-previous": "Предыдущий трек", connect: "Соединение", disconnect: "Отключение",
  lock: "Блокировка", unlock: "Разблокировка", wake: "Пробуждение", sleep: "Сон",
  reward: "Награда", "level-up": "Новый уровень", achievement: "Достижение",
  streak: "Серия успехов", badge: "Значок", bonus: "Бонус",
  "add-to-cart": "В корзину", "remove-from-cart": "Из корзины", checkout: "Оформление",
  purchase: "Покупка", coupon: "Купон", refund: "Возврат",
};

const categories: Record<CategoryName, [name: string, color: string, icon: SoundIcon]> = {
  input: ["Касания", "ink", "pulse"],
  selection: ["Выбор", "sage", "chime"],
  navigation: ["Переходы", "blue", "air"],
  editing: ["Действия", "clay", "pulse"],
  movement: ["Движение", "sand", "pulse"],
  communication: ["Сообщения", "blue", "bell"],
  feedback: ["Сигналы", "orange", "bell"],
  progress: ["Этапы", "sage", "chime"],
  loops: ["Ритмы · один цикл", "ink", "air"],
  media: ["Медиа", "clay", "pulse"],
  system: ["Система", "sand", "bowl"],
  reward: ["Награды", "orange", "chime"],
  commerce: ["Покупки", "sage", "bell"],
};

export const sounds: SoundDefinition[] = CUES.map((cue) => {
  const [category, color, icon] = categories[cue.category];
  return {
    id: cue.name, name: names[cue.name], detail: `${category} · ${cue.label}`,
    color, icon, duration: glassDurations[cue.name],
  };
});

export function getSound(id: SoundId): SoundDefinition {
  return sounds.find((sound) => sound.id === id)!;
}

// Restoration only: the old sounds are no longer offered or played.
export const legacySounds = {
  "nepal-bell": ["notification", "Непальский колокольчик", "ink"],
  "hand-chime": ["info", "Ручной колокол", "sage"],
  glockenspiel: ["success", "Глокеншпиль", "blue"],
  vibraphone: ["complete", "Вибрафон", "sand"],
  marimba: ["select", "Маримба", "clay"],
  woodblock: ["press", "Вудблок", "clay"],
  claves: ["snap", "Клавес", "orange"],
  triangle: ["checkpoint", "Треугольник", "sage"],
  gong: ["achievement", "Гонг", "sand"],
  "tubular-bell": ["reward", "Трубчатый колокол", "ink"],
  shaker: ["swipe", "Шейкер", "blue"],
  "bell-tree": ["level-up", "Перелив колокольчиков", "orange"],
  bell: ["notification", "Мягкий звон", "ink"],
  pulse: ["start", "Пульс", "orange"],
  bowl: ["complete", "Глубокий тон", "sand"],
  chime: ["success", "Колокольчики", "sage"],
  wood: ["press", "Деревянный щелчок", "clay"],
  air: ["swipe", "Воздух", "blue"],
  tick: ["typing", "Тик секундомера", "ink"],
  "tick-accent": ["snap", "Отсечка секундомера", "sand"],
} as const satisfies Record<string, readonly [SoundId, string, string]>;

export function restoreSoundId(id: unknown): SoundId | null {
  if (typeof id !== "string") return null;
  if (Object.hasOwn(legacySounds, id))
    return legacySounds[id as keyof typeof legacySounds][0];
  return sounds.some((sound) => sound.id === id) ? id as SoundId : null;
}
