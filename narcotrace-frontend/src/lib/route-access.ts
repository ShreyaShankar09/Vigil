import type { AuthRole } from '@/lib/api'

export const ROLE_ACCESS = {
  dashboard: ['field_officer'],
  newTest: ['field_officer'],
  sync: ['field_officer'],
  evidence: ['field_officer', 'lab', 'zonal_admin'],
  evidenceDetail: ['field_officer', 'lab', 'zonal_admin'],
  custodyDetail: ['field_officer', 'lab', 'zonal_admin'],
  custodyQueue: ['lab'],
  admin: ['zonal_admin'],
  profile: ['field_officer', 'lab', 'zonal_admin'],
  released: ['prosecutor'],
} as const satisfies Record<string, readonly AuthRole[]>
