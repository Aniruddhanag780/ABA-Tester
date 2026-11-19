import React from 'react';
import { Play, Square, RefreshCw, AlertCircle } from 'lucide-react';
import { ATTACK_SUITES } from '../shared/qaTypes';
import type { AttackSuiteId, QaEngineMode, QaRunConfig } from '../shared/qaTypes';

interface RunConfigPanelProps {
  config: QaRunConfig;
  onChange: (next: QaRunConfig) => void;
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  isSubmitting: boolean;
  formError: string | null;
  geminiConfigured: boolean;
}

export function RunConfigPanel({
  config,
  onChange,
  onStart,
  onStop,
  isRunning,
  isSubmitting,
  formError,
  geminiConfigured,
}: RunConfigPanelProps) {
  const toggleSuite = (id: AttackSuiteId) => {
    const exists = config.suites.includes(id);
    const nextSuites = exists
      ? config.suites.filter((s) => s !== id)
      : [...config.suites, id];
    onChange({ ...config, suites: nextSuites });
  };

  const fillDemoStore = () => {
    const origin = window.location.origin;
    onChange({
      ...config,
      targetUrl: `${origin}/demo-store`,
      masterOtp: '123456',
    });
  };

  const regeneratePhone = () => {
    const seven = String(Math.floor(1000000 + Math.random() * 8999999));
    onChange({ ...config, testPhone: `555${seven}` });
  };

  return (
    <aside className="bg-white border border-[#E8E3DC] rounded-xl p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-base font-semibold text-[#181615]">
          Target & Auth Setup
        </h2>
        <p className="text-xs text-[#5E5851] leading-relaxed">
          Point the headless Chromium agent at your staging or local storefront. It creates a fresh account, verifies Phone + OTP, and probes checkout rules.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isRunning) onStart();
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="target-url" className="text-xs font-medium text-[#181615]">
              Target E-Commerce URL
            </label>
            <button
              type="button"
              onClick={fillDemoStore}
              disabled={isRunning}
              className="text-xs font-medium text-[#1D4ED8] hover:underline disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Use Built-in Demo Store
            </button>
          </div>
          <input
            id="target-url"
            type="text"
            value={config.targetUrl}
            onChange={(e) => onChange({ ...config, targetUrl: e.target.value })}
            disabled={isRunning}
            placeholder="https://staging.yourshop.com"
            className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#FAF8F5] border border-[#E8E3DC] rounded-lg text-[#181615] placeholder:text-[#A8A198] focus:outline-none focus:border-[#181615] disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="test-phone" className="text-xs font-medium text-[#181615]">
                Synthetic User Phone
              </label>
              <button
                type="button"
                onClick={regeneratePhone}
                disabled={isRunning}
                aria-label="Generate new test phone number"
                className="text-[#5E5851] hover:text-[#181615] p-0.5 rounded disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              id="test-phone"
              type="text"
              value={config.testPhone}
              onChange={(e) => onChange({ ...config, testPhone: e.target.value })}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8E3DC] rounded-lg text-[#181615] focus:outline-none focus:border-[#181615] disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="master-otp" className="text-xs font-medium text-[#181615] block">
              Master OTP
            </label>
            <input
              id="master-otp"
              type="text"
              value={config.masterOtp}
              onChange={(e) => onChange({ ...config, masterOtp: e.target.value })}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8E3DC] rounded-lg text-[#181615] focus:outline-none focus:border-[#181615] disabled:opacity-60"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label htmlFor="test-name" className="text-xs font-medium text-[#181615] block">
              Test User Name
            </label>
            <input
              id="test-name"
              type="text"
              value={config.testName}
              onChange={(e) => onChange({ ...config, testName: e.target.value })}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm bg-[#FAF8F5] border border-[#E8E3DC] rounded-lg text-[#181615] focus:outline-none focus:border-[#181615] disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="max-steps" className="text-xs font-medium text-[#181615] block">
              Max Browser Steps
            </label>
            <select
              id="max-steps"
              value={config.maxSteps}
              onChange={(e) => onChange({ ...config, maxSteps: Number(e.target.value) })}
              disabled={isRunning}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAF8F5] border border-[#E8E3DC] rounded-lg text-[#181615] focus:outline-none focus:border-[#181615] disabled:opacity-60"
            >
              <option value={8}>8 steps</option>
              <option value={14}>14 steps</option>
              <option value={20}>20 steps</option>
              <option value={25}>25 steps</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-[#181615] block">
            Execution Engine
          </span>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F4F0EA] rounded-lg">
            {(
              [
                { id: 'ai_vision', label: 'AI Vision Agent' },
                { id: 'deterministic', label: 'Playwright Suite' },
              ] as Array<{ id: QaEngineMode; label: string }>
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                disabled={isRunning}
                onClick={() => onChange({ ...config, engineMode: mode.id })}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  config.engineMode === mode.id
                    ? 'bg-white text-[#181615] shadow-xs'
                    : 'text-[#5E5851] hover:text-[#181615]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {config.engineMode === 'ai_vision' && !geminiConfigured && (
            <p className="text-xs text-[#A16207] leading-relaxed">
              Server `GEMINI_API_KEY` is unset. Switch to Playwright Suite to run without an API key, or configure the secret.
            </p>
          )}
        </div>

        <div className="space-y-2.5 pt-1 border-t border-[#E8E3DC]">
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-medium text-[#181615]">
              QA Test Suites
            </span>
            <span className="text-xs font-mono tabular-nums text-[#8B847B]">
              {config.suites.length} / {ATTACK_SUITES.length} active
            </span>
          </div>
          <div className="space-y-2">
            {ATTACK_SUITES.map((suite) => {
              const checked = config.suites.includes(suite.id);
              return (
                <label
                  key={suite.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-[#FAF8F5] border-[#D5CEC4]'
                      : 'bg-white border-[#EFECE6] opacity-75 hover:opacity-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isRunning}
                    onChange={() => toggleSuite(suite.id)}
                    className="mt-0.5 rounded border-[#C8C0B4] text-[#181615] focus:ring-[#181615]"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#181615]">{suite.label}</div>
                    <div className="text-[11px] text-[#5E5851] leading-snug mt-0.5">
                      {suite.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <div className="pt-1">
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-medium bg-[#B91C1C] text-white rounded-lg hover:bg-[#991B1B] transition-colors whitespace-nowrap"
            >
              <Square className="w-4 h-4" />
              Stop QA Run
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <Play className="w-4 h-4" />
              {isSubmitting ? 'Launching Chromium...' : 'Start QA Run'}
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
