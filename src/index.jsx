import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";

import { ThemeModeProvider } from "./ThemeModeContext";

function startVersionPoller() {
  let currentVersion = null;

  async function check() {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`);
      const data = await res.json();
      if (currentVersion === null) {
        currentVersion = data.version;
      } else if (data.version !== currentVersion) {
        window.location.reload(true);
      }
    } catch (e) {
      // silently ignore network errors
    }
  }

  check();
  setInterval(check, 60_000);
}

startVersionPoller();

const app = createRoot(document.getElementById("root"));

app.render(
  <BrowserRouter>
    <ThemeModeProvider>
      <App />
    </ThemeModeProvider>
  </BrowserRouter>,
);
