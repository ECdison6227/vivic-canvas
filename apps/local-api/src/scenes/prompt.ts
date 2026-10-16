import { SCENES } from "@vivic/contracts";

/** Planner instructions for scene cards. One table, the same registry the UI renders from. */
const DATA: Record<(typeof SCENES)[number]["id"], string> = {
  countdown: `{"title":"生日","targetDate":"YYYY-MM-DD","targetTime?":"HH:MM","note?":""}`,
  academic_paper: `{"title":"","authors?":[""],"venue?":"","year?":2017,"abstract?":"","keyPoints?":[""],"doi?":"10.x/…","url?":"https://…","tags?":[""]}`,
  photo_gallery: `{"title":"","images?":[{"url":"https://…","caption?":""}]}`,
  weekly_schedule: `{"title":"","weekStart?":"YYYY-MM-DD(周一)","events":[{"day":1到7或"date":"YYYY-MM-DD","start?":"HH:MM","end?":"HH:MM","title":"","location?":""}]}`,
  todo_list: `{"title?":"","items":["任务"或{"text":"","done":false}]}`,
  project_roadmap: `{"title":"","phases":[{"name":"","period?":"第1个月","status?":"done|active|planned","goal?":"","milestones?":["里程碑"]}]}`,
  data_visualization: `{"title?":"","chartKind":"line|bar|pie","points":[{"x":"周一","y":3.5}],"xLabel?":"","yLabel?":""}`,
  news_summary: `{"headline":"","source?":"","publishedAt?":"YYYY-MM-DD","summary":"","keyPoints?":[""],"url?":"https://…"}`,
  historical_timeline: `{"title":"","events":[{"date":"YYYY|YYYY-MM|YYYY-MM-DD","title":"","description?":""}]}`,
  quote_note: `{"text":"","author?":"","source?":"","tag?":""}`,
  photo_story: `{"title":"","slides":[{"heading?":"","text":"","imageUrl?":"https://…"}]}`,
  activity_feed: `{"title":"","live?":true,"items?":[{"kind?":"done|update|create|comment|alert|event","text":"","time?":"昨天 18:00"}]}`,
  goal_progress: `{"title":"","current":18,"target":50,"unit?":"本","deadline?":"YYYY-MM-DD","note?":""}`,
  habit_tracking: `{"habit":"","checkins?":["YYYY-MM-DD"],"weeklyGoal?":4}`,
  book_record: `{"title":"","author?":"","status?":"want|reading|paused|finished","currentPage?":86,"totalPages?":240,"rating?":4}`,
  monthly_calendar: `{"title?":"","month?":"YYYY-MM","events":[{"date":"YYYY-MM-DD","title":"","time?":"HH:MM"}]}`,
  option_comparison: `{"title":"","options":["方案A","方案B"],"criteria":[{"name":"价格","values":[5200,4600],"better?":"lower","unit?":"元"}],"recommendation?":"","chosen?":"方案B"}`,
  web_bookmark: `{"url":"https://…","title?":"","siteName?":"","description?":"","tags?":[""]}`,
  photo_memory: `{"title":"","date?":"YYYY-MM-DD","caption?":"","imageUrl?":"https://…"}`,
  single_notification: `{"title":"","body?":"","level?":"info|success|warning|error"}`,
};

const INTENT: Record<(typeof SCENES)[number]["id"], string> = {
  countdown: "关注距离某个日期还剩多久（生日/考试/纪念日/假期）",
  academic_paper: "整理学术论文：标题、作者、来源、DOI、摘要",
  photo_gallery: "展示多张相互独立的照片",
  weekly_schedule: "一周内或某天具体几点做什么的安排",
  todo_list: "一系列需要勾选完成的任务",
  project_roadmap: "多阶段、有里程碑的长期项目规划",
  data_visualization: "用户给出的数值的趋势、分布或统计",
  news_summary: "摘要一篇新闻或资讯（需有原文或链接）",
  historical_timeline: "回顾过去的重要事件，按时间顺序",
  quote_note: "记录一句话、金句、感悟或灵感",
  photo_story: "多张照片按顺序讲一个故事",
  activity_feed: "按时间持续新增的活动记录/最近动态",
  goal_progress: "某个明确目标的完成比例",
  habit_tracking: "记录每天是否坚持某个重复行为",
  book_record: "管理单本书的阅读状态与进度",
  monthly_calendar: "整个月里事项的日期分布",
  option_comparison: "比较多个候选方案",
  web_bookmark: "收藏网页、网站、GitHub 仓库或在线资源",
  photo_memory: "纪念或展示单张照片",
  single_notification: "单个事件状态或通知（不是“提醒我…”）",
};

export const buildScenePrompt = (): string => `
场景卡片（重点）：用户想把内容整理、记录、展示成卡片时，输出 {"cards":[{"scene_id":"…","card_type":"…","data":{…}}],"spokenText":"40字内说明"}，可同时带 actions（例如先删除再建卡）。程序负责 id、布局、时间戳、校验和渲染；禁止输出 HTML、JSX、组件名、样式或卡片模板之外的字段。每个 scene_id 只能对应表中的唯一 card_type：
${SCENES.map(scene => `${scene.id} → ${scene.cardType}：${INTENT[scene.id]}。data=${DATA[scene.id]}`).join("\n")}
选择规则：按真实意图和数据结构选，不按关键词。含日期不等于倒计时；「今天有什么要完成」=todo_list；「今天几点做什么」「下周安排」=weekly_schedule；「这个月哪些天有事」=monthly_calendar；「未来三个月怎么推进」=project_roadmap；「今年目标完成多少」=goal_progress；「最近每天有没有打卡」=habit_tracking；「上个月发生了什么重要事件」=historical_timeline；「最近产生了什么活动」=activity_feed（无用户记录时 {"live":true} 显示画布自身动态）；「收藏这篇论文」只有明确是学术论文才用 academic_paper；「收藏这个网站/仓库」=web_bookmark。带时间的“提醒我…”、纯计时器仍按原提醒/倒计时动作，不用场景卡片；便笺原文记录仍用 NoteCard。
用户明确指定卡片形式且数据兼容时服从；不兼容就 clarify。一个请求涉及多个独立对象可输出多张卡（最多 6 张），每张只对应一个场景。意图不明确时 clarify，不要随机选卡；普通聊天、解释、建议用 reply，不强行建卡。
不得编造：数字、日期、时间、年份、星期、链接、DOI、作者、出处、书名、图片只能来自用户原话、clarification、已有画布或 page（用户给的链接正文）。「还有 25 天」「N 天后」「下周三」「月底」等相对说法本身就给出了日期，按 today 推算填入，不要再追问；缺少必要信息先用这些上下文补齐，完全没有线索才 clarify（例如只说“做个生日倒计时”时问“你的生日是哪天？”）。照片只用用户给出的 https 链接，没有就省略（用户可在用户页添加照片）。摘要与要点只能依据用户提供的原文或 page，没有原文不要写新闻、论文摘要或历史事件。日期按 today 与 timeZone 计算。`;
