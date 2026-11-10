import type { ReactNode } from "react";

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="text-sm font-medium text-stone-500"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
