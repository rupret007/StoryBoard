export type SocialComposerTarget = {
  enabled: boolean;
  externalPostId: string | null;
};

export type SocialComposerPost = {
  id: string;
  status: string;
  approval?: { status: string } | null;
  targets: SocialComposerTarget[];
};

export type SocialComposerWorkspace<TPost extends { id: string }> = {
  posts: TPost[];
};

/** A fresh Social visit starts a new drop. Recent posts stay in the list. */
export function defaultActiveSocialPost(): null {
  return null;
}

export function mergeSocialPost<TPost extends { id: string }>(
  workspace: SocialComposerWorkspace<TPost>,
  post: TPost
): SocialComposerWorkspace<TPost> {
  return {
    ...workspace,
    posts: [post, ...workspace.posts.filter((row) => row.id !== post.id)]
  };
}

export function socialApproveBlockReason(
  post: SocialComposerPost | null | undefined,
  drafts: SocialComposerTarget[] = post?.targets ?? []
): "missing_post" | "already_posted" | "none_enabled" | null {
  if (!post) return "missing_post";
  const enabled = drafts.filter((row) => row.enabled);
  if (
    post.status === "posted" ||
    post.status === "posting" ||
    post.approval?.status === "executed" ||
    (enabled.length > 0 && enabled.every((row) => Boolean(row.externalPostId)))
  ) {
    return "already_posted";
  }
  if (enabled.length === 0) return "none_enabled";
  return null;
}

export function canApproveSocialPost(
  post: SocialComposerPost | null | undefined,
  drafts: SocialComposerTarget[] = post?.targets ?? []
): boolean {
  return socialApproveBlockReason(post, drafts) === null;
}

export function noteFromRecordedShow(
  currentNote: string,
  event: { title: string } | null | undefined
): string {
  if (currentNote.trim()) return currentNote;
  return event?.title.trim() ?? "";
}
