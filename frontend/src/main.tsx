import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useStore } from "./app/store";
import "./styles.css";

// Kick off the one-time load of server capabilities + examples. Done here (the
// real entrypoint) rather than in a component effect so unit tests that render
// <App /> directly stay free of network calls and act() warnings.
void useStore.getState().loadServerData();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
