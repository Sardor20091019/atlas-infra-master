import { useEffect } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { useStagedView } from '../store/useStagedView';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Physical bottom-center timeline rail with a crisp 1-sentence "What changed & why" callout. */
export function StageBar() {
  const view = useStagedView();
  const setStage = useAtlasStore((s) => s.setStage);
  const traceId = useAtlasStore((s) => s.traceId);
  const stages = view?.stages ?? [];
  const index = view?.index ?? 0;
  const count = stages.length;

  // Arrow key navigation (← / →)
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target)) return;
      if (e.key === 'ArrowRight' && index < count - 1) setStage(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) setStage(index - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, setStage]);

  // Hidden if there is only 1 stage or when a request trace is actively playing
  if (count < 2 || traceId) return null;

  const currentStage = stages[index];
  const stageNum = String(index + 1).padStart(2, '0');
  const totalNum = String(count).padStart(2, '0');

  return (
    <div className="stage-dock" role="region" aria-label="Architecture evolution timeline">
      {/* 1-Sentence "What changed & why" callout right above the rail */}
      <div className="stage-callout">
        <div className="stage-callout-head">
          <span className="stage-callout-badge tabular">
            STAGE {stageNum} OF {totalNum}
          </span>
          <span className="stage-callout-title">{currentStage.label}</span>
          {currentStage.scale && (
            <span className="stage-callout-scale tabular">[{currentStage.scale}]</span>
          )}
        </div>
        <p className="stage-callout-summary">{currentStage.summary}</p>
      </div>

      {/* Tactile Horizontal Timeline Rail */}
      <div className="stage-rail">
        <button
          className="stage-rail-nav"
          onClick={() => setStage(index - 1)}
          disabled={index === 0}
          title="Previous stage (← Arrow)"
          aria-label="Previous evolution stage"
        >
          ‹
        </button>

        <ol className="stage-rail-steps">
          {stages.map((st, i) => {
            const isCur = i === index;
            const isDone = i < index;
            const num = String(i + 1).padStart(2, '0');
            return (
              <li key={st.id} className={isCur ? 'cur' : isDone ? 'done' : ''}>
                <button
                  onClick={() => setStage(i)}
                  title={`${num}. ${st.label}\n${st.summary}`}
                  aria-current={isCur ? 'step' : undefined}
                >
                  <span className="stage-rail-track">
                    <span className="stage-rail-pip" />
                  </span>
                  <span className="stage-rail-label">
                    <span className="stage-step-num tabular">{num}</span>
                    <span className="stage-step-text">{st.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <button
          className="stage-rail-nav"
          onClick={() => setStage(index + 1)}
          disabled={index === count - 1}
          title="Next stage (→ Arrow)"
          aria-label="Next evolution stage"
        >
          ›
        </button>
      </div>
    </div>
  );
}
