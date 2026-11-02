import { About } from "@/components/about";
import { Projects } from "@/components/projects";
import { ResumeSection } from "@/components/resume-section";
import { site } from "@/content/site";
import { hasResumePdf } from "@/lib/resume";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16 sm:py-24">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {site.name}
        </h1>
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          {site.domain}
        </p>
      </header>

      <div className="mt-14 space-y-12">
        <About about={site.about} />
        <ResumeSection available={hasResumePdf()} />
        <Projects projects={site.projects} />
      </div>
    </main>
  );
}
