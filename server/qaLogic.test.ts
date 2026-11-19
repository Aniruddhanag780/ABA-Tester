import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarkdownReport,
  computeRunSummary,
  deduplicateFindings,
  generateTestPhone,
  parseAgentDecision,
  validateRunConfig,
  validateTargetUrl,
} from './qaLogic.ts';
import type { QaFinding, QaRunState } from '../src/shared/qaTypes.ts';

test('validateTargetUrl accepts valid http/https and localhost URLs', () => {
  const local = validateTargetUrl('http://localhost:3000/demo-store');
  assert.equal(local.valid, true);
  assert.equal(local.normalizedUrl, 'http://localhost:3000/demo-store');

  const bare = validateTargetUrl('shop.example.com');
  assert.equal(bare.valid, true);
  assert.equal(bare.normalizedUrl, 'http://shop.example.com/');
});

test('validateTargetUrl blocks empty, non-http protocols, and cloud metadata IPs', () => {
  assert.equal(validateTargetUrl('').valid, false);
  assert.equal(validateTargetUrl('javascript:alert(1)').valid, false);
  assert.equal(validateTargetUrl('file:///etc/passwd').valid, false);
  assert.equal(validateTargetUrl('http://169.254.169.254/latest/meta-data').valid, false);
});

test('validateRunConfig enforces OTP, phone, and suite bounds', () => {
  const bad = validateRunConfig({ targetUrl: 'http://localhost:3000/demo-store', suites: [] });
  assert.equal(bad.valid, false);

  const ok = validateRunConfig({
    targetUrl: 'http://localhost:3000/demo-store',
    masterOtp: '123456',
    testPhone: '5551234567',
    suites: ['auth_otp', 'double_click'],
    maxSteps: 99,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.config?.maxSteps, 25);
});

test('generateTestPhone returns 10-digit synthetic 555 number', () => {
  const phone = generateTestPhone(8492013);
  assert.equal(phone, '5558492013');
});

test('parseAgentDecision parses valid JSON with fenced markdown and handles malformed JSON', () => {
  const fenced = '```json\n{"thought":"Click Place Order twice","phase":"double_click","action":"rapid_click","targetText":"Place Order","finding":{"title":"Duplicate order on double click","severity":"critical","category":"double_click","expected":"Only 1 order created","actual":"2 orders created","reproductionSteps":["Add item","Double-click Place Order"]}}\n```';
  const parsed = parseAgentDecision(fenced);
  assert.equal(parsed.action, 'rapid_click');
  assert.equal(parsed.phase, 'double_click');
  assert.equal(parsed.finding?.severity, 'critical');

  const fallback = parseAgentDecision('not-json');
  assert.equal(fallback.action, 'check_dom');
});

test('deduplicateFindings keeps highest severity and sorts Critical -> Low', () => {
  const findings: QaFinding[] = [
    {
      id: '1',
      title: 'Broken image',
      severity: 'medium',
      category: 'health_audit',
      expected: 'Image loads',
      actual: '404',
      reproductionSteps: ['Open store'],
      url: 'http://localhost:3000/demo-store',
      detectedAtStep: 2,
    },
    {
      id: '2',
      title: 'Broken image',
      severity: 'high',
      category: 'health_audit',
      expected: 'Image loads',
      actual: '404',
      reproductionSteps: ['Open store'],
      url: 'http://localhost:3000/demo-store',
      detectedAtStep: 4,
    },
    {
      id: '3',
      title: 'Negative cart quantity allowed',
      severity: 'critical',
      category: 'cart_abuse',
      expected: 'Reject negative quantity',
      actual: 'Cart total became -$24.00',
      reproductionSteps: ['Type -1 into qty'],
      url: 'http://localhost:3000/demo-store',
      detectedAtStep: 3,
    },
  ];

  const deduped = deduplicateFindings(findings);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].severity, 'critical');
  assert.equal(deduped[1].severity, 'high');
});

test('computeRunSummary and buildMarkdownReport produce accurate counts', () => {
  const run: QaRunState = {
    id: 'run-1',
    createdAt: '2026-11-19T08:00:00.000Z',
    completedAt: '2026-11-19T08:00:12.000Z',
    status: 'completed',
    config: {
      targetUrl: 'http://localhost:3000/demo-store',
      authMethod: 'phone_otp',
      masterOtp: '123456',
      testPhone: '5551234567',
      testName: 'QA Tester',
      engineMode: 'ai_vision',
      suites: ['auth_otp', 'double_click'],
      maxSteps: 14,
    },
    currentStep: 2,
    steps: [],
    findings: [
      {
        id: 'f1',
        title: 'Double click creates duplicate order',
        severity: 'critical',
        category: 'double_click',
        expected: 'Idempotent order submission',
        actual: 'Two order confirmations returned',
        reproductionSteps: ['Click Place Order rapidly'],
        url: 'http://localhost:3000/demo-store',
        detectedAtStep: 2,
      },
    ],
    networkFailures: [],
    consoleErrors: [],
    brokenAssets: [],
    summary: {
      totalSteps: 0,
      totalBugs: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      networkFailuresCount: 0,
      consoleErrorsCount: 0,
      brokenAssetsCount: 0,
      durationMs: 0,
    },
  };

  run.summary = computeRunSummary(run);
  assert.equal(run.summary.criticalCount, 1);
  assert.equal(run.summary.durationMs, 12000);

  const md = buildMarkdownReport(run);
  assert.match(md, /\[CRITICAL\] Double click creates duplicate order/);
  assert.match(md, /5551234567/);
});
