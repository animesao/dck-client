import { api } from './client'
import type { ActivityLog } from '@/types'

export async function getContainerActivity(containerId: string, limit?: number): Promise<ActivityLog[]> {
  const params = limit ? `?limit=${limit}` : ''
  return api<ActivityLog[]>('GET', `/containers/${containerId}/activity${params}`)
}

export async function getUserActivity(limit?: number): Promise<ActivityLog[]> {
  const params = limit ? `?limit=${limit}` : ''
  return api<ActivityLog[]>('GET', `/activity${params}`)
}
