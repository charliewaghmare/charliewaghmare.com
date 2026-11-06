import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TrainingFallback, TrainingView } from "@/components/training-view";
import { personalBests } from "@/content/personal-bests";
import { site } from "@/content/site";
import { getTrainingSnapshot } from "@/lib/garmin/snapshot";

export const metadata: Metadata = {
  title: "Training · Charlie Waghmare",
  description: "Training from the last 30 days, and personal bests.",
};

export default function TrainingPage() {
  const bests = personalBests.filter((best) => best.event.trim() && best.mark.trim());

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <header>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          <Link
            href="/"
            className="underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:decoration-stone-700"
          >
            {site.name}
          </Link>
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Training</h1>
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Last 30 days
        </p>
      </header>

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
