import { api } from './client'

export interface Template {
  id: string
  name: string
  category: string
  description: string
  image: string
  tag?: string
  command: string
  env: string
  ports: string
  memory?: string
  cpus?: string
  restart?: string
  network?: string
  volumes?: string
  created_at: string
  user_id?: string
}

export interface ImportTemplateReq {
  name: string
  category: string
  description: string
  image: string
  tag?: string
  command: string
  env: string
  ports: string
  memory?: string
  cpus?: string
  restart?: string
  network?: string
  volumes?: string
}

export async function listTemplates(): Promise<Template[]> {
  const res = await api<{ templates: Template[]; categories: string[] }>('GET', '/templates')
  return res.templates
}

export async function listCategories(): Promise<string[]> {
  const res = await api<{ templates: Template[]; categories: string[] }>('GET', '/templates')
  return res.categories
}

export async function createTemplate(req: ImportTemplateReq): Promise<void> {
  return api('POST', '/templates', req)
}

export async function importTemplate(req: ImportTemplateReq): Promise<void> {
  return api('POST', '/templates/import', req)
}

export async function deleteTemplate(id: string): Promise<void> {
  return api('DELETE', `/templates/${id}`)
}

export async function exportContainerAsTemplate(containerId: string): Promise<ImportTemplateReq> {
  return api<ImportTemplateReq>('GET', `/containers/${containerId}/export-template`)
}

export async function addCategory(name: string): Promise<void> {
  return api('POST', '/template-categories', { name })
}

export async function deleteCategory(name: string): Promise<void> {
  return api('DELETE', `/template-categories/${encodeURIComponent(name)}`)
}
