const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIGURATION ---
const CREDENTIALS = { username: "Kami555", password: "Kami526" };
const BASE = "http://51.89.99.105/NumberPanel";
const STATS_PAGE_URL = `${BASE}/client/SMSCDRStats`;

let sesskey = "";
let cookies = "";

// --- COMMON HEADERS ---
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12)",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "en-US,en;q=0.9"
};

// --- LOGIN ---
async function login() {
  try {
    const r1 = await axios.get(`${BASE}/login`, { headers: HEADERS });
    let tempCookie = r1.headers['set-cookie']?.find(x => x.includes('PHPSESSID'))?.split(';')[0] || "";

    // Solve captcha
    const cap = r1.data.match(/What is (\d+) \+ (\d+)/);
    const ans = cap ? parseInt(cap[1]) + parseInt(cap[2]) : 10;

    // POST login
    const r2 = await axios.post(`${BASE}/signin`, new URLSearchParams({
      username: CREDENTIALS.username,
      password: CREDENTIALS.password,
      capt: ans
    }), {
      headers: { ...HEADERS, Cookie: tempCookie, Referer: `${BASE}/login` },
      maxRedirects: 0,
      validateStatus: () => true
    });

    cookies = r2.headers['set-cookie']?.find(x => x.includes('PHPSESSID'))?.split(';')[0] || tempCookie;

    // Get sesskey
    const r3 = await axios.get(STATS_PAGE_URL, { headers: { ...HEADERS, Cookie: cookies, Referer: `${BASE}/client/SMSDashboard` } });
    const m = r3.data.match(/sesskey=([^&"']+)/);
    sesskey = m ? m[1] : "";
    console.log("✅ Login success | SessKey:", sesskey);

  } catch (e) {
    console.error("❌ Login failed:", e.message);
    sesskey = "";
  }
}

// ================= FETCH NUMBERS =================
async function fetchNumbers() {
  try {
    if (!sesskey) await login();
    const ts = Date.now();

    const url = `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&iSortCol_0=0&sSortDir_0=asc&_=${ts}`;

    const res = await axios.get(url, { headers: { ...HEADERS, Cookie: cookies, Referer: `${BASE}/client/MySMSNumbers` } });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      number: r[2],
      package: r[3],
      balance: r[4],
      stats: r[5].replace(/<[^>]*>/g, "")
    }));

  } catch (e) {
    sesskey = "";
    return [];
  }
}

// ================= FETCH SMS =================
async function fetchSMS() {
  try {
    if (!sesskey) await login();

    const today = new Date().toISOString().split("T")[0];
    const url =
      `${BASE}/client/res/data_smscdr.php?` +
      `fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59` +
      `&sesskey=${sesskey}&iDisplayLength=50&_=${Date.now()}`;

    const res = await axios.get(url, {
      headers: { Cookie: cookies, "X-Requested-With": "XMLHttpRequest" }
    });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      time: r[0],
      number: r[2],
      service: r[3],
      message: r[4]
    }));

  } catch (e) {
    sesskey = "";
    return [];
  }
}

// ================= API ENDPOINT =================
app.get('/api', async (req, res) => {
  const { type } = req.query;

  if (!sesskey) await login();
  if (!sesskey) return res.status(500).json({ error: "Login failed" });

  try {
    if (type === "numbers") {
      const numbers = await fetchNumbers();
      return res.json({ total: numbers.length, numbers });

    } else if (type === "sms") {
      const sms = await fetchSMS();
      return res.json({ total: sms.length, sms });

    } else {
      return res.status(400).json({ error: "Invalid type. Use ?type=numbers or ?type=sms" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  login(); // initial login
});
