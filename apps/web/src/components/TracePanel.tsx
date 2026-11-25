import { useEffect } from 'react';
import { useStagedView } from '../store/useStagedView';
import { useAtlasStore } from '../store/useAtlasStore';

const STEP_MS = 1600;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Interactive request trace selector and hop-by-hop stepper in the left workbench rail.
 * Clicking a hop highlights that exact path on the canvas and dims unrelated nodes to 25%.
 */
export function TracePanel() {
  const traceId = useAtlasStore((s) => s.traceId);
  const step = useAtlasStore((s) => s.traceStep);
  const playing = useAtlasStore((s) => s.tracePlaying);
  const startTrace = useAtlasStore((s) => s.startTrace);
  const stopTrace = useAtlasStore((s) => s.stopTrace);
  const setStep = useAtlasStore((s) => s.setTraceStep);
  const setPlaying = useAtlasStore((s) => s.setTracePlaying);

  const arch = useStagedView()?.arch;
  const traces = arch?.traces ?? [];
  const activeTrace = traces.find((t) => t.id === traceId);
  const total = activeTrace?.steps.length ?? 0;

  useEffect(() => {
    if (!playing || !activeTrace) return;
    const id = window.setInterval(() => {
      const cur = useAtlasStore.getState().traceStep;
      if (cur >= total - 1) setPlaying(false);
      else setStep(cur + 1);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, activeTrace, total, setStep, setPlaying]);

  // Arrow keys step through hops while a trace is active.
  useEffect(() => {
    if (!activeTrace || total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target)) return;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && step < total - 1) {
        setPlaying(false);
        setStep(step + 1);
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && step > 0) {
        setPlaying(false);
        setStep(step - 1);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTrace, step, total, setStep, setPlaying]);

  if (traces.length === 0) return null;

  const label = (id: string) => arch?.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <section className="rail-section" role="region" aria-label="Request Traces">
      <div className="rail-section-head">
        <span className="rail-section-title">Request Trace</span>
        <span className="rail-section-meta tabular">{traces.length} paths</span>
      </div>

      <div className="trace-list">
        {traces.map((t) => {
          const isActive = t.id === traceId;
          return (
            <div key={t.id} className={`trace-card${isActive ? ' active' : ''}`}>
              <button
                type="button"
                className="trace-card-trigger"
                onClick={() => (isActive ? stopTrace() : startTrace(t.id))}
                aria-expanded={isActive}
              >
                <span className="trace-card-icon" aria-hidden="true">
                  {isActive ? '■' : '▶'}
                </span>
                <span className="trace-card-text">
                  <span className="trace-card-name">{t.name}</span>
                  {t.description && !isActive && (
                    <span className="trace-card-desc">{t.description}</span>
                  )}
                </span>
                <span className="trace-card-count tabular">{t.steps.length} hops</span>
              </button>

              {isActive && activeTrace && (
                <div className="trace-hops-panel">
                  <div className="trace-playback-bar">
                    <button
                      type="button"
                      className="trace-mini-btn"
                      onClick={() => {
                        setPlaying(false);
                        setStep(Math.max(0, step - 1));
                      }}
                      disabled={step === 0}
                      title="Previous hop (↑)"
                      aria-label="Previous hop"
                    >
                      ‹ Prev
                    </button>
                    <button
                      type="button"
                      className="trace-mini-btn primary"
                      onClick={() => setPlaying(!playing)}
                      title={playing ? 'Pause autoplay' : 'Play trace'}
                    >
                      {playing ? '❚❚ Pause' : '▶ Play'}
                    </button>
                    <button
                      type="button"
                      className="trace-mini-btn"
                      onClick={() => {
                        setPlaying(false);
                        setStep(Math.min(total - 1, step + 1));
                      }}
                      disabled={step >= total - 1}
                      title="Next hop (↓)"
                      aria-label="Next hop"
                    >
                      Next ›
                    </button>
                    <button
                      type="button"
                      className="trace-mini-btn close"
                      onClick={stopTrace}
                      title="Stop trace (Esc)"
                      aria-label="Stop trace"
                    >
                      Stop
                    </button>
                  </div>

                  <ol className="trace-hop-list">
                    {activeTrace.steps.map((s, i) => {
                      const isCur = i === step;
                      const isDone = i < step;
                      const hopNum = String(i + 1).padStart(2, '0');
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            className={`trace-hop-btn${isCur ? ' active' : ''}${isDone ? ' done' : ''}`}
                            onClick={() => {
                              setPlaying(false);
                              setStep(i);
                            }}
                            aria-current={isCur ? 'step' : undefined}
                          >
                            <span className="trace-hop-num tabular">{hopNum}</span>
                            <span className="trace-hop-body">
                              <span className="trace-hop-route">
                                {label(s.from)} <span className="trace-hop-arrow">→</span> {label(s.to)}
                              </span>
                              {isCur && s.note && <span className="trace-hop-note">{s.note}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Kept as an alias for any external imports. */
export const TraceBar = TracePanel;
