import { CloneVoiceIdSchema } from "./voiceClone.js";
import { z } from "zod";
import { ActionEnvelopeSchema } from "@vivic/contracts";
import { SPEECH_VOICE_IDS } from "./voices.js";
import { ImageAttachmentsSchema } from "./images.js";
import { TimeZoneSchema } from "@vivic/contracts";
import { DevicePositionSchema } from "./data/deviceRegion.js";

/** Compact canvas context the control page sends with each intent request. */
export const CanvasContextSchema = z.strictObject({
  canvasId: z.string().min(1).max(128),
  stage: z.enum(["STANDBY", "AWAKENING", "WORKSPACE"]),
  viewport: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number() }),
  focusHistory: z.array(z.string().max(128)).max(20),
  timeZone: TimeZoneSchema.optional(),
  cards: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        type: z.string().min(1).max(60),
        aliases: z.array(z.string().max(80)).max(12).optional(),
        displayProps: z.record(z.string(), z.unknown()),
        sourceDataSummary: z.record(z.string(), z.unknown()),
        layout: z.strictObject({ x: z.number(), y: z.number() }),
      }),
    )
    .max(64),
});

export type CanvasContext = z.infer<typeof CanvasContextSchema>;

export const IntentRequestSchema = z.strictObject({
  text: z.string().min(1).max(500),
  canvasContext: CanvasContextSchema,
  attachments: ImageAttachmentsSchema.optional(),
  continuation: z.strictObject({ utterance: z.string().min(1).max(500), question: z.string().min(1).max(180) }).optional(),
  /** Sent by Control only for weather wording, rounded to ~1 km; never persisted by the API. */
  deviceLocation: DevicePositionSchema.optional(),
});

export const WeatherHereRequestSchema = z.strictObject({ deviceLocation: DevicePositionSchema.optional() });

export const ValidateKeyRequestSchema = z.strictObject({
  apiKey: z
    .string()
    .min(8)
    .max(256)
    .regex(/^\S+$/, "API Key 不应包含空白字符"),
});

/** Deliberately shorter than the provider's 1000-character limit. */
export const SpeechRequestSchema = z.strictObject({
  text: z.string().max(200)
    .regex(/^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u, "只接受可见短句").trim().min(1),
  voice: z.enum(SPEECH_VOICE_IDS).optional(),
  clonedVoiceId: CloneVoiceIdSchema.optional(),
  speed: z.number().min(0.5).max(2).optional(),
  timestamps: z.boolean().optional(),
});

export const IntentResponseSchema = z.strictObject({
  kind: z.enum(["envelope", "clarify", "unknown", "error", "locale"]),
  envelope: ActionEnvelopeSchema.optional(),
  message: z.string().max(400).optional(),
  suggestions: z.array(z.string().min(1).max(100)).max(5).optional(),
  locale: z.strictObject({ name: z.string().min(1).max(80), admin1: z.string().max(80).optional(),
    country: z.string().max(80).optional(), basis: z.enum(["device", "network"]), answer: z.string().min(1).max(200) }).optional(),
  usedProvider: z.enum(["rules", "stepfun", "gpt", "rules-offline", "search", "decision"]).optional(),
});

export type IntentResponse = z.infer<typeof IntentResponseSchema>;
