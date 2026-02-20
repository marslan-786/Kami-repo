const express = require("express");
const axios = require("axios");
const querystring = require("querystring");

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = {
  baseUrl: "http://167.114.209.78/roxy",
  username: "Kamibroken",
  password: "Kamran5.",
  userAgent:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144.0.7559.132 Mobile Safari/537.36"
};

let cookies = [];

/* ================= HELPER ================= */
const client = axios.create({
  headers: {
    "User-Agent": CONFIG.userAgent,
    "Accept": "*/*",
    "X-Requested-With": "XMLHttpRequest"
  },
  withCredentials: true,
  timeout: 10000,
  validateStatus: () => true
});

async function request(url, method = "GET", data = null, headers = {}) {
  const res = await client({
    url,
    method,
    data,
    headers: { ...headers, Cookie: cookies.join("; ") },
    maxRedirects: 0
  });

  // Capture cookies
  if (res.headers["set-cookie"]) {
    res.headers["set-cookie"].forEach(c => {
      const clean = c.split(";")[0];
      if (!cookies.includes(clean)) cookies.push(clean);
    });
  }

  return res.data;
}

/* ================= LOGIN ================= */
async function login() {
  console.log("🔄 Logging in...");

  const page = await request(`${CONFIG.baseUrl}/Login`);

  // Simple CAPTCHA (1 + 1 style)
  const match = page.match(/What is (\d+) \+ (\d+)/);
  let ans = 6;
  if (match) ans = Number(match[1]) + Number(match[2]);

  const form = querystring.stringify({
    username: CONFIG.username,
    password: CONFIG.password,
    capt: ans
  });

  await request(`${CONFIG.baseUrl}/signin`, "POST", form, {
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: `${CONFIG.baseUrl}/Login`
  });

  console.log("✅ Login success");
}

/* ================= FETCH NUMBERS ================= */
async function getNumbers() {
  const url =
    `${CONFIG.baseUrl}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=7&sColumns=%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1`;

  const data = await request(url, "GET", null, {
    Referer: `${CONFIG.baseUrl}/agent/MySMSNumbers`
  });

  return JSON.parse(data);
}

/* ================= FETCH SMS ================= */
async function getSMS() {
  const url =
    `${CONFIG.baseUrl}/agent/res/data_smscdr.php?fdate1=2026-02-20%2000:00:00&fdate2=2026-02-20%2023:59:59&iDisplayLength=2000&iSortCol_0=0&sSortDir_0=desc`;

  const data = await request(url, "GET", null, {
    Referer: `${CONFIG.baseUrl}/agent/SMSCDRReports`
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

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
