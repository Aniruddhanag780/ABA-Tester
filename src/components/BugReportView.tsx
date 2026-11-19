import React, { useState } from 'react';
import { Download, ArrowLeft, AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import type { QaFinding, QaRunState, SeverityLevel } from '../shared/qaTypes';

interface BugReportViewProps {
  run: QaRunState;
  onBackToRunner: () => void;
  onInspectScreenshot: (url: string, caption: string) => void;
}

const SEVERITY_LABEL: Record<SeverityLevel, { text: string; classes: string }> = {
  critical: { text: 'Critical', classes: 'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]' },
  high: { text: 'High', classes: 'text-[#C2410C] bg-[#FFF7ED] border-[#FED7AA]' },
  medium: { text: 'Medium', classes: 'text-[#A16207] bg-[#FEFCE8] border-[#FEF08A]' },
  low: { text: 'Low', classes: 'text-[#475569] bg-[#F8FAFC] border-[#E2E8F0]' },
};

export function BugReportView({ run, onBackToRunner, onInspectScreenshot }: BugReportViewProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [diagnosticTab, setDiagnosticTab] = useState<'findings' | 'network' | 'console'>('findings');

  const filteredFindings: QaFinding[] =
    severityFilter === 'all'
      ? run.findings
      : run.findings.filter((f) => f.severity === severityFilter);

  const durationSec = (run.summary.durationMs / 1000).toFixed(1);

  return (
    <section className="space-y-6">
      {/* Top Report Header */}
      <div className="bg-white border border-[#E8E3DC] rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <button
            type="button"
            onClick={onBackToRunner}
            className="text-xs font-medium text-[#5E5851] hover:text-[#181615] inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Live Runner
          </button>
          <h1 className="font-display text-2xl font-bold text-[#181615]">
            QA Bug Report
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E5851] font-mono">
            <span className="truncate max-w-[400px]">{run.config.targetUrl}</span>
            <span aria-hidden="true">·</span>
            <span>User {run.config.testPhone}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{durationSec}s</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{run.status}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href={`/api/runs/${run.id}/export?format=markdown`}
            download={`${run.id}-report.md`}
            className="px-3.5 py-2 text-xs font-medium border border-[#E8E3DC] bg-[#FAF8F5] text-[#181615] rounded-lg hover:border-[#181615] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Markdown
          </a>
          <a
            href={`/api/runs/${run.id}/export?format=json`}
            download={`${run.id}-report.json`}
            className="px-3.5 py-2 text-xs font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </a>
        </div>
      </div>

      {/* Full-width KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-[#E8E3DC] rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#5E5851]">Total Bugs Found</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#181615]">
            {run.summary.totalBugs}
          </div>
        </div>
        <div className="bg-white border border-[#E8E3DC] rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#5E5851]">Critical / High</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#B91C1C]">
            {run.summary.criticalCount + run.summary.highCount}
          </div>
        </div>
        <div className="bg-white border border-[#E8E3DC] rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#5E5851]">HTTP 4xx / 5xx</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#181615]">
            {run.summary.networkFailuresCount}
          </div>
        </div>
        <div className="bg-white border border-[#E8E3DC] rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#5E5851]">Console Errors</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#181615]">
            {run.summary.consoleErrorsCount}
          </div>
        </div>
        <div className="bg-white border border-[#E8E3DC] rounded-xl p-4 space-y-1 col-span-2 lg:col-span-1">
          <div className="text-xs text-[#5E5851]">Broken Assets</div>
          <div className="text-2xl font-display font-bold tabular-nums text-[#181615]">
            {run.summary.brokenAssetsCount}
          </div>
        </div>
      </div>

      {/* Diagnostic View Switcher & Severity Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#EFECE6] rounded-lg">
          <button
            type="button"
            onClick={() => setDiagnosticTab('findings')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              diagnosticTab === 'findings' ? 'bg-white text-[#181615] shadow-xs' : 'text-[#5E5851] hover:text-[#181615]'
            }`}
          >
            Findings ({run.findings.length})
          </button>
          <button
            type="button"
            onClick={() => setDiagnosticTab('network')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              diagnosticTab === 'network' ? 'bg-white text-[#181615] shadow-xs' : 'text-[#5E5851] hover:text-[#181615]'
            }`}
          >
            Network 4xx/5xx ({run.networkFailures.length})
          </button>
          <button
            type="button"
            onClick={() => setDiagnosticTab('console')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              diagnosticTab === 'console' ? 'bg-white text-[#181615] shadow-xs' : 'text-[#5E5851] hover:text-[#181615]'
            }`}
          >
            Console Logs ({run.consoleErrors.length})
          </button>
        </div>

        {diagnosticTab === 'findings' && (
          <div className="flex items-center gap-1 p-1 bg-[#EFECE6] rounded-lg overflow-x-auto">
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap ${
                  severityFilter === sev ? 'bg-white text-[#181615] shadow-xs' : 'text-[#5E5851] hover:text-[#181615]'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Findings List */}
      {diagnosticTab === 'findings' && (
        <div className="space-y-4">
          {filteredFindings.length === 0 ? (
            <div className="bg-white border border-[#E8E3DC] rounded-xl p-10 text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-[#15803D] mx-auto" />
              <div className="text-sm font-semibold text-[#181615]">
                No defects matched this filter
              </div>
              <p className="text-xs text-[#5E5851]">
                {run.findings.length === 0
                  ? 'All tested flows passed without recorded bugs.'
                  : 'Try switching back to All severities to inspect recorded defects.'}
              </p>
            </div>
          ) : (
            filteredFindings.map((finding, idx) => {
              const sev = SEVERITY_LABEL[finding.severity];
              return (
                <article
                  key={finding.id}
                  className="bg-white border border-[#E8E3DC] rounded-xl p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E5851]">
                        <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${sev.classes}`}>
                          {sev.text}
                        </span>
                        <span className="font-mono">{finding.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Step #{finding.detectedAtStep}</span>
                      </div>
                      <h2 className="font-display text-base font-semibold text-[#181615]">
                        {idx + 1}. {finding.title}
                      </h2>
                      <div className="text-xs font-mono text-[#8B847B] truncate">
                        {finding.url}
                      </div>
                    </div>

                    {finding.screenshotUrl && (
                      <button
                        type="button"
                        onClick={() => onInspectScreenshot(finding.screenshotUrl!, finding.title)}
                        aria-label={`Inspect screenshot for bug ${finding.title}`}
                        className="group relative w-40 h-24 rounded-lg border border-[#E8E3DC] overflow-hidden bg-[#F4F0EA] shrink-0 hover:border-[#181615] transition-colors"
                      >
                        <img
                          src={finding.screenshotUrl}
                          alt={`Evidence screenshot for ${finding.title}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-[#181615]/75 text-white text-[10px] py-0.5 px-2 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="w-3 h-3" />
                          Inspect Frame
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#EFECE6]">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#181615]">Expected Behavior</div>
                      <p className="text-xs text-[#5E5851] leading-relaxed">{finding.expected}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#B91C1C]">Actual Behavior</div>
                      <p className="text-xs text-[#5E5851] leading-relaxed">{finding.actual}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[#EFECE6]">
                    <div className="text-xs font-semibold text-[#181615]">Steps to Reproduce</div>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-[#5E5851]">
                      {finding.reproductionSteps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>
                    {finding.evidence && (
                      <div className="pt-1 text-xs font-mono text-[#5E5851]">
                        Trace: {finding.evidence}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Network 4xx/5xx Table */}
      {diagnosticTab === 'network' && (
        <div className="bg-white border border-[#E8E3DC] rounded-xl overflow-hidden">
          {run.networkFailures.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#5E5851]">
              Zero failed HTTP requests (4xx/5xx) recorded during this run.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F5] border-b border-[#E8E3DC] text-[#5E5851]">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Step</th>
                    <th className="py-2.5 px-4 font-medium">Method</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] font-mono">
                  {run.networkFailures.map((nf, idx) => (
                    <tr key={idx} className="hover:bg-[#FAF8F5]">
                      <td className="py-2.5 px-4 tabular-nums">#{nf.stepNumber}</td>
                      <td className="py-2.5 px-4 font-medium">{nf.method}</td>
                      <td className={`py-2.5 px-4 tabular-nums font-semibold ${nf.status >= 500 ? 'text-[#B91C1C]' : 'text-[#A16207]'}`}>
                        {nf.status} {nf.statusText}
                      </td>
                      <td className="py-2.5 px-4 text-[#5E5851] break-all">{nf.url}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Console Errors Table */}
      {diagnosticTab === 'console' && (
        <div className="bg-white border border-[#E8E3DC] rounded-xl overflow-hidden">
          {run.consoleErrors.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#5E5851]">
              Zero console errors or uncaught exceptions recorded during this run.
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6]">
              {run.consoleErrors.map((ce, idx) => (
                <div key={idx} className="p-4 flex items-start gap-3 text-xs">
                  <AlertCircle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    <div className="font-mono text-[#181615] font-medium">
                      [{ce.type}] · Step #{ce.stepNumber}
                    </div>
                    <div className="font-mono text-[#5E5851] break-all">{ce.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
