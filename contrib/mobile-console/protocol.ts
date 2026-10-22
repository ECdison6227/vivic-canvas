import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const MAX_FRAME_BYTES = 32 * 1024;
export const PermissionSchema = z.enum(["text.submit", "canvas.switch", "card.pin"]);
export type Permission = z.infer<typeof PermissionSchema>;
export const PERMISSIONS: Permission[] = ["text.submit", "canvas.switch", "card.pin"];
const Id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const Token = z.string().min(16).max(256);
const Version = z.number().int().nonnegative();
const scope = { v: z.literal(1), sessionId: Id, deviceId: Id, epoch: Id };

export const OperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text.submit"), text: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ kind: z.literal("canvas.switch"), targetCanvasId: Id }).strict(),
  z.object({ kind: z.literal("card.pin"), cardId: Id, pinned: z.boolean() }).strict(),
]);
export type Operation = z.infer<typeof OperationSchema>;
export const CanvasSnapshotSchema = z.object({
  computerName: z.string().min(1).max(80), ownerAvailable: z.boolean(), ownerEpoch: Id,
  activeCanvasId: Id.nullable(), version: Version,
  canvases: z.array(z.object({ id: Id, title: z.string().max(160), version: Version }).strict()).max(100),
  cards: z.array(z.object({ id: Id, title: z.string().max(160), type: z.string().min(1).max(80), pinned: z.boolean() }).strict()).max(200),
}).strict();
export type CanvasSnapshot = z.infer<typeof CanvasSnapshotSchema>;

export const HelloSchema = z.object({
  v: z.literal(1), type: z.literal("hello"), role: z.enum(["computer", "mobile"]),
  deviceId: Id, deviceName: z.string().trim().min(1).max(80),
  accessKey: z.string().min(16).max(256).optional(), token: Token.optional(),
  pairCode: z.string().regex(/^[A-Z0-9-]{6,32}$/).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.role === "computer" && ((!v.token && !v.accessKey) || v.pairCode)) ctx.addIssue({ code: "custom", message: "Computer authentication required" });
  if (v.role === "mobile" && ((!v.token && !v.pairCode) || v.accessKey || (v.token && v.pairCode))) ctx.addIssue({ code: "custom", message: "Mobile authentication required" });
});
export type Hello = z.infer<typeof HelloSchema>;
const ControllerSchema = z.object({ deviceId: Id, permissions: z.array(PermissionSchema).max(3) }).strict();
export const WelcomeSchema = z.object({
  v: z.literal(1), type: z.literal("welcome"), sessionId: Id, deviceId: Id, computerId: Id, epoch: Id,
  expiresAt: z.number().int().positive(), permissions: z.array(PermissionSchema).max(3), token: Token,
  pairCode: z.string().regex(/^[A-Z0-9-]{6,32}$/).optional(), pairExpiresAt: z.number().int().positive().optional(),
  controllers: z.array(ControllerSchema).max(20).optional(),
}).strict();
export type Welcome = z.infer<typeof WelcomeSchema>;
export const CommandSchema = z.object({
  ...scope, type: z.literal("command"), requestId: Id, canvasId: Id,
  ownerEpoch: Id, expectedVersion: Version, operation: OperationSchema,
}).strict();
export type Command = z.infer<typeof CommandSchema>;
export const ResultSchema = z.object({
  ...scope, type: z.literal("result"), forDeviceId: Id, requestId: Id,
  status: z.enum(["succeeded", "rejected", "cancelled", "unknown"]),
  message: z.string().max(500), version: Version.optional(),
}).strict();
export type Result = z.infer<typeof ResultSchema>;
export const FrameSchema = z.discriminatedUnion("type", [
  HelloSchema, WelcomeSchema, CommandSchema, ResultSchema,
  z.object({ ...scope, type: z.literal("snapshot"), sequence: Version, state: CanvasSnapshotSchema }).strict(),
  z.object({ ...scope, type: z.literal("snapshot.request") }).strict(),
  z.object({ ...scope, type: z.literal("accepted"), requestId: Id }).strict(),
  z.object({ ...scope, type: z.literal("executing"), requestId: Id, forDeviceId: Id }).strict(),
  z.object({ ...scope, type: z.literal("cancel"), requestId: Id, canvasId: Id }).strict(),
  z.object({ ...scope, type: z.literal("query"), requestId: Id, canvasId: Id }).strict(),
  z.object({ ...scope, type: z.literal("heartbeat"), at: z.number().int().nonnegative() }).strict(),
  z.object({ ...scope, type: z.literal("pong"), at: z.number().int().nonnegative() }).strict(),
  z.object({ ...scope, type: z.literal("owner.status"), available: z.boolean() }).strict(),
  z.object({ ...scope, type: z.literal("status"), ownerAvailable: z.boolean(), reason: z.string().max(200).optional() }).strict(),
  z.object({ ...scope, type: z.literal("controller"), state: z.enum(["joined", "left"]), permissions: z.array(PermissionSchema).max(3) }).strict(),
  z.object({ ...scope, type: z.literal("revoke"), targetDeviceId: Id.optional() }).strict(),
  z.object({ ...scope, type: z.literal("revoked"), reason: z.string().max(200) }).strict(),
  z.object({ ...scope, type: z.literal("pair.rotate") }).strict(),
  z.object({ ...scope, type: z.literal("pairing"), pairCode: z.string().regex(/^[A-Z0-9-]{6,32}$/), pairExpiresAt: z.number().int().positive() }).strict(),
  z.object({ v: z.literal(1), type: z.literal("error"), code: z.string().max(80), message: z.string().max(300), requestId: Id.optional() }).strict(),
]);
export type Frame = z.infer<typeof FrameSchema>;
export function parseFrame(raw: unknown): Frame | null {
  try {
    if (typeof raw === "string") {
      if (new TextEncoder().encode(raw).byteLength > MAX_FRAME_BYTES) return null;
      raw = JSON.parse(raw);
    }
    const parsed = FrameSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
