import { inventedFactsInText, SOCIAL_CAPTION_LIMITS } from "./caption-facts";
import { completeSocialCaptionDrafts } from "./caption-llm";
import { draftPlatformCaptions } from "./captions";

export type SocialCaptionEvalResult = {
  name: string;
  passed: boolean;
  detail: string;
};

function llmPayload(overrides?: {
  instagramCaption?: string;
  facebookCaption?: string;
  tiktokCaption?: string;
  youtubeCaption?: string;
  youtubeTitle?: string;
  tags?: string[];
}) {
  const tags = overrides?.tags ?? ["stalemate"];
  return {
    platforms: [
      {
        platform: "facebook" as const,
        variants: [
          { caption: overrides?.facebookCaption ?? "Playing Burlington Bar. Friday.", title: "", tags },
          { caption: "Burlington Bar · Friday", title: "", tags }
        ]
      },
      {
        platform: "instagram" as const,
        variants: [
          { caption: overrides?.instagramCaption ?? "Burlington Bar Friday.\n\n#stalemate", title: "", tags },
          { caption: "Burlington. Friday.", title: "", tags }
        ]
      },
      {
        platform: "youtube" as const,
        variants: [
          {
            caption: overrides?.youtubeCaption ?? "Playing Burlington Bar Friday.",
            title: overrides?.youtubeTitle ?? "Stalemate at Burlington Bar",
            tags
          },
          { caption: "Burlington Bar", title: "Stalemate at Burlington Bar", tags }
        ]
      },
      {
        platform: "tiktok" as const,
        variants: [
          { caption: overrides?.tiktokCaption ?? "Burlington Bar Friday.", title: "", tags },
          { caption: "Burlington.", title: "", tags }
        ]
      }
    ]
  };
}

const show = {
  name: "Stalemate at Burlington Bar",
  startsAt: "Friday",
  place: "Burlington Bar",
  ticketUrl: "https://example.com/tickets"
};

export function runSocialCaptionEvaluation(): {
  passed: boolean;
  results: SocialCaptionEvalResult[];
} {
  const results: SocialCaptionEvalResult[] = [];

  let rejectedInvented = false;
  try {
    completeSocialCaptionDrafts(
      { voice: "stalemate", note: "Manic live at Burlington, Friday.", mediaKind: "video", show },
      llmPayload({
        facebookCaption: "Doors $25 this October 99 in Chicago.",
        instagramCaption: "Don't miss Chicago October 99. $25",
        tiktokCaption: "$25 Chicago October 99",
        youtubeCaption: "Tickets $25 in Chicago on October 99"
      })
    );
  } catch {
    rejectedInvented = true;
  }
  const templateFacts = { voice: "stalemate" as const, note: "Manic live at Burlington, Friday.", mediaKind: "video" as const, show };
  const safeTemplates = completeSocialCaptionDrafts(templateFacts);
  results.push({
    name: "no-invented-facts",
    passed:
      rejectedInvented &&
      safeTemplates.source === "template" &&
      safeTemplates.drafts.every((draft) => inventedFactsInText(`${draft.caption} ${draft.title ?? ""}`, templateFacts).length === 0) &&
      safeTemplates.drafts.every((draft) => !/#chicago/i.test(draft.caption) && !draft.tags.includes("chicago")),
    detail: "Mocked LLM dates, prices, and Chicago fail the entire draft; explicit unconfigured templates use only confirmed show facts."
  });

  const stalemate = completeSocialCaptionDrafts(
    { voice: "stalemate", note: "Manic live at Burlington, Friday.", mediaKind: "video", show },
    llmPayload()
  );
  const radDad = completeSocialCaptionDrafts(
    {
      voice: "rad_dad",
      note: "Lincoln Hall this Saturday. We will play Mr. Brightside.",
      mediaKind: "photo",
      show: { name: "Rad Dad at Lincoln Hall", place: "Lincoln Hall" }
    },
    {
      platforms: [
        {
          platform: "facebook",
          variants: [
            { caption: "Lincoln Hall this Saturday. We will play Mr. Brightside!", title: "", tags: ["raddad"] },
            { caption: "Lincoln Hall Saturday!", title: "", tags: ["raddad"] }
          ]
        },
        {
          platform: "instagram",
          variants: [
            { caption: "Lincoln Hall Saturday. Mr. Brightside.\n\n#raddad #poppunk", title: "", tags: ["raddad", "poppunk"] },
            { caption: "Lincoln Hall. Come sing.", title: "", tags: ["raddad"] }
          ]
        },
        {
          platform: "youtube",
          variants: [
            { caption: "Lincoln Hall this Saturday. Mr. Brightside.", title: "Rad Dad at Lincoln Hall", tags: ["rad dad"] },
            { caption: "Lincoln Hall", title: "Rad Dad at Lincoln Hall", tags: ["rad dad"] }
          ]
        },
        {
          platform: "tiktok",
          variants: [
            { caption: "Lincoln Hall. Mr. Brightside.", title: "", tags: ["raddadband"] },
            { caption: "Lincoln Hall Saturday!", title: "", tags: ["raddadband"] }
          ]
        }
      ]
    }
  );
  const staleFb = stalemate.drafts.find((row) => row.platform === "facebook")?.caption ?? "";
  const radFb = radDad.drafts.find((row) => row.platform === "facebook")?.caption ?? "";
  results.push({
    name: "voice-separation",
    passed:
      stalemate.source === "llm" &&
      radDad.source === "llm" &&
      !/lincoln hall|mr\. brightside|raddad/i.test(staleFb) &&
      /lincoln hall/i.test(radFb) &&
      !/stalemate/i.test(radFb),
    detail: "Stalemate drafts stay on Burlington facts; Rad Dad stays on Lincoln Hall and does not inherit Stalemate."
  });

  const long = completeSocialCaptionDrafts(
    { voice: "stalemate", note: "Manic live at Burlington, Friday.", mediaKind: "video", show },
    llmPayload({
      instagramCaption: `${"Burlington Bar Friday. ".repeat(40)}#stalemate`,
      tiktokCaption: `${"Burlington Bar Friday. ".repeat(20)}`
    })
  );
  const instagram = long.drafts.find((row) => row.platform === "instagram");
  const tiktok = long.drafts.find((row) => row.platform === "tiktok");
  const facebook = long.drafts.find((row) => row.platform === "facebook");
  results.push({
    name: "length-limits",
    passed: Boolean(
      instagram &&
        tiktok &&
        facebook &&
        instagram.caption.length <= SOCIAL_CAPTION_LIMITS.instagram.caption &&
        tiktok.caption.length <= SOCIAL_CAPTION_LIMITS.tiktok.caption &&
        facebook.caption.length <= SOCIAL_CAPTION_LIMITS.facebook.caption &&
        tiktok.caption.length <= instagram.caption.length
    ),
    detail: "Instagram and TikTok stay short; Facebook may be longer; all stay inside platform caps."
  });

  const template = draftPlatformCaptions({
    voice: "stalemate",
    note: "Manic live at Burlington, Friday.",
    mediaKind: "video",
    show
  });
  results.push({
    name: "template-has-no-hardcoded-chicago",
    passed: template.every((draft) => !/#chicago/i.test(draft.caption) && !draft.tags.includes("chicago")),
    detail: "Template fallback never adds #chicago unless Chicago is in the confirmed facts."
  });

  return { passed: results.every((row) => row.passed), results };
}
