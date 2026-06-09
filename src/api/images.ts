import { api } from './client'
import type { Image } from '@/types'

export async function listImages(): Promise<Image[]> {
  return api<Image[]>('GET', '/images')
}

export async function pullImage(name: string): Promise<void> {
  return api('POST', '/images/pull', { name })
}

export async function removeImage(name: string, tag: string): Promise<void> {
  return api('DELETE', `/images/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
}
