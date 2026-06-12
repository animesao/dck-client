import { api, apiUrl } from './client'
import type { AuthResponse } from '@/types'

export async function login(username: string, password: string, twofaCode?: string, twofaToken?: string): Promise<AuthResponse> {
  return api<AuthResponse>('POST', '/auth/login', { username, password, twofa_code: twofaCode, twofa_token: twofaToken })
}

export async function register(username: string, password: string, email: string): Promise<AuthResponse> {
  return api<AuthResponse>('POST', '/auth/register', { username, password, email })
}

export async function getMe(): Promise<AuthResponse['user']> {
  return api<AuthResponse['user']>('GET', '/auth/me')
}

export async function updateProfile(data: { email?: string }): Promise<void> {
  return api<void>('PUT', '/auth/profile', data)
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return api<void>('PUT', '/auth/password', { old_password: oldPassword, new_password: newPassword })
}

export async function getTwoFactorStatus(): Promise<{ enabled: boolean }> {
  return api<{ enabled: boolean }>('GET', '/auth/2fa/status')
}

export async function setupTwoFactor(): Promise<{ secret: string; url: string }> {
  return api<{ secret: string; url: string }>('POST', '/auth/2fa/setup')
}

export function getTwoFactorQrUrl(): string {
  return apiUrl('/auth/2fa/qr')
}

export async function verifyTwoFactor(code: string): Promise<void> {
  return api<void>('POST', '/auth/2fa/verify', { code })
}

export async function disableTwoFactor(): Promise<void> {
  return api<void>('POST', '/auth/2fa/disable')
}
