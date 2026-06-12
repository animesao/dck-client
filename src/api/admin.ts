import { api } from './client'
import type { User, NodeInfo } from '@/types'

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

export async function listNodes(): Promise<NodeInfo[]> {
  return api('GET', '/admin/nodes')
}

export async function registerNode(name: string, url: string): Promise<{ id: string; name: string; url: string; api_key: string }> {
  return api('POST', '/admin/nodes', { name, url })
}

export async function removeNode(id: string): Promise<void> {
  return api('DELETE', `/admin/nodes/${id}`)
}

export async function updateUserLimits(id: string, limits: { container_limit: number; memory_limit: number; cpu_limit: number; disk_limit: number; port_limit: number }): Promise<User> {
  return api<User>('PUT', `/admin/users/${id}/limits`, limits)
}
