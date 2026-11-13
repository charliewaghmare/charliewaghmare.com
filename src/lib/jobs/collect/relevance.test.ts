import assert from "node:assert/strict";
import test from "node:test";
import { assessPosting, type CollectedPosting } from "./rules";

const now = new Date("2026-11-12T18:00:00Z");

function posting(overrides: Partial<CollectedPosting>): CollectedPosting {
  return {
    provider: "greenhouse",
    sourceId: "1",
    title: "Role",
    companyName: "Example",
    location: "Toronto, ON",
    country: "Canada",
    workArrangement: "hybrid",
    description: "",
    departments: [],
    sourceUrl: "https://example.com/jobs/1",
    applicationUrl: "https://example.com/jobs/1",
    postedOn: "2026-11-01",
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...overrides,
  };
}

test("full-time summer internship is accepted", () => {
  const result = assessPosting(
    posting({
      title: "Mechanical Engineering Intern",
      employmentType: "Full-time",
      description:
        "This is a 16-week summer internship for students currently enrolled in mechanical engineering. The intern works 40 hours a week on product design in Toronto and returns to university when the term ends. Preferred: CAD coursework.",
    }),
    now,
  );
  assert.equal(result.status, "eligible_student_role");
  assert.equal(result.publish, true);
  assert.equal(result.tags.includes("Mechanical engineering"), true);
  assert.equal(result.breakdown.compensation, 50);
  assert.equal(/\binvented|\$\d/.test(result.explanation), false);
  assert.equal(/\/100/.test(result.explanation), false);
});

test("permanent, part-time, senior, lead, and technician roles are rejected", () => {
  const cases = [
    posting({
      title: "Vehicle Dynamics Engineer — Permanent",
      employmentType: "Full-time",
      description:
        "Permanent full-time position. Former intern preferred. The engineer owns vehicle dynamics for production programs and must have 5 years of professional experience.",
    }),
    posting({
      title: "Part-time Financial Analyst",
      employmentType: "Part-time",
      description:
        "Permanent part-time professional role on the finance team. Applicants should have a completed degree and two years of work experience.",
    }),
    posting({
      title: "Senior Vehicle Dynamics Engineer",
      description:
        "Senior engineer responsible for vehicle dynamics. Eight years of professional experience are required. This is not a student position.",
    }),
    posting({
      title: "Lead Footwear Material Designer",
      description:
        "Lead designer for footwear materials. This is a permanent role. Running shoe development experience is required.",
    }),
    posting({
      title: "Automotive Technician — Full Time",
      description:
        "Full-time automotive technician for vehicle repair. Permanent position in the service department.",
    }),
    posting({
      title: "Research Internship",
      description:
        "This internship is open only to candidates who have completed a bachelor's degree. A completed degree is required before the start date. Current undergraduate students are not eligible.",
    }),
  ];
  for (const item of cases) {
    const result = assessPosting(item, now);
    assert.equal(result.publish, false, item.title);
    assert.equal(result.status, "ineligible_professional_role", item.title);
  }
});

test("summer analyst and industrial placement titles are student roles", () => {
  const analyst = assessPosting(
    {
      provider: "greenhouse",
      sourceId: "a",
      title: "Summer analyst",
      companyName: "Northline",
      location: "Toronto",
      country: "Canada",
      workArrangement: "hybrid",
      description: "Summer 2027 program.",
      departments: [],
      sourceUrl: "https://example.com/a",
      applicationUrl: "https://example.com/a",
      postedOn: null,
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    },
    new Date("2026-11-12T18:00:00Z"),
  );
  assert.equal(analyst.publish, true);
  const permanent = assessPosting(
    {
      provider: "greenhouse",
      sourceId: "p",
      title: "Permanent financial analyst",
      companyName: "Northline",
      location: "Toronto",
      country: "Canada",
      workArrangement: "onsite",
      description: "This is a permanent role.",
      departments: [],
      sourceUrl: "https://example.com/p",
      applicationUrl: "https://example.com/p",
      postedOn: null,
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    },
    new Date("2026-11-12T18:00:00Z"),
  );
  assert.equal(permanent.publish, false);
  assert.equal(permanent.status, "ineligible_professional_role");
});

test("co-op, research, and student technician placements are accepted", () => {
  const coop = assessPosting(
    posting({
      title: "Engineering Co-op, Manufacturing",
      description:
        "Co-operative education placement for undergraduate students. The student returns to university after the work term. Responsibilities include manufacturing process support.",
    }),
    now,
  );
  assert.equal(coop.publish, true);
  const research = assessPosting(
    posting({
      title: "Undergraduate Research Internship",
      description:
        "Research internship for students currently enrolled in an engineering program. The student researcher supports lab experiments and returns to class after the term.",
    }),
    now,
  );
  assert.equal(research.publish, true);
  assert.equal(research.tags.includes("Research"), true);
  const technician = assessPosting(
    posting({
      title: "Automotive Technician Co-op",
      employmentType: "Full-time",
      description:
        "Student placement in the service department. This co-op is for students enrolled in an automotive program. The schedule is full-time during the work term.",
    }),
    now,
  );
  assert.equal(technician.status, "eligible_student_role");
  assert.equal(technician.publish, true);
});

test("an ambiguous technical role is quarantined", () => {
  const result = assessPosting(
    posting({
      title: "Mechanical Design Associate",
      description:
        "Support mechanical design work on consumer products. The team uses CAD and works with manufacturing partners. Schedule and eligibility are not specified.",
    }),
    now,
  );
  assert.equal(result.status, "uncertain");
  assert.equal(result.publish, false);
});

test("categories come from the role, not from stray words", () => {
  const hootsuite = assessPosting(
    posting({
      title: "Co-op/Intern, Software Development - Winter 2027",
      companyName: "Hootsuite",
      location: "Vancouver, BC, Toronto, ON",
      description:
        "Software development co-op. You will build web features and run tests for a social media product. Students return to school after the term. The description mentions running experiments only as a metaphor.",
    }),
    now,
  );
  assert.equal(hootsuite.publish, false);
  assert.deepEqual(hootsuite.tags, ["Software"]);
  assert.equal(hootsuite.status, "eligible_student_role");
  assert.equal(/motorsport|sports/i.test(hootsuite.explanation), false);

  const cohere = assessPosting(
    posting({
      title: "Research Internship (Winter 2027)",
      companyName: "Cohere",
      location: "Canada",
      country: "Canada",
      workArrangement: "remote",
      description:
        "Research internship on machine learning. You will be running experiments and training models. The work is artificial intelligence research for students currently enrolled in university.",
    }),
    now,
  );
  assert.equal(cohere.publish, false);
  assert.equal(cohere.tags.includes("Research"), true);
  assert.equal(cohere.tags.includes("Motorsports"), false);
  assert.equal(cohere.tags.includes("Running and sports technology"), false);

  const racing = assessPosting(
    posting({
      title: "Motorsport Engineering Internship",
      description:
        "Internship with a racing team. The intern supports the car during test days. Currently enrolled mechanical engineering students are encouraged to apply.",
    }),
    now,
  );
  assert.equal(racing.tags.includes("Motorsports"), true);
  assert.ok(racing.breakdown.interest > hootsuite.breakdown.interest);

  const finance = assessPosting(
    posting({
      title: "Financial Analyst Intern",
      description:
        "Summer internship in investment analysis. The intern helps engineering the reporting process and running the monthly close. This is a finance placement for students pursuing a bachelor's degree.",
    }),
    now,
  );
  assert.deepEqual(finance.tags, ["Finance"]);
  assert.equal(finance.publish, true);
});

test("remote outside Canada is not treated as remote Canada", () => {
  const result = assessPosting(
    posting({
      title: "Finance Intern",
      location: "Remote - eligible United Kingdom locations",
      country: "United Kingdom",
      workArrangement: "remote",
      description: "This internship is for students. Applicants must be authorized to work in the United Kingdom.",
    }),
    now,
  );
  assert.equal(result.status, "eligible_student_role");
  assert.equal(result.publish, false);
  assert.equal(result.reason.includes("outside Canada"), true);
});

test("a foreign sales working-student role stays out of discovery", () => {
  const result = assessPosting(
    posting({
      title: "Working Student Sales, Munich (m/f/d)",
      location: "Munich, Germany",
      country: "Germany",
      description:
        "Working student position in sales. You will use software tools to support the commercial team. This is not an engineering internship.",
    }),
    now,
  );
  assert.equal(result.status, "eligible_student_role");
  assert.equal(result.publish, false);
  assert.equal(result.tags.includes("Software"), false);
  assert.equal(result.tags.includes("Motorsports"), false);
});
