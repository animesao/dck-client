import { api } from './client'
import type { DashboardStats } from '@/types'

export async function getDashboardStats(): Promise<DashboardStats> {
  return api<DashboardStats>('GET', '/dashboard/stats')
}
