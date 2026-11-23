import { getActivityDetail, getTrainingSnapshot } from "@/lib/garmin/snapshot";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^(?:\d{1,20}|sample-[1-6])$/.test(id)) {
    return Response.json({ message: "Run not found." }, { status: 404 });
  }

  try {
    const snapshot = await getTrainingSnapshot();
    // Never expose arbitrary activities from the connected Garmin account.
    const summary = snapshot.activities.find((activity) => activity.id === id);
    if (!summary) return Response.json({ message: "Run not found." }, { status: 404 });
    const activity = snapshot.latestActivity?.id === id
      ? snapshot.latestActivity
      : await getActivityDetail(summary);
    return Response.json({ activity }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { message: "Run details couldn’t be loaded. Please try again." },
      { status: 503 },
    );
  }
}
