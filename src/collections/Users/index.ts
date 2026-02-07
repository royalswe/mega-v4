import type { CollectionConfig } from 'payload'
import { admins } from '@/access/admins'
import { adminsAndUser } from '@/access/adminsAndUser'
import { anyone } from '@/access/anyone'
import { checkRole } from '@/access/checkRole'
import { checkUserOrAdmin } from '@/access/checkUserOrAdmin'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
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
    read: adminsAndUser,
    create: anyone,
    update: adminsAndUser,
    delete: admins,
    unlock: admins,
    admin: ({ req: { user } }) => checkRole(['admin'], user),
  },
  fields: [
    {
      name: 'username',
      type: 'text',
      required: true,
      unique: true,
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
