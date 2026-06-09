import { api } from './client'
import type { User } from '@/types'

export async function listUsers(): Promise<User[]> {
  return api<User[]>('GET', '/admin/users')
}

export async function createUser(username: string, password: string, role: string): Promise<User> {
  return api<User>('POST', '/admin/users', { username, password, role })
}

export async function updateUser(id: string, data: Partial<User & { password?: string }>): Promise<User> {
  return api<User>('PUT', `/admin/users/${id}`, data)
}

export async function deleteUser(id: string): Promise<void> {
  return api('DELETE', `/admin/users/${id}`)
}
