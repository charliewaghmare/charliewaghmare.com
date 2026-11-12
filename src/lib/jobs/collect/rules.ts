import type { ScoreBreakdown } from "@/lib/jobs/types";

export const SCORING_VERSION = "phase2-rules-v1";

export type CollectedPosting = {
  provider: "greenhouse" | "lever" | "ashby";
  sourceId: string;
  title: string;
  companyName: string;
  location: string | null;
  country: string | null;
  workArrangement: "onsite" | "hybrid" | "remote" | null;
  description: string;
  departments: string[];
  sourceUrl: string | null;
  applicationUrl: string | null;
  postedOn: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
};

const HIGH = [
  "mechanical",
  "product design",
  "product development",
  "motorsport",
  "formula 1",
  "nascar",
  "indycar",
  "footwear",
  "running shoe",
  "wearable",
  "biomechan",
  "racing sim",
  "sports equipment",
  "vehicle dynamics",
  "aerodynamic",
];

const MEDIUM = [
  "materials",
  "manufactur",
  "machine learning",
  "software",
  "automation",
  "robotic",
  "finance",
  "quantitative",
  "investment",
  "fintech",
  "engineer",
];

const SPORTS = ["motorsport", "formula 1", "nascar", "indycar", "footwear", "running", "wearable", "zwift", "whoop", "strava", "oura"];

export function blob(posting: CollectedPosting): string {
  return [posting.title, posting.description, posting.location, posting.departments.join(" "), posting.employmentType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isStudentFacing(text: string): boolean {
  return /\b(intern|internship|co-op|coop|student|new grad|new-grad|early career|undergraduate|research assistant)\b/.test(
    text,
  );
}

export function eligibility(posting: CollectedPosting, now = new Date()): {
  include: boolean;
  reason: string;
} {
  const text = blob(posting);
  const role = `${posting.title} ${posting.description}`.toLowerCase();
  const title = posting.title.toLowerCase();
  const student = isStudentFacing(role);
  const seniorTitle = /\b(senior|staff|principal|director|vice president|\bvp\b|head of)\b/.test(title);
  const manager = /\bmanager\b/.test(title) && !student;
  const years = role.match(/\b([5-9]|[1-9]\d)\+?\s+years?\b/);
  const degreeBarrier =
    /\b(must have completed|completed bachelor|completed degree|degree required)\b/.test(role) && !student;
  if ((seniorTitle || manager || years || degreeBarrier) && !student) {
    return { include: false, reason: "Role asks for experience or a level beyond a student internship." };
  }
  if (pastTerm(role, now)) {
    return { include: false, reason: "The named work term is already over." };
  }
  const studentTitle = isStudentFacing(title);
  const highTitle = HIGH.some((word) => title.includes(word));
  const high = HIGH.some((word) => text.includes(word));
  const medium = MEDIUM.some((word) => text.includes(word));
  const overlap = high || medium || /\bengineer\b/.test(text);
  if (
    /\b(annotation|recruiter|recruiting|sales|account executive|customer support|customer success)\b/.test(
      title,
    ) &&
    !studentTitle
  ) {
    return { include: false, reason: "The title is outside the search profile." };
  }
  if (studentTitle && overlap) {
    return { include: true, reason: "Student-facing title with overlap in the search profile." };
  }
  if (highTitle && !student) {
    return { include: true, reason: "Title is in a high-interest area, including stretch roles." };
  }
  if (!studentTitle) {
    return { include: false, reason: "Title is not a student role or a high-interest specialty." };
  }
  return { include: false, reason: "No meaningful overlap with the search profile." };
}

export function pastTerm(text: string, now: Date): boolean {
  const year = now.getUTCFullYear();
  const matches = text.matchAll(/\b(summer|fall|winter|spring)\s+(20\d{2})\b/g);
  for (const match of matches) {
    const term = match[1];
    const termYear = Number(match[2]);
    if (termYear < year) return true;
    if (termYear === year && (term === "summer" || term === "spring" || term === "winter")) return true;
  }
  return false;
}

export function scorePosting(posting: CollectedPosting): {
  score: number;
  breakdown: ScoreBreakdown;
  explanation: string;
  gaps: string[];
  tags: string[];
} {
  const text = blob(posting);
  const gaps: string[] = [];
  const tags: string[] = [];
  const high = HIGH.some((word) => text.includes(word));
  const sports = SPORTS.some((word) => text.includes(word)) || /running/.test(text);
  let interest = high ? 88 : 62;
  if (sports) interest = Math.min(100, interest + 10);
  if (high) tags.push("High interest");
  else tags.push("Medium interest");
  if (sports) tags.push("Sports or motorsports");

  const place = `${posting.location ?? ""} ${posting.country ?? ""}`.toLowerCase();
  let location = 40;
  let locationNote = "Location was not specific, so it was scored neutrally.";
  if (/\b(toronto|gta|mississauga|vancouver|burnaby|surrey|lower mainland)\b/.test(place)) {
    location = 100;
    locationNote = "Location is in Toronto/GTA or Vancouver.";
  } else if (/\b(collingwood|thornbury|meaford|wasaga|owen sound|georgian)\b/.test(place)) {
    location = 85;
    locationNote = "Location is in the Georgian Bay area.";
  } else if (posting.workArrangement === "remote" && posting.country === "Canada") {
    location = 80;
    locationNote = "Remote within Canada.";
  } else if (posting.country === "Canada") {
    location = 55;
    locationNote = "Other Canadian location. Kept for an exceptional fit only.";
  } else if (posting.country) {
    location = 30;
    locationNote = "Outside Canada. Work authorization and relocation are not confirmed.";
    gaps.push("Work authorization and relocation are unknown.");
  } else {
    gaps.push("Location was not specific enough to score confidently.");
  }

  let qualifications = 45;
  let qualificationNote = "Qualifications were not detailed, so this was not treated as a match.";
  if (isStudentFacing(text) && !/\b([3-9]|\d{2})\+?\s+years?\b/.test(text)) {
    qualifications = 75;
    qualificationNote = "The posting is written for a student or intern and does not demand many years.";
  } else if (isStudentFacing(text)) {
    qualifications = 55;
    qualificationNote = "Student role, but it prefers more experience than a typical first internship.";
    gaps.push("Experience preference may be a stretch.");
  } else {
    gaps.push("Qualification fit is uncertain.");
  }

  let career = 50;
  let careerNote = "Employment type was unclear, so career value is neutral.";
  if (/\b(intern|co-op|coop|new grad|undergraduate)\b/.test(text)) {
    career = 85;
    careerNote = "Internship, co-op, or new-grad hiring.";
  } else if (/early career/.test(text)) {
    career = 70;
    careerNote = "Early-career hiring.";
  }

  let compensation = 50;
  let compensationNote = "Compensation was not listed.";
  if (posting.salaryMin !== null || posting.salaryMax !== null) {
    compensation = 70;
    compensationNote = "Compensation was stated on the posting.";
  } else {
    gaps.push("Compensation was not listed.");
  }

  const breakdown = { interest, location, qualifications, career, compensation };
  const score = Math.round(
    interest * 0.35 + location * 0.2 + qualifications * 0.2 + career * 0.2 + compensation * 0.05,
  );
  const explanation = [
    `Interest ${interest}/100.`,
    locationNote,
    qualificationNote,
    careerNote,
    compensationNote,
    `Preliminary rules ${SCORING_VERSION}.`,
  ].join(" ");
  return { score, breakdown, explanation, gaps, tags };
}
