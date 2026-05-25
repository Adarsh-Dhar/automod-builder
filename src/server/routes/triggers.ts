/**
 * Trigger handlers for the ranking system and Blast Radius cache.
 */

import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { context, redis, reddit } from '@devvit/web/server';
import type { CachedPost } from '../../shared/blast-types';
import { checkLevelUp, getOrCreateProfile, incrementCommentCount } from '../services/rank.service';

export const triggers = new Hono();

function acknowledgeTrigger(triggerName: string) {
  return {
    status: 'success' as const,
    trigger: triggerName,
  };
}

function getBlastCacheKey(): string {
  return `blast:posts:${context.subredditName ?? 'default'}`;
}

function parseCachedPosts(raw: string | null | undefined): CachedPost[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CachedPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePostId(value: string): string {
  return value.startsWith('t3_') ? value.slice(3) : value;
}

/**
 * POST /internal/triggers/on-mod-action
 * Records moderation outcomes for the Blast Radius backtest cache.
 */
triggers.post('/on-mod-action', async (c) => {
  try {
    const input = await c.req.json<any>().catch(() => null);
    const targetId: string = String(input?.target_fullname ?? input?.targetFullname ?? '');
    const action: string = String(input?.action ?? '');

    if (targetId && (action === 'removelink' || action === 'approvelink')) {
      const raw = await redis.get(getBlastCacheKey());
      const posts = parseCachedPosts(raw);
      const normalizedTargetId = normalizePostId(targetId);
      const post = posts.find((item) => normalizePostId(item.id) === normalizedTargetId);

      if (post) {
        const wasRemoved = action === 'removelink';
        post.wasRemoved = wasRemoved;
        post.isSpam = wasRemoved;
        await redis.set(getBlastCacheKey(), JSON.stringify(posts));
      }
    }

    return c.json(acknowledgeTrigger('on-mod-action'), 200);
  } catch (error) {
    console.error('[RuleStage] Error in OnModAction handler:', error);
    return c.json(acknowledgeTrigger('on-mod-action'), 200);
  }
});

/**
 * POST /internal/triggers/on-post-submit
 * Caches recent posts so Blast Radius can backtest new rules.
 */
triggers.post('/on-post-submit', async (c) => {
  try {
    const input = await c.req.json<any>().catch(() => null);
    const post = input?.post ?? input;

    if (post?.id) {
      const raw = await redis.get(getBlastCacheKey());
      const posts = parseCachedPosts(raw);
      const nextPost: CachedPost = {
        id: String(post.id),
        title: String(post.title ?? ''),
        body: String(post.selftext ?? post.body ?? ''),
        author: String(post.author?.name ?? post.author?.username ?? post.author ?? 'unknown'),
        accountAgeDays: Number(post.author?.account_age_days ?? post.author?.accountAgeDays ?? 0),
        combinedKarma: Number(post.author?.combined_karma ?? post.author?.combinedKarma ?? 0),
        createdAt: Number(post.created_utc ?? post.createdAt ?? Date.now() / 1000),
        isSpam: false,
        wasRemoved: false,
      };

      const deduped = posts.filter((item) => item.id !== nextPost.id);
      deduped.unshift(nextPost);
      await redis.set(getBlastCacheKey(), JSON.stringify(deduped.slice(0, 500)));
    }

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

/**
 * POST /internal/triggers/on-install
 * Initializes the app when installed in a subreddit.
 */
triggers.post('/on-install', async (c) => {
  try {
    const subredditName = context.subredditName ?? 'default';
    console.log(`[RuleStage] App installed in subreddit: ${subredditName}`);

    // Initialize Redis keys for this subreddit
    const ruleKey = `rulestage:rule:current:${subredditName}`;
    const postsKey = `rulestage:simulation:posts:${subredditName}`;

    // Check if keys already exist (reinstall scenario)
    const existingRule = await redis.get(ruleKey);
    const existingPosts = await redis.get(postsKey);

    if (!existingRule) {
      // Initialize with default rule
      const { DEFAULT_AUTOMOD_RULE, serializeAutomodRule } = await import('../../shared/automod');
      await redis.set(ruleKey, serializeAutomodRule(DEFAULT_AUTOMOD_RULE));
      console.log(`[RuleStage] Initialized default rule for ${subredditName}`);
    } else {
      console.log(`[RuleStage] Existing rule found for ${subredditName}, preserving`);
    }

    if (!existingPosts) {
      // Initialize with empty posts array
      await redis.set(postsKey, JSON.stringify([]));
      console.log(`[RuleStage] Initialized empty simulation posts for ${subredditName}`);
    } else {
      console.log(`[RuleStage] Existing simulation posts found for ${subredditName}, preserving`);
    }

    return c.json(acknowledgeTrigger('on-install'), 200);
  } catch (error) {
    console.error('[RuleStage] Error in OnInstall handler:', error);
    return c.json(acknowledgeTrigger('on-install'), 200);
  }
});

/**
 * POST /internal/triggers/on-uninstall
 * Cleans up app data when uninstalled from a subreddit.
 */
triggers.post('/on-uninstall', async (c) => {
  try {
    const subredditName = context.subredditName ?? 'default';
    console.log(`[RuleStage] App uninstalled from subreddit: ${subredditName}`);

    // Clean up Redis keys for this subreddit
    const ruleKey = `rulestage:rule:current:${subredditName}`;
    const postsKey = `rulestage:simulation:posts:${subredditName}`;

    await redis.del(ruleKey);
    await redis.del(postsKey);

    console.log(`[RuleStage] Cleaned up Redis keys for ${subredditName}`);

    // Note: We do NOT remove the wiki rules because:
    // 1. They belong to the subreddit, not the app
    // 2. Moderators may want to keep the rules even after uninstalling
    // 3. Removing rules could cause unexpected moderation behavior

    return c.json(acknowledgeTrigger('on-uninstall'), 200);
  } catch (error) {
    console.error('[RuleStage] Error in OnUninstall handler:', error);
    return c.json(acknowledgeTrigger('on-uninstall'), 200);
  }
});
