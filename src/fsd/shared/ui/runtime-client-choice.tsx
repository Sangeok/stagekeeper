"use client";

export function RuntimeClientChoice<Value extends string>({ value, options, onChange }: { value: Value; options: readonly { value: Value; label: string }[]; onChange: (client: Value) => void }) {
  return (
    <fieldset className="flex gap-3 text-sm">
      <legend className="sr-only">Coding client</legend>
      {options.map(option => (
        <label key={option.value} className="flex items-center gap-1.5">
          <input type="radio" checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
