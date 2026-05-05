import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";

const app = createRoot(document.getElementById("root"));

app.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
