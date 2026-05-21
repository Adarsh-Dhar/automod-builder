import { redis, reddit } from '@devvit/web/server';

export const createPost = async () => {
  const post = await reddit.submitCustomPost({
    title: 'RuleStage',
  });

  // Persist the post ID so OnSubscribe and OnPostSubmit can include the link
  // in their DMs and removal comments
  await redis.set('rulestage:active_post_id', post.id);
  console.log(`[RuleStage] Active post ID saved to Redis: ${post.id}`);

  return post;
};