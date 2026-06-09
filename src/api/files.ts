import { api, apiUrl } from './client'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  mode: string
  mod_time: string
}

export interface BackupEntry {
  name: string
  size: number
  created_at: string
}

export async function listFiles(id: string, path = '/'): Promise<FileEntry[]> {
  return api<FileEntry[]>('GET', `/containers/${id}/files?path=${encodeURIComponent(path)}`)
}

export async function readFile(id: string, path: string): Promise<string> {
  return api<string>('GET', `/containers/${id}/files/read?path=${encodeURIComponent(path)}`)
}

export async function writeFile(id: string, path: string, content: string): Promise<void> {
  return api('POST', `/containers/${id}/files/write`, { path, content })
}

export function getUploadUrl(id: string, path: string): string {
  return apiUrl(`/containers/${id}/files/upload?path=${encodeURIComponent(path)}`)
}

export async function deleteFile(id: string, path: string): Promise<void> {
  return api('DELETE', `/containers/${id}/files?path=${encodeURIComponent(path)}`)
}

export async function mkdir(id: string, path: string): Promise<void> {
  return api('POST', `/containers/${id}/files/mkdir`, { path })
}

export async function listBackups(id: string): Promise<BackupEntry[]> {
  return api<BackupEntry[]>('GET', `/containers/${id}/backups`)
}

export async function createBackup(id: string): Promise<BackupEntry> {
  return api<BackupEntry>('POST', `/containers/${id}/backups`)
}

export async function restoreBackup(id: string, name: string): Promise<void> {
  return api('POST', `/containers/${id}/backups/${name}/restore`)
}

export async function deleteBackup(id: string, name: string): Promise<void> {
  return api('DELETE', `/containers/${id}/backups/${name}`)
}
