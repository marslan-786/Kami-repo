const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Import all panels
const roxy = require("./api/roxy");
const panel1 = require("./api/msi");
const panel2 = require("./api/panel1");

// Map endpoints
app.use("/api/roxy", roxy);
app.use("/api/msi", msi);
app.use("/api/panel1", panel1);

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
