const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

const roxy = require("./api/roxy");
const msi = require("./api/msi");
const np = require("./api/np");

app.use("/api/roxy", roxy);
app.use("/api/msi", msi);
app.use("/api/np", np);

app.get("/", (req,res)=> res.send("API RUNNING ✅"));

app.listen(PORT, "0.0.0.0", ()=>console.log("🚀 Server running on port", PORT));
