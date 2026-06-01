import type { ClassPredictionScore } from '../types';

interface ClassBreakdownProps {
  predictions: ClassPredictionScore[];
  thresholds: { highPercent: number; lowPercent: number };
  topClassLabel?: string;
}

export function ClassBreakdown({ predictions, thresholds, topClassLabel }: ClassBreakdownProps) {
  if (!predictions.length) return null;

  return (
    <div
      className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3"
      id="class-breakdown-panel"
    >
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Confidence thresholds
        </p>
        <p className="text-xs font-mono text-slate-300 mt-1">
          Match ≥ {thresholds.highPercent}% · Minimum {thresholds.lowPercent}%
        </p>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-2">
          All classes (closest matches)
        </p>
        <ul className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
          {predictions.map((row) => {
            const isTop = row.classLabel === topClassLabel;
            const barColor =
              row.confidence >= thresholds.highPercent
                ? 'bg-emerald-500'
                : row.confidence >= thresholds.lowPercent
                  ? 'bg-amber-500'
                  : 'bg-slate-600';

            return (
              <li
                key={row.classLabel}
                className={`rounded-lg px-2.5 py-2 ${isTop ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/40'}`}
              >
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="min-w-0 text-left">
                    <p
                      className={`text-xs font-semibold truncate ${isTop ? 'text-blue-300' : 'text-slate-200'}`}
                    >
                      {row.displayName}
                      {isTop && (
                        <span className="ml-1 text-[9px] font-mono text-blue-400">(top)</span>
                      )}
                    </p>
                    {row.studentId && (
                      <p className="text-[9px] font-mono text-slate-500 truncate">
                        ID: {row.studentId}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-300 flex-shrink-0">
                    {row.confidence}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(100, row.confidence)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
