import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/jobs/guard";
import { serviceClient } from "@/lib/jobs/supabase";

export async function POST() {
  const denied = await requireEditor();
  if (denied) return denied;
  const db = serviceClient();
  if (!db) {
    return NextResponse.json(
      { ok: false, configured: false, message: "The jobs database is not configured." },
      { status: 503 },
    );
  }

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: running } = await db
    .from("search_runs")
    .select("id")
    .eq("run_type", "collection")
    .in("status", ["requested", "running"])
    .gte("started_at", cutoff)
    .limit(1);
  if (running && running.length > 0) {
    return NextResponse.json(
      { ok: false, message: "A refresh is already running." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: created, error } = await db
    .from("search_runs")
    .insert({ started_at: now, run_type: "collection", status: "requested" })
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { ok: false, message: "Could not record the refresh request." },
      { status: 500 },
    );
  }

  const token = process.env.JOBS_GITHUB_DISPATCH_TOKEN;
  const repository = process.env.JOBS_GITHUB_REPOSITORY;
  if (!token || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    await db
      .from("search_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "GitHub dispatch is not configured.",
      })
      .eq("id", created.id);
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message:
          "Refresh was not started. Add the GitHub dispatch token, or wait for the daily Actions run.",
      },
      { status: 501 },
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/collect-jobs.yml/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main", inputs: { run_id: created.id } }),
    },
  );
  if (!response.ok) {
    await db
      .from("search_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: `GitHub dispatch failed (${response.status}).`,
      })
      .eq("id", created.id);
    return NextResponse.json(
      { ok: false, message: "GitHub did not accept the refresh request." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Refresh requested. Results appear after the collection run finishes.",
  });
}
