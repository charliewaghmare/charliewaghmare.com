import { Section } from "@/components/section";
import { resumeFile } from "@/content/site";

const primaryLink =
  "inline-flex h-11 w-full items-center justify-center rounded-md bg-stone-900 px-4 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 sm:w-auto";

const secondaryLink =
  "inline-flex h-11 w-full items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 sm:w-auto";

export function ResumeSection({ available }: { available: boolean }) {
  const href = `/${resumeFile.filename}`;

  return (
    <Section id="resume" title="Résumé">
      {available ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            className={primaryLink}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            View résumé
          </a>
          <a
            className={secondaryLink}
            href={href}
            download={resumeFile.downloadName}
          >
            Download résumé
          </a>
        </div>
      ) : (
        <p className="text-base leading-7 text-stone-600">
          Add your résumé PDF at{" "}
          <code className="text-code">{`public/${resumeFile.filename}`}</code>. View
          and download buttons will replace this note once the file is there.
        </p>
      )}
    </Section>
  );
}
