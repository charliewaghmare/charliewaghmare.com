import { existsSync } from "node:fs";
import path from "node:path";
import { resumeFile } from "@/content/site";

/** True when public/resume.pdf is on disk. Used by the server page only. */
export function hasResumePdf(): boolean {
  return existsSync(path.join(process.cwd(), "public", resumeFile.filename));
}
