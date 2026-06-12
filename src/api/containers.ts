import { api } from './client'
import type { Container, CreateContainerRequest, ContainerStats, ContainerLogs, ContainerState, ExecResult } from '@/types'

export async function listContainers(all = false): Promise<Container[]> {
  return api<Container[]>('GET', `/containers?all=${all}`)
}

export async function getContainer(id: string): Promise<Container> {
  return api<Container>('GET', `/containers/${id}`)
}

export async function createContainer(req: CreateContainerRequest): Promise<Container> {
  return api<Container>('POST', '/containers', req)
}

export async function startContainer(id: string): Promise<void> {
  return api('POST', `/containers/${id}/start`)
}

export async function stopContainer(id: string): Promise<void> {
  return api('POST', `/containers/${id}/stop`)
}

export async function restartContainer(id: string): Promise<void> {
  return api('POST', `/containers/${id}/restart`)
}

export async function removeContainer(id: string, force = false): Promise<void> {
  return api('DELETE', `/containers/${id}?force=${force}`)
}

export async function getContainerLogs(id: string): Promise<ContainerLogs> {
  return api<ContainerLogs>('GET', `/containers/${id}/logs`)
}

export async function getContainerState(id: string): Promise<ContainerState> {
  return api<ContainerState>('GET', `/containers/${id}/state`)
}

export async function getContainerStats(id: string): Promise<ContainerStats> {
  return api<ContainerStats>('GET', `/containers/${id}/stats`)
}

export async function getContainerConfig(id: string): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>('GET', `/containers/${id}/config`)
}

export async function updateContainerConfig(id: string, config: Record<string, unknown>): Promise<void> {
  return api('PUT', `/containers/${id}/config`, config)
}

export async function execContainer(id: string, command: string): Promise<ExecResult> {
  return api<ExecResult>('POST', `/containers/${id}/exec`, { command })
}

export async function addContainerPort(id: string, containerPort: number, hostPort?: number, protocol = 'tcp'): Promise<Container> {
  return api<Container>('POST', `/containers/${id}/ports`, { container_port: containerPort, host_port: hostPort || 0, protocol })
}

export async function removeContainerPort(id: string, hostPort: number): Promise<Container> {
  return api<Container>('DELETE', `/containers/${id}/ports/${hostPort}`)
}

export async function changeContainerOwner(id: string, userId: string): Promise<Container> {
  return api<Container>('PUT', `/containers/${id}/owner`, { user_id: userId })
}

export async function reinstallContainer(id: string, image: string): Promise<void> {
  return api('POST', `/containers/${id}/reinstall`, { image })
}
