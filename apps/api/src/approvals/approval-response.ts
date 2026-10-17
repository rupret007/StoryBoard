function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

/** HTTP-only projection: historical provider errors and media bearer URLs stay server-side. */
export function presentApprovalResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(presentApprovalResponse);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const source = record(value);
  const result = Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, presentApprovalResponse(entry)]));
  if (source.actionType !== "social_post_batch" || !source.payload) return result;
  const payload = record(source.payload);
  const safe = pick(payload, ["postId", "voiceKey", "adapterMode", "mediaKind", "reviewFingerprint"]);
  safe.targets = Array.isArray(payload.targets) ? payload.targets.map((target) => pick(record(target), [
    "targetId", "platform", "enabled", "caption", "title", "tags", "includeFacebookEvent",
    "facebookEventName", "facebookEventStartsAt", "facebookEventPlace", "accountExternalId", "accountLabel", "accountVoiceKey"
  ])) : [];
  if (payload.dryRunPreview) {
    const preview = record(payload.dryRunPreview);
    safe.dryRunPreview = { ...pick(preview, ["at", "socialMode"]),
      wouldPublish: Array.isArray(preview.wouldPublish)
        ? preview.wouldPublish.map((entry) => pick(record(entry), ["platform", "account", "includeFacebookEvent"])) : [] };
  }
  if (typeof payload.rejectionReason === "string") safe.rejectionReason = payload.rejectionReason;
  if (payload.executionError) safe.executionError = "Social execution needs review. Check the platform before preparing another approval.";
  if (payload.executionResult) {
    const execution = record(payload.executionResult);
    safe.executionResult = {
      ...pick(execution, ["at", "socialMode"]),
      results: Array.isArray(execution.results) ? execution.results.map((entry) => {
        const row = record(entry);
        const state = execution.socialMode === "mock" ? "simulated" : row.deliveryState ?? "unknown";
        const adapterDraftOnly = row.isDraftOnly;
        const isDraftOnly =
          typeof adapterDraftOnly === "boolean"
            ? adapterDraftOnly
            : ["private_upload", "draft_only", "processing"].includes(String(state));
        return { ...pick(row, ["platform", "externalPostId"]), deliveryState: state,
          posted: execution.socialMode === "real" && state === "published" && Boolean(row.externalPostId),
          isDraftOnly,
          ...(row.error ? { error: "Platform outcome needs review." } : {}) };
      }) : []
    };
  }
  result.payload = safe;
  return result;
}
