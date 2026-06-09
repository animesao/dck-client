import { Card, CardContent } from '@/components/ui/Card'
import { Terminal, Download, Cog, Shield, Box, BookOpen, Wrench } from 'lucide-react'

const sections = [
  {
    icon: Terminal,
    title: 'Getting Started',
    content: `dck is a lightweight container runtime using Linux kernel primitives.

Install:
  curl -fsSL https://raw.githubusercontent.com/animesao/dck/main/install.sh | bash

Or download the binary from GitHub releases.`,
  },
  {
    icon: Download,
    title: 'Pulling Images',
    content: `Pull from Docker Hub:
  dck pull nginx:latest
  dck pull ubuntu:22.04
  dck pull python:3.12-slim

Images are cached locally in ~/.dck/images/`,
  },
  {
    icon: Box,
    title: 'Running Containers',
    content: `Basic container:    dck run -d nginx:latest
With port mapping:  dck run -d -p 8080:80 nginx:latest
Named container:    dck run -d --name myweb nginx:latest
Resource limits:    dck run -d --memory 512m --cpus 1.5 nginx:latest
Environment:        dck run -d -e NODE_ENV=production node:latest`,
  },
  {
    icon: Wrench,
    title: 'Container Management',
    content: `List:       dck ps        | dck ps -a (all)
Start:      dck start <id>
Stop:       dck stop <id>
Restart:    dck restart <id>
Remove:     dck rm <id>   | dck rm -f <id>
Logs:       dck logs <id> | dck logs -f <id>
Execute:    dck exec <id> ls -la
Console:    dck attach <id> | dck console <id>`,
  },
  {
    icon: Cog,
    title: 'Multi-Container Config',
    content: `Create dck.toml:
  [web]
  image = "nginx:latest"
  ports = ["80:80"]

  [db]
  image = "postgres:16"
  env = ["POSTGRES_PASSWORD=secret"]

Deploy: dck up
Stop:   dck down`,
  },
  {
    icon: Shield,
    title: 'Best Practices',
    content: `• Use specific image tags, not :latest
• Set memory and CPU limits on all containers
• Use restart policies for production workloads
• Store secrets in environment variables
• Use volumes for persistent data
• Monitor resource usage via the dashboard
• Keep dck and dck-client updated regularly`,
  },
]

export function GuidePage() {
  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Guide</h1>
        <p className="text-[#636d7d] text-sm mt-1">Documentation and reference</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sections.map(s => (
          <Card key={s.title} className="card-gradient">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/[0.05]">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/10">
                  <s.icon size={18} className="text-indigo-400" />
                </div>
                <h3 className="font-semibold text-[#e6edf3]">{s.title}</h3>
              </div>
              <pre className="text-sm text-[#c9d1d9] whitespace-pre-wrap font-sans leading-relaxed">
                {s.content}
              </pre>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
