import { api } from './client'
import type { AppSettings, VersionInfo, DeployConfig, Category, CategoryPreset, CatalogItem } from '@/types'

export async function getSettings(): Promise<AppSettings> {
  return api<AppSettings>('GET', '/settings')
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  return api('PUT', '/settings', settings)
}

export async function getVersion(): Promise<VersionInfo> {
  return api<VersionInfo>('GET', '/version')
}

export async function getConfig(): Promise<DeployConfig> {
  return api<DeployConfig>('GET', '/config')
}

export async function saveConfig(content: string): Promise<void> {
  return api('POST', '/config', { content })
}

export async function deployConfig(): Promise<void> {
  return api('POST', '/config/deploy')
}

export async function downConfig(): Promise<void> {
  return api('POST', '/config/down')
}

export async function getCategories(): Promise<CategoryPreset[]> {
  return api<CategoryPreset[]>('GET', '/categories')
}

export async function getCatalog(): Promise<CatalogItem[]> {
  return api<CatalogItem[]>('GET', '/catalog')
}
