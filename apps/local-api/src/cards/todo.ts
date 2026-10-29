import { z } from "zod";
import { createCardActions } from "./build.js";
import { defineCardContract } from "./types.js";

export const TodoSlotsSchema = z.strictObject({
  title: z.string().trim().min(1).max(80).optional(),
  items: z.array(z.string().trim().min(1).max(160)).min(1).max(30),
});

export const todoContract = defineCardContract({
  id: "todo",
  name: "待办清单",
  description: "创建包含1到30项的待办，可填写标题；条目只填写文字，编号和完成状态由程序生成。",
  examples: ["添加待办：买牛奶；交周报", "待办：订机票、订酒店"],
  cardType: "TodoCard",
  slots: TodoSlotsSchema,
  parse(text) {
    const input = text.trim();
    // Same literal list syntax as intent/rules, consuming multiline content too.
    const prefix = input.match(/^(?:加|添加|新增|创建|新建|列)(?:个|一条|几条|下)?\s*待办\s*[:：]?\s*/)
      ?? input.match(/^待办\s*[:：]\s*/);
    if (!prefix) return null;
    const items = input.slice(prefix[0].length).split(/[;；,，、\n]+/).map(item => item.trim()).filter(Boolean);
    if (items.some(item => /提醒|倒计时|然后|并且|再(?:创建|删除|聚焦)/.test(item))) return null;
    const parsed = TodoSlotsSchema.safeParse({ items });
    return parsed.success ? parsed.data : null;
  },
  build(slots, context, now) {
    return createCardActions({
      type: "TodoCard",
      displayProps: {
        ...(slots.title ? { title: slots.title } : {}),
        items: slots.items.map((text, index) => ({ id: `item-${index + 1}`, text, done: false })),
      },
      sourceData: {},
    }, { width: 288, height: 160 }, context, now);
  },
});
