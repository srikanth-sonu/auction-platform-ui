import { Link } from "react-router-dom";
import TopBar from "../components/TopBar";

export default function Landing() {
  return (
    <div className="app-frame">
      <TopBar
        subtitle="Live tournament auction"
        actions={
          <>
            <Link className="btn btn-ghost" to="/summary">
              Summary
            </Link>
            <Link className="btn" to="/admin">
              Open admin
            </Link>
          </>
        }
      />
      <section className="hero-landing">
        <div className="hero-copy">
          <div className="brand-mark">KPL Auction</div>
          <h1>Run the night. Own the room.</h1>
          <p>
            A modern 2D / 3D switchable auction stage for cricket tournaments —
            roster, purses, live bids, sold boards, and squad summaries in one
            flow.
          </p>
          <div className="btn-row">
            <Link className="btn" to="/admin">
              Start as admin
            </Link>
            <Link className="btn btn-ghost" to="/live">
              Open live stage
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
