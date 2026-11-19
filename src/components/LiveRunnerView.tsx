import React from 'react';
import { Loader2, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Eye } from 'lucide-react';
import type { QaRunState } from '../shared/qaTypes';

interface LiveRunnerViewProps {
  run: QaRunState | null;
  onInspectScreenshot: (url: string, caption: string) => void;
  onViewReport: () => void;
  onQuickStartDemo: () => void;
}

export function LiveRunnerView({
  run,
  onInspectScreenshot,
  onViewReport,
  onQuickStartDemo,
}: LiveRunnerViewProps) {
  if (!run) {
    return (
      <section className="bg-white border border-[#E8E3DC] rounded-xl p-8 lg:p-12 flex flex-col justify-between min-h-[560px]">
        <div className="max-w-2xl space-y-5">
          <div className="text-xs font-medium text-[#5E5851]">
            Playwright Chromium · Phone + OTP Automation · Live Screenshots
          </div>
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-[#181615] text-balance">
            Autonomous QA that shops, clicks twice, and tries to break your checkout.
          </h1>
          <p className="text-[15px] text-[#5E5851] leading-relaxed">
            Configure your target e-commerce URL on the left or launch a live test against the built-in sandbox storefront. Veriflow creates a synthetic user, verifies the master OTP, tests cart boundaries, rapid-clicks checkout actions, and captures every failure with screenshots and reproduction steps.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onQuickStartDemo}
              className="px-5 py-2.5 text-sm font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] transition-colors whitespace-nowrap"
            >
              Run Live Demo Store Audit
            </button>
            <a
              href="/demo-store"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 text-sm font-medium border border-[#E8E3DC] text-[#181615] rounded-lg hover:bg-[#FAF8F5] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              Preview Demo Storefront
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10 mt-10 border-t border-[#E8E3DC]">
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-[#181615]">01. Account & Master OTP</h3>
            <p className="text-xs text-[#5E5851] leading-relaxed">
              Registers a fresh phone number, probes short/invalid phone guards, then authenticates with your master OTP (default 123456).
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-[#181615]">02. Cart & Rapid-Click Stress</h3>
            <p className="text-xs text-[#5E5851] leading-relaxed">
              Attempts negative and zero quantities, invalid promo codes, and rapid double-clicks on Place Order to catch duplicate charges.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-[#181615]">03. Screenshot Bug Report</h3>
            <p className="text-xs text-[#5E5851] leading-relaxed">
              Captures console errors, 4xx/5xx responses, broken images, and mobile overflow into an exportable severity-ranked report.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const isRunning = run.status === 'running' || run.status === 'queued';

  return (
    <section className="space-y-5">
      {/* Run Status Bar */}
      <div className="bg-white border border-[#E8E3DC] rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-[#181615]">
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#1D4ED8] shrink-0" />
            ) : run.status === 'error' ? (
              <XCircle className="w-4 h-4 text-[#B91C1C] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
            )}
            <span>
              {isRunning
                ? `Executing Step ${run.currentStep} of ${run.config.maxSteps}`
                : run.status === 'completed'
                  ? 'QA Run Completed'
                  : run.status === 'stopped'
                    ? 'QA Run Stopped'
                    : 'QA Run Failed'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E5851] font-mono">
            <span className="truncate max-w-[360px]">{run.config.targetUrl}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{run.summary.totalSteps} steps</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{run.summary.totalBugs} bugs</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{run.summary.networkFailuresCount} HTTP errors</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onViewReport}
            className="px-4 py-2 text-xs font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] transition-colors whitespace-nowrap"
          >
            Open Bug Report ({run.summary.totalBugs})
          </button>
        </div>
      </div>

      {run.errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#B91C1C] flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Runner Error</div>
            <div className="text-xs mt-0.5">{run.errorMessage}</div>
          </div>
        </div>
      )}

      {/* Live Viewport + Step Log */}
      <div className="space-y-5">
        {/* Live Browser Frame */}
        <div className="bg-white border border-[#E8E3DC] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#E8E3DC] bg-[#FAF8F5] flex items-center justify-between gap-3">
            <div className="text-xs font-mono text-[#5E5851] truncate">
              {run.steps[run.steps.length - 1]?.url || run.config.targetUrl}
            </div>
            {run.latestScreenshotUrl && (
              <button
                type="button"
                onClick={() =>
                  onInspectScreenshot(
                    run.latestScreenshotUrl!,
                    `Step ${run.currentStep} — ${run.steps[run.steps.length - 1]?.action || 'Viewport'}`
                  )
                }
                className="text-xs font-medium text-[#181615] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                Enlarge
              </button>
            )}
          </div>
          <div className="aspect-[16/10] max-h-[460px] w-full bg-[#F4F0EA] flex items-center justify-center relative">
            {run.latestScreenshotUrl ? (
              <img
                src={run.latestScreenshotUrl}
                alt={`Live Playwright browser capture at step ${run.currentStep}`}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-center px-6 py-12 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#5E5851] mx-auto" />
                <p className="text-xs text-[#5E5851]">
                  Waiting for first Chromium frame...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step-by-Step Timeline */}
        <div className="bg-white border border-[#E8E3DC] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E8E3DC] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#181615]">
              Live Step-by-Step Execution Log
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#8B847B]">
              {run.steps.length} events
            </span>
          </div>
          <div className="divide-y divide-[#EFECE6] max-h-[460px] overflow-y-auto">
            {run.steps.length === 0 ? (
              <div className="p-6 text-xs text-[#5E5851]">
                Initializing Chromium session and attaching console/network listeners...
              </div>
            ) : (
              [...run.steps].reverse().map((step) => (
                <div key={step.stepNumber} className="p-3.5 space-y-2 hover:bg-[#FAF8F5] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono tabular-nums font-medium text-[#181615]">
                          #{String(step.stepNumber).padStart(2, '0')}
                        </span>
                        <span className="font-mono text-[#5E5851]">{step.action}</span>
                        <span aria-hidden="true" className="text-[#C8C0B4]">·</span>
                        <span
                          className={
                            step.outcome === 'error'
                              ? 'text-[#B91C1C] font-medium'
                              : step.outcome === 'warning'
                                ? 'text-[#A16207] font-medium'
                                : 'text-[#15803D] font-medium'
                          }
                        >
                          {step.outcome === 'error' ? 'Defect' : step.outcome === 'warning' ? 'Warning' : 'OK'}
                        </span>
                      </div>
                      <p className="text-xs text-[#181615] font-medium leading-snug">
                        {step.detail}
                      </p>
                      <p className="text-[11px] text-[#5E5851] leading-snug">
                        {step.thought}
                      </p>
                    </div>

                    {step.screenshotUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          onInspectScreenshot(
                            step.screenshotUrl!,
                            `Step #${step.stepNumber}: ${step.detail}`
                          )
                        }
                        aria-label={`Inspect screenshot for step ${step.stepNumber}`}
                        className="w-16 h-11 rounded border border-[#E8E3DC] overflow-hidden shrink-0 bg-[#F4F0EA] hover:border-[#181615] transition-colors"
                      >
                        <img
                          src={step.screenshotUrl}
                          alt={`Step ${step.stepNumber} thumbnail`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
