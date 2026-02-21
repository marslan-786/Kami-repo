const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Dynamically load all JS files in api folder
const modules = {};
fs.readdirSync(path.join(__dirname, "api")).forEach(file => {
  if (file.endsWith(".js")) {
    const modName = file.replace(".js", "");
    modules[modName] = require(`./api/${file}`);
  }
});

app.get("/api", async (req, res) => {
  const type = req.query.type;

  try {
    if (!type) return res.json({ error: "Use ?type=moduleName" });

    const func = modules[type]?.getData;
    if (!func) return res.json({ error: "Module not found" });

    const data = await func();
    res.json(data);

  } catch (e) {
    res.json({ error: e.message });
  }
});

app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
