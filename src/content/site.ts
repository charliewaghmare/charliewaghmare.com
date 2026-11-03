/**
 * Editable site content.
 *
 * About text and projects live here so the page components can stay put.
 * The résumé file is separate: add it at public/resume.pdf.
 */

export type Project = {
  title: string;
  /** One or two sentences. */
  description: string;
  /** Independently hosted project site. */
  href?: string;
  /** GitHub repository for the project. */
  repo?: string;
};

export const site = {
  name: "Charlie Waghmare",
  domain: "charliewaghmare.com",
  /**
   * Short bio. Leave this empty until you have the copy.
   * Separate paragraphs with a blank line.
   */
  about: "I am a 2nd year materials engineering student at the University of British Columbia",
  /**
   * Projects are hidden while this list is empty.
   * Add an entry when you want one on the page. Include href, repo, or both.
   *
   * {
   *   title: "Project name",
   *   description: "One or two sentences.",
   *   href: "https://project.example.com",
   *   repo: "https://github.com/you/project",
   * }
   */
  projects: [] as Project[],
};

export const resumeFile = {
  /** File name inside the public folder. */
  filename: "resume.pdf",
  downloadName: "Charlie-Waghmare-Resume.pdf",
} as const;
