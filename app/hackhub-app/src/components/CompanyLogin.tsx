import { useEffect, useState } from 'react'
import { Alert, Button, Stack } from '@mantine/core'
import { useLocation } from 'react-router-dom'
import { loginDestination } from '../lib/loginDestination'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export function CompanyLogin({ chinese }: { chinese: boolean }) {
  const [status, setStatus] = useState<'loading' | 'enabled' | 'unavailable'>('loading')
  const { search } = useLocation()
  const error = new URLSearchParams(search).get('sso_error')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${apiBaseUrl}/api/v1/auth/sso`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((options) => {
        if (!controller.signal.aborted) setStatus(options?.enabled === true ? 'enabled' : 'unavailable')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unavailable')
      })
    return () => controller.abort()
  }, [])

  const messages: Record<string, string> = {
    account_not_linked: chinese ? '公司账号尚未关联已有网站账号，请联系网站管理员完成关联。'
      : 'Please contact the portal administrator to link your company identity to your existing account.',
    profile_incomplete: chinese ? '公司账号信息不完整，请联系管理员检查登录配置及姓名、邮箱信息。'
      : 'Company account information is incomplete. Please ask your administrator to check sign-in configuration, name and email.',
    member_required: chinese ? '此网站仅向 Bosch 公司成员开放，暂不支持访客账号登录。'
      : 'This portal is available to Bosch members. Guest accounts cannot sign in.',
  }
  const message = (error && Object.hasOwn(messages, error) ? messages[error] : null)
    ?? (chinese ? '公司登录未完成，请重试。若仍失败，请联系管理员确认审批和账号访问权限。'
      : 'Company sign-in was not completed. Please retry or ask your administrator to check approval and access.')

  return (
    <Stack gap="md">
      {error && <Alert color="red" role="alert">{message}</Alert>}
      {status === 'loading' && (
        <Button fullWidth size="sm" h={40} color="#007bc0" radius={0} loading disabled aria-label={chinese ? '正在检查公司登录' : 'Checking company sign-in'}>
          {chinese ? 'Bosch 单点登录' : 'Bosch Single-Sign-On'}
        </Button>
      )}
      {status === 'unavailable' && !error && (
        <Alert color="blue" radius={0} role="alert">
          {chinese ? '公司登录暂不可用，请稍后刷新重试或联系网站管理员。'
            : 'Company sign-in is currently unavailable. Please refresh to try again or contact the portal administrator.'}
        </Alert>
      )}
      {status === 'enabled' && (
        <Button
          component="a"
          href={`${apiBaseUrl}/api/v1/auth/oidc/authorize/bosch?redirect=${encodeURIComponent(loginDestination(search))}`}
          fullWidth
          size="sm"
          h={40}
          fw={600}
          color="#007bc0"
          radius={0}
        >
          {chinese ? 'Bosch 单点登录' : 'Bosch Single-Sign-On'}
        </Button>
      )}
    </Stack>
  )
}
