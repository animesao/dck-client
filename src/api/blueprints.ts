import { api } from './client'
import type { Blueprint } from '@/types'

export async function listBlueprints(): Promise<Blueprint[]> {
  return api<Blueprint[]>('GET', '/blueprints')
}

export async function listBlueprintsByCategory(category: string): Promise<Blueprint[]> {
  return api<Blueprint[]>('GET', `/blueprints/category/${category}`)
}

export async function launchBlueprint(name: string, env: Record<string, string>): Promise<void> {
  return api('POST', `/blueprints/${name}/launch`, env)
}
