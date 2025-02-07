require("dotenv").config();
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

const connectDB = require("./config/db");
connectDB();

app.use(express.json());

app.use("/test", require("./routes/test"));
app.use("/chat", require("./routes/chat"));
app.use("/generation/", require("./routes/generation"));
app.use("/locale", require("./routes/locale"));


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
