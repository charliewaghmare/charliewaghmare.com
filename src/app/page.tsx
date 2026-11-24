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
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <header className="td-page-header pb-8">
        <h1 className="td-page-title type-display td-text">
          {site.name}
        </h1>
        <p className="td-muted mt-4 text-sm">{site.domain}</p>
      </header>

      <div className="mt-10 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="min-w-0 lg:order-2" aria-label="Latest run">
          <Suspense fallback={<LatestRunFallback />}>
            <LatestRun />
          </Suspense>
        </aside>
        <div className="min-w-0 space-y-12 lg:order-1">
          <About about={site.about} />
          <ResumeSection available={hasResumePdf()} />
          <Projects projects={site.projects} />
        </div>
      </div>
    </main>
  );
}

async function LatestRun() {
  const snapshot = await getTrainingSnapshot();
  return <LatestRunCard activity={snapshot.latestActivity} sample={snapshot.source === "sample"} />;
}
