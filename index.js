const express = require("express");
const http = require("http");
const zlib = require("zlib");
const querystring = require("querystring");

const app = express();
const PORT = 3000;

/* ================= CONFIG ================= */

const CONFIG = {
  baseUrl: "http://167.114.209.78/roxy",
  username: "Kamibroken",
  password: "Kamran5.",
  userAgent:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Safari/537.36"
};

let cookies = [];

/* ================= REQUEST HELPER ================= */

function request(method, url, data = null, headersExtra = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": CONFIG.userAgent,
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate",
      "Cookie": cookies.join("; "),
      ...headersExtra
    };

    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = http.request(url, { method, headers }, res => {
      if (res.headers["set-cookie"]) {
        res.headers["set-cookie"].forEach(c =>
          cookies.push(c.split(";")[0])
        );
      }

      let chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        if (res.headers["content-encoding"] === "gzip")
          buf = zlib.gunzipSync(buf);

        resolve(buf.toString());
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ================= LOGIN ================= */

async function login() {
  cookies = [];

  console.log("🔄 Login start");

  const page = await request("GET", `${CONFIG.baseUrl}/Login`);

  // AUTO CAPTCHA SOLVE
  const match = page.match(/What is (\d+) \+ (\d+)/i);
  const answer = match ? Number(match[1]) + Number(match[2]) : 6;

  const form = querystring.stringify({
    username: CONFIG.username,
    password: CONFIG.password,
    capt: answer
  });

  await request(
    "POST",
    `${CONFIG.baseUrl}/signin`,
    form,
    { Referer: `${CONFIG.baseUrl}/Login` }
  );

  console.log("✅ Logged in");
}

/* ================= NUMBERS ================= */

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

/* ================= SMS ================= */

async function getSMS() {
  const today = new Date().toISOString().slice(0, 10);

  const url =
    `${CONFIG.baseUrl}/agent/res/data_smscdr.php?` +
    `fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59` +
    `&iDisplayStart=0&iDisplayLength=2000`;

  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/SMSCDRReports`,
    "X-Requested-With": "XMLHttpRequest"
  });

  return JSON.parse(data);
}

/* ================= API ================= */

app.get("/api", async (req, res) => {
  const type = req.query.type;

  if (!type)
    return res.json({ error: "Use ?type=numbers OR ?type=sms" });

  try {
    await login();

    let result;

    if (type === "numbers") result = await getNumbers();
    else if (type === "sms") result = await getSMS();
    else return res.json({ error: "Invalid type" });

    res.json(result);

  } catch (e) {
    res.json({ error: e.message });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 API running on port", PORT);
});
