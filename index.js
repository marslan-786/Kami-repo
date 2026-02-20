const express = require("express");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const querystring = require("querystring");

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = {
  baseUrl: "http://145.239.130.45/ints",
  username: "Kami526",
  password: "Kamran52",
  userAgent:
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Safari/537.36"
};

let cookies = [];

/* ================= REQUEST HELPER ================= */

function request(method, url, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;

    const headers = {
      "User-Agent": CONFIG.userAgent,
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate",
      "Cookie": cookies.join("; "),
      ...extraHeaders
    };

    if (method === "POST" && data) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = lib.request(url, { method, headers }, res => {
      if (res.headers["set-cookie"]) {
        res.headers["set-cookie"].forEach(c => {
          const clean = c.split(";")[0];
          cookies.push(clean);
        });
      }

      let chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        let buffer = Buffer.concat(chunks);
        let body = buffer;

        if (res.headers["content-encoding"] === "gzip")
          body = zlib.gunzipSync(buffer);

        resolve(body.toString());
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ================= LOGIN ================= */

async function login() {
  console.log("🔄 Logging in...");

  const page = await request("GET", `${CONFIG.baseUrl}/login`);

  const match = page.match(/What is (\d+) \+ (\d+)/);
  let ans = 10;

  if (match) ans = Number(match[1]) + Number(match[2]);

  const form = querystring.stringify({
    username: CONFIG.username,
    password: CONFIG.password,
    capt: ans
  });

  await request(
    "POST",
    `${CONFIG.baseUrl}/signin`,
    form,
    { Referer: `${CONFIG.baseUrl}/login` }
  );

  console.log("✅ Login success");
}

/* ================= FETCH NUMBERS ================= */

async function getNumbers() {
  const url =
    `${CONFIG.baseUrl}/agent/res/data_smsnumbers.php?` +
    `frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1`;

  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/MySMSNumbers`,
    "X-Requested-With": "XMLHttpRequest"
  });

  return JSON.parse(data);
}

/* ================= FETCH SMS ================= */

async function getSMS() {
  const url =
    `${CONFIG.baseUrl}/agent/res/data_smscdr.php?` +
    `fdate1=2026-01-01%2000:00:00&fdate2=2099-12-31%2023:59:59` +
    `&iDisplayLength=2000&iSortCol_0=0&sSortDir_0=desc`;

  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/SMSCDRReports`,
    "X-Requested-With": "XMLHttpRequest"
  });

  return JSON.parse(data);
}

/* ================= API ================= */

app.get("/api", async (req, res) => {
  const type = req.query.type;

  if (!type) return res.json({ error: "Use ?type=numbers or ?type=sms" });

  try {
    cookies = [];
    await login();

    let result;

    if (type === "numbers") result = await getNumbers();
    else if (type === "sms") result = await getSMS();
    else return res.json({ error: "Invalid type" });

    res.json(result);

  } catch (err) {
    res.json({ error: err.message });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
});
