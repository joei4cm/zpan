import { z } from 'zod'

export const localStoreBillingIntervalSchema = z.enum(['month', 'year'])

export const localStoreProductInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional().default(''),
    storageBytes: z.number().int().positive(),
    amountCents: z.number().int().positive(),
    currency: z.literal('usd').optional().default('usd'),
    interval: localStoreBillingIntervalSchema.nullable().optional(),
    active: z.boolean().optional().default(true),
  })
  .strict()

export const localStoreProductPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    storageBytes: z.number().int().positive().optional(),
    amountCents: z.number().int().positive().optional(),
    interval: localStoreBillingIntervalSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()

export const localStoreGiftCardCreateSchema = z
  .object({
    storageBytes: z.number().int().positive(),
    count: z.number().int().min(1).max(100),
    expiresAt: z.string().datetime().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()

export type LocalStoreProductInput = z.input<typeof localStoreProductInputSchema>
export type LocalStoreProductPatch = z.input<typeof localStoreProductPatchSchema>
export type LocalStoreGiftCardCreate = z.input<typeof localStoreGiftCardCreateSchema>
