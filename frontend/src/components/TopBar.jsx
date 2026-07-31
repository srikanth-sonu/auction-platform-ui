import { Link } from "react-router-dom";

export default function TopBar({ subtitle, actions }) {
  return (
    <header className="topbar">
      <Link to="/" className="brand-lockup">
        <div className="brand-mark">KPL Auction</div>
        {subtitle && <div className="brand-sub">{subtitle}</div>}
      </Link>
      <nav className="topnav">{actions}</nav>
    </header>
  );
}
