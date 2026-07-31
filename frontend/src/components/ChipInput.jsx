import { useState } from "react";

/**
 * Visual chip list: type a value and press Enter / click Add.
 * Better than comma-separated fields for teams & tags.
 */
export default function ChipInput({
  values,
  onChange,
  placeholder = "Type and press Enter",
  addLabel = "Add",
}) {
  const [draft, setDraft] = useState("");

  function commit(raw = draft) {
    const value = String(raw || "").trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  function removeAt(index) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <div className="team-composer">
      <div className="team-composer-row">
        <div className="chip-input">
          {values.map((value, index) => (
            <span className="chip" key={`${value}-${index}`}>
              {value}
              <button type="button" aria-label={`Remove ${value}`} onClick={() => removeAt(index)}>
                ×
              </button>
            </span>
          ))}
          <input
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Backspace" && !draft && values.length) {
                removeAt(values.length - 1);
              }
            }}
          />
        </div>
        <button type="button" className="btn btn-sm" onClick={() => commit()}>
          {addLabel}
        </button>
      </div>
      {values.length > 0 && (
        <div className="team-cards">
          {values.map((value, index) => (
            <div className="team-compose-card" key={`card-${value}-${index}`}>
              <strong>{value}</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAt(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
