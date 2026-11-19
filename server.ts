import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createDemoStoreRouter } from './server/demoStoreRoutes.ts';
import { buildMarkdownReport, validateRunConfig } from './server/qaLogic.ts';
import {
  deleteRun,
  getRun,
  getScreenshotPath,
  listRuns,
  startQaRun,
  stopRun,
  subscribeToRun,
} from './server/qaRunner.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Built-in Demo Storefront API routes
  app.use('/demo-api', createDemoStoreRouter());

  // QA Runner API routes
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.get('/api/runs', (_req, res) => {
    res.json({ runs: listRuns() });
  });

  app.post('/api/runs', async (req, res) => {
    const validation = validateRunConfig(req.body ?? {});
    if (!validation.valid || !validation.config) {
      res.status(400).json({ error: validation.error || 'Invalid QA run configuration.' });
      return;
    }

    if (validation.config.engineMode === 'ai_vision' && !process.env.GEMINI_API_KEY?.trim()) {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured in Secrets. Add GEMINI_API_KEY or switch Engine Mode to Deterministic Playwright Suite.',
      });
      return;
    }

    const run = await startQaRun(validation.config);
    res.status(201).json({ run });
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'QA run not found.' });
      return;
    }
    res.json({ run });
  });

  app.post('/api/runs/:id/stop', (req, res) => {
    const ok = stopRun(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'QA run not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/runs/:id', (req, res) => {
    const deleted = deleteRun(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'QA run not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/runs/:id/export', (req, res) => {
    const run = getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'QA run not found.' });
      return;
    }
    const format = req.query.format === 'json' ? 'json' : 'markdown';
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${run.id}-report.json"`);
      res.send(JSON.stringify(run, null, 2));
      return;
    }
    const md = buildMarkdownReport(run);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${run.id}-report.md"`);
    res.send(md);
  });

  app.get('/api/runs/:id/screenshots/:filename', (req, res) => {
    const filePath = getScreenshotPath(req.params.id, req.params.filename);
    if (!filePath) {
      res.status(404).send('Screenshot not found');
      return;
    }
    res.sendFile(filePath);
  });

  app.get('/api/runs/:id/stream', (req, res) => {
    const run = getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'QA run not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (state: unknown) => {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    };

    sendEvent(run);

    const unsubscribe = subscribeToRun(req.params.id, (updated) => {
      sendEvent(updated);
      if (updated.status === 'completed' || updated.status === 'stopped' || updated.status === 'error') {
        res.end();
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Veriflow server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
