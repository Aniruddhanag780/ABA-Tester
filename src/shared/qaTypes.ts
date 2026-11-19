export type AttackSuiteId =
  | 'auth_otp'
  | 'cart_abuse'
  | 'double_click'
  | 'checkout_tricks'
  | 'health_audit'
  | 'chaos_resilience';

export type QaEngineMode = 'ai_vision' | 'deterministic';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export type RunStatus = 'queued' | 'running' | 'completed' | 'stopped' | 'error';

export type AgentActionType =
  | 'navigate'
  | 'click'
  | 'dblclick'
  | 'rapid_click'
  | 'fill'
  | 'press'
  | 'scroll'
  | 'resize'
  | 'check_dom'
  | 'finish';

export interface QaRunConfig {
  targetUrl: string;
  authMethod: 'phone_otp';
  masterOtp: string;
  testPhone: string;
  testName: string;
  engineMode: QaEngineMode;
  suites: AttackSuiteId[];
  maxSteps: number;
}

export interface QaStepLog {
  stepNumber: number;
  timestamp: string;
  phase: AttackSuiteId | 'setup' | 'teardown';
  action: AgentActionType;
  target: string;
  value?: string;
  thought: string;
  outcome: 'ok' | 'warning' | 'error';
  detail: string;
  url: string;
  screenshotUrl?: string;
  durationMs: number;
}

export interface QaFinding {
  id: string;
  title: string;
  severity: SeverityLevel;
  category: AttackSuiteId;
  expected: string;
  actual: string;
  reproductionSteps: string[];
  evidence?: string;
  screenshotUrl?: string;
  url: string;
  detectedAtStep: number;
}

export interface QaNetworkFailure {
  timestamp: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  stepNumber: number;
}

export interface QaConsoleError {
  timestamp: string;
  type: 'console.error' | 'pageerror';
  message: string;
  stepNumber: number;
}

export interface QaBrokenAsset {
  url: string;
  tagName: 'img' | 'a';
  text: string;
  reason: string;
  pageUrl: string;
  stepNumber: number;
}

export interface QaRunSummary {
  totalSteps: number;
  totalBugs: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  networkFailuresCount: number;
  consoleErrorsCount: number;
  brokenAssetsCount: number;
  durationMs: number;
}

export interface QaRunState {
  id: string;
  createdAt: string;
  completedAt?: string;
  status: RunStatus;
  errorMessage?: string;
  config: QaRunConfig;
  currentStep: number;
  latestScreenshotUrl?: string;
  steps: QaStepLog[];
  findings: QaFinding[];
  networkFailures: QaNetworkFailure[];
  consoleErrors: QaConsoleError[];
  brokenAssets: QaBrokenAsset[];
  summary: QaRunSummary;
}

export interface AgentReportedFinding {
  title: string;
  severity: SeverityLevel;
  category: AttackSuiteId;
  expected: string;
  actual: string;
  reproductionSteps: string[];
}

export interface AgentDecision {
  thought: string;
  phase: AttackSuiteId;
  action: AgentActionType;
  selector?: string;
  targetText?: string;
  value?: string;
  viewport?: { width: number; height: number };
  finding?: AgentReportedFinding;
}

export interface AttackSuiteMeta {
  id: AttackSuiteId;
  label: string;
  description: string;
}

export const ATTACK_SUITES: AttackSuiteMeta[] = [
  {
    id: 'auth_otp',
    label: 'Signup & Phone OTP Edge Cases',
    description: 'Registers a fresh test user, tests invalid phones, wrong OTP rejection, and master OTP login.',
  },
  {
    id: 'cart_abuse',
    label: 'Cart & Quantity Abuse',
    description: 'Attempts negative quantities, zero qty, extreme numbers, and rapid add/remove state checks.',
  },
  {
    id: 'double_click',
    label: 'Double & Rapid Click Stress',
    description: 'Rapidly double-clicks Add to Cart, Buy Now, Place Order, and Pay to catch duplicate submissions.',
  },
  {
    id: 'checkout_tricks',
    label: 'Checkout & Promo Validation',
    description: 'Tests empty-cart checkout, invalid/edge coupon codes, missing address validation, and total math.',
  },
  {
    id: 'health_audit',
    label: 'Console, 4xx/5xx & Broken Assets',
    description: 'Monitors uncaught JS exceptions, failed API responses, broken images, and dead links.',
  },
  {
    id: 'chaos_resilience',
    label: 'Responsive & Boundary Chaos',
    description: 'Tests 390px mobile layout overflow, back-button state loss, and long/unicode form strings.',
  },
];
