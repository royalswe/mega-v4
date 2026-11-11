import { Payload } from 'payload';
import { getTestPayload, getTestUser } from '../utils/test-user';
import { describe, it, beforeAll, expect } from 'vitest';
import { faker } from '@faker-js/faker';

let payload: Payload;
let testUser: any;

describe('Comments Integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload();

    // Get Shared User
    testUser = await getTestUser();
  });

  it('can create a comment on a link', async () => {
    const title = faker.lorem.words(4);
    const url = faker.internet.url();
    const commentText = faker.lorem.words(4);
    const commentJson = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0 as const,
                format: 0 as const,
                mode: 'normal' as const,
                style: '',
                text: commentText,
                type: 'text' as const,
                version: 1 as const,
              },
            ],
            direction: 'ltr' as const,
            format: '' as const,
            indent: 0,
            type: 'paragraph' as const,
            version: 1 as const,
            textFormat: 0 as const,
            textStyle: '',
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        type: 'root' as const,
        version: 1,
      },
    };

    // 2. Create Link
    const link = await payload.create({
      collection: 'links',
      data: {
        title: title,
        url: url,
        type: 'article',
        user: testUser.id,
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    });

    // 3. Create Comment
    const comment = await payload.create({
      collection: 'comments',
      data: {
        comment: commentJson,
        user: testUser.id,
        link: link.id,
      },
      draft: false,
      overrideAccess: true,
    });

    expect(comment).toBeDefined();
    expect(comment.comment).toEqual(commentJson);
    expect(comment.user).toEqual(expect.objectContaining({ id: testUser.id }));
    expect(comment.link).toEqual(expect.objectContaining({ id: link.id }));

    // Verify partial update does not fail validation for missing link/post
    const updated = await payload.update({
      collection: 'comments',
      id: comment.id,
      data: {
        moderationStatus: 'pending',
      },
      overrideAccess: true,
    });
    expect(updated.moderationStatus).toBe('pending');

    await expect(
      payload.update({
        collection: 'comments',
        id: comment.id,
        data: { link: null },
        overrideAccess: true,
      }),
    ).rejects.toThrow('Either link or post must be provided');

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Comment target ${faker.string.alphanumeric(10)}`,
        content: commentJson,
        type: 'discussion',
        user: testUser.id,
        feed: 'user',
      },
      overrideAccess: true,
    });
    const moved = await payload.update({
      collection: 'comments',
      id: comment.id,
      data: { link: null, post: post.id },
      overrideAccess: true,
      depth: 0,
    });
    expect(moved.link).toBeNull();
    expect(moved.post).toBe(post.id);

    await expect(
      payload.update({
        collection: 'comments',
        id: comment.id,
        data: { post: null },
        overrideAccess: true,
      }),
    ).rejects.toThrow('Either link or post must be provided');

    const restored = await payload.update({
      collection: 'comments',
      id: comment.id,
      data: { post: null, link: link.id },
      overrideAccess: true,
      depth: 0,
    });
    expect(restored.post).toBeNull();
    expect(restored.link).toBe(link.id);
  });

  it('fails to create comment without required fields', async () => {
    // 2. Try to create comment without link
    await expect(
      // @ts-ignore
      payload.create({
        collection: 'comments',
        data: {
          comment: {
            root: {
              children: [],
              direction: null,
              format: '' as const,
              indent: 0,
              type: 'root',
              version: 1,
            },
          },
          user: testUser.id,
          link: undefined,
        },
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });
});
