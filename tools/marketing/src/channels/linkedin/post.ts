import { OutcomeUnknownError } from '../http.ts';
import type { Draft, PostResult } from '../types.ts';
import { linkedInPost } from './api.ts';
import type { LinkedInAuth } from './auth.ts';
import { escapeLittleText } from './little.ts';
import { uploadLinkedInImage } from './image.ts';

interface PostRequestBody {
  content?: { media: { id: string; altText: string } };
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

/**
 * Posts the draft to LinkedIn, link included in its text. The draft must
 * already be validated. There is no first comment: commenting needs LinkedIn's
 * partner-only Community Management API.
 *
 * @throws When the post cannot be created; {@link OutcomeUnknownError} when it
 * may have been (timeout, network error, 5xx, no id).
 */
export async function postLinkedIn(
  auth: LinkedInAuth,
  draft: Draft,
): Promise<PostResult> {
  if (draft.text === undefined) {
    throw new Error('A LinkedIn draft needs text; validate it first.');
  }
  const imageUrn = draft.image
    ? await uploadLinkedInImage(auth, draft.image)
    : undefined;
  const postUrn = await createPost(auth, {
    ...(imageUrn && draft.image
      ? { content: { media: { id: imageUrn, altText: draft.image.altText } } }
      : {}),
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
  return {
    channel: 'linkedin',
    postId: postUrn,
    url: `https://www.linkedin.com/feed/update/${postUrn}/`,
    postedAt: new Date().toISOString(),
  };
}
