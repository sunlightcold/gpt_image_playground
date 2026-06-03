import { spawnSync } from 'node:child_process'

const env = {
  ...process.env,
  VITE_API_PROXY_AVAILABLE: process.env.VITE_API_PROXY_AVAILABLE ?? 'true',
  VITE_API_PROXY_DYNAMIC: process.env.VITE_API_PROXY_DYNAMIC ?? 'true',
}

const result = spawnSync('npm', ['run', 'build'], {
  env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
