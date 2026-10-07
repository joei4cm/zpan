import type { Storage, UploadPolicy } from '@shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { UploadPolicyFormDrawer } from '@/components/admin/upload-policy-form-drawer'
import { ProBadge } from '@/components/ProBadge'
import { UpgradeHint } from '@/components/UpgradeHint'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useEntitlement } from '@/hooks/useEntitlement'
import { deleteUploadPolicy, listUploadPolicies } from '@/lib/api'

const QUERY_KEY = ['admin', 'upload-policies']

function summarizeSelector(policy: UploadPolicy): string {
  if (policy.isDefault) return '{}'
  const labels = Object.entries(policy.selector.matchLabels ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')
  const expressions = (policy.selector.matchExpressions ?? [])
    .map((expression) => {
      const values = expression.values?.length ? `(${expression.values.join('|')})` : ''
      return `${expression.key} ${expression.operator}${values}`
    })
    .join(', ')
  return [labels, expressions].filter(Boolean).join('; ') || '{}'
}

interface UploadPoliciesPanelProps {
  storages: Storage[]
}

export function UploadPoliciesPanel({ storages }: UploadPoliciesPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { hasFeature } = useEntitlement()
  const canEditCustom = hasFeature('upload_policies')
  const [formOpen, setFormOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<UploadPolicy | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UploadPolicy | null>(null)

  const policiesQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listUploadPolicies,
  })
  const policies = policiesQuery.data?.items ?? []

  const storageLabelById = useMemo(
    () => Object.fromEntries(storages.map((storage) => [storage.id, storage.bucket])),
    [storages],
  )

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUploadPolicy(id),
    onSuccess: () => {
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success(t('admin.storages.policies.deleted'))
    },
    onError: (error) => toast.error(error.message),
  })

  function openCreate() {
    if (!canEditCustom) return
    setEditingPolicy(null)
    setFormOpen(true)
  }

  function openEdit(policy: UploadPolicy) {
    setEditingPolicy(policy)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">{t('admin.storages.policies.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.storages.policies.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={!canEditCustom}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.storages.policies.add')}
          {!canEditCustom && <ProBadge className="ml-2" />}
        </Button>
      </div>

      {!canEditCustom && <UpgradeHint feature="upload_policies" />}

      <section className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.storages.policies.col.name')}</TableHead>
              <TableHead>{t('admin.storages.policies.col.enabled')}</TableHead>
              <TableHead>{t('admin.storages.policies.col.priority')}</TableHead>
              <TableHead>{t('admin.storages.policies.col.selector')}</TableHead>
              <TableHead>{t('admin.storages.policies.col.storages')}</TableHead>
              <TableHead>{t('admin.storages.policies.col.mode')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  {policiesQuery.isLoading ? t('common.loading') : t('admin.storages.policies.empty')}
                </TableCell>
              </TableRow>
            )}
            {policies.map((policy) => (
              <TableRow key={policy.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{policy.name}</span>
                    {policy.isDefault && <Badge variant="secondary">{t('admin.storages.policies.defaultBadge')}</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {policy.enabled ? t('admin.storages.policies.enabled') : t('admin.storages.policies.disabled')}
                </TableCell>
                <TableCell>{policy.priority}</TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">{summarizeSelector(policy)}</TableCell>
                <TableCell className="max-w-56 truncate text-sm">
                  {policy.storageIds.map((id) => storageLabelById[id] ?? id).join(' → ')}
                </TableCell>
                <TableCell>{t(`admin.storages.policies.mode.${policy.selectionMode}`)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(policy)}>
                      {t('common.edit')}
                    </Button>
                    {!policy.isDefault && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!canEditCustom}
                        onClick={() => setDeleteTarget(policy)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <UploadPolicyFormDrawer
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingPolicy(null)
        }}
        policy={editingPolicy}
        storages={storages}
        canEditCustom={canEditCustom}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.storages.policies.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.storages.policies.deleteConfirm', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
