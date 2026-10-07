import {
  type CreateUploadPolicyInput,
  UPLOAD_SELECTOR_KEYS,
  UPLOAD_SELECTOR_OPERATORS,
  type UpdateUploadPolicyInput,
} from '@shared/schemas'
import type { Storage, UploadPolicy, UploadSelector } from '@shared/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AdminFormDrawer, AdminFormField, AdminFormLabel, AdminSwitchField } from '@/components/admin/admin-form-drawer'
import { ProBadge } from '@/components/ProBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createUploadPolicy, updateUploadPolicy } from '@/lib/api'

type SelectorLabelRow = { id: string; key: string; value: string }
type SelectorExpressionRow = {
  id: string
  key: string
  operator: (typeof UPLOAD_SELECTOR_OPERATORS)[number]
  values: string
}

let selectorRowSeq = 0
function nextSelectorRowId(prefix: string) {
  selectorRowSeq += 1
  return `${prefix}-${selectorRowSeq}`
}

type FormState = {
  name: string
  enabled: boolean
  priority: string
  selectionMode: 'ordered' | 'balanced'
  storageIds: string[]
  matchLabels: SelectorLabelRow[]
  matchExpressions: SelectorExpressionRow[]
}

const emptyForm = (): FormState => ({
  name: '',
  enabled: true,
  priority: '10',
  selectionMode: 'ordered',
  storageIds: [],
  matchLabels: [],
  matchExpressions: [],
})

function formFromPolicy(policy: UploadPolicy | null, storages: Storage[]): FormState {
  if (!policy) {
    return {
      ...emptyForm(),
      storageIds: storages.slice(0, 1).map((storage) => storage.id),
    }
  }
  return {
    name: policy.name,
    enabled: policy.enabled,
    priority: String(policy.priority),
    selectionMode: policy.selectionMode,
    storageIds: [...policy.storageIds],
    matchLabels: Object.entries(policy.selector.matchLabels ?? {}).map(([key, value]) => ({
      id: nextSelectorRowId('label'),
      key,
      value,
    })),
    matchExpressions: (policy.selector.matchExpressions ?? []).map((expression) => ({
      id: nextSelectorRowId('expr'),
      key: expression.key,
      operator: expression.operator,
      values: (expression.values ?? []).join(', '),
    })),
  }
}

function buildSelector(form: FormState): UploadSelector {
  const matchLabels = Object.fromEntries(
    form.matchLabels.filter((row) => row.key && row.value.trim()).map((row) => [row.key, row.value.trim()] as const),
  )
  const matchExpressions = form.matchExpressions
    .filter((row) => row.key)
    .map((row) => {
      const needsValues = row.operator === 'In' || row.operator === 'NotIn'
      return {
        key: row.key,
        operator: row.operator,
        ...(needsValues
          ? {
              values: row.values
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : {}),
      }
    })
  return {
    ...(Object.keys(matchLabels).length > 0 ? { matchLabels } : {}),
    ...(matchExpressions.length > 0 ? { matchExpressions } : {}),
  }
}

interface UploadPolicyFormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: UploadPolicy | null
  storages: Storage[]
  canEditCustom: boolean
}

export function UploadPolicyFormDrawer({
  open,
  onOpenChange,
  policy,
  storages,
  canEditCustom,
}: UploadPolicyFormDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)
  const isEditing = policy !== null
  const isDefault = policy?.isDefault === true
  const selectorLocked = isDefault || (!isEditing && !canEditCustom)
  const customLocked = isDefault ? false : !canEditCustom && isEditing

  useEffect(() => {
    if (!open) return
    setForm(formFromPolicy(policy, storages))
  }, [open, policy, storages])

  const selectedStorages = useMemo(
    () => form.storageIds.map((id) => storages.find((storage) => storage.id === id)).filter(Boolean) as Storage[],
    [form.storageIds, storages],
  )
  const availableStorages = storages.filter((storage) => !form.storageIds.includes(storage.id))

  const mutation = useMutation({
    mutationFn: async () => {
      const selector = isDefault ? {} : buildSelector(form)
      const payload = {
        name: form.name.trim() || (isDefault ? 'Default' : ''),
        enabled: isDefault ? true : form.enabled,
        priority: isDefault ? 0 : Number.parseInt(form.priority, 10) || 0,
        selector,
        storageIds: form.storageIds,
        selectionMode: form.selectionMode,
      }
      if (isEditing && policy) return updateUploadPolicy(policy.id, payload as UpdateUploadPolicyInput)
      return createUploadPolicy(payload as CreateUploadPolicyInput)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'upload-policies'] })
      onOpenChange(false)
      toast.success(isEditing ? t('admin.storages.policies.updated') : t('admin.storages.policies.created'))
    },
    onError: (error) => toast.error(error.message),
  })

  const canSubmit =
    form.storageIds.length > 0 &&
    (isDefault || form.name.trim().length > 0) &&
    !customLocked &&
    !(selectorLocked && !isEditing && !canEditCustom)

  function moveStorage(index: number, direction: -1 | 1) {
    const next = [...form.storageIds]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setForm((current) => ({ ...current, storageIds: next }))
  }

  return (
    <AdminFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      title={
        isEditing
          ? isDefault
            ? t('admin.storages.policies.editDefaultTitle')
            : t('admin.storages.policies.editTitle')
          : t('admin.storages.policies.addTitle')
      }
      description={t('admin.storages.policies.formDescription')}
      bodyClassName="grid auto-rows-min content-start gap-4"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="upload-policy-form" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
      formProps={{
        id: 'upload-policy-form',
        onSubmit: (event) => {
          event.preventDefault()
          if (!canSubmit) return
          mutation.mutate()
        },
      }}
    >
      <AdminFormField
        label={t('admin.storages.policies.field.name')}
        required={!isDefault}
        help={isDefault ? t('admin.storages.policies.field.nameDefaultHelp') : undefined}
      >
        <Input
          value={form.name}
          disabled={isDefault || customLocked}
          placeholder={t('admin.storages.policies.field.namePlaceholder')}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
      </AdminFormField>

      {!isDefault && (
        <>
          <AdminSwitchField
            id="upload-policy-enabled"
            label={
              <span className="inline-flex items-center gap-2">
                {t('admin.storages.policies.field.enabled')}
                {!canEditCustom && <ProBadge />}
              </span>
            }
            checked={form.enabled}
            disabled={customLocked}
            onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
          />
          <AdminFormField
            label={
              <span className="inline-flex items-center gap-2">
                {t('admin.storages.policies.field.priority')}
                {!canEditCustom && <ProBadge />}
              </span>
            }
            required
            help={t('admin.storages.policies.field.priorityHelp')}
          >
            <Input
              type="number"
              min={0}
              value={form.priority}
              disabled={customLocked}
              placeholder={t('admin.storages.policies.field.priorityPlaceholder')}
              onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
            />
          </AdminFormField>
        </>
      )}

      <AdminFormField
        label={t('admin.storages.policies.field.selectionMode')}
        required
        help={t('admin.storages.policies.field.selectionModeHelp')}
      >
        {(controlProps) => (
          <Select
            value={form.selectionMode}
            onValueChange={(value: 'ordered' | 'balanced') =>
              setForm((current) => ({ ...current, selectionMode: value }))
            }
          >
            <SelectTrigger {...controlProps}>
              <SelectValue placeholder={t('admin.storages.policies.field.selectionModePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ordered">{t('admin.storages.policies.mode.ordered')}</SelectItem>
              <SelectItem value="balanced">{t('admin.storages.policies.mode.balanced')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </AdminFormField>

      <div className="space-y-2">
        <AdminFormLabel htmlFor="upload-policy-storages" required>
          {t('admin.storages.policies.field.storages')}
        </AdminFormLabel>
        <p className="text-xs text-muted-foreground">{t('admin.storages.policies.field.storagesHelp')}</p>
        <div className="space-y-2">
          {selectedStorages.map((storage, index) => (
            <div key={storage.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{storage.bucket}</div>
                <div className="truncate text-xs text-muted-foreground">{storage.endpoint}</div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => moveStorage(index, -1)}
                disabled={index === 0}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => moveStorage(index, 1)}
                disabled={index === selectedStorages.length - 1}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    storageIds: current.storageIds.filter((id) => id !== storage.id),
                  }))
                }
                disabled={form.storageIds.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {availableStorages.length > 0 && (
          <Select
            value=""
            onValueChange={(value) =>
              setForm((current) => ({ ...current, storageIds: [...current.storageIds, value] }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('admin.storages.policies.field.addStoragePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {availableStorages.map((storage) => (
                <SelectItem key={storage.id} value={storage.id}>
                  {storage.bucket}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!isDefault && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AdminFormLabel htmlFor="upload-policy-selector">
              <span className="inline-flex items-center gap-2">
                {t('admin.storages.policies.field.selector')}
                {!canEditCustom && <ProBadge />}
              </span>
            </AdminFormLabel>
          </div>
          <p className="text-xs text-muted-foreground">{t('admin.storages.policies.field.selectorHelp')}</p>

          <div className="space-y-2">
            <div className="text-xs font-medium">{t('admin.storages.policies.field.matchLabels')}</div>
            {form.matchLabels.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Select
                  value={row.key}
                  disabled={customLocked}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      matchLabels: current.matchLabels.map((item) =>
                        item.id === row.id ? { ...item, key: value } : item,
                      ),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.storages.policies.field.keyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_SELECTOR_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={row.value}
                  disabled={customLocked}
                  placeholder={t('admin.storages.policies.field.valuePlaceholder')}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      matchLabels: current.matchLabels.map((item) =>
                        item.id === row.id ? { ...item, value: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={customLocked}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      matchLabels: current.matchLabels.filter((item) => item.id !== row.id),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={customLocked}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  matchLabels: [
                    ...current.matchLabels,
                    { id: nextSelectorRowId('label'), key: 'file.category', value: '' },
                  ],
                }))
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('admin.storages.policies.field.addLabel')}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium">{t('admin.storages.policies.field.matchExpressions')}</div>
            {form.matchExpressions.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Select
                  value={row.key}
                  disabled={customLocked}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      matchExpressions: current.matchExpressions.map((item) =>
                        item.id === row.id ? { ...item, key: value } : item,
                      ),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('admin.storages.policies.field.keyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_SELECTOR_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.operator}
                  disabled={customLocked}
                  onValueChange={(value: (typeof UPLOAD_SELECTOR_OPERATORS)[number]) =>
                    setForm((current) => ({
                      ...current,
                      matchExpressions: current.matchExpressions.map((item) =>
                        item.id === row.id ? { ...item, operator: value } : item,
                      ),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_SELECTOR_OPERATORS.map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {operator}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={row.values}
                  disabled={customLocked || row.operator === 'Exists' || row.operator === 'DoesNotExist'}
                  placeholder={t('admin.storages.policies.field.valuesPlaceholder')}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      matchExpressions: current.matchExpressions.map((item) =>
                        item.id === row.id ? { ...item, values: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={customLocked}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      matchExpressions: current.matchExpressions.filter((item) => item.id !== row.id),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={customLocked}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  matchExpressions: [
                    ...current.matchExpressions,
                    { id: nextSelectorRowId('expr'), key: 'upload.source', operator: 'In', values: '' },
                  ],
                }))
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('admin.storages.policies.field.addExpression')}
            </Button>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1 text-xs font-medium">{t('admin.storages.policies.field.selectorPreview')}</div>
            <pre className="overflow-x-auto text-[11px] text-muted-foreground">
              {JSON.stringify(buildSelector(form), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </AdminFormDrawer>
  )
}
