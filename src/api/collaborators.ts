import { api } from './client'
import type { ContainerPermission } from '@/types'

export async function listCollaborators(containerId: string): Promise<ContainerPermission[]> {
  return api<ContainerPermission[]>('GET', `/containers/${containerId}/collaborators`)
}

export async function addCollaborator(containerId: string, username: string, permission: string): Promise<void> {
  return api<void>('POST', `/containers/${containerId}/collaborators`, { username, permission })
}

export async function removeCollaborator(containerId: string, userId: string): Promise<void> {
  return api<void>('DELETE', `/containers/${containerId}/collaborators/${userId}`)
}
