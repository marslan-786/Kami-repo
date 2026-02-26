const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORT ALL PANELS ---
const roxy = require("./api/roxy");
const roxy1 = require("./api/roxy1");
const msi = require("./api/msi");
const msi1 = require("./api/msi1");
const np = require("./api/np");
const np2 = require("./api/np2");
const goat = require("./api/goat");
const goat1 = require("./api/goat1");  // <-- NEW

// --- ROUTES ---
app.use("/api/roxy", roxy);
app.use("/api/roxy1", roxy1);
app.use("/api/msi", msi);
app.use("/api/msi1", msi1);
app.use("/api/np", np);
app.use("/api/np2", np2);
app.use("/api/goat", goat);
app.use("/api/goat1", goat1); // <-- NEW

// --- HEALTH CHECK ---
app.get("/", (req,res)=> res.send("API RUNNING ✅"));

// --- START SERVER ---
app.listen(PORT, "0.0.0.0", ()=>console.log(`🚀 Server running on port ${PORT}`));
