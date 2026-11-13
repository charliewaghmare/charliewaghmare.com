import type { ScoreBreakdown } from "@/lib/jobs/types";

export const SCORING_VERSION = "phase35-rules-v1";

export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "workday"
  | "web";

export type CollectedPosting = {
  provider: JobSource;
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

export type EligibilityStatus =
  | "eligible_student_role"
  | "ineligible_professional_role"
  | "uncertain";

export type CategoryHit = {
  id: string;
  level: "high" | "medium";
  boost: boolean;
  evidence: string;
};

export type Assessment = {
  status: EligibilityStatus;
  publish: boolean;
  reason: string;
  evidence: string[];
  categories: CategoryHit[];
  score: number;
  breakdown: ScoreBreakdown;
  explanation: string;
  gaps: string[];
  tags: string[];
};

type CategoryRule = {
  id: string;
  level: "high" | "medium";
  boost: boolean;
  pattern: RegExp;
};

const CATEGORIES: CategoryRule[] = [
  {
    id: "Motorsports",
    level: "high",
    boost: true,
    pattern: /\b(motorsports?|formula\s*1|nascar|indycar|vehicle dynamics|race engineer)\b/,
  },
  { id: "Mechanical engineering", level: "high", boost: false, pattern: /\bmechanical engineer/ },
  { id: "Product design", level: "high", boost: false, pattern: /\bproduct design/ },
  { id: "Product development", level: "high", boost: false, pattern: /\bproduct development/ },
  {
    id: "Running and sports technology",
    level: "high",
    boost: true,
    pattern: /\b(running shoes?|footwear|underfoot|wearables?|biomechan)/,
  },
  {
    id: "Software",
    level: "medium",
    boost: false,
    pattern: /\b(software|developer|devops|front[- ]?end|back[- ]?end)\b/,
  },
  {
    id: "AI and research",
    level: "medium",
    boost: false,
    pattern: /\b(machine learning|artificial intelligence|research intern|research internship|undergraduate research)\b/,
  },
  {
    id: "Finance",
    level: "medium",
    boost: false,
    pattern: /\b(finance|financial|investment|quantitative|fintech)\b/,
  },
  { id: "Manufacturing", level: "medium", boost: false, pattern: /\bmanufactur/ },
  {
    id: "Materials engineering",
    level: "high",
    boost: false,
    pattern: /\b(materials? engineering|materials? engineer|materials intern|metallurg)/,
  },
  { id: "Robotics", level: "medium", boost: false, pattern: /\brobotic/ },
  { id: "Automation", level: "medium", boost: false, pattern: /\bautomation\b/ },
];

export function blob(posting: CollectedPosting): string {
  return [posting.title, posting.description, posting.location, posting.departments.join(" "), posting.employmentType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isStudentFacing(text: string): boolean {
  return /\b(intern|internship|co-op|coop|student|undergraduate|research assistant)\b/.test(text);
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

export function eligibility(posting: CollectedPosting, now = new Date()): {
  include: boolean;
  reason: string;
  status: EligibilityStatus;
} {
  const assessment = assessPosting(posting, now);
  return { include: assessment.publish, reason: assessment.reason, status: assessment.status };
}

export function scorePosting(posting: CollectedPosting, now = new Date()): {
  score: number;
  breakdown: ScoreBreakdown;
  explanation: string;
  gaps: string[];
  tags: string[];
} {
  const assessment = assessPosting(posting, now);
  return {
    score: assessment.score,
    breakdown: assessment.breakdown,
    explanation: assessment.explanation,
    gaps: assessment.gaps,
    tags: assessment.tags,
  };
}

export function assessPosting(
  posting: CollectedPosting,
  now = new Date(),
  options?: { allowInternational?: boolean },
): Assessment {
  const title = posting.title.toLowerCase();
  const description = posting.description.toLowerCase();
  const studentTitle = studentTitleEvidence(title);
  const studentEmployment = studentEmploymentEvidence(posting.employmentType);
  const studentDescription = studentDescriptionEvidence(description);
  const professionalTitle = /\b(senior|sr\.?|staff|principal|director|vice president|\bvp\b|head of|lead|manager|permanent|full-time|full time)\b/.test(
    title,
  );
  const permanentBody = /\bpermanent (position|role|employment|full-time|full time)\b|\bfull-time regular\b|\bregular full-time\b/.test(
    description,
  );
  const yearsRequired = /\b([3-9]|[1-9]\d)\+?\s+years?\b/.test(description);
  const evidence: string[] = [];
  if (studentTitle) evidence.push(`Title indicates a ${studentTitle}.`);
  if (studentEmployment) evidence.push(`The employment category says ${studentEmployment}.`);
  if (studentDescription) evidence.push("The description describes this opening as a student placement.");

  const categories = categoriesFor(title, description);
  const highInterest = categories.some((category) => category.level === "high");
  const scheduleNote = /\bfull-time\b|\bfull time\b/.test(`${title} ${posting.employmentType ?? ""}`.toLowerCase())
    ? " Full-time here describes the weekly schedule."
    : "";

  if (degreeBarrier(title, description)) {
    return assessment({
      status: "ineligible_professional_role",
      publish: false,
      reason: "The posting requires a completed degree or excludes current students.",
      evidence,
      categories,
    });
  }

  const positive = Boolean(studentTitle || (studentEmployment && !professionalTitle) || (studentDescription && !professionalTitle));
  if (positive && !studentTitle && (professionalTitle || permanentBody)) {
    return assessment({
      status: "ineligible_professional_role",
      publish: false,
      reason: "The title is a senior, lead, or permanent role. A mention of students does not make it a student placement.",
      evidence,
      categories,
    });
  }

  if (positive) {
    if (pastTerm(`${title} ${description}`, now)) {
      return assessment({
        status: "eligible_student_role",
        publish: false,
        reason: "This is a student role, but the named work term is already over.",
        evidence,
        categories,
      });
    }
    if (isInternational(posting) && !highInterest && !options?.allowInternational) {
      return assessment({
        status: "eligible_student_role",
        publish: false,
        reason: "This is a student role outside Canada, and the title is not in a high-interest area.",
        evidence,
        categories,
      });
    }
    const scored = scoreEligible(posting, categories);
    return {
      status: "eligible_student_role",
      publish: true,
      reason: `${evidence[0] ?? "The posting is explicitly for a current student."}${scheduleNote}`,
      evidence,
      categories,
      ...scored,
    };
  }

  if (professionalTitle || permanentBody || (yearsRequired && !studentDescription)) {
    return assessment({
      status: "ineligible_professional_role",
      publish: false,
      reason: professionalTitle
        ? "The title describes a professional, permanent, senior, or lead role, with no student placement in the title."
        : "The posting describes permanent or experienced professional employment, not a current-student placement.",
      evidence,
      categories,
    });
  }

  if (/\b(part-time|part time)\b/.test(title)) {
    return assessment({
      status: "ineligible_professional_role",
      publish: false,
      reason: "Part-time professional employment is not a student placement unless the title says so.",
      evidence,
      categories,
    });
  }

  return assessment({
    status: "uncertain",
    publish: false,
    reason: "There is no positive evidence that this opening is an internship, co-op, or other current-student placement.",
    evidence,
    categories,
  });
}

function assessment(input: {
  status: EligibilityStatus;
  publish: boolean;
  reason: string;
  evidence: string[];
  categories: CategoryHit[];
}): Assessment {
  return {
    ...input,
    score: 0,
    breakdown: { interest: 0, location: 0, qualifications: 0, career: 0, compensation: 0 },
    explanation: input.reason,
    gaps: [],
    tags: input.categories.map((category) => category.id),
  };
}

function studentTitleEvidence(title: string): string | null {
  const patterns: [RegExp, string][] = [
    [/\binternships?\b/, "internship"],
    [/\binterns?\b/, "intern"],
    [/\bco-?ops?\b/, "co-op"],
    [/\b(co-operative|cooperative) education\b/, "co-operative education placement"],
    [/\bsummer students?\b/, "summer student role"],
    [/\bundergraduates?\b|\bundergrad\b/, "undergraduate role"],
    [/\bwork-integrated learning\b|\bwork integrated learning\b/, "work-integrated learning placement"],
    [/\bstudent (engineer|engineering|researcher|research|analyst|placement|position|program|intern|technician|automotive)\b/, "student placement"],
    [/\bundergraduates? researchers?\b|\bresearch assistant\b/, "undergraduate research role"],
    [/\bindustrial placements?\b/, "industrial placement"],
    [/\bsummer analysts?\b/, "summer analyst role"],
    [/\buniversity students?\b/, "university student role"],
    [/\bresearch intern\b/, "research internship"],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(title)) return label;
  }
  if (/\bstudent\b/.test(title) && !/\b(success|affairs|services|loans?|recruit|experience)\b/.test(title)) {
    return "student role";
  }
  return null;
}

function studentEmploymentEvidence(employmentType: string | null): string | null {
  if (!employmentType) return null;
  const value = employmentType.toLowerCase();
  if (/\bintern/.test(value)) return "internship";
  if (/\bco-?op/.test(value)) return "co-op";
  if (/\bstudent\b/.test(value)) return "student";
  return null;
}

function studentDescriptionEvidence(description: string): boolean {
  const sentences = description.split(/(?<=[.!?])\s+/);
  return sentences.some((sentence) => {
    const value = sentence.toLowerCase();
    if (/\b(former|previous|prior|ex-)(\s+\w+){0,3}\s+(intern|co-op|coop)\b/.test(value)) return false;
    if (/\bintern(ship)? experience\b/.test(value) && /\b(preferred|required|an asset|plus)\b/.test(value)) return false;
    return /\b(this (internship|co-op|placement)|co-op (position|role|placement|program)|internship (position|program)|summer student (position|program|role)|open to undergraduate students|for undergraduate students|currently enrolled|returning to (university|school|studies)|pursuing (a |an )?(bachelor|undergraduate)|work-integrated learning|work integrated learning)\b/.test(
      value,
    );
  });
}

function degreeBarrier(title: string, description: string): boolean {
  const text = `${title} ${description}`;
  const barrier =
    /\b(must have completed|have completed (a |an |their )?(bachelor|undergraduate|degree)|completed degree|degree already completed|graduates only|current undergraduate students are not eligible|phd required|doctoral degree required)\b/.test(
      text,
    );
  const enrolled =
    /\b(pursuing|currently enrolled|working towards|expected graduation|penultimate|returning to (university|school|studies))\b/.test(
      text,
    );
  return barrier && !enrolled;
}

function isInternational(posting: CollectedPosting): boolean {
  if (posting.country && posting.country !== "Canada") return true;
  const place = (posting.location ?? "").toLowerCase();
  if (!place.trim() || place.trim() === "remote") return false;
  return !/\b(canada|canadian|toronto|vancouver|mississauga|ottawa|montreal|montréal|calgary|edmonton|ontario|british columbia|quebec|québec|alberta|collingwood|owen sound|gta|burnaby|richmond|surrey|georgian)\b/.test(
    place,
  ) && !/,\s*(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt)\b/.test(place);
}

function categoriesFor(title: string, description: string): CategoryHit[] {
  const fromTitle = CATEGORIES.filter((category) => category.pattern.test(title));
  const titleIsOffProfile = /\b(sales|marketing|recruiter|recruiting|customer support|customer success|account executive|retail)\b/.test(
    title,
  );
  const chosen =
    fromTitle.length > 0 || titleIsOffProfile
      ? fromTitle
      : CATEGORIES.filter((category) => category.pattern.test(description.slice(0, 700)));
  const hits = chosen.map((category) => ({
    id: category.id,
    level: category.level,
    boost: category.boost && fromTitle.includes(category),
    evidence: fromTitle.includes(category) ? `Title matches ${category.id}.` : `Opening description matches ${category.id}.`,
  }));
  if (hits.length === 0 && /\bengineer/.test(title)) {
    hits.push({
      id: "General engineering",
      level: "medium",
      boost: false,
      evidence: "Title describes engineering work.",
    });
  }
  return hits;
}

function scoreEligible(
  posting: CollectedPosting,
  categories: CategoryHit[],
): Pick<Assessment, "score" | "breakdown" | "explanation" | "gaps" | "tags"> {
  const title = posting.title.toLowerCase();
  const description = posting.description.toLowerCase();
  const gaps: string[] = [];
  const high = categories.some((category) => category.level === "high");
  const medium = categories.some((category) => category.level === "medium");
  let interest = high ? 84 : medium ? 60 : 42;
  if (categories.some((category) => category.boost)) interest = Math.min(96, interest + 8);

  const place = `${posting.location ?? ""} ${posting.country ?? ""}`.toLowerCase();
  const remoteListed = posting.workArrangement === "remote" || /\bremote\b/.test(posting.location?.toLowerCase() ?? "");
  const remoteCanada = remoteListed && (posting.country === "Canada" || /\b(canada|canadian|within canada)\b/.test(place));
  let location = 40;
  let locationSentence = "The location was not specific enough to treat it as Toronto or Vancouver.";
  if (/\b(toronto|gta|mississauga|north york|scarborough|etobicoke|markham|vaughan|brampton|vancouver|burnaby|richmond|surrey|new westminster|north vancouver|lower mainland)\b/.test(place)) {
    location = 100;
    locationSentence = "The location is a strong fit.";
  } else if (/\b(collingwood|thornbury|meaford|wasaga|owen sound|georgian)\b/.test(place)) {
    location = 85;
    locationSentence = "The location is in the Georgian Bay area.";
  } else if (remoteCanada) {
    location = 80;
    locationSentence = "Remote work within Canada is a good fit.";
  } else if (remoteListed && posting.country && posting.country !== "Canada") {
    location = 28;
    locationSentence = "Remote work is listed, but the posting does not say it can be done from Canada.";
    gaps.push("Work authorization and relocation are unknown.");
  } else if (posting.country === "Canada" || /\b(canada|ontario|british columbia|quebec|québec|alberta)\b/.test(place)) {
    location = 55;
    locationSentence = "This is elsewhere in Canada, so the location fit is weaker than Toronto or Vancouver.";
  } else if (posting.country || /\b(united states|united kingdom|europe|international)\b/.test(place)) {
    location = 28;
    locationSentence = "The posting is outside Canada, and work authorization is not confirmed.";
    gaps.push("Work authorization and relocation are unknown.");
  } else {
    gaps.push("Location was not specific enough to score confidently.");
  }

  if (
    posting.country !== "Canada" &&
    /\b(authorized to work in the (united states|u\.s\.|usa|uk|united kingdom)|u\.s\. citizenship|us citizenship|must be (a )?citizen|no visa sponsorship|unable to sponsor)\b/.test(
      description,
    )
  ) {
    location = Math.min(location, 22);
    locationSentence = "The posting appears to require work authorization outside Canada.";
    if (!gaps.some((gap) => gap.includes("authorization"))) {
      gaps.push("Work authorization outside Canada is mentioned.");
    }
  }

  const { qualifications, qualificationSentence } = scoreQualifications(description);
  if (qualifications < 65) gaps.push("Required experience may be a stretch.");

  const focus = categories[0]?.id ?? "";
  const technical = categories.length > 0;
  const career = technical ? 84 : 58;
  const careerSentence = careerSentenceFor(focus, technical);

  const compensation = posting.salaryMin !== null || posting.salaryMax !== null ? 70 : 50;
  if (compensation === 50) gaps.push("Compensation was not listed.");

  const breakdown = { interest, location, qualifications, career, compensation };
  const score = Math.round(interest * 0.35 + location * 0.2 + qualifications * 0.2 + career * 0.2 + compensation * 0.05);
  const kind = /\bco-?op/.test(title) ? "co-op" : "internship";
  const where = wherePhrase(posting.location, location);
  const extras = [
    qualificationSentence,
    compensation === 50 ? "Compensation was not listed." : "Compensation is stated on the posting.",
  ].filter(Boolean);
  const explanation = `${focus || "Student"} ${kind} ${where}. ${locationSentence} ${careerSentence} ${extras.join(" ")}`.replace(
    /\s+/g,
    " ",
  ).trim();
  return {
    score,
    breakdown,
    explanation,
    gaps,
    tags: categories.map((category) => category.id),
  };
}

function wherePhrase(location: string | null, locationScore: number): string {
  if (locationScore >= 100 && location) return `in ${location}`;
  if (locationScore === 85) return "in the Georgian Bay area";
  if (locationScore === 80) return "that can be done remotely from Canada";
  if (locationScore === 55) return "elsewhere in Canada";
  if (locationScore <= 30) return "outside Canada";
  return "with the location not specified";
}

function careerSentenceFor(focus: string, technical: boolean): string {
  if (focus === "Software") return "It offers practical software experience.";
  if (focus === "Mechanical engineering") return "It offers hands-on mechanical engineering experience.";
  if (focus === "Materials engineering") return "It offers materials engineering experience.";
  if (focus === "Motorsports") return "It is directly connected to motorsports engineering.";
  if (focus === "Finance") return "It offers experience in finance.";
  if (focus === "AI and research") return "It offers research experience.";
  if (focus === "Product design" || focus === "Product development") return "It offers product development experience.";
  if (focus === "Running and sports technology") return "It is connected to running or sports technology.";
  if (technical) return "It offers relevant technical experience.";
  return "The overlap with the search profile is limited.";
}

function scoreQualifications(description: string): { qualifications: number; qualificationSentence: string } {
  const sentences = description.split(/(?<=[.!?])\s+/);
  let requiredYears = false;
  let preferredYears = false;
  for (const sentence of sentences) {
    const value = sentence.toLowerCase();
    if (!/\b([2-9]|[1-9]\d)\+?\s+years?\b/.test(value)) continue;
    if (/\b(preferred|nice to have|an asset|bonus|plus)\b/.test(value)) preferredYears = true;
    else requiredYears = true;
  }
  if (requiredYears) {
    return {
      qualifications: 52,
      qualificationSentence: "Some required experience looks like a stretch.",
    };
  }
  if (preferredYears) {
    return {
      qualifications: 72,
      qualificationSentence: "Extra experience is listed as preferred rather than required.",
    };
  }
  return {
    qualifications: 74,
    qualificationSentence: "",
  };
}
