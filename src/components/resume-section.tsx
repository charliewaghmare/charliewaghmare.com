import { Section } from "@/components/section";
import { resumeFile } from "@/content/site";

const primaryLink =
  "home-button home-button-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-sm font-medium sm:w-auto";

const secondaryLink =
  "home-button inline-flex min-h-11 w-full items-center justify-center px-4 text-sm font-medium sm:w-auto";

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
        <p className="td-muted text-base leading-7">
          Add your résumé PDF at{" "}
          <code className="text-code">{`public/${resumeFile.filename}`}</code>. View
          and download buttons will replace this note once the file is there.
        </p>
      )}
    </Section>
  );
}
