export function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export const ROLE_LABELS = {
  BAT: "Batsman",
  BOWL: "Bowler",
  AR: "All-rounder",
  WK: "Wicket-keeper",
};

export function parsePlayerLines(text, defaultBase = 500) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
      const name = parts[0];
      const roleRaw = (parts[1] || "BAT").toUpperCase();
      const roleMap = {
        BAT: "BAT",
        BATSMAN: "BAT",
        BOWL: "BOWL",
        BOWLER: "BOWL",
        AR: "AR",
        "ALL-ROUNDER": "AR",
        ALLROUNDER: "AR",
        WK: "WK",
        "WICKET-KEEPER": "WK",
        KEEPER: "WK",
      };
      return {
        name,
        role: roleMap[roleRaw] || "BAT",
        basePrice: Number(parts[2]) || defaultBase,
      };
    });
}
