import { z } from 'zod'
import { opaqueIdSchema } from './id'

export const UPLOAD_SELECTOR_KEYS = [
  'space.id',
  'space.type',
  'file.category',
  'file.mime',
  'file.extension',
  'upload.source',
] as const

export type UploadSelectorKey = (typeof UPLOAD_SELECTOR_KEYS)[number]

export const UPLOAD_SELECTOR_OPERATORS = ['In', 'NotIn', 'Exists', 'DoesNotExist'] as const

const uploadSelectorKeySchema = z.enum(UPLOAD_SELECTOR_KEYS)

export const uploadSelectionModeSchema = z.enum(['ordered', 'balanced'])

export const uploadSelectorExpressionSchema = z
  .object({
    key: uploadSelectorKeySchema,
    operator: z.enum(UPLOAD_SELECTOR_OPERATORS),
    values: z.array(z.string().min(1).max(256)).max(32).optional(),
  })
  .superRefine((expression, ctx) => {
    const needsValues = expression.operator === 'In' || expression.operator === 'NotIn'
    const values = expression.values ?? []
    if (needsValues && values.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'In/NotIn expressions require at least one value',
        path: ['values'],
      })
    }
    if (!needsValues && values.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Exists/DoesNotExist expressions must not include values',
        path: ['values'],
      })
    }
  })

export const uploadSelectorSchema = z
  .object({
    matchLabels: z
      .record(z.string(), z.string().min(1).max(256))
      .optional()
      .superRefine((labels, ctx) => {
        if (!labels) return
        for (const key of Object.keys(labels)) {
          if (!UPLOAD_SELECTOR_KEYS.includes(key as UploadSelectorKey)) {
            ctx.addIssue({
              code: 'custom',
              message: `Unsupported selector key: ${key}`,
              path: [key],
            })
          }
        }
      }),
    matchExpressions: z.array(uploadSelectorExpressionSchema).max(32).optional(),
  })
  .default({})

export const createUploadPolicySchema = z.object({
  name: z.string().trim().min(1).max(128),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1_000_000).default(10),
  selector: uploadSelectorSchema,
  storageIds: z.array(opaqueIdSchema).min(1).max(64),
  selectionMode: uploadSelectionModeSchema.default('ordered'),
})

export const updateUploadPolicySchema = z.object({
  name: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1_000_000),
  selector: uploadSelectorSchema,
  storageIds: z.array(opaqueIdSchema).min(1).max(64),
  selectionMode: uploadSelectionModeSchema,
})

export const patchUploadPolicySchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(1_000_000).optional(),
    selector: uploadSelectorSchema.optional(),
    storageIds: z.array(opaqueIdSchema).min(1).max(64).optional(),
    selectionMode: uploadSelectionModeSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: 'At least one field is required' })

export type CreateUploadPolicyInput = z.infer<typeof createUploadPolicySchema>
export type UpdateUploadPolicyInput = z.infer<typeof updateUploadPolicySchema>
export type PatchUploadPolicyInput = z.infer<typeof patchUploadPolicySchema>
export type UploadSelectorInput = z.infer<typeof uploadSelectorSchema>
export type UploadSelectionModeInput = z.infer<typeof uploadSelectionModeSchema>
