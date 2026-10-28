import { execFileSync } from 'node:child_process'

export default function globalSetup() {
  execFileSync('scripts/erpnext-reset.sh', { stdio: 'inherit' })
  execFileSync('scripts/erpnext-health.sh', { stdio: 'inherit' })
}
