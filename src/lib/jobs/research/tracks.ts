export type ResearchTrack = {
  id: string;
  label: string;
  queries: string[];
};

export const RESEARCH_TRACKS: ResearchTrack[] = [
  {
    id: "mechanical",
    label: "Mechanical and product development",
    queries: [
      "mechanical design internship Summer 2027 Canada",
      "product development co-op Toronto 2027",
      "prototype engineering internship Vancouver student",
      "CAD testing internship consumer product 2027",
      "mechanical R&D summer student Ontario",
    ],
  },
  {
    id: "motorsports",
    label: "Motorsports and racing",
    queries: [
      "motorsport engineering internship 2027",
      "vehicle dynamics student placement internship",
      "racing composites internship student",
      "motorsport telemetry internship co-op",
      "NASCAR IndyCar engineering internship student",
    ],
  },
  {
    id: "running",
    label: "Running and sports technology",
    queries: [
      "running footwear development internship 2027",
      "sports equipment design co-op student",
      "wearable biomechanics internship",
      "athletic footwear materials intern student",
      "sports technology startup internship Canada",
    ],
  },
  {
    id: "materials",
    label: "Materials and manufacturing",
    queries: [
      "materials engineering internship 2027 Canada",
      "composites development co-op student",
      "manufacturing engineering summer student Ontario",
      "materials testing laboratory internship Vancouver",
      "metallurgy internship undergraduate",
    ],
  },
  {
    id: "software",
    label: "AI, software and automation",
    queries: [
      "software engineering co-op Vancouver Winter 2027",
      "machine learning internship undergraduate Canada 2027",
      "robotics software internship student",
      "AI engineering internship Toronto student",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    queries: [
      "investment analyst internship engineering students Toronto 2027",
      "fintech co-op undergraduate Canada",
      "quantitative research internship student Canada",
      "corporate finance summer student Vancouver",
    ],
  },
  {
    id: "regional",
    label: "Regional employers",
    queries: [
      "engineering summer student Collingwood Ontario",
      "manufacturing co-op Georgian Bay",
      "mechanical internship Vancouver Lower Mainland 2027",
      "product design internship Toronto GTA student",
    ],
  },
];
