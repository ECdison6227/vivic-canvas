import { z } from "zod";
import { createCardActions } from "./build.js";
import { defineCardContract } from "./types.js";

export const NoteSlotsSchema = z.union([
  z.strictObject({ text: z.string().trim().min(1).max(500) }),
  z.strictObject({ bullets: z.array(z.string().trim().min(1).max(180)).min(1).max(5) }),
]);

export const noteContract = defineCardContract({
  id: "note",
  name: "便笺",
  description: "保存原文 text，或1到5条 bullets；二者只选一种，不改写或截断用户的内容。",
  examples: ["记一下明天交周报", "便签：门禁卡放在抽屉里", "新建便笺，内容是周五下午复盘"],
  cardType: "NoteCard",
  slots: NoteSlotsSchema,
  parse(text) {
    const input = text.trim().replace(/^(?:请帮我|帮我|请)\s*/, "");
    const prefix = input.match(/^(?:(?:创建|新建|添加|记下|记|记录)(?:一?[张个条])?(?:便笺|便签|笔记)|(?:便笺|便签|笔记)(?=\s*[:：]))/)
      ?? input.match(/^(?:记一下|记下来|记下|记录一下)/);
    if (!prefix) return null;
    // Strip the prefix once, so a missing body cannot backtrack into punctuation.
    const body = input.slice(prefix[0].length).trim()
      .replace(/^(?:[，,]\s*内容(?:是|为)\s*[:：]?|内容(?:是|为)\s*[:：]?|[:：，,])\s*/, "");
    const parsed = NoteSlotsSchema.safeParse({ text: body });
    return parsed.success ? parsed.data : null;
  },
  build(slots, context, now) {
    return createCardActions({ type: "NoteCard", displayProps: slots, sourceData: {} },
      { width: 320, height: 120 }, context, now);
  },
});
