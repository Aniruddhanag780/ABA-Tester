import React from 'react';
import { Trash2, ArrowUpRight, FileSearch } from 'lucide-react';
import type { QaRunState } from '../shared/qaTypes';

interface RunHistoryViewProps {
  runs: QaRunState[];
  onOpenRun: (run: QaRunState) => void;
  onDeleteRun: (runId: string) => void;
  onStartNew: () => void;
}

export function RunHistoryView({
  runs,
  onOpenRun,
  onDeleteRun,
  onStartNew,
}: RunHistoryViewProps) {
  if (runs.length === 0) {
    return (
      <section className="bg-white border border-[#E8E3DC] rounded-xl p-12 text-center space-y-4">
        <FileSearch className="w-8 h-8 text-[#8B847B] mx-auto" />
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-[#181615]">
            No QA runs recorded yet
          </h2>
          <p className="text-xs text-[#5E5851] max-w-md mx-auto">
            Launch your first autonomous browser test against a storefront URL to inspect live steps and severity-ranked bug reports here.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartNew}
          className="px-4 py-2 text-xs font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] transition-colors"
        >
          Configure First QA Run
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white border border-[#E8E3DC] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E8E3DC] flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#181615]">Run History</h1>
          <p className="text-xs text-[#5E5851]">
            Persisted browser test executions and diagnostic reports.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-[#8B847B]">
          {runs.length} runs
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#FAF8F5] border-b border-[#E8E3DC] text-[#5E5851]">
            <tr>
              <th className="py-3 px-4 font-medium">Target Storefront</th>
              <th className="py-3 px-4 font-medium">Engine</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Steps</th>
              <th className="py-3 px-4 font-medium text-right">Bugs</th>
              <th className="py-3 px-4 font-medium text-right">HTTP Errors</th>
              <th className="py-3 px-4 font-medium text-right">Duration</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFECE6]">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-[#FAF8F5] transition-colors">
                <td className="py-3 px-4">
                  <div className="font-mono text-[#181615] truncate max-w-[280px]">
                    {run.config.targetUrl}
                  </div>
                  <div className="text-[11px] text-[#8B847B] font-mono mt-0.5">
                    {new Date(run.createdAt).toLocaleString()} · {run.config.testPhone}
                  </div>
                </td>
                <td className="py-3 px-4 text-[#5E5851] whitespace-nowrap">
                  {run.config.engineMode === 'ai_vision' ? 'AI Vision' : 'Playwright Suite'}
                </td>
                <td className="py-3 px-4 whitespace-nowrap">
                  <span
                    className={`font-medium capitalize ${
                      run.status === 'completed'
                        ? 'text-[#15803D]'
                        : run.status === 'error'
                          ? 'text-[#B91C1C]'
                          : run.status === 'running'
                            ? 'text-[#1D4ED8]'
                            : 'text-[#5E5851]'
                    }`}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-[#181615]">
                  {run.summary.totalSteps}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#B91C1C]">
                  {run.summary.totalBugs}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-[#5E5851]">
                  {run.summary.networkFailuresCount}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-[#5E5851]">
                  {(run.summary.durationMs / 1000).toFixed(1)}s
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRun(run)}
                      aria-label={`Open bug report for ${run.config.targetUrl}`}
                      className="px-2.5 py-1 text-xs font-medium border border-[#E8E3DC] rounded-md text-[#181615] hover:border-[#181615] inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      Report
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRun(run.id)}
                      aria-label={`Delete run ${run.id}`}
                      className="p-1.5 text-[#8B847B] hover:text-[#B91C1C] rounded-md transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
