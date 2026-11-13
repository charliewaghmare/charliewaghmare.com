/** Exclude job functions, not employers or incidental software/tool requirements. */
export function excludedDiscoveryRole(job: { title: string; description?: string | null }): boolean {
  const title = job.title.toLowerCase();
  const software = /\b(software|developers?|programmers?|firmware|devops|mlops|sre|full[- ]?stack|front[- ]?end|back[- ]?end|site reliability|embedded software)\b/;
  if (software.test(title)) return true;

  const physicalRole = /\b(mechanical|materials?|manufacturing|industrial|electrical|hardware|product design|product development|vehicle dynamics|biomechanics|footwear)\s+(engineering|engineer|design|development|intern|co-?op|student)\b/;
  const ai = /\b(ai|ml|ai\/ml|machine[- ]learning|artificial intelligence|deep learning|computer vision|natural language processing)\b/;
  if (ai.test(title) && !physicalRole.test(title)) return true;

  // A generic research title can hide its actual function. Do not infer this
  // from an employer name, departments, or a physical role's tool requirements.
  if (!physicalRole.test(title) && /\b(research|scientist|engineering intern|engineering co-?op)\b/.test(title)) {
    const opening = (job.description ?? "").toLowerCase().slice(0, 700);
    if (/\b(machine[- ]learning|artificial intelligence|deep learning|computer vision|natural language processing|software (engineering|development)|ai research|ml research)\b/.test(opening)) return true;
  }
  return false;
}
