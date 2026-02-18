const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIGURATION ---
const BASE = "http://51.89.99.105/NumberPanel";
const STATS_PAGE_URL = `${BASE}/client/SMSCDRStats`;

const CREDENTIALS = {
  username: "Kami555",
  password: "Kami526"
};

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12)",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "en-US,en;q=0.9"
};

// --- GLOBAL STATE ---
let STATE = {
  cookie: null,
  sesskey: null,
  isLoggingIn: false
};

// --- HELPER: FIND KEY IN HTML ---
function extractKey(html) {
  let match = html.match(/sesskey=([^&"']+)/);
  if (match) return match[1];
  match = html.match(/sesskey\s*[:=]\s*["']([^"']+)["']/);
  if (match) return match[1];
  return null;
}

// --- LOGIN & SESSKEY FETCH ---
async function login() {
  if (STATE.isLoggingIn) return;
  STATE.isLoggingIn = true;
  try {
    const instance = axios.create({ withCredentials: true, headers: COMMON_HEADERS, timeout: 15000 });

    // 1️⃣ Get login page
    const r1 = await instance.get(`${BASE}/login`);
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

    const r2 = await instance.post(`${BASE}/signin`, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: tempCookie, Referer: `${BASE}/login` },
      maxRedirects: 0,
      validateStatus: () => true
    });

    // 4️⃣ Save cookie
    if (r2.headers["set-cookie"]) {
      const newC = r2.headers["set-cookie"].find(x => x.includes("PHPSESSID"));
      if (newC) STATE.cookie = newC.split(";")[0];
    } else {
      STATE.cookie = tempCookie;
    }

    console.log("✅ Login success:", STATE.cookie);

    // 5️⃣ Get sesskey
    const r3 = await axios.get(STATS_PAGE_URL, {
      headers: { ...COMMON_HEADERS, Cookie: STATE.cookie, Referer: `${BASE}/client/SMSDashboard` }
    });
    STATE.sesskey = extractKey(r3.data);
    if (STATE.sesskey) console.log("🔥 SessKey:", STATE.sesskey);
    else console.log("❌ SessKey not found");

  } catch (e) {
    console.log("❌ Login error:", e.message);
  } finally {
    STATE.isLoggingIn = false;
  }
}

// --- AUTO REFRESH ---
setInterval(() => {
  if (!STATE.sesskey) login();
}, 120000);

// --- API ENDPOINT ---
app.get("/api", async (req, res) => {
  const { type } = req.query;

  if (!STATE.cookie || !STATE.sesskey) {
    await login();
    if (!STATE.sesskey) return res.status(500).json({ error: "Waiting for login..." });
  }

  const ts = Date.now();
  let targetUrl = "";
  let referer = "";

  if (type === "numbers") {
    referer = `${BASE}/client/MySMSNumbers`;
    targetUrl = `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;
  } else if (type === "sms") {
    referer = `${BASE}/client/SMSCDRStats`;
    const today = new Date().toISOString().split("T")[0];
    targetUrl = `${BASE}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${STATE.sesskey}&iDisplayLength=50&_=${ts}`;
  } else {
    return res.status(400).json({ error: "Use ?type=numbers or ?type=sms" });
  }

  try {
    const r = await axios.get(targetUrl, { headers: { ...COMMON_HEADERS, Cookie: STATE.cookie, Referer: referer } });

    // Re-login if session expired
    if (!r.data || r.data.includes("<html") || r.data.includes("login")) {
      console.log("⚠️ Session expired, re-login...");
      await login();
      return res.status(503).send("Session refreshed. Try again.");
    }

    // Map response according to requested type
    if (type === "numbers") {
      res.json({
        sEcho: 2,
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
      res.json({
        sEcho: 2,
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
    console.log("❌ Fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  login();
});
