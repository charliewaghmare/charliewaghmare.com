import type { Metadata } from "next";
import { Suspense } from "react";
import { TrainingFallback, TrainingView } from "@/components/training-view";
import { personalBests } from "@/content/personal-bests";
import { getTrainingSnapshot } from "@/lib/garmin/snapshot";

export const metadata: Metadata = {
  title: "Training · Charlie Waghmare",
  description: "Training from the last 30 days, and personal bests.",
};

export default function TrainingPage() {
  const bests = personalBests.filter((best) => best.event.trim() && best.mark.trim());

  return (
    <main className="mx-auto w-full max-w-[1320px] px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
      <Suspense fallback={<TrainingFallback />}>
        <TrainingData bests={bests} />
      </Suspense>
    </main>
  );
}

async function TrainingData({
  bests,
}: {
  bests: typeof personalBests;
}) {
  const snapshot = await getTrainingSnapshot();
  return <TrainingView snapshot={snapshot} bests={bests} />;
}
