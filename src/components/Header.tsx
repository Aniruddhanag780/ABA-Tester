import React from 'react';

export type ActiveTab = 'runner' | 'report' | 'history';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onNewRun: () => void;
  hasActiveReport: boolean;
}

export function Header({ activeTab, onSelectTab, onNewRun, hasActiveReport }: HeaderProps) {
  return (
    <header className="border-b border-[#E8E3DC] bg-[#FAF8F5]/95 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('runner');
          }}
          className="font-display text-lg font-bold tracking-tight text-[#181615] whitespace-nowrap shrink-0"
        >
          Veriflow
        </a>

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => onSelectTab('runner')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'runner'
                ? 'border-[#181615] text-[#181615]'
                : 'border-transparent text-[#5E5851] hover:text-[#181615]'
            }`}
          >
            Test Runner
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('report')}
            disabled={!hasActiveReport}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'report'
                ? 'border-[#181615] text-[#181615]'
                : !hasActiveReport
                  ? 'border-transparent text-[#A8A198] cursor-not-allowed'
                  : 'border-transparent text-[#5E5851] hover:text-[#181615]'
            }`}
          >
            Bug Report
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('history')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'history'
                ? 'border-[#181615] text-[#181615]'
                : 'border-transparent text-[#5E5851] hover:text-[#181615]'
            }`}
          >
            Run History
          </button>
          <a
            href="/demo-store"
            target="_blank"
            rel="noreferrer"
            className="py-1 text-[#5E5851] hover:text-[#181615] transition-colors whitespace-nowrap shrink-0 border-b-2 border-transparent"
          >
            Demo Storefront
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onNewRun}
            className="px-4 py-2 text-xs font-medium bg-[#181615] text-[#FAF8F5] rounded-lg hover:bg-[#2F2B28] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#181615]"
          >
            New QA Run
          </button>
        </div>
      </div>

      {/* Mobile navigation row */}
      <nav aria-label="Mobile navigation" className="flex md:hidden items-center gap-4 px-6 pb-3 text-xs font-medium overflow-x-auto">
        <button
          type="button"
          onClick={() => onSelectTab('runner')}
          className={`whitespace-nowrap shrink-0 pb-1 border-b-2 ${
            activeTab === 'runner' ? 'border-[#181615] text-[#181615]' : 'border-transparent text-[#5E5851]'
          }`}
        >
          Test Runner
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('report')}
          disabled={!hasActiveReport}
          className={`whitespace-nowrap shrink-0 pb-1 border-b-2 ${
            activeTab === 'report' ? 'border-[#181615] text-[#181615]' : 'border-transparent text-[#5E5851]'
          }`}
        >
          Bug Report
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('history')}
          className={`whitespace-nowrap shrink-0 pb-1 border-b-2 ${
            activeTab === 'history' ? 'border-[#181615] text-[#181615]' : 'border-transparent text-[#5E5851]'
          }`}
        >
          Run History
        </button>
        <a href="/demo-store" target="_blank" rel="noreferrer" className="whitespace-nowrap shrink-0 pb-1 text-[#5E5851]">
          Demo Storefront
        </a>
      </nav>
    </header>
  );
}
