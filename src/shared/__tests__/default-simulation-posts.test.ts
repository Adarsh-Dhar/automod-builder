/**
 * Verification test for default simulation posts
 * Ensures they match the reference document exactly
 */

import { describe, it, expect } from 'vitest';
import { createDefaultSimulationPosts } from '../automod';

describe('createDefaultSimulationPosts', () => {
  it('should create 4 default simulation posts', () => {
    const posts = createDefaultSimulationPosts();
    expect(posts).toHaveLength(4);
  });

  it('Post 1 should match the reference - Promo / low-karma new account', () => {
    const posts = createDefaultSimulationPosts();
    const post = posts[0]!;

    expect(post.id).toBe('post-1');
    expect(post.title).toBe('Look what I got in the mail today');
    expect(post.body).toBe('Brand launch teaser');
    expect(post.author).toBe('newshopper88');
    expect(post.accountAgeDays).toBe(12);
    expect(post.combinedKarma).toBe(14);
    expect(post.linkKarma).toBe(10);
    expect(post.commentKarma).toBe(4);
    expect(post.subreddit).toBe('r/shopping');
    expect(post.domain).toBe('self.shopping');
    expect(post.url).toBe('https://reddit.com/r/shopping/comments/abc123');
    expect(post.isSelf).toBe(true);
    expect(post.over18).toBe(false);
    expect(post.spoiler).toBe(false);
    expect(post.stickied).toBe(false);
    expect(post.numComments).toBe(5);
    expect(post.score).toBe(3);
    expect(post.upvoteRatio).toBe(0.6);
    expect(post.authorFlairText).toBe('');
    expect(post.linkFlairText).toBe('');
    expect(post.distinguished).toBe('');
  });

  it('Post 2 should match the reference - Established mod / stickied discussion', () => {
    const posts = createDefaultSimulationPosts();
    const post = posts[1]!;

    expect(post.id).toBe('post-2');
    expect(post.title).toBe('Weekly discussion thread');
    expect(post.body).toBe('Thoughts on the latest release');
    expect(post.author).toBe('communityhelper');
    expect(post.accountAgeDays).toBe(418);
    expect(post.combinedKarma).toBe(1204);
    expect(post.linkKarma).toBe(800);
    expect(post.commentKarma).toBe(404);
    expect(post.subreddit).toBe('r/technology');
    expect(post.domain).toBe('self.technology');
    expect(post.url).toBe('https://reddit.com/r/technology/comments/def456');
    expect(post.isSelf).toBe(true);
    expect(post.over18).toBe(false);
    expect(post.spoiler).toBe(false);
    expect(post.stickied).toBe(true);
    expect(post.numComments).toBe(150);
    expect(post.score).toBe(250);
    expect(post.upvoteRatio).toBe(0.85);
    expect(post.authorFlairText).toBe('Moderator');
    expect(post.linkFlairText).toBe('Discussion');
    expect(post.distinguished).toBe('moderator');
  });

  it('Post 3 should match the reference - Vendor throwaway / link to imgur / promo flair', () => {
    const posts = createDefaultSimulationPosts();
    const post = posts[2]!;

    expect(post.id).toBe('post-3');
    expect(post.title).toBe('Just arrived - shipping update');
    expect(post.body).toBe('This feels like another promo post');
    expect(post.author).toBe('vendorthrowaway');
    expect(post.accountAgeDays).toBe(8);
    expect(post.combinedKarma).toBe(2);
    expect(post.linkKarma).toBe(1);
    expect(post.commentKarma).toBe(1);
    expect(post.subreddit).toBe('r/deals');
    expect(post.domain).toBe('imgur.com');
    expect(post.url).toBe('https://imgur.com/gallery/xyz789');
    expect(post.isSelf).toBe(false);
    expect(post.over18).toBe(false);
    expect(post.spoiler).toBe(false);
    expect(post.stickied).toBe(false);
    expect(post.numComments).toBe(2);
    expect(post.score).toBe(-5);
    expect(post.upvoteRatio).toBe(0.3);
    expect(post.authorFlairText).toBe('');
    expect(post.linkFlairText).toBe('Promo');
    expect(post.distinguished).toBe('');
  });

  it('Post 4 should match the reference - Amazon deal / low upvote ratio', () => {
    const posts = createDefaultSimulationPosts();
    const post = posts[3]!;

    expect(post.id).toBe('post-4');
    expect(post.title).toBe('Grab yours here before it is gone');
    expect(post.body).toBe('Limited offer');
    expect(post.author).toBe('lowkarmaaccount');
    expect(post.accountAgeDays).toBe(54);
    expect(post.combinedKarma).toBe(32);
    expect(post.linkKarma).toBe(20);
    expect(post.commentKarma).toBe(12);
    expect(post.subreddit).toBe('r/gaming');
    expect(post.domain).toBe('amazon.com');
    expect(post.url).toBe('https://amazon.com/product/123');
    expect(post.isSelf).toBe(false);
    expect(post.over18).toBe(false);
    expect(post.spoiler).toBe(false);
    expect(post.stickied).toBe(false);
    expect(post.numComments).toBe(8);
    expect(post.score).toBe(1);
    expect(post.upvoteRatio).toBe(0.45);
    expect(post.authorFlairText).toBe('');
    expect(post.linkFlairText).toBe('Deal');
    expect(post.distinguished).toBe('');
  });
});
