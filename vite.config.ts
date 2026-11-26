import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

// Local Vercel Serverless Function adapter for Vite dev/preview server
function vercelApiPlugin(): Plugin {
  const attachMiddleware = (server: any, isDevServer = false) => {
    const loadApi = async (relPath: string) => {
      if (isDevServer && typeof server?.ssrLoadModule === 'function') {
        return await server.ssrLoadModule(relPath);
      }
      const absUrl = pathToFileURL(path.resolve(process.cwd(), relPath.replace(/^\/+/, ''))).href;
      return await import(absUrl);
    };

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
          const mod = await loadApi('/api/recipes/index.ts');
          return await mod.default(req, res);
        }
        if (pathname.startsWith('/api/recipes/')) {
          req.query.slug = decodeURIComponent(pathname.slice('/api/recipes/'.length));
          const mod = await loadApi('/api/recipes/[slug].ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/stripe/checkout') {
          const mod = await loadApi('/api/stripe/checkout.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/stripe/portal') {
          const mod = await loadApi('/api/stripe/portal.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/stripe/webhook') {
          const mod = await loadApi('/api/stripe/webhook.ts');
          if (typeof mod.POST === 'function' || typeof mod.GET === 'function') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBuf = Buffer.concat(chunks);
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers || {})) {
              if (Array.isArray(v)) v.forEach(item => headers.append(k, String(item)));
              else if (typeof v === 'string') headers.set(k, v);
            }
            const method = (req.method || 'GET').toUpperCase();
            const fn = mod[method];
            if (typeof fn !== 'function') {
              res.setHeader('Allow', 'POST');
              return res.status(405).json({ error: 'Method Not Allowed' });
            }
            const webReq = new Request(urlObj.href, {
              method,
              headers,
              body: method === 'GET' || method === 'HEAD' ? undefined : rawBuf,
            });
            const webRes: Response = await fn(webReq);
            res.statusCode = webRes.status;
            webRes.headers.forEach((val, key) => res.setHeader(key, val));
            const outBuf = Buffer.from(await webRes.arrayBuffer());
            res.end(outBuf);
            return;
          }
          return await mod.default(req, res);
        }
        if (pathname === '/api/me') {
          const mod = await loadApi('/api/me.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/health') {
          const mod = await loadApi('/api/health.ts');
          return await mod.default(req, res);
        }
        if (pathname === '/api/geo') {
          const mod = await loadApi('/api/geo.ts');
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
      attachMiddleware(server, true);
    },
    configurePreviewServer(server) {
      attachMiddleware(server, false);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env / .env.local variables (including server-only POSTGRES_URL, CLERK_SECRET_KEY, STRIPE_*)
  // so local Vite API middleware behaves identically to Vercel Serverless Functions.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined && v !== '') {
      process.env[k] = v;
    }
  }

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), vercelApiPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
