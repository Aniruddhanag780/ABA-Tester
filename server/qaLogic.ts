import type {
  AgentActionType,
  AgentDecision,
  AttackSuiteId,
  QaFinding,
  QaRunConfig,
  QaRunState,
  QaRunSummary,
  SeverityLevel,
} from '../src/shared/qaTypes.ts';

const VALID_SUITES: ReadonlySet<string> = new Set<AttackSuiteId>([
  'auth_otp',
  'cart_abuse',
  'double_click',
  'checkout_tricks',
  'health_audit',
  'chaos_resilience',
]);

const VALID_ACTIONS: ReadonlySet<string> = new Set<AgentActionType>([
  'navigate',
  'click',
  'dblclick',
  'rapid_click',
  'fill',
  'press',
  'scroll',
  'resize',
  'check_dom',
  'finish',
]);

const VALID_SEVERITIES: ReadonlySet<string> = new Set<SeverityLevel>([
  'critical',
  'high',
  'medium',
  'low',
]);

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.goog',
  '0.0.0.0',
]);

export function validateTargetUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'Target URL is required.' };
  }

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
    if (candidate.includes(':') && !candidate.startsWith('localhost')) {
      return { valid: false, error: 'Only http:// and https:// URLs are supported.' };
    }
    candidate = `http://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, error: 'Enter a valid web URL (e.g. https://shop.example.com).' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http:// and https:// URLs are supported.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.startsWith('169.254.')) {
    return { valid: false, error: 'This target host is not permitted for QA testing.' };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

export function validateRunConfig(input: Partial<QaRunConfig>): {
  valid: boolean;
  config?: QaRunConfig;
  error?: string;
} {
  const urlCheck = validateTargetUrl(input.targetUrl ?? '');
  if (!urlCheck.valid || !urlCheck.normalizedUrl) {
    return { valid: false, error: urlCheck.error };
  }

  const masterOtp = (input.masterOtp ?? '123456').trim();
  if (!masterOtp || masterOtp.length > 12) {
    return { valid: false, error: 'Master OTP must be between 1 and 12 characters.' };
  }

  const testPhone = (input.testPhone ?? generateTestPhone()).trim();
  if (!testPhone || testPhone.replace(/\D/g, '').length < 7) {
    return { valid: false, error: 'Provide a valid test phone number (at least 7 digits).' };
  }

  const suites = (input.suites ?? []).filter((s): s is AttackSuiteId => VALID_SUITES.has(s));
  if (suites.length === 0) {
    return { valid: false, error: 'Select at least one QA test suite.' };
  }

  const maxStepsRaw = Number(input.maxSteps ?? 14);
  const maxSteps = Number.isFinite(maxStepsRaw)
    ? Math.max(4, Math.min(25, Math.round(maxStepsRaw)))
    : 14;

  const engineMode = input.engineMode === 'deterministic' ? 'deterministic' : 'ai_vision';

  return {
    valid: true,
    config: {
      targetUrl: urlCheck.normalizedUrl,
      authMethod: 'phone_otp',
      masterOtp,
      testPhone,
      testName: (input.testName ?? 'QA Tester').trim() || 'QA Tester',
      engineMode,
      suites,
      maxSteps,
    },
  };
}

export function generateTestPhone(seed?: number): string {
  const n = seed !== undefined ? Math.abs(Math.floor(seed)) : Math.floor(1000000 + Math.random() * 8999999);
  const seven = String(n).padStart(7, '0').slice(0, 7);
  return `555${seven}`;
}

export function parseAgentDecision(rawJson: string): AgentDecision {
  const cleaned = rawJson
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {
      thought: 'Model returned malformed JSON; inspecting current DOM state safely.',
      phase: 'health_audit',
      action: 'check_dom',
    };
  }

  const phase: AttackSuiteId = VALID_SUITES.has(String(parsed.phase))
    ? (parsed.phase as AttackSuiteId)
    : 'health_audit';
  const action: AgentActionType = VALID_ACTIONS.has(String(parsed.action))
    ? (parsed.action as AgentActionType)
    : 'check_dom';

  const decision: AgentDecision = {
    thought: typeof parsed.thought === 'string' && parsed.thought.trim()
      ? parsed.thought.trim()
      : 'Inspecting storefront behavior.',
    phase,
    action,
    selector: typeof parsed.selector === 'string' && parsed.selector.trim() ? parsed.selector.trim() : undefined,
    targetText: typeof parsed.targetText === 'string' && parsed.targetText.trim() ? parsed.targetText.trim() : undefined,
    value: typeof parsed.value === 'string' ? parsed.value : undefined,
  };

  if (parsed.viewport && typeof parsed.viewport === 'object') {
    const vp = parsed.viewport as Record<string, unknown>;
    const w = Number(vp.width);
    const h = Number(vp.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w >= 320 && h >= 480) {
      decision.viewport = { width: Math.round(w), height: Math.round(h) };
    }
  }

  if (parsed.finding && typeof parsed.finding === 'object') {
    const f = parsed.finding as Record<string, unknown>;
    const title = typeof f.title === 'string' ? f.title.trim() : '';
    const actual = typeof f.actual === 'string' ? f.actual.trim() : '';
    if (title && actual) {
      const severity: SeverityLevel = VALID_SEVERITIES.has(String(f.severity))
        ? (f.severity as SeverityLevel)
        : 'medium';
      const category: AttackSuiteId = VALID_SUITES.has(String(f.category))
        ? (f.category as AttackSuiteId)
        : phase;
      const steps = Array.isArray(f.reproductionSteps)
        ? f.reproductionSteps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
      decision.finding = {
        title,
        severity,
        category,
        expected: typeof f.expected === 'string' && f.expected.trim() ? f.expected.trim() : 'Expected strict validation and safe state transition.',
        actual,
        reproductionSteps: steps.length > 0 ? steps : ['Open storefront and perform the recorded QA step.'],
      };
    }
  }

  return decision;
}

export function sortFindingsBySeverity(findings: QaFinding[]): QaFinding[] {
  return [...findings].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return a.detectedAtStep - b.detectedAtStep;
  });
}

export function deduplicateFindings(findings: QaFinding[]): QaFinding[] {
  const seen = new Map<string, QaFinding>();
  for (const item of findings) {
    const key = `${item.category}::${item.title.toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else if (SEVERITY_RANK[item.severity] < SEVERITY_RANK[existing.severity]) {
      seen.set(key, item);
    }
  }
  return sortFindingsBySeverity(Array.from(seen.values()));
}

export function computeRunSummary(run: Pick<QaRunState, 'steps' | 'findings' | 'networkFailures' | 'consoleErrors' | 'brokenAssets' | 'createdAt' | 'completedAt'>): QaRunSummary {
  const deduped = deduplicateFindings(run.findings);
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const f of deduped) {
    if (f.severity === 'critical') criticalCount++;
    else if (f.severity === 'high') highCount++;
    else if (f.severity === 'medium') mediumCount++;
    else lowCount++;
  }

  const startMs = Date.parse(run.createdAt) || Date.now();
  const endMs = run.completedAt ? (Date.parse(run.completedAt) || Date.now()) : Date.now();

  return {
    totalSteps: run.steps.length,
    totalBugs: deduped.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    networkFailuresCount: run.networkFailures.length,
    consoleErrorsCount: run.consoleErrors.length,
    brokenAssetsCount: run.brokenAssets.length,
    durationMs: Math.max(0, endMs - startMs),
  };
}

export function buildMarkdownReport(run: QaRunState): string {
  const sorted = deduplicateFindings(run.findings);
  const lines: string[] = [
    `# Veriflow QA Bug Report`,
    ``,
    `- **Target URL**: ${run.config.targetUrl}`,
    `- **Run ID**: ${run.id}`,
    `- **Status**: ${run.status}`,
    `- **Engine**: ${run.config.engineMode === 'ai_vision' ? 'AI Vision + Playwright' : 'Deterministic Playwright'}`,
    `- **Test Account**: ${run.config.testPhone} (Master OTP: ${run.config.masterOtp})`,
    `- **Executed**: ${run.createdAt}`,
    `- **Total Steps**: ${run.summary.totalSteps}`,
    `- **Total Findings**: ${sorted.length} (${run.summary.criticalCount} Critical, ${run.summary.highCount} High, ${run.summary.mediumCount} Medium, ${run.summary.lowCount} Low)`,
    `- **Failed Network Requests (4xx/5xx)**: ${run.networkFailures.length}`,
    `- **Console / Runtime Errors**: ${run.consoleErrors.length}`,
    `- **Broken Assets**: ${run.brokenAssets.length}`,
    ``,
    `## Findings`,
    ``,
  ];

  if (sorted.length === 0) {
    lines.push(`No defects were recorded during this run.`);
  } else {
    sorted.forEach((f, idx) => {
      lines.push(`### ${idx + 1}. [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`- **Category**: ${f.category}`);
      lines.push(`- **Page URL**: ${f.url}`);
      lines.push(`- **Detected at Step**: ${f.detectedAtStep}`);
      lines.push(`- **Expected**: ${f.expected}`);
      lines.push(`- **Actual**: ${f.actual}`);
      if (f.evidence) {
        lines.push(`- **Evidence**: \`${f.evidence}\``);
      }
      lines.push(`- **Steps to Reproduce**:`);
      f.reproductionSteps.forEach((step, sIdx) => {
        lines.push(`  ${sIdx + 1}. ${step}`);
      });
      lines.push(``);
    });
  }

  if (run.networkFailures.length > 0) {
    lines.push(`## Failed Network Requests`);
    lines.push(``);
    run.networkFailures.slice(0, 25).forEach((nf) => {
      lines.push(`- \`${nf.method} ${nf.url}\` -> **${nf.status} ${nf.statusText}** (Step ${nf.stepNumber})`);
    });
    lines.push(``);
  }

  if (run.consoleErrors.length > 0) {
    lines.push(`## Console & Runtime Errors`);
    lines.push(``);
    run.consoleErrors.slice(0, 25).forEach((ce) => {
      lines.push(`- [${ce.type}] ${ce.message} (Step ${ce.stepNumber})`);
    });
    lines.push(``);
  }

  return lines.join('\n');
}
