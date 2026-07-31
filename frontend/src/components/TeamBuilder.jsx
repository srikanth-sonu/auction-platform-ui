import { useState } from "react";
import { TEAM_COLORS, shortCodeFromName } from "../lib/format";

/**
 * Team builder: add teams as visual cards (name + code + color),
 * not a comma-separated text field.
 */
export default function TeamBuilder({ teams, onChange }) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [color, setColor] = useState(TEAM_COLORS[0]);

  function addTeam() {
    const teamName = name.trim();
    if (!teamName) return;
    if (teams.some((t) => t.name.toLowerCase() === teamName.toLowerCase())) {
      setName("");
      return;
    }
    onChange([
      ...teams,
      {
        name: teamName,
        shortCode: (shortCode || shortCodeFromName(teamName)).slice(0, 4).toUpperCase(),
        color,
      },
    ]);
    setName("");
    setShortCode("");
    setColor(TEAM_COLORS[teams.length % TEAM_COLORS.length]);
  }

  function removeAt(index) {
    onChange(teams.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="team-add">
        <input
          placeholder="Team name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!shortCode) setShortCode(shortCodeFromName(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTeam();
            }
          }}
        />
        <input
          placeholder="Code"
          value={shortCode}
          maxLength={4}
          onChange={(e) => setShortCode(e.target.value.toUpperCase())}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title="Team color"
        />
        <button type="button" className="btn" onClick={addTeam}>
          Add team
        </button>
      </div>

      <div className="team-grid-edit">
        {teams.map((team, index) => (
          <div className="team-edit-card" key={`${team.name}-${index}`}>
            <div className="swatch" style={{ background: team.color }} />
            <div className="meta">
              <div>
                <strong>{team.name}</strong>
                <div className="muted">{team.shortCode}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeAt(index)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {!teams.length && (
        <p className="muted" style={{ marginTop: 8 }}>
          Add franchises one by one — each gets a code and color for the live board.
        </p>
      )}
    </div>
  );
}
