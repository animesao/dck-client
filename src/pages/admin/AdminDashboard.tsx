import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getDashboardStats } from '@/api/dashboard'
import { listContainers } from '@/api/containers'
import { updateUserLimits, listNodes, registerNode, removeNode } from '@/api/admin'
import { Card, CardContent } from '@/components/ui/Card'
import { PageLoading } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ContainerStatusBadge } from '@/components/containers/ContainerStatusBadge'
import { formatBytes } from '@/utils'
import { useUIStore } from '@/store/uiStore'
import type { DashboardStats, Container as ContainerType, UserStats, NodeInfo } from '@/types'
import { Activity, ContainerIcon, HardDrive, Cpu, Server, Users, Shield, Clock, Settings2, Gauge, MemoryStick, Plus, Trash2, ExternalLink, Wifi, WifiOff } from 'lucide-react'

export function AdminDashboardPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const addToast = useUIStore(s => s.addToast)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [allContainers, setAllContainers] = useState<ContainerType[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<UserStats | null>(null)
  const [editLimits, setEditLimits] = useState({ container_limit: 0, memory_limit: 0, cpu_limit: 0, disk_limit: 0, port_limit: 0 })
  const [savingLimits, setSavingLimits] = useState(false)
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null)
  const [showNodeModal, setShowNodeModal] = useState(false)
  const [nodeName, setNodeName] = useState('')
  const [nodeUrl, setNodeUrl] = useState('')
  const [registeringNode, setRegisteringNode] = useState(false)

  const refreshStats = () => {
    Promise.all([getDashboardStats(), listContainers(true)])
      .then(([s, c]) => { setStats(s); setAllContainers(c) })
      .catch(() => {})
  }

  const fetchNodes = () => {
    listNodes().then(setNodes).catch(() => {})
  }

  useEffect(() => {
    if (!isAdmin) { navigate('/dashboard'); return }
    refreshStats()
    fetchNodes()
    setLoading(false)
  }, [])

  const handleEditLimits = (u: UserStats) => {
    setEditUser(u)
    setEditLimits({
      container_limit: u.container_limit || 0,
      memory_limit: u.memory_limit || 0,
      cpu_limit: u.cpu_limit || 0,
      disk_limit: u.disk_limit > 0 ? u.disk_limit / (1024 * 1024) : u.disk_limit,
      port_limit: u.port_limit || 0,
    })
  }

  const handleSaveLimits = async () => {
    if (!editUser) return
    setSavingLimits(true)
    try {
      const payload = {
        ...editLimits,
        disk_limit: editLimits.disk_limit > 0 ? editLimits.disk_limit * (1024 * 1024) : editLimits.disk_limit,
      }
      await updateUserLimits(editUser.id, payload)
      addToast('Limits updated', 'success')
      setEditUser(null)
      refreshStats()
    } catch (err: any) {
      addToast(err.message || 'Failed to update limits', 'error')
    } finally {
      setSavingLimits(false)
    }
  }

  const handleRegisterNode = async () => {
    if (!nodeName || !nodeUrl) return
    setRegisteringNode(true)
    try {
      await registerNode(nodeName, nodeUrl)
      addToast('Node registered', 'success')
      setShowNodeModal(false)
      setNodeName('')
      setNodeUrl('')
      fetchNodes()
    } catch (err: any) {
      addToast(err.message || 'Failed to register node', 'error')
    } finally {
      setRegisteringNode(false)
    }
  }

  const handleRemoveNode = async (id: string) => {
    try {
      await removeNode(id)
      addToast('Node removed', 'success')
      fetchNodes()
    } catch (err: any) {
      addToast(err.message || 'Failed to remove node', 'error')
    }
  }

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Admin Dashboard</h1>
        <p className="text-[#636d7d] text-sm mt-1">System-wide overview and management</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                <Users size={22} className="text-indigo-400" />
              </div>
              <div>
                <p className="stat-value text-indigo-400">{stats?.users ?? '-'}</p>
                <p className="text-xs text-[#636d7d] font-medium">Users</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/10">
                <Activity size={22} className="text-emerald-400" />
              </div>
              <div>
                <p className="stat-value text-emerald-400">{allContainers.filter(c => c.status === 'running').length}</p>
                <p className="text-xs text-[#636d7d] font-medium">Running</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center border border-red-500/10">
                <ContainerIcon size={22} className="text-red-400" />
              </div>
              <div>
                <p className="stat-value text-red-400">{allContainers.filter(c => c.status !== 'running').length}</p>
                <p className="text-xs text-[#636d7d] font-medium">Stopped</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/10">
                <HardDrive size={22} className="text-blue-400" />
              </div>
              <div>
                <p className="stat-value text-blue-400">{allContainers.length}</p>
                <p className="text-xs text-[#636d7d] font-medium">Total</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="card-gradient">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/10">
                <Shield size={22} className="text-amber-400" />
              </div>
              <div>
                <p className="stat-value text-amber-400">{stats?.images ?? '-'}</p>
                <p className="text-xs text-[#636d7d] font-medium">Images</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3]">CPU Usage</h3>
            </div>
            <ProgressBar value={stats?.cpu_percent || 0} showLabel />
            <div className="mt-2 flex items-center gap-2 text-xs text-[#636d7d]">
              <Server size={12} />
              {stats?.system?.cpu_model || 'Unknown'} ({stats?.system?.cpu_cores || '?'} cores)
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <MemoryStick size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3]">Memory Usage</h3>
            </div>
            <ProgressBar value={stats?.memory_used || 0} max={stats?.memory_total || 1} showLabel />
            <div className="mt-2 flex items-center gap-2 text-xs text-[#636d7d]">
              <HardDrive size={12} />
              {formatBytes(stats?.memory_used || 0)} / {formatBytes(stats?.memory_total || 0)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <HardDrive size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3]">Disk Usage</h3>
            </div>
            <ProgressBar value={stats?.disk_used || 0} max={stats?.disk_total || 1} showLabel />
            <div className="mt-2 flex items-center gap-2 text-xs text-[#636d7d]">
              <HardDrive size={12} />
              {formatBytes(stats?.disk_used || 0)} / {formatBytes(stats?.disk_total || 0)}
            </div>
          </div>
        </Card>
      </div>

      {/* System Info */}
      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-5">
            <Gauge size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">System Information</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">OS</p>
              <p className="text-sm font-medium text-[#e6edf3]">{stats?.system?.os || '-'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Architecture</p>
              <p className="text-sm font-medium text-[#e6edf3]">{stats?.system?.arch || '-'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Kernel</p>
              <p className="text-sm font-medium text-[#e6edf3]">{stats?.system?.kernel || '-'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#636d7d] font-medium">Uptime</p>
              <p className="text-sm font-medium text-[#e6edf3] flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-400" />
                {stats?.system?.uptime || '-'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Nodes */}
      <Card>
        <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#e6edf3]">Nodes</h3>
          <Button size="sm" onClick={() => setShowNodeModal(true)}>
            <Plus size={14} className="mr-1" /> Add Node
          </Button>
        </div>
        {nodes.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No nodes registered</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {nodes.map(node => (
              <div
                key={node.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors cursor-pointer"
                onClick={() => setSelectedNode(node)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-indigo-400" />
                    <span className="text-sm font-semibold text-[#e6edf3]">{node.name}</span>
                  </div>
                  {node.online ? (
                    <Wifi size={14} className="text-emerald-400" />
                  ) : (
                    <WifiOff size={14} className="text-red-400" />
                  )}
                </div>
                <div className="text-xs text-[#636d7d] mb-3 truncate">{node.url}</div>
                {node.online && node.hostname && (
                  <>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#636d7d]">CPU</span>
                          <span className="text-[#e6edf3]">{node.cpu_model?.split('@')[0]?.trim() || node.cpu_model} ({node.cpu_cores}c)</span>
                        </div>
                        <ProgressBar value={node.cpu_percent || 0} showLabel />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#636d7d]">Memory</span>
                          <span className="text-[#e6edf3]">{formatBytes(node.mem_used || 0)} / {formatBytes(node.mem_total || 0)}</span>
                        </div>
                        <ProgressBar value={node.mem_percent || 0} showLabel />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#636d7d]">Disk</span>
                          <span className="text-[#e6edf3]">{formatBytes(node.disk_used || 0)} / {formatBytes(node.disk_total || 0)}</span>
                        </div>
                        <ProgressBar value={node.disk_percent || 0} showLabel />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-[#636d7d]">
                      <Clock size={11} />
                      Up {node.uptime || '-'}
                    </div>
                  </>
                )}
                {!node.online && (
                  <div className="text-xs text-red-400">Offline</div>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleRemoveNode(node.id) }}
                  className="mt-3 flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Node Detail Modal */}
      <Modal open={!!selectedNode} onClose={() => setSelectedNode(null)} title={selectedNode?.name || 'Node Details'}>
        {selectedNode && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Status</p>
                <p className={`font-medium ${selectedNode.online ? 'text-emerald-400' : 'text-red-400'}`}>
                  {selectedNode.online ? 'Online' : 'Offline'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Hostname</p>
                <p className="text-[#e6edf3]">{selectedNode.hostname || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">URL</p>
                <p className="text-[#e6edf3]">{selectedNode.url}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Version</p>
                <p className="text-[#e6edf3]">{selectedNode.version || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">CPU</p>
                <p className="text-[#e6edf3]">{selectedNode.cpu_model || '-'} ({selectedNode.cpu_cores || '?'} cores)</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium">Uptime</p>
                <p className="text-[#e6edf3]">{selectedNode.uptime || '-'}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-2">CPU Usage</p>
              <ProgressBar value={selectedNode.cpu_percent || 0} showLabel />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-2">Memory Usage</p>
              <ProgressBar value={selectedNode.mem_percent || 0} showLabel />
              <p className="text-xs text-[#636d7d] mt-1">{formatBytes(selectedNode.mem_used || 0)} / {formatBytes(selectedNode.mem_total || 0)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#636d7d] font-medium mb-2">Disk Usage</p>
              <ProgressBar value={selectedNode.disk_percent || 0} showLabel />
              <p className="text-xs text-[#636d7d] mt-1">{formatBytes(selectedNode.disk_used || 0)} / {formatBytes(selectedNode.disk_total || 0)}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Register Node Modal */}
      <Modal open={showNodeModal} onClose={() => setShowNodeModal(false)} title="Register Node">
        <div className="space-y-4">
          <Input label="Node Name" value={nodeName} onChange={e => setNodeName(e.target.value)} placeholder="e.g. vps-1" />
          <Input label="Node URL" value={nodeUrl} onChange={e => setNodeUrl(e.target.value)} placeholder="e.g. http://192.168.1.100:8080" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowNodeModal(false)}>Cancel</Button>
            <Button onClick={handleRegisterNode} loading={registeringNode}>Register</Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#e6edf3]">Users</h3>
        </div>
        {!stats?.user_stats || stats.user_stats.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No users</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            <div className="flex items-center gap-3 px-5 py-2 text-xs text-[#636d7d] font-medium">
              <span className="w-8" />
              <span className="flex-1">Username</span>
              <span className="w-16 text-center">Role</span>
              <span className="w-16 text-center">Containers</span>
              <span className="w-20 text-center">Cont. Limit</span>
              <span className="w-20 text-center">Disk Limit</span>
              <span className="w-24 text-right">Last Login</span>
              <span className="w-10" />
            </div>
            {stats.user_stats.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                  <Users size={14} className="text-indigo-400" />
                </div>
                <span className="text-sm text-[#e6edf3] font-medium flex-1">{u.username}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-16 text-center ${u.role === 'admin' ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                  {u.role}
                </span>
                <span className="text-xs text-[#e6edf3] w-16 text-center">{u.container_count}</span>
                <span className={`text-xs w-20 text-center ${u.container_limit > 0 && u.container_count >= u.container_limit ? 'text-red-400' : 'text-[#636d7d]'}`}>
                  {u.container_limit === -1 ? '∞' : u.container_limit}
                </span>
                <span className="text-xs text-[#636d7d] w-20 text-center">
                  {u.disk_limit === -1 ? '∞' : u.disk_limit === 0 ? '0' : `${u.disk_limit / (1024 * 1024)} MB`}
                </span>
                <span className="text-xs text-[#636d7d] w-24 text-right flex items-center justify-end gap-1">
                  <Clock size={11} />
                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                </span>
                <button onClick={() => handleEditLimits(u)} className="p-1.5 rounded hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3]">
                  <Settings2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Limits: ${editUser?.username || ''}`}>
        <div className="space-y-4">
          <Input
            label="Max Containers (-1 = ∞, 0 = disabled)"
            type="number"
            min={-1}
            value={String(editLimits.container_limit)}
            onChange={e => setEditLimits(l => ({ ...l, container_limit: parseInt(e.target.value) || 0 }))}
          />
          <Input
            label="Max Memory MB (-1 = ∞, 0 = disabled)"
            type="number"
            min={-1}
            value={String(editLimits.memory_limit)}
            onChange={e => setEditLimits(l => ({ ...l, memory_limit: parseInt(e.target.value) || 0 }))}
          />
          <Input
            label="Max CPU Cores (-1 = ∞, 0 = disabled)"
            type="number"
            min={-1}
            step={0.1}
            value={String(editLimits.cpu_limit)}
            onChange={e => setEditLimits(l => ({ ...l, cpu_limit: parseFloat(e.target.value) || 0 }))}
          />
          <Input
            label="Max Disk per Container (MB, -1 = ∞, 0 = disabled)"
            type="number"
            min={-1}
            value={String(editLimits.disk_limit)}
            onChange={e => setEditLimits(l => ({ ...l, disk_limit: parseInt(e.target.value) || 0 }))}
          />
          <Input
            label="Max Ports per Container (-1 = ∞, 0 = disabled)"
            type="number"
            min={-1}
            value={String(editLimits.port_limit)}
            onChange={e => setEditLimits(l => ({ ...l, port_limit: parseInt(e.target.value) || 0 }))}
          />
          <p className="text-[10px] text-[#636d7d]">Current usage: {editUser?.container_count || 0} containers</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveLimits} loading={savingLimits}>Save Limits</Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h3 className="text-sm font-semibold text-[#e6edf3]">All Containers</h3>
        </div>
        {allContainers.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636d7d]">No containers</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {allContainers.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <ContainerStatusBadge status={c.status} />
                <span className="text-sm text-[#e6edf3] font-medium flex-1">{c.name || c.id.slice(0, 12)}</span>
                <span className="text-xs text-[#636d7d] hidden sm:inline">{c.image}</span>
                <span className="text-xs font-mono text-[#636d7d]">{window.location.hostname}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
