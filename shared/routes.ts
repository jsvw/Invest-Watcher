import { z } from 'zod';
import { insertPlatformSchema, insertInvestmentSchema, insertValuationSchema, platforms, investments, valuations } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  platforms: {
    list: {
      method: 'GET' as const,
      path: '/api/platforms',
      responses: {
        200: z.array(z.custom<typeof platforms.$inferSelect & { currentValue?: string, totalInvested?: string }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/platforms',
      input: insertPlatformSchema,
      responses: {
        201: z.custom<typeof platforms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/platforms/:id',
      responses: {
        200: z.custom<typeof platforms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  investments: {
    list: {
      method: 'GET' as const,
      path: '/api/platforms/:platformId/investments',
      responses: {
        200: z.array(z.custom<typeof investments.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/investments',
      input: insertInvestmentSchema,
      responses: {
        201: z.custom<typeof investments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  valuations: {
    list: {
      method: 'GET' as const,
      path: '/api/platforms/:platformId/valuations',
      responses: {
        200: z.array(z.custom<typeof valuations.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/valuations',
      input: insertValuationSchema,
      responses: {
        201: z.custom<typeof valuations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  insights: {
    generate: {
      method: 'POST' as const,
      path: '/api/insights',
      input: z.object({ prompt: z.string().optional() }),
      responses: {
        200: z.object({ insight: z.string() }),
        500: errorSchemas.internal,
      },
    },
  },
};

// ============================================
// HELPER
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
