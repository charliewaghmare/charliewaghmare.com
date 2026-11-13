import { excludedDiscoveryRole } from "@/lib/jobs/role-policy";
import { pastTerm } from "@/lib/jobs/collect/rules";
import { canonicalUrl } from "@/lib/jobs/collect/text";

const STUDENT =
  /\b(intern(ship)?s?|co-?ops?|co-operative education|cooperative education|summer students?|undergraduates?|student (engineer|engineering|analyst|researcher)|industrial placements?|summer analysts?|university students?|research assistants?)\b/i;
const PROFESSIONAL =
  /\b(senior|sr\.?|staff|principal|director|vice president|\bvp\b|head of|lead|manager|permanent)\b/i;

export function screenCandidate(
  job: {
    title: string;
    employmentType: string | null;
    evidenceQuote: string;
    sourceUrl: string;
  },
  seen: Set<string>,
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  const url = canonicalUrl(job.sourceUrl);
  if (!url) return { ok: false, reason: "The posting URL is not a usable https link." };
  if (seen.has(url)) return { ok: false, reason: "Duplicate posting URL in this run." };
  seen.add(url);
  if (excludedDiscoveryRole({ title: job.title, description: job.evidenceQuote })) {
    return { ok: false, reason: "AI, machine-learning and software roles are excluded from discovery." };
  }
  const title = job.title.toLowerCase();
  const studentTitle = STUDENT.test(title);
  if (PROFESSIONAL.test(title) && !studentTitle) {
    return { ok: false, reason: "The title is a professional role, so it was not sent for page verification." };
  }
  const blob = `${job.title} ${job.employmentType ?? ""} ${job.evidenceQuote}`;
  if (!STUDENT.test(blob)) {
    return { ok: false, reason: "No student-role signal before verification." };
  }
  if (pastTerm(blob, now)) {
    return { ok: false, reason: "The named work term is already over." };
  }
  return { ok: true };
}
