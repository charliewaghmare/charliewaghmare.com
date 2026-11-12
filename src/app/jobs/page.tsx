import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { JobsDashboard } from "@/components/jobs/jobs-dashboard";
import { editUnlocked } from "@/lib/jobs/auth";
import { getJobsPageModel } from "@/lib/jobs/repository";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Personal job discovery and application tracking.",
};

export default function JobsPage() {
  return (
    <main className="mx-auto w-full max-w-[1320px] px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
      <Suspense fallback={<JobsFallback />}>
        <JobsData />
      </Suspense>
    </main>
  );
}

async function JobsData() {
  await connection();
  const unlocked = await editUnlocked();
  const model = await getJobsPageModel(unlocked);
  return <JobsDashboard model={model} unlocked={unlocked} />;
}

function JobsFallback() {
  return (
    <div aria-hidden="true">
      <div className="td-skeleton h-10 w-64 animate-pulse rounded" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="td-skeleton h-24 animate-pulse rounded-[0.75rem]" />
        ))}
      </div>
    </div>
  );
}
