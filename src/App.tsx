import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Header } from './components/Header';
import type { ActiveTab } from './components/Header';
import { RunConfigPanel } from './components/RunConfigPanel';
import { LiveRunnerView } from './components/LiveRunnerView';
import { BugReportView } from './components/BugReportView';
import { RunHistoryView } from './components/RunHistoryView';
import { DemoStorefront } from './components/DemoStorefront';
import type { QaRunConfig, QaRunState } from './shared/qaTypes';

function defaultConfig(): QaRunConfig {
  const seven = String(Math.floor(1000000 + Math.random() * 8999999));
  return {
    targetUrl: '',
    authMethod: 'phone_otp',
    masterOtp: '123456',
    testPhone: `555${seven}`,
    testName: 'QA Verifier',
    engineMode: 'ai_vision',
    suites: [
      'auth_otp',
      'cart_abuse',
      'double_click',
      'checkout_tricks',
      'health_audit',
      'chaos_resilience',
    ],
    maxSteps: 14,
  };
}

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/demo-store')) {
    return <DemoStorefront />;
  }

  return <VeriflowConsole />;
}

function VeriflowConsole() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('runner');
  const [config, setConfig] = useState<QaRunConfig>(defaultConfig);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(true);
  const [runs, setRuns] = useState<QaRunState[]>([]);
  const [currentRun, setCurrentRun] = useState<QaRunState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      // ignore transient poll error
    }
  };

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        const hasKey = Boolean(d.geminiConfigured);
        setGeminiConfigured(hasKey);
        if (!hasKey) {
          setConfig((prev) => ({ ...prev, engineMode: 'deterministic' }));
        }
      })
      .catch(() => {});

    void loadHistory();

    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const connectStream = (runId: string) => {
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/runs/${runId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data) as QaRunState;
        setCurrentRun(updated);
        setRuns((prev) => {
          const exists = prev.some((r) => r.id === updated.id);
          return exists
            ? prev.map((r) => (r.id === updated.id ? updated : r))
            : [updated, ...prev];
        });
        if (updated.status === 'completed' || updated.status === 'stopped' || updated.status === 'error') {
          es.close();
          void loadHistory();
        }
      } catch {
        // ignore parse failure
      }
    };

    es.onerror = () => {
      es.close();
    };
  };

  const launchRun = async (overrideConfig?: QaRunConfig) => {
    const payload = overrideConfig ?? config;
    if (!payload.targetUrl.trim()) {
      setFormError('Target URL is required.');
      return;
    }
    if (payload.suites.length === 0) {
      setFormError('Select at least one QA test suite.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Unable to start QA run.');
        return;
      }
      const created = data.run as QaRunState;
      setCurrentRun(created);
      setActiveTab('runner');
      connectStream(created.id);
    } catch {
      setFormError('Network error while connecting to QA runner server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopRun = async () => {
    if (!currentRun) return;
    await fetch(`/api/runs/${currentRun.id}/stop`, { method: 'POST' });
    eventSourceRef.current?.close();
    void loadHistory();
  };

  const handleDeleteRun = async (runId: string) => {
    await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
    setRuns((prev) => prev.filter((r) => r.id !== runId));
    if (currentRun?.id === runId) {
      setCurrentRun(null);
      setActiveTab('history');
    }
  };

  const handleQuickStartDemo = () => {
    const demoConfig: QaRunConfig = {
      ...config,
      targetUrl: `${window.location.origin}/demo-store`,
      masterOtp: '123456',
    };
    setConfig(demoConfig);
    void launchRun(demoConfig);
  };

  const isRunning =
    currentRun?.status === 'running' || currentRun?.status === 'queued';

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#181615] flex flex-col">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hasActiveReport={Boolean(currentRun)}
        onNewRun={() => {
          setActiveTab('runner');
          if (!isRunning) {
            setCurrentRun(null);
            setFormError(null);
          }
        }}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
        {activeTab === 'runner' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4">
              <RunConfigPanel
                config={config}
                onChange={setConfig}
                onStart={() => void launchRun()}
                onStop={() => void handleStopRun()}
                isRunning={Boolean(isRunning)}
                isSubmitting={isSubmitting}
                formError={formError}
                geminiConfigured={geminiConfigured}
              />
            </div>
            <div className="lg:col-span-8">
              <LiveRunnerView
                run={currentRun}
                onInspectScreenshot={(url, caption) => setLightbox({ url, caption })}
                onViewReport={() => setActiveTab('report')}
                onQuickStartDemo={handleQuickStartDemo}
              />
            </div>
          </div>
        )}

        {activeTab === 'report' && currentRun && (
          <BugReportView
            run={currentRun}
            onBackToRunner={() => setActiveTab('runner')}
            onInspectScreenshot={(url, caption) => setLightbox({ url, caption })}
          />
        )}

        {activeTab === 'history' && (
          <RunHistoryView
            runs={runs}
            onOpenRun={(run) => {
              setCurrentRun(run);
              setActiveTab('report');
            }}
            onDeleteRun={(id) => void handleDeleteRun(id)}
            onStartNew={() => {
              setCurrentRun(null);
              setActiveTab('runner');
            }}
          />
        )}
      </main>

      {/* Screenshot Lightbox Modal */}
      {lightbox && (
        <div
          role="dialog"
          aria-label="Screenshot inspection"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-white border border-[#E8E3DC] rounded-xl max-w-5xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#E8E3DC] flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-[#181615] truncate">{lightbox.caption}</span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                aria-label="Close screenshot modal"
                className="p-1 text-[#5E5851] hover:text-[#181615]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-[#F4F0EA] max-h-[80vh] overflow-auto flex items-center justify-center p-2">
              <img
                src={lightbox.url}
                alt={lightbox.caption}
                className="max-w-full h-auto rounded"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
