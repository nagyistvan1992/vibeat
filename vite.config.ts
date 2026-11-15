import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Local Vercel Serverless Function adapter for Vite dev/preview server
function vercelApiPlugin(): Plugin {
  const attachMiddleware = (server: any) => {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const rawUrl = req.url || '';
      if (!rawUrl.startsWith('/api/')) return next();

      const urlObj = new URL(rawUrl, 'http://localhost:5173');
      const pathname = urlObj.pathname.replace(/\/+$/, '');
      const query: Record<string, string> = {};
      urlObj.searchParams.forEach((v, k) => {
        query[k] = v;
      });

      // Enhance res with Vercel-compatible status() and json() helpers
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.json = (payload: any) => {
        if (!res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify(payload));
        return res;
      };

      // Parse JSON body for non-webhook POST requests
      if (req.method === 'POST' && pathname !== '/api/stripe/webhook') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawStr = Buffer.concat(chunks).toString('utf8');
        try {
          req.body = rawStr ? JSON.parse(rawStr) : {};
        } catch {
          req.body = rawStr;
        }
      }

      req.query = query;

      try {
        if (pathname === '/api/recipes') {
          const mod = await import('./api/recipes/index.ts');
          return await mod.default(req, res);
        }
        if (pathname.startsWith('/api/recipes/')) {
          req.query.slug = decodeURIComponent(pathname.slice('/api/recipes/'.length));
          const mod = await import('./api/recipes/[slug].ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/stripe/checkout') {
          const mod = await import('./api/stripe/checkout.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/stripe/portal') {
          const mod = await import('./api/stripe/portal.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/stripe/webhook') {
          const mod = await import('./api/stripe/webhook.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/me') {
          const mod = await import('./api/me.ts');
          return await mod.default(req, res);
        }
        res.status(404).json({ error: 'API endpoint not found' });
      } catch (err: any) {
        console.error('[Vite API Middleware Error]', err);
        res.status(500).json({ error: err?.message || 'Internal Server Error' });
      }
    });
  };

  return {
    name: 'vercel-serverless-api-adapter',
    configureServer(server) {
      attachMiddleware(server);
    },
    configurePreviewServer(server) {
      attachMiddleware(server);
    },
  };
}

export default defineConfig({
  plugins: [react(), vercelApiPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
