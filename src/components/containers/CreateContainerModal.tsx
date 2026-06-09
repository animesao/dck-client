import { useState } from 'react'
import { createContainer } from '@/api/containers'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import type { CreateContainerRequest } from '@/types'

interface CreateContainerModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const imageOptions = [
  { value: 'nginx:latest', label: 'nginx:latest' },
  { value: 'redis:latest', label: 'redis:latest' },
  { value: 'postgres:latest', label: 'postgres:latest' },
  { value: 'mysql:latest', label: 'mysql:latest' },
  { value: 'mongo:latest', label: 'mongo:latest' },
  { value: 'python:latest', label: 'python:latest' },
  { value: 'node:latest', label: 'node:latest' },
  { value: 'alpine:latest', label: 'alpine:latest' },
  { value: 'ubuntu:latest', label: 'ubuntu:latest' },
]

const restartOptions = [
  { value: 'no', label: 'No' },
  { value: 'always', label: 'Always' },
  { value: 'on-failure', label: 'On Failure' },
  { value: 'unless-stopped', label: 'Unless Stopped' },
]

export function CreateContainerModal({ open, onClose, onSuccess }: CreateContainerModalProps) {
  const addToast = useUIStore(s => s.addToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<CreateContainerRequest>({
    image: 'nginx:latest',
    name: '',
    ports: [],
    volumes: [],
    env: [],
    restart: 'no',
    memory: '',
    cpus: '',
    network: 'bridge',
  })
  const [portStr, setPortStr] = useState('')
  const [volStr, setVolStr] = useState('')
  const [envStr, setEnvStr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const ports = portStr ? portStr.split(',').map(p => p.trim()).filter(Boolean) : []
      const volumes = volStr ? volStr.split(',').map(v => v.trim()).filter(Boolean) : []
      const env = envStr ? envStr.split(',').map(e => e.trim()).filter(Boolean) : []

      await createContainer({ ...form, ports, volumes, env })
      addToast('Container created successfully', 'success')
      onSuccess()
      onClose()
      setForm({
        image: 'nginx:latest',
        name: '',
        ports: [],
        volumes: [],
        env: [],
        restart: 'no',
        memory: '',
        cpus: '',
        network: 'bridge',
      })
      setPortStr('')
      setVolStr('')
      setEnvStr('')
    } catch (err: any) {
      addToast(err.message || 'Failed to create container', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Container" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Image"
            value={form.image}
            onChange={e => setForm({ ...form, image: e.target.value })}
            options={imageOptions}
          />
          <Input
            label="Container Name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="my-container"
          />
        </div>

        <Input
          label="Ports (comma-separated, e.g. 8080:80, 443:443)"
          value={portStr}
          onChange={e => setPortStr(e.target.value)}
          placeholder="8080:80, 3000:3000"
        />

        <Input
          label="Volumes (comma-separated, e.g. /data:/var/lib/data)"
          value={volStr}
          onChange={e => setVolStr(e.target.value)}
          placeholder="/host/path:/container/path"
        />

        <Input
          label="Environment Variables (comma-separated, e.g. KEY=VAL)"
          value={envStr}
          onChange={e => setEnvStr(e.target.value)}
          placeholder="NODE_ENV=production, PORT=3000"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Restart Policy"
            value={form.restart}
            onChange={e => setForm({ ...form, restart: e.target.value })}
            options={restartOptions}
          />
          <Input
            label="Memory (e.g. 512m, 1g)"
            value={form.memory || ''}
            onChange={e => setForm({ ...form, memory: e.target.value })}
            placeholder="512m"
          />
          <Input
            label="CPUs (e.g. 1, 1.5)"
            value={form.cpus || ''}
            onChange={e => setForm({ ...form, cpus: e.target.value })}
            placeholder="1"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Container</Button>
        </div>
      </form>
    </Modal>
  )
}
