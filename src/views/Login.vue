<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminAuthStore } from '@/stores/auth'
import { adminAPI, type CaptchaPayload } from '@/api/admin'
import { applySiteIcon } from '@/utils/favicon'
import ImageCaptcha from '@/components/captcha/ImageCaptcha.vue'
import TurnstileCaptcha from '@/components/captcha/TurnstileCaptcha.vue'

const { t } = useI18n()
const router = useRouter()
const authStore = useAdminAuthStore()

type Step = 'password' | 'totp'
const step = ref<Step>('password')

const username = ref('')
const password = ref('')
const totpCode = ref('')
const recoveryCode = ref('')
const useRecovery = ref(false)
const error = ref('')
const loadingCaptcha = ref(false)
const captchaConfig = ref<any>(null)
const captchaPayload = ref<CaptchaPayload>({})
const turnstileToken = ref('')
const imageCaptchaRef = ref<InstanceType<typeof ImageCaptcha> | null>(null)
const turnstileRef = ref<InstanceType<typeof TurnstileCaptcha> | null>(null)

const captchaProvider = computed(() => String(captchaConfig.value?.provider || 'none'))
const loginCaptchaEnabled = computed(() => {
  const loginScene = !!captchaConfig.value?.scenes?.login
  return loginScene && captchaProvider.value !== 'none'
})
const turnstileSiteKey = computed(() => String(captchaConfig.value?.turnstile?.site_key || ''))

const challengeRemaining = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const updateCountdown = () => {
  if (!authStore.challengeExpiresAt) {
    challengeRemaining.value = 0
    return
  }
  const ms = new Date(authStore.challengeExpiresAt).getTime() - Date.now()
  challengeRemaining.value = Math.max(0, Math.floor(ms / 1000))
  if (challengeRemaining.value === 0 && step.value === 'totp') {
    backToPassword()
    error.value = t('admin.login.totp.expired')
  }
}

const startCountdown = () => {
  updateCountdown()
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(updateCountdown, 1000)
}

const stopCountdown = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const getCaptchaPayload = (): CaptchaPayload | undefined => {
  if (!loginCaptchaEnabled.value) return undefined
  if (captchaProvider.value === 'image') {
    return {
      captcha_id: captchaPayload.value.captcha_id || '',
      captcha_code: captchaPayload.value.captcha_code || '',
    }
  }
  if (captchaProvider.value === 'turnstile') {
    return { turnstile_token: turnstileToken.value }
  }
  return undefined
}

const submitPassword = async () => {
  error.value = ''
  if (loginCaptchaEnabled.value && captchaProvider.value === 'image') {
    if (!captchaPayload.value.captcha_id || !captchaPayload.value.captcha_code) {
      error.value = t('admin.login.captchaRequired')
      return
    }
  }
  if (loginCaptchaEnabled.value && captchaProvider.value === 'turnstile') {
    if (!turnstileToken.value) {
      error.value = t('admin.login.captchaRequired')
      return
    }
  }
  try {
    const res = await authStore.login({
      username: username.value.trim(),
      password: password.value,
      captcha_payload: getCaptchaPayload(),
    })
    if (res.requiresTotp) {
      step.value = 'totp'
      totpCode.value = ''
      recoveryCode.value = ''
      useRecovery.value = false
      startCountdown()
    } else {
      router.push('/')
    }
  } catch (err: any) {
    error.value = err?.message || t('admin.login.errors.invalidCredentials')
    if (captchaProvider.value === 'image') imageCaptchaRef.value?.refresh()
    if (captchaProvider.value === 'turnstile') {
      turnstileRef.value?.reset()
      turnstileToken.value = ''
    }
  }
}

const submit2FA = async () => {
  error.value = ''
  if (useRecovery.value) {
    if (!recoveryCode.value.trim()) {
      error.value = t('admin.login.totp.recoveryRequired')
      return
    }
  } else {
    if (totpCode.value.length !== 6) {
      error.value = t('admin.login.totp.codeFormat')
      return
    }
  }
  try {
    await authStore.verify2FA(
      useRecovery.value
        ? { recovery_code: recoveryCode.value.trim() }
        : { code: totpCode.value },
    )
    stopCountdown()
    router.push('/')
  } catch (err: any) {
    // The API client rejects with an Error that already contains a localized message.
    // After repeated failures or challenge expiry, the user can return to password login.
    error.value = err?.message || t('admin.login.totp.verifyFailed')
  }
}

const backToPassword = () => {
  authStore.clearChallenge()
  stopCountdown()
  step.value = 'password'
  password.value = ''
  totpCode.value = ''
  recoveryCode.value = ''
}

const loadCaptchaConfig = async () => {
  loadingCaptcha.value = true
  try {
    const res = await adminAPI.getPublicConfig()
    const payload = res.data?.data as any
    applySiteIcon(payload?.brand?.site_icon)
    captchaConfig.value = payload?.captcha || null
  } catch {
    captchaConfig.value = null
  } finally {
    loadingCaptcha.value = false
  }
}

onMounted(() => {
  loadCaptchaConfig()
})

onUnmounted(() => {
  stopCountdown()
})
</script>

<template>
  <div class="nexa-shell relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-foreground">
    <div class="absolute inset-0 nexa-grid opacity-70"></div>
    <div class="pointer-events-none absolute left-[8%] top-[12%] h-56 w-56 rounded-full bg-primary/15 blur-3xl"></div>
    <div class="pointer-events-none absolute bottom-[10%] right-[10%] h-72 w-72 rounded-full bg-accent/12 blur-3xl"></div>
    <div class="relative grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="hidden lg:block">
        <div class="nexa-brand-mark mb-6 h-14 w-14 text-base">NX</div>
        <div class="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-primary">
          NexaCard Admin
        </div>
        <h1 class="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-foreground">
          Command center for cards, orders, payments and growth.
        </h1>
        <p class="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          A calmer dark cockpit for daily operations, tuned with electric blue actions and soft teal status signals.
        </p>
        <div class="mt-8 grid max-w-xl grid-cols-3 gap-3 text-xs">
          <div class="rounded-lg border border-border bg-card/70 px-3 py-3 backdrop-blur">
            <div class="text-muted-foreground">Orders</div>
            <div class="mt-1 font-semibold">Realtime</div>
          </div>
          <div class="rounded-lg border border-border bg-card/70 px-3 py-3 backdrop-blur">
            <div class="text-muted-foreground">Payments</div>
            <div class="mt-1 font-semibold">Monitored</div>
          </div>
          <div class="rounded-lg border border-border bg-card/70 px-3 py-3 backdrop-blur">
            <div class="text-muted-foreground">Inventory</div>
            <div class="mt-1 font-semibold">Guarded</div>
          </div>
        </div>
      </div>

      <div class="w-full max-w-md justify-self-center lg:justify-self-end">
        <Card class="nexa-surface rounded-lg shadow-xl">
          <CardHeader>
            <div class="mb-3 flex items-center gap-3 lg:hidden">
              <div class="nexa-brand-mark h-10 w-10 text-sm">NX</div>
              <div>
                <div class="font-semibold">NexaCard</div>
                <div class="text-xs text-muted-foreground">Admin cockpit</div>
              </div>
            </div>
            <CardTitle class="text-2xl">
              {{ step === 'password' ? t('admin.login.title') : t('admin.login.totp.title') }}
            </CardTitle>
            <p class="text-sm text-muted-foreground mt-1">
              {{ step === 'password' ? t('admin.login.subtitle') : t('admin.login.totp.subtitle') }}
            </p>
          </CardHeader>
          <CardContent>
            <form v-if="step === 'password'" class="space-y-4" @submit.prevent="submitPassword">
              <div class="space-y-2">
                <Label for="username">{{ t('admin.login.username') }}</Label>
                <Input id="username" v-model="username" :placeholder="t('admin.login.username')" />
              </div>
              <div class="space-y-2">
                <Label for="password">{{ t('admin.login.password') }}</Label>
                <Input
                  id="password"
                  v-model="password"
                  type="password"
                  :placeholder="t('admin.login.password')"
                />
              </div>

              <div v-if="loginCaptchaEnabled" class="space-y-2">
                <Label>{{ t('admin.login.captchaLabel') }}</Label>
                <ImageCaptcha
                  v-if="captchaProvider === 'image'"
                  ref="imageCaptchaRef"
                  v-model="captchaPayload"
                  :disabled="authStore.loading || loadingCaptcha"
                />
                <TurnstileCaptcha
                  v-else-if="captchaProvider === 'turnstile'"
                  ref="turnstileRef"
                  v-model="turnstileToken"
                  :site-key="turnstileSiteKey"
                />
              </div>

              <div v-if="error" class="text-sm text-destructive">{{ error }}</div>
              <Button type="submit" class="w-full" :disabled="authStore.loading || loadingCaptcha">
                {{ authStore.loading ? t('admin.login.submitting') : t('admin.login.submit') }}
              </Button>
            </form>

            <form v-else class="space-y-4" @submit.prevent="submit2FA">
              <p class="text-xs text-muted-foreground">
                {{ t('admin.login.totp.remaining', { seconds: challengeRemaining }) }}
              </p>

              <template v-if="!useRecovery">
                <div class="space-y-2">
                  <Label for="totp">{{ t('admin.login.totp.codeLabel') }}</Label>
                  <Input
                    id="totp"
                    v-model="totpCode"
                    inputmode="numeric"
                    maxlength="6"
                    pattern="[0-9]{6}"
                    autocomplete="one-time-code"
                    autofocus
                    placeholder="123456"
                  />
                </div>
              </template>
              <template v-else>
                <div class="space-y-2">
                  <Label for="rc">{{ t('admin.login.totp.recoveryLabel') }}</Label>
                  <Input id="rc" v-model="recoveryCode" autofocus placeholder="xxxx-xxxxxx" />
                </div>
              </template>

              <button
                type="button"
                class="text-xs text-primary underline"
                @click="useRecovery = !useRecovery"
              >
                {{ useRecovery ? t('admin.login.totp.useCode') : t('admin.login.totp.useRecovery') }}
              </button>

              <div v-if="error" class="text-sm text-destructive">{{ error }}</div>
              <div class="flex gap-2">
                <Button type="button" variant="outline" class="flex-1" @click="backToPassword">
                  {{ t('admin.login.totp.back') }}
                </Button>
                <Button type="submit" class="flex-1" :disabled="authStore.loading">
                  {{ authStore.loading ? t('admin.login.submitting') : t('admin.login.totp.submit') }}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <p class="mt-4 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <span>© {{ new Date().getFullYear() }} NexaCard ·</span>
          <a
            href="https://github.com/dujiao-next"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.084 3.292 9.4 7.86 10.922.575.106.784-.25.784-.556 0-.273-.01-1-.016-1.962-3.197.694-3.872-1.54-3.872-1.54-.522-1.326-1.274-1.678-1.274-1.678-1.042-.713.079-.699.079-.699 1.152.081 1.758 1.183 1.758 1.183 1.024 1.755 2.688 1.248 3.343.954.104-.742.401-1.248.73-1.535-2.552-.29-5.236-1.276-5.236-5.678 0-1.254.448-2.28 1.182-3.084-.118-.29-.512-1.457.112-3.04 0 0 .964-.308 3.158 1.178a10.98 10.98 0 0 1 2.876-.387c.976.004 1.96.132 2.878.387 2.192-1.486 3.154-1.178 3.154-1.178.626 1.583.232 2.75.114 3.04.736.804 1.18 1.83 1.18 3.084 0 4.413-2.688 5.384-5.248 5.668.412.354.78 1.052.78 2.12 0 1.53-.014 2.764-.014 3.14 0 .31.206.668.79.554C20.212 21.396 23.5 17.083 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
            </svg>
            <span>Dujiao-Next upstream</span>
          </a>
        </p>
      </div>
    </div>
  </div>
</template>
