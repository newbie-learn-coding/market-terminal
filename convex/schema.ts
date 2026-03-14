import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    topic: v.string(),
    status: v.string(),
    step: v.string(),
    progress: v.float64(),
    meta: v.any(),
    published: v.optional(v.boolean()),
    slug: v.optional(v.string()),
    assetKey: v.optional(v.string()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_slug", ["slug"])
    .index("by_asset", ["assetKey", "status"])
    .searchIndex("search_topic", { searchField: "topic" }),

  sessionEvents: defineTable({
    sessionId: v.string(),
    type: v.string(),
    payload: v.any(),
  }).index("by_sessionId", ["sessionId"]),
});
