import { useState } from "react";
import api from "../services/api";

export default function Chat() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");

  const sendMessage = async () => {
    try {
      const res = await api.post("/chat", {
        message: message,
      });

      setReply(res.data.reply);
    } catch (error) {
      console.error(error);
      setReply("Backend Error");
    }
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>CampusPilot AI - Chat</h1>

      <input
        type="text"
        placeholder="Ask something..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{
          width: "300px",
          padding: "10px",
          marginRight: "10px",
        }}
      />

      <button onClick={sendMessage}>Send</button>

      <h3>AI Reply:</h3>

      <p>{reply}</p>
    </div>
  );
}