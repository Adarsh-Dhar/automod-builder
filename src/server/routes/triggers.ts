/**
 * Trigger handlers for the ranking system
 */

import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { reddit } from '@devvit/web/server';
import { checkLevelUp, getOrCreateProfile, incrementCommentCount } from '../services/rank.service';

export const triggers = new Hono();

function acknowledgeTrigger(triggerName: string) {
  return {
    status: 'success' as const,
    trigger: triggerName,
  };
}

/**
 * POST /internal/triggers/on-mod-action
 * RuleStage does not need to react to mod actions yet, but Devvit expects the
 * endpoint to exist because it is registered in devvit.json.
 */
triggers.post('/on-mod-action', async (c) => {
  try {
    await c.req.json().catch(() => null);
    return c.json(acknowledgeTrigger('on-mod-action'), 200);
  } catch (error) {
    console.error('[RuleStage] Error in OnModAction handler:', error);
    return c.json(acknowledgeTrigger('on-mod-action'), 200);
  }
});

/**
 * POST /internal/triggers/on-post-submit
 * Keep the trigger wired even though RuleStage v1 does not need post-submit
 * processing yet.
 */
triggers.post('/on-post-submit', async (c) => {
  try {
    await c.req.json().catch(() => null);
    return c.json(acknowledgeTrigger('on-post-submit'), 200);
  } catch (error) {
    console.error('[RuleStage] Error in OnPostSubmit handler:', error);
    return c.json(acknowledgeTrigger('on-post-submit'), 200);
  }
});

/**
 * POST /internal/triggers/on-rank-subscribe
 * Initializes a rank profile and sends the welcome DM.
 */
triggers.post('/on-rank-subscribe', async (c) => {
  try {
    const input = await c.req.json<any>();
    const username: string | undefined = input.user?.name;

    if (!username) {
      console.warn('[Rank] OnSubscribe trigger: No username in payload');
      return c.json<TriggerResponse>({}, 200);
    }

    await getOrCreateProfile(username);

    try {
      await reddit.sendPrivateMessage({
        to: username,
        subject: 'Welcome to your Community Passport',
        text: `Welcome to the Community Passport! 🎉\n\nYou've joined a community with a 5-level ranking system. Spend time in the hub, browse posts, and participate in discussions to level up.\n\nYour current level is Newcomer (🔒). Open the hub to start earning progress toward Verified, Silver, Gold, and Platinum.`,
      });
    } catch (dmError) {
      console.warn(`[Rank] Could not send welcome DM to ${username}:`, dmError);
    }

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Rank] Error in OnSubscribe handler:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});

/**
 * POST /internal/triggers/on-comment-submit
 * Increments comment progress and checks for level ups.
 */
triggers.post('/on-comment-submit', async (c) => {
  try {
    const input = await c.req.json<any>();
    const authorName: string | undefined = input.author?.name;

    if (!authorName) {
      console.warn('[Rank] OnCommentSubmit: No author in payload');
      return c.json<TriggerResponse>({}, 200);
    }

    await incrementCommentCount(authorName);
    const result = await checkLevelUp(authorName);

    if (result.leveledUp && result.newLevel !== undefined) {
      try {
        await reddit.sendPrivateMessage({
          to: authorName,
          subject: 'You leveled up!',
          text: `Congratulations, u/${authorName}! You reached level ${result.newLevel}.`,
        });
      } catch (dmError) {
        console.warn(`[Rank] Could not send level-up DM to ${authorName}:`, dmError);
      }
    }

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Rank] Error in OnCommentSubmit handler:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});
