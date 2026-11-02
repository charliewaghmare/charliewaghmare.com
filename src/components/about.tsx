import { Section } from "@/components/section";

function paragraphs(about: string): string[] {
  return about
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function About({ about }: { about: string }) {
  const blocks = paragraphs(about);

  return (
    <Section id="about" title="About">
      {blocks.length > 0 ? (
        <div className="space-y-4 text-base leading-7">
          {blocks.map((block) => (
            <p key={block}>{block}</p>
          ))}
        </div>
      ) : (
        <p className="text-base leading-7 text-stone-600 dark:text-stone-400">
          Add a short bio as <code className="text-code">about</code> in{" "}
          <code className="text-code">src/content/site.ts</code>. It will
          replace this note.
        </p>
      )}
    </Section>
  );
}
