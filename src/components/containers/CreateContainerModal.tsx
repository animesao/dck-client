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
  { value: 'itzg/minecraft-server:latest', label: 'Minecraft Server (latest)' },
  { value: 'itzg/minecraft-server:1.21', label: 'Minecraft Server 1.21' },
  { value: 'itzg/minecraft-server:1.20.4', label: 'Minecraft Server 1.20.4' },
  { value: 'itzg/minecraft-server:1.19.4', label: 'Minecraft Server 1.19.4' },
  { value: 'itzg/minecraft-server:1.18.2', label: 'Minecraft Server 1.18.2' },
  { value: 'itzg/minecraft-server:1.17.1', label: 'Minecraft Server 1.17.1' },
  { value: 'itzg/minecraft-server:1.16.5', label: 'Minecraft Server 1.16.5' },
  { value: 'itzg/minecraft-server:1.15.2', label: 'Minecraft Server 1.15.2' },
  { value: 'itzg/minecraft-server:1.14.4', label: 'Minecraft Server 1.14.4' },
  { value: 'itzg/minecraft-server:1.12.2', label: 'Minecraft Server 1.12.2' },
  { value: 'itzg/minecraft-server:1.10.2', label: 'Minecraft Server 1.10.2' },
  { value: 'itzg/minecraft-server:1.8.9', label: 'Minecraft Server 1.8.9' },
  { value: 'itzg/minecraft-server:1.7.10', label: 'Minecraft Server 1.7.10' },
  { value: '', label: 'Custom image...' },
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
  const [customImage, setCustomImage] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState<CreateContainerRequest>({
    image: 'nginx:latest',
    name: '',
    command: '',
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
        command: '',
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
          {customImage ? (
            <div className="col-span-2">
              <Input
                label="Custom Image"
                value={form.image}
                onChange={e => setForm({ ...form, image: e.target.value })}
                placeholder="user/image:tag"
              />
              <button
                type="button"
                onClick={() => { setCustomImage(false); setForm({ ...form, image: 'nginx:latest' }) }}
                className="text-sm text-blue-500 hover:text-blue-700 mt-1"
              >
                ← Choose from presets
              </button>
            </div>
          ) : (
            <Select
              label="Image"
              value={form.image}
              onChange={e => {
                const val = e.target.value
                if (val === '') {
                  setCustomImage(true)
                  setForm({ ...form, image: '' })
                } else {
                  setForm({ ...form, image: val })
                }
              }}
              options={imageOptions}
            />
          )}
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

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          {showAdvanced ? '▼' : '▶'} Advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-4 border border-gray-200 rounded-lg p-4">
            <Input
              label="Command (overrides image CMD)"
              value={form.command || ''}
              onChange={e => setForm({ ...form, command: e.target.value })}
              placeholder="e.g. java -jar server.jar --nogui"
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Container</Button>
        </div>
      </form>
    </Modal>
  )
}
