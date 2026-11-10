import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import { CompanyLogin } from './CompanyLogin'

afterEach(() => vi.unstubAllGlobals())

function renderLogin(url = '/login') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[url]}>
        <CompanyLogin chinese />
      </MemoryRouter>
    </MantineProvider>
  )
}

describe('CompanyLogin', () => {
  it('waits for the options response without starting sign-in automatically', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderLogin()
    expect(screen.getByRole('button', { name: '正在检查公司登录' })).toBeDisabled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('starts company login and preserves an internal destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ enabled: true })))
    renderLogin('/login?redirect=%2Fnominate')
    expect(await screen.findByRole('link', { name: 'Bosch 单点登录' })).toHaveAttribute(
      'href', '/api/v1/auth/oidc/authorize/bosch?redirect=%2Fnominate'
    )
  })

  it('rejects an external return destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ enabled: true })))
    renderLogin('/login?redirect=https://example.invalid')
    expect(await screen.findByRole('link', { name: 'Bosch 单点登录' })).toHaveAttribute(
      'href', '/api/v1/auth/oidc/authorize/bosch?redirect=%2Foverview'
    )
  })

  it.each([false, 'true', undefined])('does not enable SSO for configuration %s', async (enabled) => {
    const json = vi.fn().mockResolvedValue({ enabled })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json }))
    renderLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('公司登录暂不可用')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows an explanation when the options request fails', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('unavailable'))
    vi.stubGlobal('fetch', fetch)
    renderLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('公司登录暂不可用')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('explains how to resolve an unlinked account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ enabled: false })))
    renderLogin('/login?sso_error=account_not_linked')
    expect(screen.getByRole('alert')).toHaveTextContent('请联系网站管理员完成关联')
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('does not display arbitrary provider error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ enabled: false })))
    renderLogin('/login?sso_error=untrusted-provider-error')
    expect(screen.getByRole('alert')).toHaveTextContent('公司登录未完成')
    expect(screen.queryByText('untrusted-provider-error')).not.toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })
})
