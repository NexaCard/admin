<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  KeyRound,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-vue-next'
import { adminAPI } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatMoney, getLocalizedText } from '@/utils/format'
import { formatSkuDisplayLabel } from '@/utils/sku'
import type { AdminDashboardInventoryAlert } from '@/api/types'
import DashboardAd from '@/components/admin/DashboardAd.vue'

interface DashboardAlertItem {
  type: string
  level: string
  value: number
}

interface DashboardFunnel {
  orders_created: number
  payments_created: number
  payments_success: number
  orders_paid: number
  orders_completed: number
  payment_conversion_rate: string
  completion_rate: string
}

interface DashboardOverview {
  range: string
  from: string
  to: string
  timezone: string
  currency?: string
  kpi: {
    orders_total: number
    paid_orders: number
    completed_orders: number
    pending_payment_orders: number
    processing_orders: number
    gmv_paid: string
    total_cost: string
    total_profit: string
    profit_margin: string
    payments_total: number
    payments_success: number
    payments_failed: number
    payment_success_rate: string
    new_users: number
    active_products: number
    out_of_stock_products: number
    low_stock_products: number
    out_of_stock_skus: number
    low_stock_skus: number
    auto_available_secrets: number
    manual_available_units: number
    total_user_balance: string
  }
  funnel: DashboardFunnel
  alerts: DashboardAlertItem[]
}

interface DashboardTrendPoint {
  date: string
  orders_total: number
  orders_paid: number
  payments_success: number
  payments_failed: number
  gmv_paid: string
  profit: string
}

interface DashboardTrends {
  range: string
  from: string
  to: string
  timezone: string
  points: DashboardTrendPoint[]
}

interface DashboardProductRanking {
  product_id: number
  sku_id?: number
  sku_code?: string
  sku_spec_values?: Record<string, unknown>
  title: string
  paid_orders: number
  quantity: number
  paid_amount: string
  total_cost: string
  profit: string
}

interface DashboardChannelRanking {
  channel_id: number
  channel_name: string
  provider_type: string
  channel_type: string
  success_count: number
  failed_count: number
  success_amount: string
  success_rate: string
}

interface DashboardRankings {
  range: string
  from: string
  to: string
  timezone: string
  top_products: DashboardProductRanking[]
  top_channels: DashboardChannelRanking[]
}

const { t, locale } = useI18n()

const loadingOverview = ref(false)
const loadingTrends = ref(false)
const loadingRankings = ref(false)
const loadingInventoryAlerts = ref(false)
const dashboardError = ref('')
const overview = ref<DashboardOverview | null>(null)
const trends = ref<DashboardTrends | null>(null)
const rankings = ref<DashboardRankings | null>(null)
const inventoryAlerts = ref<AdminDashboardInventoryAlert[]>([])

const filters = reactive({
  range: '7d',
  from: '',
  to: '',
})

const rangeOptions = computed(() => [
  { value: 'today', label: t('admin.dashboard.range.today') },
  { value: '7d', label: t('admin.dashboard.range.last7Days') },
  { value: '30d', label: t('admin.dashboard.range.last30Days') },
  { value: 'custom', label: t('admin.dashboard.range.custom') },
])

const isCustomRange = computed(() => filters.range === 'custom')
const isDashboardLoading = computed(() => loadingOverview.value || loadingTrends.value || loadingRankings.value || loadingInventoryAlerts.value)
const trendPoints = computed(() => trends.value?.points || [])

const rankingSkuLabel = (item: DashboardProductRanking) =>
  formatSkuDisplayLabel({ sku_code: item.sku_code, spec_values: item.sku_spec_values }, locale.value)

const asPercent = (value?: string | number) => `${value ?? '0.00'}%`

const maxOrderTrend = computed(() => {
  let maxValue = 1
  trendPoints.value.forEach((point) => {
    maxValue = Math.max(maxValue, point.orders_total, point.orders_paid)
  })
  return maxValue
})

const maxPaymentTrend = computed(() => {
  let maxValue = 1
  trendPoints.value.forEach((point) => {
    maxValue = Math.max(maxValue, point.payments_success, point.payments_failed)
  })
  return maxValue
})

const funnelSteps = computed(() => {
  const funnel = overview.value?.funnel
  if (!funnel) return []
  return [
    { key: 'ordersCreated', label: t('admin.dashboard.funnel.ordersCreated'), value: funnel.orders_created },
    { key: 'paymentsCreated', label: t('admin.dashboard.funnel.paymentsCreated'), value: funnel.payments_created },
    { key: 'paymentsSuccess', label: t('admin.dashboard.funnel.paymentsSuccess'), value: funnel.payments_success },
    { key: 'ordersPaid', label: t('admin.dashboard.funnel.ordersPaid'), value: funnel.orders_paid },
    { key: 'ordersCompleted', label: t('admin.dashboard.funnel.ordersCompleted'), value: funnel.orders_completed },
  ]
})

const maxFunnelValue = computed(() => {
  let maxValue = 1
  funnelSteps.value.forEach((item) => {
    maxValue = Math.max(maxValue, item.value)
  })
  return maxValue
})

const orderTotalHeight = (value: number) => `${Math.max(4, Math.round((value / maxOrderTrend.value) * 100))}%`
const orderPaidHeight = (value: number) => `${Math.max(4, Math.round((value / maxOrderTrend.value) * 100))}%`
const paymentSuccessHeight = (value: number) => `${Math.max(4, Math.round((value / maxPaymentTrend.value) * 100))}%`
const paymentFailedHeight = (value: number) => `${Math.max(4, Math.round((value / maxPaymentTrend.value) * 100))}%`
const funnelWidth = (value: number) => `${Math.max(4, Math.round((value / maxFunnelValue.value) * 100))}%`

const shortDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
}

const makeRangeDate = (raw: string, endOfDay: boolean) => {
  if (!raw) return undefined
  const suffix = endOfDay ? 'T23:59:59' : 'T00:00:00'
  const date = new Date(`${raw}${suffix}`)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

const buildQuery = (forceRefresh = false) => {
  const params: Record<string, any> = {
    range: filters.range,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }

  if (isCustomRange.value) {
    const from = makeRangeDate(filters.from, false)
    const to = makeRangeDate(filters.to, true)
    if (!from || !to) {
      return null
    }
    params.from = from
    params.to = to
  }

  if (forceRefresh) {
    params.force_refresh = true
  }

  return params
}

const loadOverview = async (forceRefresh = false) => {
  loadingOverview.value = true
  try {
    const params = buildQuery(forceRefresh)
    if (!params) {
      dashboardError.value = t('admin.dashboard.errors.customRangeRequired')
      overview.value = null
      return
    }
    const response = await adminAPI.getDashboardOverview(params)
    overview.value = response.data.data as unknown as DashboardOverview
  } finally {
    loadingOverview.value = false
  }
}

const loadTrends = async (forceRefresh = false) => {
  loadingTrends.value = true
  try {
    const params = buildQuery(forceRefresh)
    if (!params) {
      trends.value = null
      return
    }
    const response = await adminAPI.getDashboardTrends(params)
    trends.value = response.data.data as unknown as DashboardTrends
  } finally {
    loadingTrends.value = false
  }
}

const loadRankings = async (forceRefresh = false) => {
  loadingRankings.value = true
  try {
    const params = buildQuery(forceRefresh)
    if (!params) {
      rankings.value = null
      return
    }
    const response = await adminAPI.getDashboardRankings(params)
    rankings.value = response.data.data as unknown as DashboardRankings
  } finally {
    loadingRankings.value = false
  }
}

const loadInventoryAlerts = async () => {
  loadingInventoryAlerts.value = true
  try {
    const response = await adminAPI.getDashboardInventoryAlerts()
    inventoryAlerts.value = (response.data.data as unknown as AdminDashboardInventoryAlert[]) || []
  } catch {
    inventoryAlerts.value = []
  } finally {
    loadingInventoryAlerts.value = false
  }
}

const loadDashboard = async (forceRefresh = false) => {
  dashboardError.value = ''
  try {
    await Promise.all([loadOverview(forceRefresh), loadTrends(forceRefresh), loadRankings(forceRefresh), loadInventoryAlerts()])
  } catch (error: any) {
    dashboardError.value = error?.message || t('admin.dashboard.errors.fetchFailed')
  }
}

const handleRangeChange = (value: unknown) => {
  const nextValue = String(value || '').trim() || '7d'
  filters.range = nextValue
  if (nextValue !== 'custom') {
    filters.from = ''
    filters.to = ''
    loadDashboard()
    return
  }

  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 6)
  filters.from = start.toISOString().slice(0, 10)
  filters.to = today.toISOString().slice(0, 10)
  loadDashboard()
}

const handleCustomRangeChange = () => {
  if (!isCustomRange.value) return
  loadDashboard()
}

const refreshDashboard = () => {
  loadDashboard(true)
}

const alertClass = (level: string) => {
  if (level === 'error') return 'nexa-alert-row-danger'
  if (level === 'warning') return 'nexa-alert-row-warning'
  return 'nexa-alert-row-neutral'
}

const alertLabel = (type: string) => {
  const key = `admin.dashboard.alertTypes.${type}`
  const translated = t(key)
  return translated === key ? type : translated
}

const inventoryAlertLabel = (item: AdminDashboardInventoryAlert) => {
  return item.alert_type === 'out_of_stock_products'
    ? t('admin.dashboard.inventoryAlerts.outOfStock')
    : t('admin.dashboard.inventoryAlerts.lowStock')
}

const inventoryAlertBadgeClass = (item: AdminDashboardInventoryAlert) => {
  return item.alert_type === 'out_of_stock_products'
    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
}

const skuSpecLabel = (item: AdminDashboardInventoryAlert) => {
  if (!item.sku_spec_values || Object.keys(item.sku_spec_values).length === 0) return ''
  return Object.values(item.sku_spec_values).join(' / ')
}

const channelLabel = (item: DashboardChannelRanking) => {
  if (item.channel_name) return item.channel_name
  return `${item.provider_type || '-'} / ${item.channel_type || '-'}`
}

const heroStats = computed(() => [
  {
    label: t('admin.dashboard.kpi.paymentSuccessRate'),
    value: asPercent(overview.value?.kpi.payment_success_rate),
    helper: t('admin.dashboard.hero.paymentsHealth'),
    tone: 'success',
  },
  {
    label: t('admin.dashboard.kpi.profitMargin'),
    value: asPercent(overview.value?.kpi.profit_margin),
    helper: t('admin.dashboard.hero.marginHealth'),
    tone: 'primary',
  },
  {
    label: t('admin.dashboard.kpi.lowStockProducts'),
    value: overview.value?.kpi.low_stock_products ?? 0,
    helper: t('admin.dashboard.hero.inventoryHealth'),
    tone: (overview.value?.kpi.low_stock_products || 0) > 0 ? 'warning' : 'muted',
  },
])

const primaryMetrics = computed(() => [
  {
    label: t('admin.dashboard.kpi.gmvPaid'),
    value: formatMoney(overview.value?.kpi.gmv_paid, overview.value?.currency),
    helper: `${t('admin.dashboard.kpi.paidOrders')}: ${overview.value?.kpi.paid_orders ?? 0}`,
    icon: CircleDollarSign,
    tone: 'primary',
  },
  {
    label: t('admin.dashboard.kpi.totalProfit'),
    value: formatMoney(overview.value?.kpi.total_profit, overview.value?.currency),
    helper: `${t('admin.dashboard.kpi.totalCost')}: ${formatMoney(overview.value?.kpi.total_cost, overview.value?.currency)}`,
    icon: TrendingUp,
    tone: 'success',
  },
  {
    label: t('admin.dashboard.kpi.ordersTotal'),
    value: overview.value?.kpi.orders_total ?? 0,
    helper: `${t('admin.dashboard.kpi.completedOrders')}: ${overview.value?.kpi.completed_orders ?? 0}`,
    icon: ShoppingBag,
    tone: 'info',
  },
  {
    label: t('admin.dashboard.kpi.totalUserBalance'),
    value: formatMoney(overview.value?.kpi.total_user_balance, overview.value?.currency),
    helper: `${t('admin.dashboard.kpi.newUsers')}: ${overview.value?.kpi.new_users ?? 0}`,
    icon: Wallet,
    tone: 'violet',
  },
])

const operationMetrics = computed(() => [
  {
    label: t('admin.dashboard.kpi.pendingOrders'),
    value: overview.value?.kpi.pending_payment_orders ?? 0,
    helper: `${t('admin.dashboard.kpi.processingOrders')}: ${overview.value?.kpi.processing_orders ?? 0}`,
    icon: Gauge,
    tone: 'warning',
  },
  {
    label: t('admin.dashboard.kpi.activeProducts'),
    value: overview.value?.kpi.active_products ?? 0,
    helper: `${t('admin.dashboard.kpi.outOfStockProducts')}: ${overview.value?.kpi.out_of_stock_products ?? 0}`,
    icon: Package,
    tone: 'info',
  },
  {
    label: t('admin.dashboard.kpi.autoAvailableSecrets'),
    value: overview.value?.kpi.auto_available_secrets ?? 0,
    helper: `${t('admin.dashboard.kpi.manualAvailableUnits')}: ${overview.value?.kpi.manual_available_units ?? 0}`,
    icon: KeyRound,
    tone: 'success',
  },
  {
    label: t('admin.dashboard.kpi.paymentsSuccess'),
    value: overview.value?.kpi.payments_success ?? 0,
    helper: `${t('admin.dashboard.kpi.paymentsFailed')}: ${overview.value?.kpi.payments_failed ?? 0}`,
    icon: CreditCard,
    tone: 'primary',
  },
])

const generalAlerts = computed(() =>
  (overview.value?.alerts || []).filter((alert) => alert.type !== 'out_of_stock_products' && alert.type !== 'low_stock_products'),
)

const riskCount = computed(() => {
  const alertTotal = (overview.value?.alerts || []).reduce((sum, item) => sum + Number(item.value || 0), 0)
  return alertTotal + inventoryAlerts.value.length
})

const quickActions = computed(() => [
  {
    label: t('admin.navItems.orderList'),
    description: t('admin.dashboard.quickActions.ordersDesc'),
    path: '/orders',
    icon: ShoppingBag,
  },
  {
    label: t('admin.navItems.payments'),
    description: t('admin.dashboard.quickActions.paymentsDesc'),
    path: '/payments',
    icon: CreditCard,
  },
  {
    label: t('admin.navItems.productList'),
    description: t('admin.dashboard.quickActions.productsDesc'),
    path: '/products',
    icon: Boxes,
  },
  {
    label: t('admin.navItems.cardSecrets'),
    description: t('admin.dashboard.quickActions.cardSecretsDesc'),
    path: '/card-secrets',
    icon: KeyRound,
  },
  {
    label: t('admin.navItems.userList'),
    description: t('admin.dashboard.quickActions.usersDesc'),
    path: '/users',
    icon: Users,
  },
])

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <div class="dashboard-shell space-y-6">
    <section class="nexa-dashboard-hero">
      <div class="relative z-10 grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(330px,420px)] lg:p-6">
        <div class="min-w-0">
          <div class="mb-3 inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Zap class="h-3.5 w-3.5" />
            {{ t('admin.dashboard.eyebrow') }}
          </div>
          <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{{ t('admin.dashboard.title') }}</h1>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{{ t('admin.dashboard.subtitle') }}</p>

          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <div
              v-for="item in heroStats"
              :key="item.label"
              class="nexa-hero-stat"
              :class="`nexa-tone-${item.tone}`"
            >
              <div class="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{{ item.label }}</div>
              <div class="mt-1 text-xl font-semibold tracking-tight">{{ item.value }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ item.helper }}</div>
            </div>
          </div>
        </div>

        <div class="nexa-filter-panel">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{{ t('admin.dashboard.period') }}</div>
              <div class="mt-1 text-sm font-semibold">{{ shortDate(overview?.from) }} - {{ shortDate(overview?.to) }}</div>
            </div>
            <div class="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              <span class="h-2 w-2 rounded-full" :class="isDashboardLoading ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'"></span>
              {{ isDashboardLoading ? t('admin.dashboard.loadingSnapshot') : t('admin.dashboard.liveSnapshot') }}
            </div>
          </div>

          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            <Select v-model="filters.range" @update:modelValue="handleRangeChange">
              <SelectTrigger class="h-9">
                <SelectValue :placeholder="t('admin.dashboard.filters.range')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in rangeOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" class="h-9" :disabled="isDashboardLoading" @click="refreshDashboard">
              <RefreshCw class="h-4 w-4" :class="isDashboardLoading ? 'animate-spin' : ''" />
              {{ t('admin.dashboard.actions.refreshNow') }}
            </Button>
            <Input
              v-if="isCustomRange"
              v-model="filters.from"
              type="date"
              class="h-9"
              :placeholder="t('admin.dashboard.filters.from')"
              @update:modelValue="handleCustomRangeChange"
            />
            <Input
              v-if="isCustomRange"
              v-model="filters.to"
              type="date"
              class="h-9"
              :placeholder="t('admin.dashboard.filters.to')"
              @update:modelValue="handleCustomRangeChange"
            />
          </div>
        </div>
      </div>
    </section>

    <div v-if="dashboardError" class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {{ dashboardError }}
    </div>

    <DashboardAd slot-code="dashboard_top_banner" layout="banner" />

    <section class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <article
        v-for="item in primaryMetrics"
        :key="item.label"
        class="nexa-metric-card"
        :class="`nexa-tone-${item.tone}`"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="text-xs font-medium text-muted-foreground">{{ item.label }}</div>
            <div class="mt-2 break-words text-2xl font-semibold tracking-tight">{{ item.value }}</div>
            <div class="mt-2 text-xs text-muted-foreground">{{ item.helper }}</div>
          </div>
          <div class="nexa-metric-icon">
            <component :is="item.icon" class="h-5 w-5" />
          </div>
        </div>
      </article>
    </section>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
      <Card class="nexa-dashboard-panel min-w-0">
        <CardHeader class="border-b border-border/70 p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle class="flex items-center gap-2 text-sm">
                <BarChart3 class="h-4 w-4 text-primary" />
                {{ t('admin.dashboard.sections.performance') }}
              </CardTitle>
              <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.dashboard.sections.performanceHint') }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-primary"></span>{{ t('admin.dashboard.trends.ordersTotal') }}</span>
              <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>{{ t('admin.dashboard.trends.ordersPaid') }}</span>
              <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-sky-500"></span>{{ t('admin.dashboard.trends.paymentsSuccess') }}</span>
              <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-rose-500"></span>{{ t('admin.dashboard.trends.paymentsFailed') }}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-4">
          <div v-if="loadingTrends" class="text-sm text-muted-foreground">{{ t('admin.common.loading') }}</div>
          <div v-else-if="trendPoints.length === 0" class="text-sm text-muted-foreground">{{ t('admin.dashboard.emptyTrend') }}</div>
          <div v-else class="nexa-chart-canvas overflow-x-auto">
            <div class="inline-flex min-w-full items-end gap-3 px-2 pb-2 pt-4">
              <div v-for="point in trendPoints" :key="point.date" class="nexa-chart-column">
                <div class="flex h-44 items-end gap-1">
                  <div class="w-2.5 rounded-t bg-primary/80" :style="{ height: orderTotalHeight(point.orders_total) }" :title="`${t('admin.dashboard.trends.ordersTotal')}: ${point.orders_total}`"></div>
                  <div class="w-2.5 rounded-t bg-emerald-500/80" :style="{ height: orderPaidHeight(point.orders_paid) }" :title="`${t('admin.dashboard.trends.ordersPaid')}: ${point.orders_paid}`"></div>
                  <div class="w-2.5 rounded-t bg-sky-500/80" :style="{ height: paymentSuccessHeight(point.payments_success) }" :title="`${t('admin.dashboard.trends.paymentsSuccess')}: ${point.payments_success}`"></div>
                  <div class="w-2.5 rounded-t bg-rose-500/80" :style="{ height: paymentFailedHeight(point.payments_failed) }" :title="`${t('admin.dashboard.trends.paymentsFailed')}: ${point.payments_failed}`"></div>
                </div>
                <div class="mt-2 whitespace-nowrap text-[10px] text-muted-foreground">{{ shortDate(point.date) }}</div>
                <div class="whitespace-nowrap text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{{ formatMoney(point.profit, overview?.currency) }}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="nexa-dashboard-panel min-w-0">
        <CardHeader class="border-b border-border/70 p-4">
          <CardTitle class="flex items-center gap-2 text-sm">
            <Gauge class="h-4 w-4 text-primary" />
            {{ t('admin.dashboard.funnel.title') }}
          </CardTitle>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.dashboard.sections.funnelHint') }}</p>
        </CardHeader>
        <CardContent class="p-4">
          <div v-if="!overview" class="text-sm text-muted-foreground">{{ t('admin.common.loading') }}</div>
          <div v-else class="space-y-4">
            <div v-for="item in funnelSteps" :key="item.key" class="space-y-1.5">
              <div class="flex items-center justify-between gap-3 text-xs">
                <span class="text-muted-foreground">{{ item.label }}</span>
                <span class="font-mono font-semibold">{{ item.value }}</span>
              </div>
              <div class="nexa-funnel-track">
                <div class="nexa-funnel-fill" :style="{ width: funnelWidth(item.value) }"></div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs">
              <div class="nexa-mini-readout">
                <div class="text-muted-foreground">{{ t('admin.dashboard.funnel.paymentConversionRate') }}</div>
                <div class="mt-1 text-lg font-semibold">{{ asPercent(overview.funnel.payment_conversion_rate) }}</div>
              </div>
              <div class="nexa-mini-readout">
                <div class="text-muted-foreground">{{ t('admin.dashboard.funnel.completionRate') }}</div>
                <div class="mt-1 text-lg font-semibold">{{ asPercent(overview.funnel.completion_rate) }}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="item in operationMetrics"
        :key="item.label"
        class="nexa-operation-card"
        :class="`nexa-tone-${item.tone}`"
      >
        <div class="flex items-center gap-3">
          <div class="nexa-operation-icon">
            <component :is="item.icon" class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <div class="text-xs text-muted-foreground">{{ item.label }}</div>
            <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
            <div class="mt-1 text-xs text-muted-foreground">{{ item.helper }}</div>
          </div>
        </div>
      </article>
    </section>

    <DashboardAd slot-code="dashboard_kpi_card" layout="card" />

    <section class="grid gap-4 xl:grid-cols-2">
      <Card class="nexa-dashboard-panel min-w-0">
        <CardHeader class="border-b border-border/70 p-4">
          <CardTitle class="flex items-center gap-2 text-sm">
            <Package class="h-4 w-4 text-primary" />
            {{ t('admin.dashboard.rankings.topProductsTitle') }}
          </CardTitle>
        </CardHeader>
        <CardContent class="p-4">
          <div v-if="loadingRankings" class="text-sm text-muted-foreground">{{ t('admin.common.loading') }}</div>
          <div v-else-if="!rankings || rankings.top_products.length === 0" class="text-sm text-muted-foreground">{{ t('admin.dashboard.rankings.empty') }}</div>
          <div v-else class="space-y-2">
            <div v-for="(item, index) in rankings.top_products" :key="`${item.product_id}-${item.sku_id || 0}`" class="nexa-ranking-row">
              <div class="nexa-ranking-index">{{ index + 1 }}</div>
              <div class="min-w-0 flex-1">
                <div class="line-clamp-1 text-sm font-semibold">{{ item.title }}</div>
                <div v-if="rankingSkuLabel(item)" class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {{ t('admin.dashboard.rankings.skuLabel') }}: {{ rankingSkuLabel(item) }}
                </div>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{{ t('admin.dashboard.rankings.paidOrders') }}: {{ item.paid_orders }}</span>
                  <span>{{ t('admin.dashboard.rankings.quantity') }}: {{ item.quantity }}</span>
                  <span>{{ t('admin.dashboard.rankings.profit') }}: {{ formatMoney(item.profit, overview?.currency) }}</span>
                </div>
              </div>
              <div class="text-right text-sm font-semibold">{{ formatMoney(item.paid_amount, overview?.currency) }}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="nexa-dashboard-panel min-w-0">
        <CardHeader class="border-b border-border/70 p-4">
          <CardTitle class="flex items-center gap-2 text-sm">
            <CreditCard class="h-4 w-4 text-primary" />
            {{ t('admin.dashboard.rankings.topChannelsTitle') }}
          </CardTitle>
        </CardHeader>
        <CardContent class="p-4">
          <div v-if="loadingRankings" class="text-sm text-muted-foreground">{{ t('admin.common.loading') }}</div>
          <div v-else-if="!rankings || rankings.top_channels.length === 0" class="text-sm text-muted-foreground">{{ t('admin.dashboard.rankings.empty') }}</div>
          <div v-else class="space-y-2">
            <div v-for="(item, index) in rankings.top_channels" :key="`${item.channel_id}-${item.channel_type}`" class="nexa-ranking-row">
              <div class="nexa-ranking-index">{{ index + 1 }}</div>
              <div class="min-w-0 flex-1">
                <div class="line-clamp-1 text-sm font-semibold">{{ channelLabel(item) }}</div>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{{ t('admin.dashboard.rankings.successCount') }}: {{ item.success_count }}</span>
                  <span>{{ t('admin.dashboard.rankings.failedCount') }}: {{ item.failed_count }}</span>
                  <span>{{ t('admin.dashboard.rankings.successRate') }}: {{ asPercent(item.success_rate) }}</span>
                </div>
              </div>
              <div class="text-right text-sm font-semibold">{{ formatMoney(item.success_amount, overview?.currency) }}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>

    <DashboardAd slot-code="dashboard_sponsored" layout="compact" />

    <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <Card class="nexa-dashboard-panel min-w-0">
        <CardHeader class="border-b border-border/70 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <CardTitle class="flex items-center gap-2 text-sm">
                <AlertTriangle class="h-4 w-4" :class="riskCount > 0 ? 'text-amber-500' : 'text-emerald-500'" />
                {{ t('admin.dashboard.alerts.title') }}
              </CardTitle>
              <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.dashboard.sections.riskHint', { count: riskCount }) }}</p>
            </div>
            <div class="rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium">{{ riskCount }}</div>
          </div>
        </CardHeader>
        <CardContent class="p-4">
          <div v-if="generalAlerts.length > 0" class="mb-3 space-y-2">
            <div
              v-for="alert in generalAlerts"
              :key="`${alert.type}-${alert.value}`"
              class="nexa-alert-row"
              :class="alertClass(alert.level)"
            >
              <span class="font-medium">{{ alertLabel(alert.type) }}</span>
              <span class="font-mono text-xs">{{ alert.value }}</span>
            </div>
          </div>

          <div v-if="inventoryAlerts.length > 0" class="space-y-2">
            <div class="text-xs font-medium text-muted-foreground">{{ t('admin.dashboard.inventoryAlerts.title') }}</div>
            <div
              v-for="(item, idx) in inventoryAlerts"
              :key="`inv-${item.product_id}-${item.sku_id || 0}-${idx}`"
              class="nexa-inventory-row"
            >
              <div class="min-w-0 flex-1">
                <router-link :to="{ path: '/products', query: { product_id: item.product_id } }" class="line-clamp-1 font-medium text-primary underline-offset-4 hover:underline">
                  {{ getLocalizedText(item.product_title) }}
                </router-link>
                <div v-if="skuSpecLabel(item)" class="mt-0.5 text-xs text-muted-foreground">
                  SKU: {{ skuSpecLabel(item) }}
                  <span v-if="item.sku_code" class="ml-1">({{ item.sku_code }})</span>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="font-mono text-xs text-muted-foreground">{{ item.available_stock }}</span>
                <span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium" :class="inventoryAlertBadgeClass(item)">
                  {{ inventoryAlertLabel(item) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="generalAlerts.length === 0 && inventoryAlerts.length === 0" class="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {{ t('admin.dashboard.alerts.empty') }}
          </div>
        </CardContent>
      </Card>

      <Card class="nexa-dashboard-panel min-w-0">
        <CardHeader class="border-b border-border/70 p-4">
          <CardTitle class="flex items-center gap-2 text-sm">
            <ArrowUpRight class="h-4 w-4 text-primary" />
            {{ t('admin.dashboard.quickActions.title') }}
          </CardTitle>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.dashboard.quickActions.subtitle') }}</p>
        </CardHeader>
        <CardContent class="p-4">
          <div class="grid gap-2">
            <router-link
              v-for="action in quickActions"
              :key="action.path"
              :to="action.path"
              class="nexa-action-tile group"
            >
              <span class="nexa-action-icon">
                <component :is="action.icon" class="h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold">{{ action.label }}</span>
                <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ action.description }}</span>
              </span>
              <ChevronRight class="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </router-link>
          </div>
        </CardContent>
      </Card>
    </section>
  </div>
</template>
