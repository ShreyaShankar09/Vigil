import {
  Bell,
  CloudUpload,
  FileStack,
  FlaskConical,
  Home,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { AuthUser } from '@/lib/api'
import type { TKey } from '@/lib/i18n'

export interface NavigationItem {
  to: string
  tk: TKey
  icon: LucideIcon
}

const profile: NavigationItem = { to: '/profile', tk: 'nav.profile', icon: User }
const evidence: NavigationItem = { to: '/evidence', tk: 'nav.evidence', icon: FileStack }

const navigation: Record<AuthUser['role'], NavigationItem[]> = {
  field_officer: [
    { to: '/dashboard', tk: 'nav.home', icon: Home },
    { to: '/test/new', tk: 'nav.tests', icon: FlaskConical },
    evidence,
    { to: '/sync', tk: 'nav.sync', icon: CloudUpload },
    profile,
  ],
  lab: [
    { to: '/evidence', tk: 'nav.evidenceZone', icon: FileStack },
    { to: '/custody', tk: 'nav.custody', icon: LockKeyhole },
    profile,
  ],
  zonal_admin: [
    { to: '/command', tk: 'nav.command', icon: LayoutDashboard },
    { to: '/admin/officers', tk: 'nav.officers', icon: Users },
    evidence,
    { to: '/alerts', tk: 'nav.alerts', icon: Bell },
    { to: '/security', tk: 'nav.security', icon: ShieldCheck },
    profile,
  ],
  prosecutor: [
    { to: '/released', tk: 'nav.released', icon: FileStack },
  ],
}

export function navigationForRole(role: AuthUser['role']): NavigationItem[] {
  return navigation[role]
}

export function homeForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'field_officer': return '/dashboard'
    case 'lab': return '/evidence'
    case 'zonal_admin': return '/command'
    case 'prosecutor': return '/released'
  }
}
