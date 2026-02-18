const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

// ================= CONFIG =================
const BASE = "http://51.89.99.105/NumberPanel";
const CREDENTIALS = { username: "Kami555", password: "Kami526" };
const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12)",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "en-US,en;q=0.9"
};

// ================= GLOBAL STATE =================
let cookies = "";
let sesskey = "";
let isLoggingIn = false;

// ================= HELPERS =================
function extractKey(html) {
  let match = html.match(/sesskey=([^&"']+)/);
  if (match) return match[1];
  match = html.match(/sesskey\s*[:=]\s*["']([^"']+)["']/);
  if (match) return match[1];
  return null;
}

// ================= LOGIN FUNCTION =================
async function login() {
  if (isLoggingIn) return;
  isLoggingIn = true;
  try {
    const r1 = await axios.get(`${BASE}/login`, { headers: COMMON_HEADERS });
    if (r1.headers["set-cookie"]) {
      const c = r1.headers["set-cookie"].find(x => x.includes("PHPSESSID"));
      if (c) cookies = c.split(";")[0];
    }

    const cap = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
    const ans = cap ? parseInt(cap[1]) + parseInt(cap[2]) : 10;

    await axios.post(
      `${BASE}/signin`,
      new URLSearchParams({
        username: CREDENTIALS.username,
        password: CREDENTIALS.password,
        capt: ans
      }),
      {
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies,
          Referer: `${BASE}/login`
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    // GET sesskey
    const r2 = await axios.get(`${BASE}/client/SMSCDRStats`, {
      headers: { ...COMMON_HEADERS, Cookie: cookies, Referer: `${BASE}/client/SMSDashboard` }
    });
    sesskey = extractKey(r2.data) || "";
    console.log("✅ Login Success, sesskey:", sesskey);

  } catch (e) {
    console.log("❌ Login error:", e.message);
    sesskey = "";
  } finally {
    isLoggingIn = false;
  }
}

// ================= FETCH NUMBERS =================
async function fetchNumbers() {
  try {
    if (!sesskey) await login();
    const ts = Date.now();
    const url = `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;

    const res = await axios.get(url, {
      headers: { ...COMMON_HEADERS, Cookie: cookies, "X-Requested-With": "XMLHttpRequest" }
    });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      id: r[0],
      number: r[1],
      country: r[2],
      service: r[3],
      status: r[4]
    }));

  } catch (e) {
    console.log("Numbers fetch error:", e.message);
    sesskey = "";
    return [];
  }
}

// ================= FETCH SMS =================
async function fetchSMS() {
  try {
    if (!sesskey) await login();
    const today = new Date().toISOString().split("T")[0];

    const url = `${BASE}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${sesskey}&iDisplayLength=50&_=${Date.now()}`;
    const res = await axios.get(url, {
      headers: { ...COMMON_HEADERS, Cookie: cookies, "X-Requested-With": "XMLHttpRequest" }
    });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      time: r[0],
      number: r[2],
      service: r[3],
      message: r[4]
    }));

  } catch (e) {
    console.log("SMS fetch error:", e.message);
    sesskey = "";
    return [];
  }
}

// ================= API ENDPOINT =================
app.get("/api", async (req, res) => {
  const type = req.query.type;
  if (type === "numbers") {
    const data = await fetchNumbers();
    return res.json(data);
  } else if (type === "sms") {
    const data = await fetchSMS();
    return res.json(data);
  } else {
    return res.status(400).json({ error: "Use ?type=numbers or ?type=sms" });
  }
});

// ================= AUTO LOGIN REFRESH =================
setInterval(() => { if (!sesskey) login(); }, 120000); // every 2 min

// ================= START SERVER =================
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await login();
});
