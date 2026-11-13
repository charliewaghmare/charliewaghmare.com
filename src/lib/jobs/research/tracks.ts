export type ResearchTrack = {
  id: string;
  label: string;
  interest: "high" | "medium";
  queries: string[];
};

const SEASONS = ["Summer 2027", "Fall 2027", "Winter 2028"];

type TrackSeed = {
  id: string;
  label: string;
  interest: "high" | "medium";
  roles: string[];
  places: string[];
};

const SEEDS: TrackSeed[] = [
  {
    id: "mechanical",
    label: "Mechanical and product development",
    interest: "high",
    roles: ["mechanical engineering", "product development", "prototype design", "CAD design"],
    places: ["Toronto", "Vancouver", "Ontario", "Canada"],
  },
  {
    id: "motorsports",
    label: "Motorsports and automotive engineering",
    interest: "high",
    roles: ["motorsport engineering", "vehicle dynamics", "automotive engineering", "composites"],
    places: ["Canada", "United States", "United Kingdom", "Ontario"],
  },
  {
    id: "running",
    label: "Running and sports technology",
    interest: "high",
    roles: ["footwear development", "sports equipment design", "wearable technology", "biomechanics"],
    places: ["Canada", "Vancouver", "Toronto", "remote Canada"],
  },
  {
    id: "materials",
    label: "Materials and manufacturing",
    interest: "high",
    roles: ["materials engineering", "composites manufacturing", "metallurgy", "manufacturing engineering"],
    places: ["Ontario", "Vancouver", "Canada", "Toronto"],
  },
  {
    id: "software",
    label: "AI, software and automation",
    interest: "medium",
    roles: ["software engineering", "machine learning", "robotics software", "automation"],
    places: ["Vancouver", "Toronto", "Canada", "remote Canada"],
  },
  {
    id: "finance",
    label: "Finance and financial technology",
    interest: "medium",
    roles: ["finance", "fintech", "quantitative research", "investment analyst"],
    places: ["Toronto", "Vancouver", "Canada", "Ontario"],
  },
  {
    id: "regional",
    label: "Regional employers",
    interest: "medium",
    roles: ["engineering", "manufacturing", "product design", "mechanical engineering"],
    places: ["Collingwood Ontario", "Georgian Bay", "Vancouver Lower Mainland", "Toronto GTA"],
  },
];

const TERMS = ["internship", "co-op", "summer student", "industrial placement", "undergraduate"];

export function queriesForTrack(seed: TrackSeed): string[] {
  const queries: string[] = [];
  seed.roles.forEach((role, index) => {
    const season = SEASONS[index % SEASONS.length];
    const place = seed.places[index % seed.places.length];
    const term = TERMS[index % TERMS.length];
    queries.push(`${role} ${term} ${season} ${place}`);
  });
  queries.push(`${seed.roles[0]} co-operative education ${SEASONS[0]} ${seed.places[0]}`);
  queries.push(`${seed.roles[0]} university student ${SEASONS[2]} ${seed.places[1] ?? seed.places[0]}`);
  return [...new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()))];
}

export const RESEARCH_TRACKS: ResearchTrack[] = SEEDS.map((seed) => ({
  id: seed.id,
  label: seed.label,
  interest: seed.interest,
  queries: queriesForTrack(seed),
}));
