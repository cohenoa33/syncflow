// packages/dashboard-web/src/main.tsx

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { io } from "socket.io-client";
import { useEventStore } from "./store/events";

const socket = io("http://localhost:5050");

socket.on("event", (e) => {
  useEventStore.getState().addEvent(e);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


