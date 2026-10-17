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

import { canApproveSocialPost } from "./receipt";

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
): "missing_post" | "already_posted" | "none_enabled" | "not_ready" | null {
  if (!post) return "missing_post";
  const enabled = drafts.filter((row) => row.enabled);
  const hasPlatformId = [...(post.targets ?? []), ...drafts].some((row) =>
    Boolean(row.externalPostId)
  );
  if (
    post.status === "posted" ||
    post.status === "posting" ||
    post.status === "simulated" ||
    post.approval?.status === "executed" ||
    hasPlatformId
  ) {
    return "already_posted";
  }
  if (enabled.length === 0) return "none_enabled";
  if (!canApproveSocialPost({
    isOwner: true,
    approvalStatus: post.approval?.status,
    postStatus: post.status,
    hasEnabledTarget: true
  })) {
    return "not_ready";
  }
  return null;
}

export function noteFromRecordedShow(
  currentNote: string,
  event: { title: string } | null | undefined,
  previousEvent?: { title: string } | null | undefined
): string {
  const trimmed = currentNote.trim();
  const previousTitle = previousEvent?.title.trim() ?? "";
  if (!trimmed) return event?.title.trim() ?? "";
  if (previousTitle && trimmed === previousTitle) {
    return event?.title.trim() ?? "";
  }
  return currentNote;
}
