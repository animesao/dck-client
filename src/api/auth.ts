import { api } from './client'
import type { AuthResponse, User } from '@/types'

export async function login(username: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>('POST', '/auth/login', { username, password })
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>('POST', '/auth/register', { username, password })
}

export async function getMe(): Promise<User> {
  return api<User>('GET', '/auth/me')
}
