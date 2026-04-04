import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:8000";

function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>DiaHacks</h1>
      <p>API status: <strong>{status}</strong></p>
    </div>
  );
}

export default App;
