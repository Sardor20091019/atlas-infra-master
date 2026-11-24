import { useEffect } from 'react';
import { useStagedView } from '../store/useStagedView';
import { useAtlasStore } from '../store/useAtlasStore';

const STEP_MS = 1600;

/** Step bar shown over the canvas while a trace is active. Owns the autoplay timer. */
export function TraceBar() {
  const traceId = useAtlasStore((s) => s.traceId);
  const step = useAtlasStore((s) => s.traceStep);
  const playing = useAtlasStore((s) => s.tracePlaying);
  const setStep = useAtlasStore((s) => s.setTraceStep);
  const setPlaying = useAtlasStore((s) => s.setTracePlaying);
  const stopTrace = useAtlasStore((s) => s.stopTrace);

  // Only traces that are complete in the current stage.
  const stagedView = useStagedView();
  const arch = stagedView?.arch;
  const trace = arch?.traces?.find((t) => t.id === traceId);
  const total = trace?.steps.length ?? 0;

  useEffect(() => {
    if (!playing || !trace) return;
    const id = window.setInterval(() => {
      const cur = useAtlasStore.getState().traceStep;
      if (cur >= total - 1) setPlaying(false);
      else setStep(cur + 1);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, trace, total, setStep, setPlaying]);

  // The draft can lose steps while a trace is playing; never index past the end.
  const s = trace?.steps[Math.min(step, total - 1)];
  if (!trace || !s) return null;
  const label = (id: string) => arch?.nodes.find((n) => n.id === id)?.label ?? id;

  const currentStepNum = String(step + 1).padStart(2, '0');
  const totalStepsNum = String(total).padStart(2, '0');

  return (
    <div className="trace-bar" role="region" aria-label="Request Trace Playback">
      <div className="trace-bar-head">
        <div className="trace-title-cluster">
          <span className="trace-active-indicator" />
          <span className="trace-name">{trace.name}</span>
          <span className="trace-step-tag tabular">
            HOP {currentStepNum} / {totalStepsNum}
          </span>
        </div>
        <div className="trace-controls">
          <button
            className="trace-ctrl-btn"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            title="Previous hop"
            aria-label="Previous hop"
          >
            ‹
          </button>
          <button
            className="trace-ctrl-btn"
            onClick={() => setPlaying(!playing)}
            title={playing ? 'Pause trace' : 'Play trace'}
            aria-label={playing ? 'Pause trace' : 'Play trace'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            className="trace-ctrl-btn"
            onClick={() => setStep(Math.min(total - 1, step + 1))}
            disabled={step >= total - 1}
            title="Next hop"
            aria-label="Next hop"
          >
            ›
          </button>
          <button
            className="trace-ctrl-btn close-btn"
            onClick={stopTrace}
            title="Exit request tracing (Esc)"
            aria-label="Exit request tracing"
          >
            ×
          </button>
        </div>
      </div>

      <div className="trace-bar-hop">
        <span className="trace-hop-endpoint">{label(s.from)}</span>
        <span className="trace-hop-arrow">➔</span>
        <span className="trace-hop-endpoint">{label(s.to)}</span>
      </div>

      <p className="trace-bar-note">{s.note}</p>

      {/* Discrete Hop Progress Rail */}
      <div className="trace-dots">
        {trace.steps.map((_, i) => (
          <button
            key={i}
            className={`trace-segment-btn${i === step ? ' cur' : i < step ? ' done' : ''}`}
            onClick={() => setStep(i)}
            title={`Hop ${i + 1}`}
            aria-label={`Hop ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Legacy sidebar TracePanel fallback (kept for compatibility in Build mode). */
export function TracePanel() {
  const traceId = useAtlasStore((s) => s.traceId);
  const startTrace = useAtlasStore((s) => s.startTrace);
  const stopTrace = useAtlasStore((s) => s.stopTrace);
  const arch = useStagedView()?.arch;
  const traces = arch?.traces ?? [];
  if (traces.length === 0) return null;

  return (
    <div className="trace-panel">
      <div className="panel-title">Request Traces</div>
      {traces.map((t) => {
        const on = t.id === traceId;
        return (
          <button
            key={t.id}
            className={`trace-row${on ? ' on' : ''}`}
            onClick={() => (on ? stopTrace() : startTrace(t.id))}
          >
            <span className="trace-play">{on ? '■' : '▶'}</span>
            <span>
              <span className="trace-name">{t.name}</span>
              {t.description && <span className="layer-desc">{t.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
