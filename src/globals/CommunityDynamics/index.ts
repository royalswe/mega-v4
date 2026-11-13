import type { GlobalConfig } from 'payload'

import { admins } from '@/access/admins'
import { anyone } from '@/access/anyone'

/**
 * Persisted population snapshot that drives dynamic trust thresholds.
 * Written by `src/lib/community/trustDynamics.ts` (local API with
 * `overrideAccess: true`); read-only in the admin UI.
 */
export const CommunityDynamics: GlobalConfig = {
  slug: 'community-dynamics',
  label: 'Community Dynamics',
  admin: {
    group: 'Community',
    description:
      'Population-relative trust thresholds. Recomputed automatically from active-member distribution (exponential moving average).',
  },
  access: {
    read: anyone,
    update: admins,
  },
  fields: [
    {
      name: 'computedAt',
      type: 'date',
      admin: { readOnly: true },
    },
    {
      name: 'totalActiveMembers',
      type: 'number',
      admin: { readOnly: true },
    },
    {
      name: 'levels',
      type: 'array',
      admin: { readOnly: true },
      fields: [
        { name: 'level', type: 'text', required: true },
        { name: 'count', type: 'number' },
        { name: 'share', type: 'number' },
        { name: 'threshold', type: 'number', required: true },
        { name: 'scale', type: 'number' },
      ],
    },
  ],
}
