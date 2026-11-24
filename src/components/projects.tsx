import { Section } from "@/components/section";
import type { Project } from "@/content/site";

/**
 * Renders nothing until site.projects has entries.
 * Each project can link to a hosted site, a GitHub repo, or both.
 */
export function Projects({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <Section id="projects" title="Projects">
      <ul className="divide-y divide-[var(--td-border-subtle)]">
        {projects.map((project) => (
          <li
            key={`${project.title}-${project.href ?? ""}-${project.repo ?? ""}`}
            className="py-5 first:pt-0 last:pb-0"
          >
            <h3 className="text-base font-medium">{project.title}</h3>
            {project.description ? (
              <p className="td-muted mt-1 text-sm leading-6">
                {project.description}
              </p>
            ) : null}
            {project.href || project.repo ? (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {project.href ? (
                  <a
                    className="td-link underline"
                    href={project.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit site
                  </a>
                ) : null}
                {project.repo ? (
                  <a
                    className="td-link underline"
                    href={project.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub
                  </a>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
