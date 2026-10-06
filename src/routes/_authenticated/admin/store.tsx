import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Gift, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AdminFormDrawer, AdminFormField, AdminSwitchField } from '@/components/admin/admin-form-drawer'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { LocalStoreGiftCard, LocalStoreProduct } from '@/lib/api'
import {
  createLocalStoreGiftCards,
  createLocalStoreProduct,
  deleteLocalStoreProduct,
  disableLocalStoreGiftCard,
  listLocalStoreGiftCards,
  listLocalStoreProducts,
  updateLocalStoreProduct,
} from '@/lib/api'
import { formatCurrency, formatSize } from '@/lib/format'

export const Route = createFileRoute('/_authenticated/admin/store')({
  component: AdminStorePage,
})

const PRODUCTS_KEY = ['admin', 'store', 'products'] as const
const GIFT_CARDS_KEY = ['admin', 'store', 'gift-cards'] as const
const BYTE_UNITS = { MB: 1024 ** 2, GB: 1024 ** 3 } as const
type ByteUnit = keyof typeof BYTE_UNITS

function bytesToUnitValue(bytes: number, unit: ByteUnit) {
  return String(bytes / BYTE_UNITS[unit])
}

function parseBytes(value: string, unit: ByteUnit) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * BYTE_UNITS[unit])
}

function parseCents(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100)
}

export function AdminStorePage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [productOpen, setProductOpen] = useState(false)
  const [editing, setEditing] = useState<LocalStoreProduct | null>(null)
  const [giftOpen, setGiftOpen] = useState(false)
  const [issuedCodes, setIssuedCodes] = useState<string[]>([])

  const productsQuery = useQuery({ queryKey: PRODUCTS_KEY, queryFn: listLocalStoreProducts })
  const giftCardsQuery = useQuery({ queryKey: GIFT_CARDS_KEY, queryFn: listLocalStoreGiftCards })
  const products = productsQuery.data?.items ?? []
  const giftCards = giftCardsQuery.data?.items ?? []

  return (
    <div className="space-y-8">
      <AdminPageHeader title={t('admin.store.title')} description={t('admin.store.description')} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t('admin.store.productsTitle')}</h3>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setProductOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('admin.store.addProduct')}
          </Button>
        </div>
        {productsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border px-4 py-12 text-sm text-muted-foreground">
            <ShoppingBag className="h-8 w-8" />
            {t('admin.store.noProducts')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.store.colName')}</TableHead>
                <TableHead>{t('admin.store.colStorage')}</TableHead>
                <TableHead>{t('admin.store.colPrice')}</TableHead>
                <TableHead>{t('admin.store.colInterval')}</TableHead>
                <TableHead>{t('admin.store.colStatus')}</TableHead>
                <TableHead className="text-right">{t('admin.storages.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{formatSize(product.storageBytes)}</TableCell>
                  <TableCell>{formatCurrency(product.amountCents, product.currency, i18n.resolvedLanguage)}</TableCell>
                  <TableCell>
                    {product.interval ? t(`admin.store.interval.${product.interval}`) : t('admin.store.interval.once')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.active ? 'default' : 'secondary'}>
                      {product.active ? t('admin.store.statusActive') : t('admin.store.statusInactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(product)
                        setProductOpen(true)
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await deleteLocalStoreProduct(product.id)
                        queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
                        toast.success(t('admin.store.productDeleted'))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t('admin.store.giftCardsTitle')}</h3>
          <Button size="sm" onClick={() => setGiftOpen(true)}>
            <Gift className="mr-2 h-4 w-4" />
            {t('admin.store.issueGiftCards')}
          </Button>
        </div>
        {giftCardsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : giftCards.length === 0 ? (
          <p className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
            {t('admin.store.noGiftCards')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.store.colCode')}</TableHead>
                <TableHead>{t('admin.store.colStorage')}</TableHead>
                <TableHead>{t('admin.store.colStatus')}</TableHead>
                <TableHead>{t('admin.store.colNote')}</TableHead>
                <TableHead className="text-right">{t('admin.storages.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {giftCards.map((card) => (
                <GiftCardRow
                  key={card.id}
                  card={card}
                  onDisabled={() => queryClient.invalidateQueries({ queryKey: GIFT_CARDS_KEY })}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <ProductDrawer
        key={editing?.id ?? 'create'}
        open={productOpen}
        product={editing}
        onOpenChange={setProductOpen}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY })
          setProductOpen(false)
          setEditing(null)
        }}
      />
      <GiftCardDrawer
        open={giftOpen}
        onOpenChange={setGiftOpen}
        onIssued={(codes) => {
          queryClient.invalidateQueries({ queryKey: GIFT_CARDS_KEY })
          setGiftOpen(false)
          setIssuedCodes(codes)
        }}
      />
      {issuedCodes.length > 0 && <IssuedCodesDrawer codes={issuedCodes} onClose={() => setIssuedCodes([])} />}
    </div>
  )
}

function GiftCardRow({ card, onDisabled }: { card: LocalStoreGiftCard; onDisabled: () => void }) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell className="font-mono">****{card.codeLast4}</TableCell>
      <TableCell>{formatSize(card.storageBytes)}</TableCell>
      <TableCell>{t(`admin.store.giftStatus.${card.status}`, { defaultValue: card.status })}</TableCell>
      <TableCell className="max-w-48 truncate">{card.note ?? '—'}</TableCell>
      <TableCell className="text-right">
        {card.status === 'active' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await disableLocalStoreGiftCard(card.id)
              toast.success(t('admin.store.giftCardDisabled'))
              onDisabled()
            }}
          >
            {t('admin.store.disable')}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function ProductDrawer({
  open,
  product,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  product: LocalStoreProduct | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [unit, setUnit] = useState<ByteUnit>(product && product.storageBytes >= BYTE_UNITS.GB ? 'GB' : 'MB')
  const [storageValue, setStorageValue] = useState(
    product ? bytesToUnitValue(product.storageBytes, product.storageBytes >= BYTE_UNITS.GB ? 'GB' : 'MB') : '10',
  )
  const [price, setPrice] = useState(product ? String(product.amountCents / 100) : '9.99')
  const [interval, setInterval] = useState<'once' | 'month' | 'year'>(product?.interval ?? 'once')
  const [active, setActive] = useState(product?.active ?? true)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const storageBytes = parseBytes(storageValue, unit)
      const amountCents = parseCents(price)
      if (!name.trim()) throw new Error(t('admin.store.nameRequired'))
      if (!storageBytes) throw new Error(t('admin.store.storageRequired'))
      if (!amountCents) throw new Error(t('admin.store.priceRequired'))
      const payload = {
        name: name.trim(),
        description,
        storageBytes,
        amountCents,
        interval: interval === 'once' ? null : interval,
        active,
      }
      if (product) return updateLocalStoreProduct(product.id, payload)
      return createLocalStoreProduct(payload)
    },
    onSuccess: () => {
      toast.success(product ? t('admin.store.productUpdated') : t('admin.store.productCreated'))
      onSaved()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <AdminFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={product ? t('admin.store.editProduct') : t('admin.store.addProduct')}
      description={t('admin.store.productHelp')}
      bodyClassName="grid auto-rows-min content-start gap-4"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
      formProps={{
        onSubmit: (event) => {
          event.preventDefault()
          saveMutation.mutate()
        },
      }}
    >
      <AdminFormField label={t('admin.store.fieldName')} required>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('admin.store.namePlaceholder')}
        />
      </AdminFormField>
      <AdminFormField label={t('admin.store.fieldDescription')} help={t('admin.store.descriptionHelp')}>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('admin.store.descriptionPlaceholder')}
        />
      </AdminFormField>
      <AdminFormField label={t('admin.store.fieldStorage')} required>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            step="any"
            value={storageValue}
            onChange={(event) => setStorageValue(event.target.value)}
            placeholder="10"
          />
          <Select value={unit} onValueChange={(value) => setUnit(value as ByteUnit)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MB">MB</SelectItem>
              <SelectItem value="GB">GB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </AdminFormField>
      <AdminFormField label={t('admin.store.fieldPrice')} required help={t('admin.store.priceHelp')}>
        <Input
          type="number"
          min={0.01}
          step="0.01"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="9.99"
        />
      </AdminFormField>
      <AdminFormField label={t('admin.store.fieldInterval')}>
        <Select value={interval} onValueChange={(value) => setInterval(value as typeof interval)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">{t('admin.store.interval.once')}</SelectItem>
            <SelectItem value="month">{t('admin.store.interval.month')}</SelectItem>
            <SelectItem value="year">{t('admin.store.interval.year')}</SelectItem>
          </SelectContent>
        </Select>
      </AdminFormField>
      <AdminSwitchField
        id="store-product-active"
        label={t('admin.store.fieldActive')}
        checked={active}
        onCheckedChange={setActive}
      />
    </AdminFormDrawer>
  )
}

function GiftCardDrawer({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssued: (codes: string[]) => void
}) {
  const { t } = useTranslation()
  const [unit, setUnit] = useState<ByteUnit>('GB')
  const [storageValue, setStorageValue] = useState('10')
  const [count, setCount] = useState('1')
  const [note, setNote] = useState('')

  const issueMutation = useMutation({
    mutationFn: async () => {
      const storageBytes = parseBytes(storageValue, unit)
      const parsedCount = Number(count)
      if (!storageBytes) throw new Error(t('admin.store.storageRequired'))
      if (!Number.isInteger(parsedCount) || parsedCount < 1) throw new Error(t('admin.store.countRequired'))
      return createLocalStoreGiftCards({
        storageBytes,
        count: parsedCount,
        note: note.trim() || null,
      })
    },
    onSuccess: (result) => {
      toast.success(t('admin.store.giftCardsCreated'))
      onIssued(result.items.map((item) => item.code).filter((code): code is string => Boolean(code)))
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <AdminFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('admin.store.issueGiftCards')}
      description={t('admin.store.giftCardHelp')}
      bodyClassName="grid auto-rows-min content-start gap-4"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={issueMutation.isPending}>
            {t('admin.store.issue')}
          </Button>
        </>
      }
      formProps={{
        onSubmit: (event) => {
          event.preventDefault()
          issueMutation.mutate()
        },
      }}
    >
      <AdminFormField label={t('admin.store.fieldStorage')} required>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={storageValue}
            onChange={(event) => setStorageValue(event.target.value)}
            placeholder="10"
          />
          <Select value={unit} onValueChange={(value) => setUnit(value as ByteUnit)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MB">MB</SelectItem>
              <SelectItem value="GB">GB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </AdminFormField>
      <AdminFormField label={t('admin.store.fieldCount')} required>
        <Input
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          placeholder="1"
        />
      </AdminFormField>
      <AdminFormField label={t('admin.store.fieldNote')}>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('admin.store.notePlaceholder')}
        />
      </AdminFormField>
    </AdminFormDrawer>
  )
}

function IssuedCodesDrawer({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const text = useMemo(() => codes.join('\n'), [codes])
  return (
    <AdminFormDrawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.store.issuedCodesTitle')}
      description={t('admin.store.issuedCodesHelp')}
      bodyClassName="grid auto-rows-min content-start gap-4"
      footer={
        <Button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () => toast.success(t('admin.store.codesCopied')),
              () => toast.error(t('common.error')),
            )
          }}
        >
          {t('admin.store.copyCodes')}
        </Button>
      }
    >
      <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-sm">{text}</pre>
    </AdminFormDrawer>
  )
}
