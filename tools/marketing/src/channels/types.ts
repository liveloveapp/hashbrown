/** The channels the marketing app publishes to. */
export type SocialChannel = 'x' | 'linkedin' | 'devto';

/** The dev.to article fields that sit beside the markdown body. */
export interface DraftArticle {
  /** 1-128 chars. */
  title: string;
  /** Dev.to: `^[a-z0-9]+$`, at most 4 items, each at most 30 chars. */
  tags?: string[];
  /** Absolute https: URL of the origin post, for search engines. */
  canonicalUrl?: string;
  /** Meta description; falls through to the platform's SEO subtitle. */
  description?: string;
}

/** One reviewed, immutable image attached to a social post. */
export interface DraftImage {
  /** Public PNG/JPEG under hashbrown.dev/marketing/. */
  url: string;
  /** Accurate screen-reader description, at most 1,000 characters. */
  altText: string;
  /** SHA-256 of the exact reviewed bytes. */
  sha256: string;
}

/** A post ready to publish. Queued X/LinkedIn posts require an image. */
export interface Draft {
  channel: SocialChannel;
  text?: string;
  threadParts?: string[];
  link?: { url: string; previewTitle?: string };
  scheduledAt?: string;
  article?: DraftArticle;
  /**
   * Not supported: LinkedIn comments need partner API access, so validation
   * rejects it. Put the link in `text`.
   */
  firstComment?: string;
  /** Required by the social queue; omitted only by legacy direct helpers. */
  image?: DraftImage;
}

/** Where a published post lives. */
export interface PostResult {
  channel: SocialChannel;
  postId: string;
  url: string;
  postedAt: string;
  /** Follow-up steps that failed after the post itself went live. */
  warnings?: string[];
}

/** Validates and publishes drafts for one channel. */
export interface ChannelAdapter {
  readonly id: SocialChannel;
  post(draft: Draft): Promise<PostResult>;
}
