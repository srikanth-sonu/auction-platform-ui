import { Link } from "react-router-dom";
import TopBar from "../components/TopBar";

export default function Landing() {
  return (
    <div className="app-frame">
      <TopBar
        subtitle="Multi-club cricket auctions"
        actions={
          <>
            <Link className="btn btn-ghost" to="/settings">
              Settings
            </Link>
            <Link className="btn btn-ghost" to="/summary">
              Summary
            </Link>
            <Link className="btn" to="/admin">
              Club admin
            </Link>
          </>
        }
      />

      <section className="hero">
        <div className="brand-mark">KPL Auction</div>
        <h1>Professional player auctions for every club.</h1>
        <p>
          Create franchises, import rosters, run live bids with purse and overseas
          rules, and broadcast a 2D/3D stage your room can follow.
        </p>
        <div className="btn-row">
          <Link className="btn" to="/admin" style={{ background: "#fff", color: "#0B6E4F" }}>
            Open admin console
          </Link>
          <Link className="btn btn-ghost" to="/settings" style={{ borderColor: "rgba(255,255,255,0.35)", color: "#fff", background: "transparent" }}>
            Connect backend
          </Link>
        </div>
      </section>

      <div className="shell">
        <div className="feature-grid">
          <article className="feature-card">
            <h3>Club-ready setup</h3>
            <p>
              Club profiles, colored franchise cards, purse budgets, squad size and
              overseas limits — built for weekend leagues and mega auctions.
            </p>
          </article>
          <article className="feature-card">
            <h3>Auctioneer controls</h3>
            <p>
              Roster queue, next/random player, tiered increments, team-led bidding,
              sold/unsold, undo last sale, and CSV import/export.
            </p>
          </article>
          <article className="feature-card">
            <h3>Live broadcast</h3>
            <p>
              Switchable 2D and 3D stage with purses, leading bidder, and sold feed —
              perfect for a projector or second screen.
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}
