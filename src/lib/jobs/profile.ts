import type { SearchPreferences } from "@/lib/jobs/types";

/**
 * Owner search profile for a future scoring pipeline.
 * Phase 1 stores and edits this model. It does not score listings.
 */
export const defaultSearchPreferences: SearchPreferences = {
  weights: {
    interest: 35,
    location: 20,
    qualifications: 20,
    career: 20,
    compensation: 5,
  },
  interests: [
    { id: "mechanical", label: "Mechanical engineering", level: "high" },
    { id: "product", label: "Product design and development", level: "high" },
    { id: "motorsports", label: "Motorsports, including F1, NASCAR and IndyCar", level: "high" },
    { id: "running", label: "Running and sports performance technology", level: "high" },
    { id: "wearables", label: "Wearables and sports equipment development", level: "high" },
    { id: "materials", label: "Materials engineering", level: "medium" },
    { id: "manufacturing", label: "Manufacturing", level: "medium" },
    { id: "ai", label: "AI and software engineering", level: "medium" },
    { id: "automation", label: "Automation and robotics", level: "medium" },
    { id: "general", label: "General engineering", level: "medium" },
    {
      id: "finance",
      label: "Finance, including investment banking, asset management, quantitative finance and fintech",
      level: "medium",
    },
    { id: "other", label: "Interesting non-engineering opportunities", level: "medium" },
  ],
  boosts: [
    "Motorsports",
    "Running",
    "Sports technology",
    "Racing simulation",
    "Consumer product development",
  ],
  locations: {
    ideal: ["Toronto and GTA", "Vancouver and Lower Mainland"],
    good: [
      "Collingwood",
      "Thornbury",
      "Meaford",
      "Wasaga Beach",
      "Owen Sound",
      "Surrounding Georgian Bay region",
    ],
    remote: ["Remote opportunities within Canada"],
    exceptionalOnly: ["Other Canadian locations"],
  },
  workTerms: ["Summer 2027", "Fall 2027", "Winter 2028", "Rolling or flexible start"],
  minScore: 50,
  strategy:
    "Exploratory discovery, including conventional internships, niche teams, small companies, startups and unusual roles.",
  feedbackAdaptation:
    "Moderate adaptation from saved, applied and ignored jobs. Explicit preferences stay authoritative.",
  qualificationApproach:
    "Flexible matching. Prefer realistic roles, keep ambitious ones that would be useful experience, and drop clearly ineligible positions.",
};

export function weightsTotal(weights: SearchPreferences["weights"]): number {
  return (
    weights.interest +
    weights.location +
    weights.qualifications +
    weights.career +
    weights.compensation
  );
}

export function isSearchPreferences(value: unknown): value is SearchPreferences {
  if (!value || typeof value !== "object") return false;
  const record = value as SearchPreferences;
  if (!record.weights || weightsTotal(record.weights) !== 100) return false;
  if (!Array.isArray(record.interests) || !Array.isArray(record.workTerms)) return false;
  if (typeof record.minScore !== "number" || record.minScore < 0 || record.minScore > 100) {
    return false;
  }
  return true;
}
