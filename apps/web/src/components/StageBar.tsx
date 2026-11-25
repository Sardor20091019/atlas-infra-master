import { useEffect } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { useStagedView } from '../store/useStagedView';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Vertical stepped evolution timeline inside the left workbench rail.
 * Supports ↑/↓ (and ←/→) keyboard navigation when no trace is active.
 */
export function StageBar() {
  const view = useStagedView();
  const setStage = useAtlasStore((s) => s.setStage);
  const traceId = useAtlasStore((s) => s.traceId);
  const stages = view?.stages ?? [];
  const index = view?.index ?? 0;
  const count = stages.length;

  useEffect(() => {
    if (count < 2 || traceId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target)) return;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && index < count - 1) {
        setStage(index + 1);
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && index > 0) {
        setStage(index - 1);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, traceId, setStage]);

  if (count < 2) return null;

  const currentStage = stages[index];
  const stageNum = String(index + 1).padStart(2, '0');
  const totalNum = String(count).padStart(2, '0');

  return (
    <section className="rail-section" role="region" aria-label="Evolution Stages">
      <div className="rail-section-head">
        <span className="rail-section-title">Evolution Stages</span>
        <span className="rail-section-meta tabular">
          {stageNum}/{totalNum}
        </span>
      </div>

      <ol className="stage-timeline">
        {stages.map((st, i) => {
          const isCur = i === index;
          const isDone = i < index;
          const num = String(i + 1).padStart(2, '0');
          return (
            <li
              key={st.id}
              className={`stage-timeline-item${isCur ? ' active' : ''}${isDone ? ' done' : ''}`}
            >
              <button
                type="button"
                className="stage-timeline-btn"
                onClick={() => setStage(i)}
                aria-current={isCur ? 'step' : undefined}
              >
                <span className="stage-timeline-marker" aria-hidden="true">
                  <span className="stage-timeline-dot" />
                </span>
                <span className="stage-timeline-content">
                  <span className="stage-timeline-row">
                    <span className="stage-timeline-num tabular">{num}</span>
                    <span className="stage-timeline-label">{st.label}</span>
                    {st.scale && <span className="stage-timeline-scale tabular">{st.scale}</span>}
                  </span>
                </span>
              </button>

              {isCur && currentStage && (
                <div className="stage-story-block">
                  <div className="stage-story-kicker tabular">What changed &amp; why</div>
                  <p className="stage-story-text">{currentStage.summary}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
