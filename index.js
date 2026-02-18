const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

// ================= CONFIG =================
const BASE_URL = "http://51.89.99.105/NumberPanel";
const CREDENTIALS = {
  username: "Kami521",
  password: "Kami526"
};

const STATS_PAGE_URL = `${BASE_URL}/client/SMSCDRStats`;
const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12)",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "en-US,en;q=0.9"
};

// ================= GLOBAL STATE =================
let STATE = {
  cookie: null,
  sessKey: null,
  isLoggingIn: false
};

// ================= HELPERS =================
function extractSessKey(html) {
  let match = html.match(/sesskey=([^&"']+)/);
  if (match) return match[1];

  match = html.match(/sesskey\s*[:=]\s*["']([^"']+)["']/);
  if (match) return match[1];

  return null;
}

// ================= LOGIN FUNCTION =================
async function login() {
  if (STATE.isLoggingIn) return;
  STATE.isLoggingIn = true;

  try {
    const instance = axios.create({ withCredentials: true, headers: COMMON_HEADERS, timeout: 15000 });

    // 1️⃣ Login Page (cookies + captcha)
    const r1 = await instance.get(`${BASE_URL}/login`);
    let tempCookie = "";
    if (r1.headers["set-cookie"]) {
      const c = r1.headers["set-cookie"].find(x => x.includes("PHPSESSID"));
      if (c) tempCookie = c.split(";")[0];
    }

    const capMatch = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
    const ans = capMatch ? parseInt(capMatch[1]) + parseInt(capMatch[2]) : 10;

    // 2️⃣ Post Login
    const params = new URLSearchParams();
    params.append("username", CREDENTIALS.username);
    params.append("password", CREDENTIALS.password);
    params.append("capt", ans);

    const r2 = await instance.post(`${BASE_URL}/signin`, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: tempCookie,
        Referer: `${BASE_URL}/login`
      },
      maxRedirects: 0,
      validateStatus: () => true
    });

    if (r2.headers["set-cookie"]) {
      const newC = r2.headers["set-cookie"].find(x => x.includes("PHPSESSID"));
      STATE.cookie = newC ? newC.split(";")[0] : tempCookie;
    } else {
      STATE.cookie = tempCookie;
    }

    // 3️⃣ Fetch Stats Page to get sessKey
    const r3 = await axios.get(STATS_PAGE_URL, {
      headers: { ...COMMON_HEADERS, Cookie: STATE.cookie, Referer: `${BASE_URL}/client/SMSDashboard` }
    });

    const key = extractSessKey(r3.data);
    if (key) STATE.sessKey = key;

    console.log("✅ Login Success, sessKey:", STATE.sessKey);

  } catch (e) {
    console.error("❌ Login Error:", e.message);
  } finally {
    STATE.isLoggingIn = false;
  }
}

// ================= AUTO REFRESH =================
setInterval(() => {
  login();
}, 120000); // 2 min

// ================= API ENDPOINT =================
app.get("/api", async (req, res) => {
  const { type } = req.query;
  if (!STATE.cookie || !STATE.sessKey) await login();

  const ts = Date.now();
  const today = new Date().toISOString().split("T")[0];
  let targetUrl = "";
  let referer = "";

  try {
    if (type === "numbers") {
      referer = `${BASE_URL}/client/MySMSNumbers`;
      targetUrl = `${BASE_URL}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;
    } else if (type === "sms") {
      referer = `${BASE_URL}/client/SMSCDRStats`;
      targetUrl = `${BASE_URL}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${STATE.sessKey}&iDisplayLength=50&_=${ts}`;
    } else {
      return res.status(400).json({ error: "Invalid type. Use ?type=numbers or ?type=sms" });
    }

    const r = await axios.get(targetUrl, { headers: { ...COMMON_HEADERS, Cookie: STATE.cookie, Referer: referer }, timeout: 25000 });

    // Check session expired
    const dataCheck = r.data.subarray ? r.data.subarray(0, 1000).toString() : JSON.stringify(r.data).slice(0, 1000);
    if (dataCheck.includes("<html") || dataCheck.includes("login")) {
      await login();
      return res.status(503).send("Session refreshed. Try again.");
    }

    // ================= FORMAT RESPONSE =================
    if (type === "numbers") {
      const aaData = r.data.aaData || [];
      return res.json({
        sEcho: 2,
        iTotalRecords: aaData.length.toString(),
        iTotalDisplayRecords: aaData.length.toString(),
        aaData: aaData.map(r => [r[0], r[1], r[2], r[3], r[4], r[5]])
      });
    } else if (type === "sms") {
      const aaData = r.data.aaData || [];
      return res.json({
        aaData: aaData.map(r => ({
          time: r[0],
          number: r[2],
          service: r[3],
          message: r[4]
        }))
      });
    }

  } catch (e) {
    console.error("❌ API Fetch Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  login();
});
