import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours


// Deletes a session and all its events — called automatically 24h after creation.
export const deleteExpired = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
    if (session) {
      if (session.published) return; // published reports are never deleted
      await ctx.db.delete(session._id);
    }

    const events = await ctx.db
      .query("sessionEvents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const ev of events) await ctx.db.delete(ev._id);
  },
});

export const create = mutation({
  args: {
    sessionId: v.string(),
    topic: v.string(),
    status: v.string(),
    step: v.string(),
    progress: v.float64(),
    meta: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessions", args);
    await ctx.scheduler.runAfter(TTL_MS, internal.sessions.deleteExpired, {
      sessionId: args.sessionId,
    });
  },
});

export const updateStep = mutation({
  args: {
    sessionId: v.string(),
    step: v.string(),
    progress: v.float64(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) return;
    const patch: Record<string, unknown> = { step: args.step, progress: args.progress };
    if (args.meta !== undefined) patch.meta = args.meta;
    await ctx.db.patch(row._id, patch);
  },
});

export const updateStatus = mutation({
  args: {
    sessionId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { status: args.status });
  },
});

export const patchMeta = mutation({
  args: {
    sessionId: v.string(),
    metaPatch: v.any(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) return;
    const prevMeta = (row.meta as Record<string, unknown>) ?? {};
    await ctx.db.patch(row._id, { meta: { ...prevMeta, ...args.metaPatch } });
  },
});

// ── Queries ────────────────────────────────────────────────────────────────

export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const list = query({
  args: {
    limit: v.optional(v.float64()),
    status: v.optional(v.string()),
    q: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = (args.limit ?? 50) as number;

    if (args.q && args.q.trim()) {
      let results = await ctx.db
        .query("sessions")
        .withSearchIndex("search_topic", (q) => q.search("topic", args.q!.trim()))
        .take(limit);
      if (args.status) {
        results = results.filter((s) => s.status === args.status);
      }
      return results;
    }

    let results = await ctx.db.query("sessions").order("desc").take(limit);
    if (args.status) {
      results = results.filter((s) => s.status === args.status);
    }
    return results;
  },
});

// ── Publishing ────────────────────────────────────────────────────────────────

export const publish = mutation({
  args: {
    sessionId: v.string(),
    slug: v.string(),
    assetKey: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row) throw new Error("Session not found");
    if (row.status !== "ready") throw new Error("Session is not ready");
    await ctx.db.patch(row._id, {
      published: true,
      slug: args.slug,
      assetKey: args.assetKey,
    });
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const listPublished = query({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const limit = (args.limit ?? 200) as number;
    const all = await ctx.db.query("sessions").order("desc").take(limit * 3);
    return all.filter((s) => s.published === true).slice(0, limit);
  },
});

export const listByAsset = query({
  args: {
    assetKey: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const limit = (args.limit ?? 50) as number;
    return await ctx.db
      .query("sessions")
      .withIndex("by_asset", (q) => q.eq("assetKey", args.assetKey).eq("status", "ready"))
      .order("desc")
      .take(limit);
  },
});
