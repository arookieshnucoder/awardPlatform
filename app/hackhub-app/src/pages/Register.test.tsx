import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from '../contexts/LanguageContext'
import { Register } from './Register'

const { signup } = vi.hoisted(() => ({ signup: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ signup }) }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

describe('Award registration', () => {
  it('creates an associate account and returns home without organization setup', async () => {
    localStorage.setItem('hackhub-language', 'en')
    const user = userEvent.setup()
    render(<MantineProvider env="test"><LanguageProvider><MemoryRouter initialEntries={['/register']}><Routes><Route path="/register" element={<Register />} /><Route path="/" element={<div>Award overview</div>} /></Routes></MemoryRouter></LanguageProvider></MantineProvider>)
    expect(screen.queryByLabelText(/Organization/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/Full Name/), 'Alice Award')
    await user.type(screen.getByLabelText(/^Email/), 'alice@example.com')
    await user.type(screen.getByLabelText(/^Password/), 'ExamplePass123')
    await user.type(screen.getByLabelText(/^Confirm Password/), 'ExamplePass123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(signup).toHaveBeenCalledWith('alice@example.com', 'ExamplePass123', 'Alice Award')
    expect(await screen.findByText('Award overview')).toBeInTheDocument()
  })
})
