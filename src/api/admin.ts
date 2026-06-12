import { api } from './client'
import type { User, NodeInfo, Role } from '@/types'

export async function listUsers(): Promise<User[]> {
  return api<User[]>('GET', '/admin/users')
}

export async function createUser(username: string, password: string, role: string, email: string): Promise<User> {
  return api<User>('POST', '/admin/users', { username, password, role, email })
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

export async function listRoles(): Promise<Role[]> {
  return api<Role[]>('GET', '/admin/roles')
}

export async function createRole(name: string, color: string, isAdmin: boolean): Promise<Role> {
  return api<Role>('POST', '/admin/roles', { name, color, is_admin: isAdmin })
}

export async function deleteRole(name: string): Promise<void> {
  return api('DELETE', `/admin/roles/${encodeURIComponent(name)}`)
}

export async function listUserRoles(): Promise<{ id: string; username: string; role: string; role_color: string }[]> {
  return api('GET', '/admin/user-roles')
}
