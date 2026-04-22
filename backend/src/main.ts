import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

/**
 * Parse `FRONTEND_ORIGIN` into an allow-list.
 *
 * We deliberately refuse `*`: financial data (commission splits, agent
 * earnings) must never be reachable from a cross-origin page the user
 * didn't explicitly trust. An unset env var falls back to the local Nuxt
 * dev server so `npm run dev` still works without configuration; anything
 * beyond that must be spelled out.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return ['http://localhost:3000'];
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.includes('*')) {
    throw new Error(
      'FRONTEND_ORIGIN="*" is refused — this API serves financial data and must be origin-locked.',
    );
  }
  return origins;
}

const VERCEL_HOST_SUFFIX = '.vercel.app';

function vercelHostnameStem(hostname: string): string | null {
  if (!hostname.endsWith(VERCEL_HOST_SUFFIX)) return null;
  return hostname.slice(0, -VERCEL_HOST_SUFFIX.length);
}

/**
 * True when `requestHost` is the same Vercel project as `listedHost`
 * (production URL you put in `FRONTEND_ORIGIN`).
 *
 * Vercel uses several preview hostname shapes, e.g.
 * `{project}-git-{branch}-{team}.vercel.app` and
 * `{project}-{hash}-{team}.vercel.app` — we cannot rely on `-git-` only.
 * We require the preview stem to share the production prefix and to have
 * strictly more `-` segments so `estate-agency-evil` does not match
 * `estate-agency-ay4u`.
 */
export function vercelHostsShareSameProject(
  requestHost: string,
  listedHost: string,
): boolean {
  const a = vercelHostnameStem(requestHost);
  const b = vercelHostnameStem(listedHost);
  if (a === null || b === null) return false;
  if (a === b) return true;

  const aParts = a.split('-');
  const bParts = b.split('-');

  if (bParts.length === 1) {
    return a.startsWith(`${b}-`) && aParts.length >= 3;
  }

  const lastDash = b.lastIndexOf('-');
  const prefix = lastDash >= 0 ? b.slice(0, lastDash + 1) : `${b}-`;
  if (!a.startsWith(prefix)) return false;

  return aParts.length > bParts.length;
}

function listedVercelHosts(allowedOrigins: string[]): string[] {
  const hosts: string[] = [];
  for (const o of allowedOrigins) {
    try {
      const host = new URL(o).hostname;
      if (host.endsWith(VERCEL_HOST_SUFFIX)) hosts.push(host);
    } catch {
      /* skip */
    }
  }
  return hosts;
}

/** Whether `origin` may call this API from a browser (CORS). */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    for (const o of allowedOrigins) {
      try {
        const listedHost = new URL(o).hostname;
        if (vercelHostsShareSameProject(host, listedHost)) return true;
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers: sets sane defaults for CSP, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, etc. We keep helmet's stock
  // config — the API returns JSON only, so the default CSP is safe, and
  // we serve Swagger from the same origin which is already allowed.
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN);
  const vercelListed = listedVercelHosts(allowedOrigins);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    },
    // Matches what we actually use; narrower than the NestJS default
    // (`*`), which reflected every request method back.
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // `credentials: true` would let the browser attach cookies. We have
    // no session cookies today, so leaving it off is the safer default
    // — flip it on (and drop any `*` origins) the day we add auth.
    credentials: false,
    maxAge: 600,
  });
  Logger.log(
    `CORS allow-list: ${allowedOrigins.join(', ')}` +
      (vercelListed.length > 0
        ? `; sibling *.vercel.app deployment URLs allowed for: ${vercelListed.join(', ')}`
        : ''),
    'Bootstrap',
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Estate Agency API')
    .setDescription(
      'Transaction lifecycle + commission breakdown API for estate agency consultancy.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('agents')
    .addTag('transactions')
    .addTag('health')
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, doc);

  const port = process.env.PORT ?? 3001;
  // Bind to `0.0.0.0` explicitly: on PaaS providers (Render, Fly, etc.)
  // the container has its own internal interface and localhost-only
  // binding silently answers nothing. NestJS's default is already
  // `0.0.0.0` with Express, but stating it makes the intent visible to
  // anyone reading the bootstrap path.
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
  Logger.log(`Swagger docs at /api/docs`, 'Bootstrap');
}

// Only auto-run the bootstrap when this module is executed as the entry
// point (via `nest start`, `node dist/src/main.js`, etc.). Guarding lets the
// spec file import `parseAllowedOrigins` without spinning up an actual
// Nest app — which would try to connect to MongoDB and leak worker
// processes into the Jest run.
if (require.main === module) {
  void bootstrap();
}
