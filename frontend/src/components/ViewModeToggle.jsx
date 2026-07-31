export default function ViewModeToggle({ mode, onChange }) {
  return (
    <div className="mode-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        className={mode === "2d" ? "active" : ""}
        onClick={() => onChange("2d")}
      >
        2D
      </button>
      <button
        type="button"
        className={mode === "3d" ? "active" : ""}
        onClick={() => onChange("3d")}
      >
        3D
      </button>
    </div>
  );
}
