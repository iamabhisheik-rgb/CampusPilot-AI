import { useEffect, useState } from "react";
import api from "../services/api";

export default function Home() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/")
      .then((res) => setMsg(res.data.message))
      .catch(() => setMsg("Backend not connected"));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>CampusPilot AI</h1>
      <h2>{msg}</h2>
    </div>
  );
}