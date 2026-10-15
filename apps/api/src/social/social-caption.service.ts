import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import {
  SOCIAL_CAPTION_LLM_NOTICE_FAILED,
  SOCIAL_CAPTION_LLM_NOTICE_NO_KEY,
  completeSocialCaptionDrafts,
  socialCaptionLlmInput,
  socialCaptionLlmInstructions,
  socialCaptionLlmJsonSchema,
  type DraftCaptionsInput,
  type SocialCaptionDraftResult
} from "@storyboard/shared";

export type SocialCaptionResponsesClient = {
  responses: {
    create(body: {
      model: string;
      store: boolean;
      max_output_tokens: number;
      instructions: string;
      input: string;
      text: {
        format: {
          type: "json_schema";
          name: string;
          strict: boolean;
          schema: Record<string, unknown>;
        };
      };
    }): Promise<{ output_text: string }>;
  };
};

export function socialCaptionLlmReady(env: {
  OPENAI_ENABLED?: boolean | undefined;
  OPENAI_API_KEY?: string | undefined;
}): boolean {
  const key = env.OPENAI_API_KEY?.trim();
  return Boolean(env.OPENAI_ENABLED && key && key !== "replace-me");
}

@Injectable()
export class SocialCaptionService {
  constructor(private readonly config: ConfigService) {}

  draftingStatus() {
    if (this.llmReady()) {
      return {
        llmReady: true,
        notice: "The manager LLM will write caption variants from confirmed facts."
      };
    }
    return {
      llmReady: false,
      notice: SOCIAL_CAPTION_LLM_NOTICE_NO_KEY
    };
  }

  llmReady(): boolean {
    return socialCaptionLlmReady({
      OPENAI_ENABLED: this.config.get<boolean>("OPENAI_ENABLED"),
      OPENAI_API_KEY: this.config.get<string>("OPENAI_API_KEY")
    });
  }

  async draft(
    input: DraftCaptionsInput,
    client?: SocialCaptionResponsesClient
  ): Promise<SocialCaptionDraftResult> {
    const canCall = Boolean(client) || this.llmReady();
    if (!canCall) {
      return completeSocialCaptionDrafts(input, null);
    }
    try {
      const llm = client ?? new OpenAI({ apiKey: this.config.getOrThrow<string>("OPENAI_API_KEY") });
      const response = await llm.responses.create({
        model: this.config.get<string>("OPENAI_MANAGER_MODEL") ?? "gpt-5.6-terra",
        store: false,
        max_output_tokens: 2000,
        instructions: socialCaptionLlmInstructions(input.voice),
        input: JSON.stringify(socialCaptionLlmInput(input)),
        text: {
          format: {
            type: "json_schema",
            name: "social_captions",
            strict: true,
            schema: socialCaptionLlmJsonSchema()
          }
        }
      });
      return completeSocialCaptionDrafts(input, JSON.parse(response.output_text));
    } catch {
      const fallback = completeSocialCaptionDrafts(input, null);
      return { ...fallback, notice: SOCIAL_CAPTION_LLM_NOTICE_FAILED };
    }
  }
}
