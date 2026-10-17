# 落地页卡片组件清单（2026-10-17）

落地页（`apps/web/landing/` → `src/landing/`，单文件版 `vivic-landing.html`）上出现的卡片都是产品自己的卡片组件，经 `src/landing/shared.tsx` 的 `CardFrame` → `src/cards/VivicCard.tsx` → `src/cards/registry.tsx` 渲染。示例数据都在 `src/landing/demoCards.ts`，一共 25 张，覆盖 23 种卡片类型：20 张场景卡（全部）+ 天气、搜索、表格 3 种经典卡，倒计时卡另有纯计时和带事项提醒两种形态。没有出现的只有 `NoteCard`（便笺）。

可视化图鉴：`apps/web/card-gallery/`（`src/landing/gallery/`），按下面的分组渲染全部示例卡，可切换展示页 / 用户页（可编辑）和浅色 / 深色。用户页里的修改只存在本页内存里，经过 `CardRecordSchema` 校验，不保存、不联网。单文件版：

```sh
cd apps/web
LANDING_PAGE=card-gallery LANDING_SINGLE=1 node_modules/.bin/vite build --config vite.landing.config.ts
LANDING_PAGE=card-gallery node scripts/inline-landing.mjs   # → dist-card-gallery-single/vivic-card-gallery.html
```

分组和出现位置写在 `src/landing/gallery/catalog.ts`；`__tests__/catalog.test.ts` 检查它和 `demoCards.ts`、`RING_ORDER` 保持一致。

## 卡片一览

组件路径相对 `apps/web/src/cards/`；尺寸是展示页的布局尺寸（场景卡来自 `packages/contracts/src/scenes.ts` 的 `SCENE_CARD_SIZES`）。

| 分组 | demo key | 名称 | 卡片类型 | 组件 | 尺寸 | 落地页位置 |
|---|---|---|---|---|---|---|
| 时间与日程 | countdown | 重要日期倒计时 | CountdownCard | scene/views/CountdownDateView.tsx | 300×200 | 首屏、卡片环、时间的事 |
| | timer | 纯计时器 | CountdownCard | CountdownCardView.tsx | 240×120 | 首屏、卡片环、时间的事、换一种氛围 |
| | reminder | 带事项的提醒 | CountdownCard | CountdownCardView.tsx | 300×120 | 时间的事 |
| | week | 周计划 | WeeklyScheduleCard | scene/views/WeeklyScheduleCardView.tsx | 600×320 | 卡片环、一边说一边看 |
| | month | 月历 | MonthCalendarCard | scene/views/MonthCalendarCardView.tsx | 360×380 | 卡片环、时间的事 |
| | notice | 通知 | NotificationCard | scene/views/NotificationCardView.tsx | 340×160 | 卡片环、时间的事 |
| 任务与目标 | todo | 待办清单 | TodoCard | TodoCardView.tsx | 320×200 | 首屏、卡片环、一边说一边看、拖到手边 |
| | goal | 目标进度环 | ProgressRingCard | scene/views/ProgressRingCardView.tsx | 280×300 | 首屏、卡片环、数字有出处、拖到手边 |
| | habit | 习惯打卡热力图 | HabitHeatmapCard | scene/views/HabitHeatmapCardView.tsx | 400×260 | 卡片环 |
| | roadmap | 项目路线图 | RoadmapCard | scene/views/RoadmapCardView.tsx | 600×320 | 卡片环 |
| 数据与对比 | chart | 数据图表 | ChartCard | ChartCardView.tsx | 420×300 | 首屏、卡片环 |
| | compare | 方案对比 | ComparisonCard | scene/views/ComparisonCardView.tsx | 560×340 | 卡片环、像聊天一样 |
| | table | 表格 | TableCard | TableCardView.tsx | 320×200 | 卡片环 |
| 资料与阅读 | search | 搜索结果 | SearchResultCard | SearchResultCardView.tsx | 340×190 | 卡片环 |
| | link | 网页收藏 | LinkPreviewCard | scene/views/LinkPreviewCardView.tsx | 340×230 | 卡片环 |
| | paper | 论文 | PaperCard | scene/views/PaperCardView.tsx | 380×300 | 卡片环 |
| | news | 新闻摘要 | NewsCard | scene/views/NewsCardView.tsx | 380×340 | 卡片环 |
| | book | 阅读记录 | BookCard | scene/views/BookCardView.tsx | 380×240 | 卡片环 |
| | quote | 金句 | QuoteCard | scene/views/QuoteCardView.tsx | 320×220 | 卡片环 |
| 照片与回忆 | cover | 纪念封面 | PhotoCoverCard | scene/views/PhotoCoverCardView.tsx | 380×320 | 卡片环 |
| | story | 照片故事 | StoryCarouselCard | scene/views/StoryCarouselCardView.tsx | 440×340 | 卡片环 |
| | gallery | 照片墙 | GalleryCard | scene/views/GalleryCardView.tsx | 420×340 | 卡片环 |
| | timeline | 时间线 | TimelineCard | scene/views/TimelineCardView.tsx | 360×380 | 卡片环、像聊天一样 |
| 环境与动态 | weather | 天气 | WeatherCard | WeatherCardView.tsx | 240×150 | 卡片环、像聊天一样 |
| | feed | 最近动态 | ActivityFeedCard | scene/views/ActivityFeedCardView.tsx | 340×340 | 卡片环 |

卡片环（`SceneRing.tsx`）按 `RING_ORDER` 展示除 reminder 外的 24 张。

## 落地页各板块用到的卡片

| 板块 | 文件 | 卡片 | 呈现 |
|---|---|---|---|
| 首屏展示窗口 | HeroDisplay.tsx | timer、todo、countdown、chart、goal 轮播 | 展示页，深色（午夜蓝紫） |
| 场景卡片环 | SceneRing.tsx | `RING_ORDER` 24 张 | 展示页，浅色 |
| 一边说，一边看 | HowItWorks.tsx | todo（用户页可勾选 / 展示页）、week | 深色 |
| 像聊天一样 | FeatureDemos.tsx `ChatDemo` | compare、timeline、weather | 展示页，浅色（奶白） |
| 时间的事 | FeatureDemos.tsx `TimeDemo` | timer、reminder、countdown、month、notice | 展示页，深色（余烬） |
| 数字有出处 | FeatureDemos.tsx `TrustDemo` | goal + 「生成前核对」卡 | 浅色（莓果） |
| 拖到手边 | FeatureDemos.tsx `HandsOnDemo` | todo、goal（宽 312） | 用户页，可编辑 |
| 换一种氛围 | FeatureDemos.tsx `AmbienceDemo` | timer | 跟随 12 种背景配色 |

「生成前核对」卡只在落地页上出现：它用场景卡的样式类（`vivic-card` / `vivic-scene-*`）直接写在 `TrustDemo` 里，不是注册表里的卡片类型，所以图鉴里没有它。
