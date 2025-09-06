require("dotenv").config();
const path = require("path");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

const connectDB = require("./config/db");
connectDB();

app.use(express.json());

// Serve static web assets from project ./web
app.use(express.static(path.join(__dirname, "..", "web")));

app.use("/chat", require("./routes/chat"));
app.use("/world", require("./routes/world"));
app.use("/admin", require("./routes/admin"));
app.use("/locale", require("./routes/locale"));
app.use("/race", require("./routes/race"));
app.use("/quest", require("./routes/quest"));
app.use("/character", require("./routes/character"));
app.use("/playerCharacter", require("./routes/playerCharacter"));
app.use("/activePlayerCharacter", require("./routes/activePlayerCharacter"));
app.use("/events", require("./routes/events"));


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
