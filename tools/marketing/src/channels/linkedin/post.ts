import { OutcomeUnknownError } from '../http.ts';
import type { Draft, PostResult } from '../types.ts';
import { linkedInPost } from './api.ts';
import type { LinkedInAuth } from './auth.ts';
import { escapeLittleText } from './little.ts';

interface PostRequestBody {
  author: string;
  commentary: string;
  visibility: 'PUBLIC';
  distribution: {
    feedDistribution: 'MAIN_FEED';
    targetEntities: [];
    thirdPartyDistributionChannels: [];
  };
  lifecycleState: 'PUBLISHED';
  isReshareDisabledByAuthor: false;
}

async function createPost(
  auth: LinkedInAuth,
  body: PostRequestBody,
): Promise<string> {
  const { restliId } = await linkedInPost(auth, '/posts', body);
  if (!restliId) {
    // The post is live; only its id is missing.
    throw new OutcomeUnknownError(
      'LinkedIn created the post but returned no x-restli-id header.',
    );
  }
  return restliId;
}

async function createComment(
  auth: LinkedInAuth,
  postUrn: string,
  text: string,
): Promise<void> {
  await linkedInPost(
    auth,
    `/socialActions/${encodeURIComponent(postUrn)}/comments`,
    { actor: auth.authorUrn, object: postUrn, message: { text } },
  );
}

/**
 * Posts the draft to LinkedIn, then its `firstComment` if it has one. The
 * draft must already be validated.
 *
 * @throws When the post cannot be created; {@link OutcomeUnknownError} when it
 * may have been (timeout, network error, 5xx, no id). A failed comment does
 * not throw, because the post is already live; it comes back as a warning.
 */
export async function postLinkedIn(
  auth: LinkedInAuth,
  draft: Draft,
): Promise<PostResult> {
  if (draft.text === undefined) {
    throw new Error('A LinkedIn draft needs text; validate it first.');
  }
  const postUrn = await createPost(auth, {
    author: auth.authorUrn,
    commentary: escapeLittleText(draft.text),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  });
  const result: PostResult = {
    channel: 'linkedin',
    postId: postUrn,
    url: `https://www.linkedin.com/feed/update/${postUrn}/`,
    postedAt: new Date().toISOString(),
  };

  if (draft.firstComment) {
    try {
      await createComment(auth, postUrn, draft.firstComment);
    } catch (error) {
      result.warnings = [
        `Post is live but the first comment failed; add it by hand. ${(error as Error).message}`,
      ];
    }
  }

  return result;
}
