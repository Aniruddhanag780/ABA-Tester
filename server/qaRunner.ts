import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type {
  AgentDecision,
  QaBrokenAsset,
  QaConsoleError,
  QaFinding,
  QaNetworkFailure,
  QaRunConfig,
  QaRunState,
  QaStepLog,
} from '../src/shared/qaTypes.ts';
import { planNextQaStep } from './geminiPlanner.ts';
import type { DomSnapshotSummary } from './geminiPlanner.ts';
import { computeRunSummary, deduplicateFindings } from './qaLogic.ts';

const RUNS_DIR = path.resolve(process.cwd(), '.qa-runs');
const ARTIFACTS_DIR = path.resolve(process.cwd(), '.qa-artifacts');

fs.mkdirSync(RUNS_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const activeRuns = new Map<string, QaRunState>();
const stopSignals = new Map<string, boolean>();
const runEmitters = new Map<string, EventEmitter>();

function getEmitter(runId: string): EventEmitter {
  let emitter = runEmitters.get(runId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(50);
    runEmitters.set(runId, emitter);
  }
  return emitter;
}

function saveRunToDisk(run: QaRunState): void {
  try {
    const filePath = path.join(RUNS_DIR, `${run.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(run, null, 2), 'utf-8');
  } catch {
    // Non-fatal disk persistence warning
  }
}

function emitUpdate(run: QaRunState): void {
  run.summary = computeRunSummary(run);
  run.findings = deduplicateFindings(run.findings);
  activeRuns.set(run.id, run);
  saveRunToDisk(run);
  getEmitter(run.id).emit('state', run);
}

export function subscribeToRun(runId: string, listener: (run: QaRunState) => void): () => void {
  const emitter = getEmitter(runId);
  emitter.on('state', listener);
  return () => {
    emitter.off('state', listener);
  };
}

export function getRun(runId: string): QaRunState | undefined {
  const mem = activeRuns.get(runId);
  if (mem) return mem;
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as QaRunState;
      activeRuns.set(runId, parsed);
      return parsed;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function listRuns(): QaRunState[] {
  const byId = new Map<string, QaRunState>();
  try {
    const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, file), 'utf-8')) as QaRunState;
        byId.set(parsed.id, parsed);
      } catch {
        // skip corrupted file
      }
    }
  } catch {
    // ignore
  }
  for (const [id, run] of activeRuns.entries()) {
    byId.set(id, run);
  }
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export function deleteRun(runId: string): boolean {
  stopSignals.set(runId, true);
  activeRuns.delete(runId);
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  const artDir = path.join(ARTIFACTS_DIR, runId);
  let existed = false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    existed = true;
  }
  if (fs.existsSync(artDir)) {
    fs.rmSync(artDir, { recursive: true, force: true });
    existed = true;
  }
  return existed;
}

export function stopRun(runId: string): boolean {
  const run = getRun(runId);
  if (!run) return false;
  stopSignals.set(runId, true);
  if (run.status === 'running' || run.status === 'queued') {
    run.status = 'stopped';
    run.completedAt = new Date().toISOString();
    emitUpdate(run);
  }
  return true;
}

export function getScreenshotPath(runId: string, filename: string): string | null {
  const safeName = path.basename(filename);
  if (!safeName.endsWith('.png')) return null;
  const fullPath = path.join(ARTIFACTS_DIR, path.basename(runId), safeName);
  return fs.existsSync(fullPath) ? fullPath : null;
}

function resolveChromiumExecutable(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function captureStepScreenshot(
  page: Page,
  runId: string,
  stepNumber: number
): Promise<{ url: string; base64: string }> {
  const dir = path.join(ARTIFACTS_DIR, runId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `step-${String(stepNumber).padStart(2, '0')}.png`;
  const filePath = path.join(dir, filename);
  const buffer = await page.screenshot({ path: filePath, type: 'png' });
  return {
    url: `/api/runs/${runId}/screenshots/${filename}`,
    base64: buffer.toString('base64'),
  };
}

async function inspectDom(page: Page): Promise<DomSnapshotSummary> {
  const raw = (await page.evaluate(`(() => {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var hasHorizontalOverflow = document.documentElement.scrollWidth > vw + 2;

    function isVisible(el) {
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      var rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function buildSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      var testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId.replace(/"/g, '\\\\"') + '"]';
      var name = el.getAttribute('name');
      if (name) return el.tagName.toLowerCase() + '[name="' + name.replace(/"/g, '\\\\"') + '"]';
      var aria = el.getAttribute('aria-label');
      if (aria) return el.tagName.toLowerCase() + '[aria-label="' + aria.replace(/"/g, '\\\\"') + '"]';
      var placeholder = el.getAttribute('placeholder');
      if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + placeholder.replace(/"/g, '\\\\"') + '"]';
      var allSame = Array.from(document.querySelectorAll(el.tagName.toLowerCase()));
      var idx = allSame.indexOf(el);
      return idx >= 0 ? el.tagName.toLowerCase() + ' >> nth=' + idx : el.tagName.toLowerCase();
    }

    var inputs = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(isVisible)
      .slice(0, 25)
      .map(function (el) {
        var label = '';
        if (el.id) {
          var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (lbl) label = (lbl.textContent || '').trim();
        }
        if (!label && el.closest('label')) {
          label = (el.closest('label').textContent || '').trim();
        }
        return {
          selector: buildSelector(el),
          type: el.type || el.tagName.toLowerCase(),
          name: el.name || '',
          placeholder: el.placeholder || '',
          label: label.slice(0, 80),
          value: (el.value || '').slice(0, 60)
        };
      });

    var buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
      .filter(isVisible)
      .slice(0, 35)
      .map(function (el) {
        var text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
        return {
          selector: buildSelector(el),
          text: text.slice(0, 80),
          disabled: Boolean(el.disabled)
        };
      });

    var links = Array.from(document.querySelectorAll('a[href]'))
      .filter(isVisible)
      .slice(0, 20)
      .map(function (el) {
        return {
          selector: buildSelector(el),
          text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
          href: el.getAttribute('href') || ''
        };
      });

    var brokenImages = Array.from(document.querySelectorAll('img'))
      .filter(function (img) { return img.complete && img.naturalWidth === 0; })
      .map(function (img) {
        return {
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || 'Image'
        };
      });

    var visibleTextSnippet = ((document.body && document.body.innerText) || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 1400);

    return {
      url: window.location.href,
      title: document.title,
      viewport: { width: vw, height: vh },
      hasHorizontalOverflow: hasHorizontalOverflow,
      visibleTextSnippet: visibleTextSnippet,
      inputs: inputs,
      buttons: buttons,
      links: links,
      brokenImages: brokenImages
    };
  })()`)) as DomSnapshotSummary;

  return raw;
}

async function resolveLocator(page: Page, selector?: string, targetText?: string) {
  if (selector) {
    try {
      const loc = page.locator(selector).first();
      if ((await loc.count()) > 0) {
        return loc;
      }
    } catch {
      // fall through to text match
    }
  }
  if (targetText) {
    const byRoleBtn = page.getByRole('button', { name: targetText }).first();
    if ((await byRoleBtn.count()) > 0) return byRoleBtn;
    const byRoleLink = page.getByRole('link', { name: targetText }).first();
    if ((await byRoleLink.count()) > 0) return byRoleLink;
    const byText = page.getByText(targetText).first();
    if ((await byText.count()) > 0) return byText;
  }
  return null;
}

async function executeDecision(
  page: Page,
  decision: AgentDecision,
  run: QaRunState,
  stepNumber: number
): Promise<{ outcome: 'ok' | 'warning' | 'error'; detail: string }> {
  const timeout = 6000;

  switch (decision.action) {
    case 'navigate': {
      const target = decision.value || run.config.targetUrl;
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(350);
      return { outcome: 'ok', detail: `Navigated to ${page.url()}` };
    }

    case 'click': {
      const loc = await resolveLocator(page, decision.selector, decision.targetText);
      if (!loc) {
        return { outcome: 'warning', detail: `Could not locate clickable element "${decision.selector || decision.targetText || 'unknown'}"` };
      }
      await loc.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
      await loc.click({ timeout });
      await page.waitForTimeout(350);
      return { outcome: 'ok', detail: `Clicked "${decision.targetText || decision.selector}"` };
    }

    case 'dblclick':
    case 'rapid_click': {
      const loc = await resolveLocator(page, decision.selector, decision.targetText);
      if (!loc) {
        return { outcome: 'warning', detail: `Could not locate button for rapid click "${decision.selector || decision.targetText || 'unknown'}"` };
      }
      await loc.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
      const ordersBefore = run.networkFailures.length;
      let postRequests = 0;
      const onReq = (req: { method: () => string }) => {
        if (req.method() === 'POST') postRequests++;
      };
      page.on('request', onReq);
      try {
        await loc.click({ timeout });
        await loc.click({ timeout, force: true }).catch(() => {});
        await loc.click({ timeout, force: true }).catch(() => {});
        await page.waitForTimeout(600);
      } finally {
        page.off('request', onReq);
      }

      if (postRequests > 1) {
        run.findings.push({
          id: `f-dbl-${stepNumber}`,
          title: `Rapid double-click triggered ${postRequests} duplicate POST submissions on "${decision.targetText || decision.selector}"`,
          severity: 'critical',
          category: 'double_click',
          expected: 'Button should disable immediately or use an idempotency key so rapid clicks trigger at most 1 request.',
          actual: `Firing 3 rapid clicks sent ${postRequests} concurrent POST requests.`,
          reproductionSteps: [
            `Open ${page.url()}`,
            `Rapidly click "${decision.targetText || decision.selector}" multiple times within 200ms`,
            `Observe ${postRequests} POST submissions dispatched.`,
          ],
          evidence: `${postRequests} POST requests in 600ms (network failures delta: ${run.networkFailures.length - ordersBefore})`,
          url: page.url(),
          detectedAtStep: stepNumber,
        });
        return {
          outcome: 'error',
          detail: `Rapid click dispatched ${postRequests} duplicate POST requests on "${decision.targetText || decision.selector}"`,
        };
      }
      return {
        outcome: 'ok',
        detail: `Rapid-clicked "${decision.targetText || decision.selector}" (${postRequests} POST requests observed)`,
      };
    }

    case 'fill': {
      const loc = await resolveLocator(page, decision.selector, decision.targetText);
      if (!loc) {
        return { outcome: 'warning', detail: `Could not locate input "${decision.selector || decision.targetText || 'unknown'}"` };
      }
      await loc.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
      await loc.fill(decision.value ?? '', { timeout });
      await page.waitForTimeout(200);
      return { outcome: 'ok', detail: `Entered "${decision.value ?? ''}" into ${decision.selector || decision.targetText}` };
    }

    case 'press': {
      const key = decision.value || 'Enter';
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      return { outcome: 'ok', detail: `Pressed key ${key}` };
    }

    case 'scroll': {
      await page.evaluate(() => window.scrollBy(0, 520));
      await page.waitForTimeout(250);
      return { outcome: 'ok', detail: 'Scrolled viewport down 520px' };
    }

    case 'resize': {
      const w = decision.viewport?.width ?? 390;
      const h = decision.viewport?.height ?? 844;
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      return { outcome: 'ok', detail: `Resized viewport to ${w}x${h}` };
    }

    case 'check_dom': {
      await page.waitForTimeout(250);
      return { outcome: 'ok', detail: `Audited DOM state at ${page.url()}` };
    }

    case 'finish': {
      return { outcome: 'ok', detail: 'Completed planned QA coverage.' };
    }
  }
}

function recordTelemetryFindings(
  run: QaRunState,
  dom: DomSnapshotSummary,
  stepNumber: number,
  screenshotUrl: string
): void {
  for (const broken of dom.brokenImages) {
    const already = run.brokenAssets.some((b) => b.url === broken.src && b.pageUrl === dom.url);
    if (!already) {
      const asset: QaBrokenAsset = {
        url: broken.src || '(empty src)',
        tagName: 'img',
        text: broken.alt,
        reason: 'naturalWidth === 0 after load',
        pageUrl: dom.url,
        stepNumber,
      };
      run.brokenAssets.push(asset);
      run.findings.push({
        id: `f-img-${run.brokenAssets.length}`,
        title: `Broken product or media image (${broken.alt || broken.src})`,
        severity: 'high',
        category: 'health_audit',
        expected: 'All visible <img> elements should resolve with HTTP 200 and non-zero naturalWidth.',
        actual: `Image "${broken.src}" failed to render (naturalWidth = 0).`,
        reproductionSteps: [`Navigate to ${dom.url}`, `Inspect image "${broken.alt}" (${broken.src})`],
        evidence: broken.src,
        screenshotUrl,
        url: dom.url,
        detectedAtStep: stepNumber,
      });
    }
  }

  if (dom.hasHorizontalOverflow) {
    run.findings.push({
      id: `f-overflow-${dom.viewport.width}`,
      title: `Horizontal layout overflow at ${dom.viewport.width}x${dom.viewport.height}`,
      severity: 'medium',
      category: 'chaos_resilience',
      expected: 'Document scrollWidth should fit within viewport width without horizontal scrolling.',
      actual: `Page overflowed horizontally at ${dom.viewport.width}px width.`,
      reproductionSteps: [
        `Open ${dom.url}`,
        `Set viewport to ${dom.viewport.width}x${dom.viewport.height}`,
        'Check horizontal scrollability.',
      ],
      screenshotUrl,
      url: dom.url,
      detectedAtStep: stepNumber,
    });
  }
}

async function runDeterministicSequence(
  page: Page,
  run: QaRunState,
  captureAndRecord: (
    phase: QaStepLog['phase'],
    action: QaStepLog['action'],
    target: string,
    thought: string,
    outcome: QaStepLog['outcome'],
    detail: string,
    durationMs: number,
    value?: string
  ) => Promise<void>
): Promise<void> {
  // Step 1: Initial load & broken image / DOM health check
  const t0 = Date.now();
  const dom1 = await inspectDom(page);
  await captureAndRecord(
    'health_audit',
    'check_dom',
    run.config.targetUrl,
    'Inspecting initial storefront load, broken images, and console/network baseline.',
    dom1.brokenImages.length > 0 ? 'warning' : 'ok',
    `Loaded "${dom1.title}" (${dom1.buttons.length} buttons, ${dom1.brokenImages.length} broken images)`,
    Date.now() - t0
  );
  if (stopSignals.get(run.id)) return;

  // Step 2: Auth & OTP flow if Sign In / Phone input is present
  if (run.config.suites.includes('auth_otp')) {
    const openAuthBtn = page.getByRole('button', { name: /sign in|log in|account|login/i }).first();
    if ((await openAuthBtn.count()) > 0) {
      const ts = Date.now();
      await openAuthBtn.click().catch(() => {});
      await page.waitForTimeout(300);
      await captureAndRecord(
        'auth_otp',
        'click',
        'Sign In',
        'Opening authentication modal/page to test Phone + OTP registration.',
        'ok',
        'Opened Sign In / Account flow',
        Date.now() - ts
      );
    }

    const phoneInput = page.locator('input[type="tel"], input[name*="phone" i], input[placeholder*="phone" i]').first();
    if ((await phoneInput.count()) > 0) {
      // Try invalid short phone first
      const tInv = Date.now();
      await phoneInput.fill('12');
      const sendBtn = page.getByRole('button', { name: /send otp|continue|next|verify/i }).first();
      if ((await sendBtn.count()) > 0) await sendBtn.click().catch(() => {});
      await page.waitForTimeout(250);
      await captureAndRecord(
        'auth_otp',
        'fill',
        'Phone Input',
        'Testing invalid short phone validation before registering fresh test user.',
        'ok',
        'Submitted short phone "12" to verify validation guard',
        Date.now() - tInv,
        '12'
      );

      // Fill valid synthetic phone
      const tPhone = Date.now();
      await phoneInput.fill(run.config.testPhone);
      const nameInput = page.locator('input[name*="name" i], input[placeholder*="name" i]').first();
      if ((await nameInput.count()) > 0) {
        await nameInput.fill(run.config.testName).catch(() => {});
      }
      if ((await sendBtn.count()) > 0) await sendBtn.click().catch(() => {});
      await page.waitForTimeout(350);
      await captureAndRecord(
        'auth_otp',
        'fill',
        'Phone Input',
        `Creating fresh user with phone ${run.config.testPhone}.`,
        'ok',
        `Submitted phone ${run.config.testPhone}`,
        Date.now() - tPhone,
        run.config.testPhone
      );

      // Enter Master OTP
      const otpInput = page.locator('input[name*="otp" i], input[placeholder*="otp" i], input[placeholder*="code" i], input[maxlength="6"]').first();
      if ((await otpInput.count()) > 0) {
        const tOtp = Date.now();
        await otpInput.fill(run.config.masterOtp);
        const verifyBtn = page.getByRole('button', { name: /verify|submit|confirm|sign in|login/i }).first();
        if ((await verifyBtn.count()) > 0) await verifyBtn.click().catch(() => {});
        await page.waitForTimeout(450);
        await captureAndRecord(
          'auth_otp',
          'fill',
          'OTP Input',
          `Completing authentication using master OTP ${run.config.masterOtp}.`,
          'ok',
          `Verified session with OTP ${run.config.masterOtp}`,
          Date.now() - tOtp,
          run.config.masterOtp
        );
      }
    }
  }
  if (stopSignals.get(run.id)) return;

  // Step 3: Add item to cart
  const addBtn = page.getByRole('button', { name: /add to cart|add to bag|buy now/i }).first();
  if ((await addBtn.count()) > 0) {
    const tAdd = Date.now();
    await addBtn.click().catch(() => {});
    await page.waitForTimeout(300);
    await captureAndRecord(
      'cart_abuse',
      'click',
      'Add to Cart',
      'Adding primary product to cart to unlock quantity & checkout tests.',
      'ok',
      'Added product to cart',
      Date.now() - tAdd
    );
  }

  // Open cart if drawer/button exists
  const cartBtn = page.getByRole('button', { name: /cart|bag|checkout/i }).first();
  if ((await cartBtn.count()) > 0) {
    await cartBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }

  // Step 4: Cart negative quantity abuse
  if (run.config.suites.includes('cart_abuse')) {
    const qtyInput = page.locator('input[type="number"], input[name*="qty" i], input[aria-label*="quantity" i]').first();
    if ((await qtyInput.count()) > 0) {
      const tNeg = Date.now();
      await qtyInput.fill('-3');
      await qtyInput.press('Enter').catch(() => {});
      await page.waitForTimeout(250);
      const bodyText = await page.evaluate(() => document.body.innerText);
      const acceptedNegative = /-\$\d+|\$-?\d+/.test(bodyText) || (await qtyInput.inputValue()) === '-3';
      if (acceptedNegative) {
        run.findings.push({
          id: `f-neg-qty-${run.steps.length + 1}`,
          title: 'Cart accepts negative item quantity (-3), corrupting order total',
          severity: 'critical',
          category: 'cart_abuse',
          expected: 'Quantity inputs must clamp or reject values <= 0 and never compute negative totals.',
          actual: 'Entering "-3" was accepted in the cart quantity control.',
          reproductionSteps: [
            `Add an item to cart on ${run.config.targetUrl}`,
            'Enter "-3" into the quantity input',
            'Observe negative quantity / total accepted without validation.',
          ],
          url: page.url(),
          detectedAtStep: run.steps.length + 1,
        });
      }
      await captureAndRecord(
        'cart_abuse',
        'fill',
        'Quantity Input',
        'Testing negative quantity boundary (-3) in shopping cart.',
        acceptedNegative ? 'error' : 'ok',
        acceptedNegative ? 'Cart accepted negative quantity -3' : 'Negative quantity rejected',
        Date.now() - tNeg,
        '-3'
      );
      await qtyInput.fill('1').catch(() => {});
    }
  }
  if (stopSignals.get(run.id)) return;

  // Step 5: Promo / coupon edge case
  if (run.config.suites.includes('checkout_tricks')) {
    const promoInput = page.locator('input[name*="coupon" i], input[name*="promo" i], input[placeholder*="coupon" i], input[placeholder*="promo" i]').first();
    if ((await promoInput.count()) > 0) {
      const tPromo = Date.now();
      await promoInput.fill('CRASH500');
      const applyBtn = page.getByRole('button', { name: /apply/i }).first();
      if ((await applyBtn.count()) > 0) await applyBtn.click().catch(() => {});
      await page.waitForTimeout(450);
      await captureAndRecord(
        'checkout_tricks',
        'fill',
        'Promo Code Input',
        'Testing error handling on problematic promo code "CRASH500".',
        run.networkFailures.length > 0 ? 'error' : 'ok',
        'Submitted promo code CRASH500',
        Date.now() - tPromo,
        'CRASH500'
      );
    }
  }
  if (stopSignals.get(run.id)) return;

  // Step 6: Double-click Place Order / Pay stress test
  if (run.config.suites.includes('double_click')) {
    const orderBtn = page.getByRole('button', { name: /place order|pay now|complete order|submit order/i }).first();
    if ((await orderBtn.count()) > 0) {
      const tDbl = Date.now();
      const res = await executeDecision(
        page,
        {
          thought: 'Stress-testing Place Order button with rapid triple click.',
          phase: 'double_click',
          action: 'rapid_click',
          targetText: 'Place Order',
        },
        run,
        run.steps.length + 1
      );
      await captureAndRecord(
        'double_click',
        'rapid_click',
        'Place Order',
        'Rapidly clicking Place Order to verify idempotency protection.',
        res.outcome,
        res.detail,
        Date.now() - tDbl
      );
    }
  }
  if (stopSignals.get(run.id)) return;

  // Step 7: Mobile viewport overflow check
  if (run.config.suites.includes('chaos_resilience')) {
    const tMob = Date.now();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobDom = await inspectDom(page);
    await captureAndRecord(
      'chaos_resilience',
      'resize',
      '390x844',
      'Checking mobile viewport responsiveness and horizontal overflow.',
      mobDom.hasHorizontalOverflow ? 'warning' : 'ok',
      mobDom.hasHorizontalOverflow
        ? 'Horizontal overflow detected at 390px width'
        : 'No horizontal overflow at 390x844',
      Date.now() - tMob
    );
  }
}

export async function startQaRun(config: QaRunConfig): Promise<QaRunState> {
  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const initialRun: QaRunState = {
    id: runId,
    createdAt: new Date().toISOString(),
    status: 'running',
    config,
    currentStep: 0,
    steps: [],
    findings: [],
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

  stopSignals.set(runId, false);
  emitUpdate(initialRun);

  void executeRunInBackground(initialRun);
  return initialRun;
}

async function executeRunInBackground(run: QaRunState): Promise<void> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    const executablePath = resolveChromiumExecutable();
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('favicon.ico')) return;
        const entry: QaConsoleError = {
          timestamp: new Date().toISOString(),
          type: 'console.error',
          message: text.slice(0, 400),
          stepNumber: run.currentStep || 1,
        };
        run.consoleErrors.push(entry);
      }
    });

    page.on('pageerror', (err) => {
      const entry: QaConsoleError = {
        timestamp: new Date().toISOString(),
        type: 'pageerror',
        message: err.message.slice(0, 400),
        stepNumber: run.currentStep || 1,
      };
      run.consoleErrors.push(entry);
      run.findings.push({
        id: `f-pageerr-${run.consoleErrors.length}`,
        title: `Uncaught JavaScript exception: ${err.message.slice(0, 80)}`,
        severity: 'high',
        category: 'health_audit',
        expected: 'Application should run without uncaught runtime exceptions.',
        actual: err.message,
        reproductionSteps: [`Navigate to ${page.url()}`, 'Trigger user interaction and check console.'],
        evidence: err.message,
        screenshotUrl: run.latestScreenshotUrl,
        url: page.url(),
        detectedAtStep: run.currentStep || 1,
      });
    });

    page.on('response', (res) => {
      const status = res.status();
      const url = res.url();
      if (status >= 400 && !url.endsWith('favicon.ico')) {
        const failure: QaNetworkFailure = {
          timestamp: new Date().toISOString(),
          url,
          method: res.request().method(),
          status,
          statusText: res.statusText(),
          stepNumber: run.currentStep || 1,
        };
        run.networkFailures.push(failure);
        if (status >= 500) {
          run.findings.push({
            id: `f-5xx-${run.networkFailures.length}`,
            title: `Server 5xx error (${status}) on ${res.request().method()} ${new URL(url).pathname}`,
            severity: 'critical',
            category: 'health_audit',
            expected: 'Backend endpoints should validate inputs and return graceful 2xx or 4xx responses.',
            actual: `${res.request().method()} ${url} returned HTTP ${status} ${res.statusText()}`,
            reproductionSteps: [
              `Perform action at step ${run.currentStep || 1} on ${page.url()}`,
              `Inspect network request to ${url}`,
            ],
            evidence: `${status} ${res.statusText()}`,
            screenshotUrl: run.latestScreenshotUrl,
            url: page.url(),
            detectedAtStep: run.currentStep || 1,
          });
        }
      }
    });

    const captureAndRecord = async (
      phase: QaStepLog['phase'],
      action: QaStepLog['action'],
      target: string,
      thought: string,
      outcome: QaStepLog['outcome'],
      detail: string,
      durationMs: number,
      value?: string
    ): Promise<void> => {
      const stepNumber = run.steps.length + 1;
      run.currentStep = stepNumber;
      const shot = await captureStepScreenshot(page, run.id, stepNumber);
      run.latestScreenshotUrl = shot.url;
      const dom = await inspectDom(page);
      recordTelemetryFindings(run, dom, stepNumber, shot.url);

      run.steps.push({
        stepNumber,
        timestamp: new Date().toISOString(),
        phase,
        action,
        target,
        value,
        thought,
        outcome,
        detail,
        url: page.url(),
        screenshotUrl: shot.url,
        durationMs,
      });
      emitUpdate(run);
    };

    // Navigate to target URL
    const navStart = Date.now();
    await page.goto(run.config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(600);

    if (run.config.engineMode === 'deterministic') {
      await runDeterministicSequence(page, run, captureAndRecord);
    } else {
      // Initial observation step
      await captureAndRecord(
        'setup',
        'navigate',
        run.config.targetUrl,
        'Opened target storefront in headless Chromium and captured baseline DOM and screenshot.',
        'ok',
        `Loaded ${page.url()}`,
        Date.now() - navStart
      );

      for (let i = 2; i <= run.config.maxSteps; i++) {
        if (stopSignals.get(run.id)) break;

        const stepStart = Date.now();
        const dom = await inspectDom(page);
        const shot = await captureStepScreenshot(page, run.id, i - 1);

        const decision = await planNextQaStep({
          config: run.config,
          stepNumber: i,
          maxSteps: run.config.maxSteps,
          dom,
          screenshotBase64: shot.base64,
          recentSteps: run.steps,
          recentNetworkFailures: run.networkFailures
            .slice(-6)
            .map((nf) => `${nf.method} ${nf.url} -> ${nf.status}`),
          recentConsoleErrors: run.consoleErrors
            .slice(-6)
            .map((ce) => `[${ce.type}] ${ce.message}`),
        });

        if (decision.finding) {
          run.findings.push({
            id: `f-ai-${i}-${run.findings.length + 1}`,
            title: decision.finding.title,
            severity: decision.finding.severity,
            category: decision.finding.category,
            expected: decision.finding.expected,
            actual: decision.finding.actual,
            reproductionSteps: decision.finding.reproductionSteps,
            screenshotUrl: run.latestScreenshotUrl,
            url: page.url(),
            detectedAtStep: i,
          });
        }

        const execResult = await executeDecision(page, decision, run, i);
        await captureAndRecord(
          decision.phase,
          decision.action,
          decision.targetText || decision.selector || page.url(),
          decision.thought,
          execResult.outcome,
          execResult.detail,
          Date.now() - stepStart,
          decision.value
        );

        // Attach latest screenshot to findings logged during this step
        for (const f of run.findings) {
          if (f.detectedAtStep === i && !f.screenshotUrl) {
            f.screenshotUrl = run.latestScreenshotUrl;
          }
        }
        emitUpdate(run);

        if (decision.action === 'finish') {
          break;
        }
      }
    }

    if (stopSignals.get(run.id)) {
      run.status = 'stopped';
    } else {
      run.status = 'completed';
    }
    run.completedAt = new Date().toISOString();
    emitUpdate(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected QA runner error.';
    run.status = 'error';
    run.errorMessage = message;
    run.completedAt = new Date().toISOString();
    emitUpdate(run);
  } finally {
    stopSignals.delete(run.id);
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
