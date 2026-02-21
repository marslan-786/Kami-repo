const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

/* IMPORT PANELS */
const roxy = require("./api/roxy");
const msi = require("./api/msi");   // 💥 add this
// const panel1 = require("./api/panel1");

/* ROUTES */
app.use("/api/roxy", roxy);
app.use("/api/msi", msi);          // 💥 enable MSI
// app.use("/api/panel1", panel1);

/* HEALTH CHECK (VERY IMPORTANT FOR RAILWAY) */
app.get("/", (req, res) => {
  res.send("API RUNNING ✅");
});

/* START SERVER */
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
