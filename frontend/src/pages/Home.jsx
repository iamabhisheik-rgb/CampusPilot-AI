import { useEffect, useState } from "react";
import api from "../services/api";

export default function Home() {
  const [msg, setMsg] = useState("Checking backend...");

  useEffect(() => {
    api.get("/health")
      .then((res) => setMsg(res.data.message))
      .catch(() => setMsg("Backend not connected"));
  }, []);

  return (
    <div style={{ padding: 20 }}>
         <div className="mt-8">
  <button
  style={{
    background: "#6C63FF",
    color: "white",
    padding: "14px 28px",
    borderRadius: "10px",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    marginTop: "20px"
  }}
>
  🚀 AI Exam Analysis
</button>
      <h2>{msg}</h2>
    </div>
  );
{"}"}