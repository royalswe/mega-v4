import type { CollectionConfig } from 'payload'
import type { AfterChangeHook, AfterDeleteHook } from 'payload/types'

// When a comment is created, add it to the corresponding link's comments array
const updateLinkOnCommentChange: AfterChangeHook = ({ doc, req, operation }) => {
  if (operation === 'create') {
    // Fire-and-forget
    ;(async () => {
      try {
        const linkId = typeof doc.link === 'object' ? doc.link.id : doc.link
        if (linkId) {
          const link = await req.payload.findByID({
            collection: 'links',
            id: String(linkId),
            depth: 0,
          })

          if (link) {
            const comments = link.comments || []
            const newComments = [...comments, doc.id]

            await req.payload.update({
              collection: 'links',
              id: String(linkId),
              data: {
                comments: newComments,
              },
            })
          }
        }
      } catch (e) {
        req.payload.logger.error(`Error in updateLinkOnCommentChange hook: ${e}`)
      }
    })()
  }
  return doc
}

// When a comment is deleted, remove it from the corresponding link's comments array
const updateLinkOnCommentDelete: AfterDeleteHook = ({ req, id, doc }) => {
  // Fire-and-forget
  ;(async () => {
    try {
      const linkId = typeof doc.link === 'object' ? doc.link.id : doc.link
      if (linkId) {
        const link = await req.payload.findByID({
          collection: 'links',
          id: String(linkId),
          depth: 0,
        })

        if (link && link.comments) {
          const newComments = link.comments.filter((commentId: string) => commentId !== id)
          await req.payload.update({
            collection: 'links',
            id: String(linkId),
            data: {
              comments: newComments,
            },
          })
        }
      }
    } catch (e) {
      req.payload.logger.error(`Error in updateLinkOnCommentDelete hook: ${e}`)
    }
  })()
}

export const Comments: CollectionConfig = {
  slug: 'comments',
  fields: [
    {
      name: 'comment',
      type: 'textarea',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'links',
      required: true,
    },
  ],
  hooks: {
    afterChange: [updateLinkOnCommentChange],
    afterDelete: [updateLinkOnCommentDelete],
  },
}