import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AgentDecision, QaRunConfig, QaStepLog } from '../src/shared/qaTypes.ts';
import { parseAgentDecision } from './qaLogic.ts';

export interface DomSnapshotSummary {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  hasHorizontalOverflow: boolean;
  visibleTextSnippet: string;
  inputs: Array<{
    selector: string;
    type: string;
    name: string;
    placeholder: string;
    label: string;
    value: string;
  }>;
  buttons: Array<{
    selector: string;
    text: string;
    disabled: boolean;
  }>;
  links: Array<{
    selector: string;
    text: string;
    href: string;
  }>;
  brokenImages: Array<{ src: string; alt: string }>;
}

export interface PlannerContext {
  config: QaRunConfig;
  stepNumber: number;
  maxSteps: number;
  dom: DomSnapshotSummary;
  screenshotBase64: string;
  recentSteps: QaStepLog[];
  recentNetworkFailures: string[];
  recentConsoleErrors: string[];
}

function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets, or switch Engine Mode to Deterministic Playwright Suite.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function planNextQaStep(ctx: PlannerContext): Promise<AgentDecision> {
  const ai = createAiClient();

  const systemInstruction = [
    'You are Veriflow, an autonomous senior QA engineer testing an e-commerce web application in a real Chromium browser.',
    'Your goal is to systematically sign up / log in using Phone + Master OTP, browse products, test cart boundaries, stress-test Buy/Place Order/Pay buttons with rapid double-clicks, probe checkout edge cases, and report real functional, validation, console, network, or broken-asset bugs.',
    'Safety boundaries: Only perform functional QA, UI boundary, validation, idempotency, and resilience checks. Never output or inject XSS, SQL injection, script tags, or security exploit payloads.',
    `Test user credentials to use: Name="${ctx.config.testName}", Phone="${ctx.config.testPhone}", Master OTP="${ctx.config.masterOtp}".`,
    `Selected QA suites: ${ctx.config.suites.join(', ')}.`,
    'Rules for choosing actions:',
    '1. If not yet signed in and a Sign In / Account / Login button or phone input is visible, complete signup/login first using the test phone number and master OTP.',
    '2. Test auth edge cases briefly if auth_otp is enabled (e.g., try invalid phone or wrong OTP once before entering master OTP), then log in cleanly.',
    '3. Add item(s) to cart. If cart_abuse is enabled, test negative quantity (e.g., "-2") or "0" or huge quantity ("99999") in quantity inputs.',
    '4. If double_click is enabled, use action "rapid_click" on "Add to Cart", "Buy Now", "Place Order", or "Pay" buttons to verify idempotency.',
    '5. If checkout_tricks is enabled, test invalid/empty promo codes (or edge promo codes visible/plausible), missing shipping fields, or total math.',
    '6. If chaos_resilience is enabled, test resizing to 390x844 mobile viewport at least once to check layout overflow.',
    '7. Whenever you observe a real defect (broken image, HTTP 4xx/5xx, uncaught console error, negative cart total, duplicate order from double click, missing validation, mobile horizontal overflow), populate the "finding" object with precise expected vs actual behavior and concrete reproduction steps.',
    '8. Choose "finish" once all enabled suites have been exercised or when at the final step.',
    'Always provide an exact CSS selector from the DOM inventory in "selector" whenever interacting with an input or button.',
  ].join('\n');

  const historySummary = ctx.recentSteps
    .slice(-8)
    .map(
      (s) =>
        `Step ${s.stepNumber} [${s.phase}] ${s.action} target="${s.target}" value="${s.value ?? ''}" -> ${s.outcome}: ${s.detail}`
    )
    .join('\n');

  const promptText = [
    `Current Step: ${ctx.stepNumber} of ${ctx.maxSteps}`,
    `Current URL: ${ctx.dom.url}`,
    `Page Title: ${ctx.dom.title}`,
    `Viewport: ${ctx.dom.viewport.width}x${ctx.dom.viewport.height} (horizontalOverflow=${ctx.dom.hasHorizontalOverflow})`,
    `Broken Images Detected on Page: ${JSON.stringify(ctx.dom.brokenImages)}`,
    `Recent Network 4xx/5xx Failures: ${JSON.stringify(ctx.recentNetworkFailures)}`,
    `Recent Console/Runtime Errors: ${JSON.stringify(ctx.recentConsoleErrors)}`,
    `Recent Steps:\n${historySummary || 'None yet'}`,
    `Interactive Inputs:\n${JSON.stringify(ctx.dom.inputs.slice(0, 20))}`,
    `Interactive Buttons:\n${JSON.stringify(ctx.dom.buttons.slice(0, 25))}`,
    `Visible Links:\n${JSON.stringify(ctx.dom.links.slice(0, 15))}`,
    `Visible Page Text Excerpt:\n${ctx.dom.visibleTextSnippet}`,
    `Decide the single best next QA action.`,
  ].join('\n\n');

  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: ctx.screenshotBase64,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              thought: { type: Type.STRING, description: 'Concise QA reasoning for this step.' },
              phase: {
                type: Type.STRING,
                description:
                  'One of: auth_otp, cart_abuse, double_click, checkout_tricks, health_audit, chaos_resilience',
              },
              action: {
                type: Type.STRING,
                description:
                  'One of: navigate, click, dblclick, rapid_click, fill, press, scroll, resize, check_dom, finish',
              },
              selector: { type: Type.STRING, description: 'Exact CSS selector from DOM list.' },
              targetText: { type: Type.STRING, description: 'Accessible label or button text.' },
              value: { type: Type.STRING, description: 'Text to type for fill, key for press, or URL for navigate.' },
              viewport: {
                type: Type.OBJECT,
                properties: {
                  width: { type: Type.INTEGER },
                  height: { type: Type.INTEGER },
                },
              },
              finding: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  severity: { type: Type.STRING, description: 'critical, high, medium, or low' },
                  category: { type: Type.STRING },
                  expected: { type: Type.STRING },
                  actual: { type: Type.STRING },
                  reproductionSteps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['title', 'severity', 'category', 'expected', 'actual', 'reproductionSteps'],
              },
            },
            required: ['thought', 'phase', 'action'],
          },
        },
      });

      const rawText = response.text ?? '';
      return parseAgentDecision(rawText);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      if (isTransient && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw new Error(formatGeminiError(msg));
    }
  }

  throw new Error(formatGeminiError(lastError instanceof Error ? lastError.message : 'Gemini request failed'));
}

function formatGeminiError(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as { error?: { message?: string; code?: number } };
    if (parsed?.error?.message) {
      return `AI Planner Error (${parsed.error.code ?? 'API'}): ${parsed.error.message}`;
    }
  } catch {
    // not raw JSON
  }
  return rawMessage;
}
