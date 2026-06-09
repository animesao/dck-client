import { api } from './client'
import type { ProjectInfo, ProjectConfig } from '@/types'

export async function scanProjects(): Promise<ProjectInfo[]> {
  return api<ProjectInfo[]>('GET', '/projects/scan')
}

export async function readProject(dir: string): Promise<ProjectInfo> {
  return api<ProjectInfo>('GET', `/projects/read?dir=${encodeURIComponent(dir)}`)
}

export async function createProject(config: ProjectConfig): Promise<void> {
  return api('POST', '/projects/create', config)
}

export async function saveProject(config: ProjectConfig): Promise<void> {
  return api('POST', '/projects/save', config)
}

export async function deleteProject(dir: string): Promise<void> {
  return api('DELETE', `/projects/delete?dir=${encodeURIComponent(dir)}`)
}

export async function deployProject(dir: string, profile?: string): Promise<void> {
  return api('POST', '/projects/deploy', { dir, profile })
}
