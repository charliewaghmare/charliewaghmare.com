import Link from "next/link";
import { Suspense } from "react";
import {
  LatestRunCard,
  LatestRunFallback,
} from "@/components/latest-run-card";
import { About } from "@/components/about";
import { Projects } from "@/components/projects";
import { ResumeSection } from "@/components/resume-section";
import { site } from "@/content/site";
import { getTrainingSnapshot } from "@/lib/garmin/snapshot";
import { hasResumePdf } from "@/lib/resume";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16 sm:py-24">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {site.name}
        </h1>
        <p className="mt-3 flex items-center gap-x-3 text-sm text-stone-500">
          <span>{site.domain}</span>
          <Link
            href="/training"
            className="underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500"
          >
            Training
          </Link>
        </p>
      </header>

      <aside className="mt-8 xl:fixed xl:right-6 xl:top-6 xl:z-20 xl:mt-0 xl:w-72">
        <Suspense fallback={<LatestRunFallback />}>
          <LatestRun />
        </Suspense>
      </aside>

      <div className="mt-14 space-y-12">
        <About about={site.about} />
        <ResumeSection available={hasResumePdf()} />
        <Projects projects={site.projects} />
      </div>
    </main>
  );
}

async function LatestRun() {
  const snapshot = await getTrainingSnapshot();
  return <LatestRunCard snapshot={snapshot} />;
}
