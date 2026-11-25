import 'dotenv/config';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { recordApiLog } from './src/db/repository.ts';
import { env } from './src/server/config/env.ts';
import { errorHandler } from './src/server/middleware/errorHandler.ts';
import { apiRouter } from './src/server/routes/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Attach a unique Request ID to every request for production observability (zero secret leakage)
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.trim().length > 0 && incoming.length <= 64
        ? incoming.trim()
        : `mm-${crypto.randomBytes(4).toString('hex')}`;
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // Configure CORS without wildcard on authenticated endpoints
  const configuredOrigins = env.clientOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (configuredOrigins.length === 0) {
          // Allow same-origin / local preview / deployed cloud preview origins cleanly
          if (
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:') ||
            origin.endsWith('.run.app') ||
            origin.endsWith('.vercel.app')
          ) {
            return callback(null, true);
          }
          return callback(null, false);
        }
        return callback(null, configuredOrigins.includes(origin));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      credentials: false,
    })
  );

  app.use(express.json({ limit: '2mb' }));

  // Non-blocking API request & latency monitor (excludes sensitive headers/bodies)
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path === '/health' || req.path === '/admin/overview') return;
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      if (statusCode >= 500 || durationMs > 12_000) {
        console.warn(
          JSON.stringify({
            level: statusCode >= 500 ? 'error' : 'warn',
            service: 'marketminds-api',
            requestId: (req as any).requestId,
            method: req.method,
            path: req.path.slice(0, 120),
            statusCode,
            durationMs,
            timestamp: new Date().toISOString(),
          })
        );
      }
      void recordApiLog({
        method: req.method,
        path: req.path.slice(0, 120),
        statusCode,
        durationMs,
        errorMessage: statusCode >= 400 ? `HTTP ${statusCode} on ${req.method} ${req.path}` : null,
      });
    });
    next();
  });

  app.use('/api', apiRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(errorHandler);

  const server = http.createServer(app);
  let viteServer: { close: () => Promise<void> } | null = null;

  if (env.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server },
        ws: hmrDisabled ? false : undefined,
        watch: hmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });
    viteServer = vite;

    // When HMR is explicitly disabled by proxy/preview environment (DISABLE_HMR=true),
    // serve transformed index.html WITHOUT the /@vite/client WebSocket script so the
    // browser never attempts a failing ws:// upgrade or throws an unhandled rejection.
    if (hmrDisabled) {
      app.get('*', async (req, res, next) => {
        if (
          req.path.startsWith('/api') ||
          req.path.startsWith('/@') ||
          req.path.startsWith('/src/') ||
          req.path.startsWith('/node_modules/') ||
          path.extname(req.path) !== ''
        ) {
          return next();
        }
        try {
          const indexPath = path.resolve(__dirname, 'index.html');
          const rawHtml = fs.readFileSync(indexPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
          const cleanHtml = transformed.replace(
            /<script\s+type="module"\s+src="\/@vite\/client"><\/script>\s*/gi,
            ''
          );
          res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(cleanHtml);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distPath, 'index.html');
    if (!fs.existsSync(distIndex)) {
      console.error(
        `[FATAL] Production build not found at ${distIndex}. Run "npm run build" before starting in production mode.`
      );
      process.exit(1);
    }

    // Long-term cache for content-hashed Vite production bundles
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        immutable: true,
        maxAge: '1y',
      })
    );
    app.use(express.static(distPath, { index: false }));

    // SPA fallback: never cache HTML so deployments update cleanly
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(distIndex);
    });
  }

  const port = env.port;
  const host = env.host;

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[FATAL] Port ${port} on ${host} is already in use (EADDRINUSE). Stop the conflicting process or pass --port / configure PORT in your environment. Refusing to silently switch ports to prevent frontend/backend mismatch.`
      );
      process.exit(1);
    }
    console.error('[FATAL] Server failed to start:', err);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(
      `[MarketMinds] Server listening on http://${host}:${port} (${env.nodeEnv})`
    );
  });

  const shutdown = (signal: string) => {
    console.log(`[MarketMinds] Received ${signal}, shutting down cleanly...`);
    const forceTimer = setTimeout(() => process.exit(0), 3000);
    forceTimer.unref();
    void (async () => {
      try {
        if (viteServer) {
          await viteServer.close();
        }
      } catch {
        // Ignore Vite shutdown errors
      }
      server.close(() => {
        process.exit(0);
      });
    })();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[FATAL] Failed to initialize MarketMinds server:', err);
  process.exit(1);
});
