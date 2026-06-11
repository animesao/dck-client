import { api } from './client'
import type { ContainerPermission } from '@/types'

export async function listCollaborators(containerId: string): Promise<ContainerPermission[]> {
  return api<ContainerPermission[]>('GET', `/containers/${containerId}/collaborators`)
}

export async function addCollaborator(containerId: string, username: string, permission: string, permissions?: string): Promise<void> {
  return api<void>('POST', `/containers/${containerId}/collaborators`, { username, permission, permissions })
}

export async function updateCollaborator(containerId: string, userId: string, permission: string, permissions?: string): Promise<void> {
  return api<void>('PUT', `/containers/${containerId}/collaborators/${userId}`, { permission, permissions })
}

export async function removeCollaborator(containerId: string, userId: string): Promise<void> {
  return api<void>('DELETE', `/containers/${containerId}/collaborators/${userId}`)
}
