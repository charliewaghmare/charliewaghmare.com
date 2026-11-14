const UNIT_PATTERN = /(\/km|\s+km|\s+bpm|\s+ms)/g;

export function WithUnits({
  text,
  unitClassName = "type-unit",
}: {
  text: string;
  unitClassName?: string;
}) {
  const parts = text.split(UNIT_PATTERN);
  return parts.map((part, index) =>
    part === "/km" || part === " km" || part === " bpm" || part === " ms" ? (
      <span key={`${part}-${index}`} className={unitClassName}>
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}
