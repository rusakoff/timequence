import type { ReactNode } from "react";
import { ArrowRight, Dumbbell, Headphones, Plus, Wind } from "lucide-react";
import "./home.css";

// A welcome surface inside the editor, using its palette and live player.
// DESIGN_VARIANCE = 6, MOTION_INTENSITY = 3, VISUAL_DENSITY = 3.
type Props = {
  player: ReactNode;
  onContinue: () => void;
  onExample: (example: "breathing" | "tabata") => void;
  onCreate: () => void;
  canCreate: boolean;
  error: string;
};

export function Home({ player, onContinue, onExample, onCreate, canCreate, error }: Props) {
  return (
    <div className="welcome">
      <header className="welcome-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          timequence
        </span>
      </header>

      <div className="welcome-body">
        <section className="welcome-intro" aria-labelledby="welcome-title">
          <h1 id="welcome-title">У каждого дела<br />свой ритм.</h1>
          <p>
            Расставьте звуковые сигналы для дыхания, тренировок или любого занятия.
            Таймер подскажет, когда двигаться дальше.
          </p>
          <button className="welcome-start" onClick={onContinue} autoFocus>
            Открыть редактор <ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>

        <section className="welcome-preview" aria-label="Ваш таймер в дзен-режиме">
          {player || (
            <div className="welcome-empty">
              <Headphones size={32} strokeWidth={1.5} aria-hidden="true" />
              <h2>Начните со своего ритма</h2>
              <p>Добавьте таймер, выберите звуки и расставьте сигналы.</p>
              <button onClick={onCreate}><Plus size={16} aria-hidden="true" /> Создать таймер</button>
            </div>
          )}
        </section>
      </div>

      <section className="welcome-examples" aria-labelledby="welcome-examples-title">
        <h2 id="welcome-examples-title">Или начните с примера</h2>
        <div className="welcome-options">
          <button onClick={() => onExample("breathing")}>
            <Wind size={19} strokeWidth={1.7} aria-hidden="true" />
            <span>Дыхание <small>4-7-8</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button onClick={() => onExample("tabata")}>
            <Dumbbell size={19} strokeWidth={1.7} aria-hidden="true" />
            <span>Табата <small>20/10</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button onClick={onCreate} disabled={!canCreate}>
            <Plus size={19} strokeWidth={1.7} aria-hidden="true" />
            <span>Свой таймер</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {!canCreate && <p className="welcome-note">Чтобы создать новый таймер, удалите один из сохранённых. Достигнут лимит: 100 таймеров.</p>}
        {error && <p className="welcome-error" role="alert">{error}</p>}
      </section>

      <footer className="welcome-footer">
        Без регистрации. Ваши таймеры сохраняются в этом браузере.
      </footer>
    </div>
  );
}
