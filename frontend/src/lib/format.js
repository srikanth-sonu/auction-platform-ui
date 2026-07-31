export function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export const ROLE_LABELS = {
  BAT: "Batsman",
  BOWL: "Bowler",
  AR: "All-rounder",
  WK: "Wicket-keeper",
};

export const CATEGORY_LABELS = {
  CAPPED: "Capped",
  UNCAPPED: "Uncapped",
  ICON: "Icon",
  GRADE_A: "Grade A",
  GRADE_B: "Grade B",
  GRADE_C: "Grade C",
};

export const TEAM_COLORS = [
  "#0B6E4F",
  "#1D4E89",
  "#B23A48",
  "#F4A261",
  "#6D597A",
  "#2A9D8F",
  "#E76F51",
  "#264653",
  "#8Ac926",
  "#1982C4",
];

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
        category: (parts[2] || "UNCAPPED").toUpperCase().replace(/\s+/g, "_"),
        countryType: (parts[3] || "LOCAL").toUpperCase(),
        basePrice: Number(parts[4]) || defaultBase,
      };
    });
}

export function shortCodeFromName(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}
