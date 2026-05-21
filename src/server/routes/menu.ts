import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

/**
 * POST /internal/menu/rank-settings
 * Open the RuleStage app entry from the subreddit menu.
 */
menu.post('/rank-settings', async (c) => {
  try {
    return c.json<UiResponse>(
      {
        showToast: `Opening RuleStage on r/${context.subredditName}.`,
      },
      200
    );
  } catch (error) {
    console.error('Error opening RuleStage:', error);
    return c.json<UiResponse>({ showToast: 'Error opening RuleStage' }, 500);
  }
});
