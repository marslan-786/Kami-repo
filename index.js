const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------- CONFIG ----------------
const BASE_URL = "http://51.89.99.105/NumberPanel";
const CREDENTIALS = { username: "Kami555", password: "Kami526" };
const STATS_PAGE_URL = `${BASE_URL}/client/SMSCDRStats`;

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12)",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "en-US,en;q=0.9"
};

// ---------------- GLOBAL STATE ----------------
let STATE = {
  cookie: null,
  sessKey: null,
  isLoggingIn: false
};

// ---------------- HELPERS ----------------
function getTodayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractKey(html) {
  let m = html.match(/sesskey=([^&"']+)/);
  if (m) return m[1];
  m = html.match(/sesskey\s*[:=]\s*["']([^"']+)["']/);
  if (m) return m[1];
  return null;
}

// ---------------- LOGIN & SESSKEY ----------------
async function performLogin() {
  if (STATE.isLoggingIn) return;
  STATE.isLoggingIn = true;
  try {
    const instance = axios.create({ withCredentials: true, headers: COMMON_HEADERS, timeout: 15000 });

    // 1️⃣ Login page fetch
    const r1 = await instance.get(`${BASE_URL}/login`);
    let tempCookie = "";
    if (r1.headers["set-cookie"]) {
      const c = r1.headers["set-cookie"].find(x => x.includes("PHPSESSID"));
      if (c) tempCookie = c.split(";")[0];
    }

    // 2️⃣ Solve captcha
    const match = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
    const ans = match ? parseInt(match[1]) + parseInt(match[2]) : 10;

    // 3️⃣ Post login
    const params = new URLSearchParams();
    params.append("username", CREDENTIALS.username);
    params.append("password", CREDENTIALS.password);
    params.append("capt", ans);

    const r2 = await instance.post(`${BASE_URL}/signin`, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": tempCookie, "Referer": `${BASE_URL}/login` },
      maxRedirects: 0,
      validateStatus: () => true
    });

    STATE.cookie = r2.headers["set-cookie"] ? r2.headers["set-cookie"].find(x => x.includes("PHPSESSID")).split(";")[0] : tempCookie;

    console.log("✅ Login success. Cookie:", STATE.cookie);

    // 4️⃣ Fetch sesskey
    const r3 = await axios.get(STATS_PAGE_URL, { headers: { ...COMMON_HEADERS, Cookie: STATE.cookie, Referer: `${BASE_URL}/client/SMSDashboard` } });
    STATE.sessKey = extractKey(r3.data);
    if (STATE.sessKey) console.log("🔥 SessKey FOUND:", STATE.sessKey);
    else console.log("❌ SessKey not found!");

  } catch (e) {
    console.error("❌ Login failed:", e.message);
  } finally {
    STATE.isLoggingIn = false;
  }
}

// ---------------- AUTO REFRESH ----------------
setInterval(() => performLogin(), 120000); // 2 min

// ---------------- API ----------------
app.get("/api", async (req, res) => {
  const { type } = req.query;

  if (!STATE.cookie || !STATE.sessKey) {
    await performLogin();
    if (!STATE.sessKey) return res.status(500).json({ error: "Server Error: Waiting for login..." });
  }

  const ts = Date.now();
  const today = getTodayDate();
  let targetUrl = "", specificReferer = "";

  if (type === "numbers") {
    specificReferer = `${BASE_URL}/client/MySMSNumbers`;
    targetUrl = `${BASE_URL}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;
  } else if (type === "sms") {
    specificReferer = `${BASE_URL}/client/SMSCDRStats`;
    targetUrl = `${BASE_URL}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${STATE.sessKey}&iDisplayLength=50&_=${ts}`;
  } else {
    return res.status(400).json({ error: "Invalid type. Use ?type=sms or ?type=numbers" });
  }

  try {
    const r = await axios.get(targetUrl, { headers: { ...COMMON_HEADERS, Cookie: STATE.cookie, Referer: specificReferer }, timeout: 25000 });

    let dataString = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    if (!r.data || dataString.includes("<html") || dataString.toLowerCase().includes("login")) {
      console.log("⚠️ Session expired. Re-login...");
      await performLogin();
      return res.status(503).send("Session refreshed. Try again.");
    }

    // Map response
    if (type === "numbers") {
      return res.json({
        sEcho: r.data.sEcho,
        iTotalRecords: r.data.iTotalRecords,
        iTotalDisplayRecords: r.data.iTotalDisplayRecords,
        aaData: r.data.aaData.map(r => ({
          id: r[0],
          number: r[1],
          country: r[2],
          service: r[3],
          status: r[4]
        }))
      });
    } else if (type === "sms") {
      return res.json({
        sEcho: r.data.sEcho,
        iTotalRecords: r.data.iTotalRecords,
        iTotalDisplayRecords: r.data.iTotalDisplayRecords,
        aaData: r.data.aaData.map(r => ({
          time: r[0],
          number: r[2],
          service: r[3],
          message: r[4]
        }))
      });
    }

  } catch (e) {
    console.error("❌ API error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ---------------- START SERVER ----------------
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await performLogin();
});
