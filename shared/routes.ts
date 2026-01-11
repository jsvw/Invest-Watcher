import { z } from 'zod';
import { 
  insertPlatformSchema, 
  insertInvestmentSchema, 
  insertWithdrawalSchema,
  insertValuationSchema, 
  platforms, 
  investments, 
  withdrawals,
  valuations,
  type InsertPlatform,
  type InsertInvestment,
  type InsertWithdrawal,
  type InsertValuation 
} from './schema';

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
    update: {
      method: 'PATCH' as const,
      path: '/api/investments/:id',
      input: insertInvestmentSchema.partial(),
      responses: {
        200: z.custom<typeof investments.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  withdrawals: {
    list: {
      method: 'GET' as const,
      path: '/api/platforms/:platformId/withdrawals',
      responses: {
        200: z.array(z.custom<typeof withdrawals.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/withdrawals',
      input: insertWithdrawalSchema,
      responses: {
        201: z.custom<typeof withdrawals.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/withdrawals/:id',
      input: insertWithdrawalSchema.partial(),
      responses: {
        200: z.custom<typeof withdrawals.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/withdrawals/:id',
      responses: {
        204: z.undefined(),
        404: errorSchemas.notFound,
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
    update: {
      method: 'PATCH' as const,
      path: '/api/valuations/:id',
      input: insertValuationSchema.partial(),
      responses: {
        200: z.custom<typeof valuations.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
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
  portfolio: {
    history: {
      method: 'GET' as const,
      path: '/api/portfolio/history',
      responses: {
        200: z.array(z.object({
          date: z.string(),
          value: z.number(),
          invested: z.number()
        })),
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

export type NoteInput = z.infer<typeof api.platforms.create.input>;
export type NoteResponse = z.infer<typeof api.platforms.create.responses[201]>;
export type ValidationError = z.infer<typeof errorSchemas.validation>;
export type NotFoundError = z.infer<typeof errorSchemas.notFound>;
export type InternalError = z.infer<typeof errorSchemas.internal>;

export { type InsertPlatform, type InsertInvestment, type InsertWithdrawal, type InsertValuation };
