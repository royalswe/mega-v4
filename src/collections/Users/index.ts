import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { admins } from '@/access/admins'
import { adminsAndUser } from '@/access/adminsAndUser'
import { anyone } from '@/access/anyone'
import { checkRole } from '@/access/checkRole'
import { checkUserOrAdmin } from '@/access/checkUserOrAdmin'
import {
  buildPointClassProfile,
  buildTrustProfile,
  deriveAutomaticRoles,
  deriveBehavioralTitles,
} from '@/lib/community/reputation'

const readNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

const mergeScore = (incoming: unknown, existing: unknown): number => {
  if (typeof incoming === 'number' && Number.isFinite(incoming)) return incoming
  return readNumber(existing)
}

const syncCommunityProfile: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const existingRoles =
    Array.isArray(data?.roles) && data.roles.length > 0
      ? data.roles
      : Array.isArray(originalDoc?.roles) && originalDoc.roles.length > 0
        ? originalDoc.roles
        : ['user']

  const discoveryScore = mergeScore(data?.discoveryScore, originalDoc?.discoveryScore)
  const contributionScore = mergeScore(data?.contributionScore, originalDoc?.contributionScore)
  const interactionScore = mergeScore(data?.interactionScore, originalDoc?.interactionScore)
  const moderationScore = mergeScore(data?.moderationScore, originalDoc?.moderationScore)
  const legacyContributionScore = mergeScore(
    data?.legacyContributionScore,
    originalDoc?.legacyContributionScore,
  )
  const securityScore = mergeScore(data?.securityScore, originalDoc?.securityScore)

  const likabilityScore = mergeScore(data?.likabilityScore, originalDoc?.likabilityScore)
  const cleaningScore = mergeScore(data?.cleaningScore, originalDoc?.cleaningScore)
  const recruiterScore = mergeScore(data?.recruiterScore, originalDoc?.recruiterScore)
  const pointProfile = buildPointClassProfile({
    discoveryScore,
    contributionScore,
    interactionScore,
    likabilityScore,
    cleaningScore,
    recruiterScore,
    moderationScore,
    legacyContributionScore,
    securityScore,
  })
  const trust = buildTrustProfile({
    discoveryScore,
    contributionScore,
    interactionScore,
    moderationScore,
    likabilityScore,
    cleaningScore,
    recruiterScore,
    legacyContributionScore,
    securityScore,
  })

  const roles = deriveAutomaticRoles(
    {
      discoveryScore,
      contributionScore,
      interactionScore,
      moderationScore,
      legacyContributionScore,
      securityScore,
      streakDays: mergeScore(data?.streakDays, originalDoc?.streakDays),
      lastActiveAt:
        typeof data?.lastActiveAt === 'string' || data?.lastActiveAt instanceof Date
          ? data.lastActiveAt
          : originalDoc?.lastActiveAt,
    },
    existingRoles,
  )

  const titles = deriveBehavioralTitles({
    discoveryScore,
    contributionScore,
    interactionScore,
    moderationScore,
    streakDays: mergeScore(data?.streakDays, originalDoc?.streakDays),
    lastActiveAt:
      typeof data?.lastActiveAt === 'string' || data?.lastActiveAt instanceof Date
        ? data.lastActiveAt
        : originalDoc?.lastActiveAt,
  })

  return {
    ...data,
    roles,
    isAdmin: roles.includes('admin'),
    isEditor: roles.includes('editor'),
    isModerator: roles.includes('moderator'),
    isCleaner: roles.includes('cleaner'),
    isRecruiter: roles.includes('recruiter'),
    isUploader: roles.includes('uploader'),
    trustLevel: trust.trustLevel,
    reputationHidden: trust.reputationHidden,
    totalMemberValue: pointProfile.totalMemberValue,
    reputationPublicLabel: trust.reputationPublicLabel,
    titles,
    badges:
      Array.isArray(data?.badges) && data.badges.length > 0
        ? data.badges
        : Array.isArray(originalDoc?.badges)
          ? originalDoc.badges
          : [],
    streakDays: Math.max(0, mergeScore(data?.streakDays, originalDoc?.streakDays)),
    lastActiveAt:
      data?.lastActiveAt ||
      originalDoc?.lastActiveAt ||
      (data && !originalDoc ? new Date().toISOString() : undefined),
  }
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'username',
  },
  auth: {
    tokenExpiration: 172800, // 48 hours
    maxLoginAttempts: 10,
    lockTime: 600 * 1000, // 10 minutes
    loginWithUsername: {
      allowEmailLogin: true, // allow login with email or username
      requireEmail: false, // Email is not required on signup
    },
    cookies: {
      sameSite: 'None',
      secure: true,
    },
  },
  access: {
    read: anyone,
    create: anyone,
    update: adminsAndUser,
    delete: admins,
    unlock: admins,
    admin: ({ req: { user } }) => checkRole(['admin'], user),
  },
  hooks: {
    beforeChange: [syncCommunityProfile],
  },
  fields: [
    {
      name: 'username',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'bio',
      type: 'textarea',
      maxLength: 400,
    },
    {
      name: 'avatar',
      type: 'relationship',
      relationTo: 'media',
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      access: {
        read: checkUserOrAdmin,
        update: checkUserOrAdmin,
      },
    },
    {
      name: 'trustLevel',
      type: 'select',
      defaultValue: 'newcomer',
      admin: {
        readOnly: true,
      },
      options: [
        {
          label: 'Newcomer',
          value: 'newcomer',
        },
        {
          label: 'Regular',
          value: 'regular',
        },
        {
          label: 'Recognized',
          value: 'recognized',
        },
        {
          label: 'Trusted',
          value: 'trusted',
        },
        {
          label: 'Veteran',
          value: 'veteran',
        },
        {
          label: 'Curator',
          value: 'curator',
        },
        {
          label: 'Pillar',
          value: 'pillar',
        },
        {
          label: 'Legend',
          value: 'legend',
        },
      ],
    },
    {
      name: 'titles',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'badges',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'reputationHidden',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
      access: {
        read: admins,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'reputationPublicLabel',
      type: 'text',
      defaultValue: 'Newcomer',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'securityScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: admins,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'likabilityScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'cleaningScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'recruiterScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'isUploader',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'isEditor',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'isModerator',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'isCleaner',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'isRecruiter',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'isAdmin',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
      access: {
        read: admins,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'streakDays',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'lastActiveAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'discoveryScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'contributionScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'interactionScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'moderationScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: admins,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'legacyContributionScore',
      type: 'number',
      defaultValue: 0,
      access: {
        read: admins,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'totalMemberValue',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
      access: {
        read: () => true,
        create: admins,
        update: admins,
      },
    },
    {
      name: 'resetPasswordToken',
      type: 'text',
      hidden: true,
    },
    {
      name: 'resetPasswordExpiration',
      type: 'date',
      hidden: true,
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      saveToJWT: true,
      access: {
        read: admins,
        update: admins,
        create: admins,
      },
      options: [
        {
          label: 'Admin',
          value: 'admin',
        },
        {
          label: 'Editor',
          value: 'editor',
        },
        {
          label: 'Moderator',
          value: 'moderator',
        },
        {
          label: 'Cleaner',
          value: 'cleaner',
        },
        {
          label: 'Uploader',
          value: 'uploader',
        },
        {
          label: 'Recruiter',
          value: 'recruiter',
        },
        {
          label: 'User',
          value: 'user',
        },
      ],
    },
    {
      name: 'settings',
      type: 'group',
      fields: [
        {
          name: 'nsfw',
          type: 'checkbox',
          defaultValue: false,
          label: 'Show NSFW Content',
        },
        {
          name: 'language',
          type: 'select',
          defaultValue: 'en',
          required: true,
          options: [
            { label: 'English', value: 'en' },
            { label: 'Svenska', value: 'sv' },
          ],
        },
      ],
    },
  ],
}
