import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PublicView from "./PublicView";
import Summary from "./Summary";
import "./index.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";

let Component = App;
if (path === "/public") Component = PublicView;
if (path === "/summary") Component = Summary;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>
);
