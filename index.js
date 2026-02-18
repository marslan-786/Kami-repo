const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIG ---
const BASE = "http://51.89.99.105/NumberPanel";
const CREDENTIALS = { username: "Kami555", password: "Kami526" };

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12)",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "en-US,en;q=0.9",
};

let cookies = "";
let sesskey = "";
let isLoggingIn = false;

// --- HELPER: LOGIN & FETCH SESSKEY ---
async function login() {
  if (isLoggingIn) return;
  isLoggingIn = true;
  try {
    console.log("🔄 Logging in...");

    const instance = axios.create({ withCredentials: true, headers: COMMON_HEADERS, timeout: 15000 });

    // 1. Get login page (for captcha + cookie)
    const r1 = await instance.get(`${BASE}/login`);
    let tempCookie = "";
    if (r1.headers["set-cookie"]) {
      const c = r1.headers["set-cookie"].find((x) => x.includes("PHPSESSID"));
      if (c) tempCookie = c.split(";")[0];
    }

    // 2. Solve captcha (if exists)
    let ans = "10";
    const m = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
    if (m) ans = parseInt(m[1]) + parseInt(m[2]);

    // 3. Post login
    const params = new URLSearchParams();
    params.append("username", CREDENTIALS.username);
    params.append("password", CREDENTIALS.password);
    params.append("capt", ans);

    const r2 = await instance.post(`${BASE}/signin`, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: tempCookie,
        Referer: `${BASE}/login`,
      },
      maxRedirects: 0,
      validateStatus: () => true,
    });

    cookies = r2.headers["set-cookie"]?.find((x) => x.includes("PHPSESSID"))?.split(";")[0] || tempCookie;

    // 4. Get sesskey from stats page
    const r3 = await axios.get(`${BASE}/client/SMSCDRStats`, {
      headers: { ...COMMON_HEADERS, Cookie: cookies, Referer: `${BASE}/client/SMSDashboard` },
    });

    const sk = r3.data.match(/sesskey=([^&"']+)/);
    sesskey = sk ? sk[1] : "";

    if (!sesskey) console.log("❌ SessKey not found!");
    else console.log("✅ Login success. SessKey:", sesskey);
  } catch (e) {
    console.log("❌ Login error:", e.message);
    sesskey = "";
  } finally {
    isLoggingIn = false;
  }
}

// --- AUTO REFRESH LOGIN ---
setInterval(() => {
  login();
}, 120000); // 2 minutes

// --- GET TODAY DATE ---
function getTodayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ================= API ENDPOINT =================
app.get("/api", async (req, res) => {
  const { type } = req.query;

  if (!cookies || !sesskey) await login();
  if (!sesskey) return res.status(500).json({ error: "Waiting for login..." });

  try {
    const ts = Date.now();
    let targetUrl = "";
    let referer = "";

    if (type === "numbers") {
      // 🔹 Numbers API
      referer = `${BASE}/client/MySMSNumbers`;
      targetUrl = `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&iDisplayStart=0&iDisplayLength=-1&_=${ts}`;
    } else if (type === "sms") {
      // 🔹 SMS API
      const today = getTodayDate();
      referer = `${BASE}/client/SMSCDRStats`;
      targetUrl = `${BASE}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${sesskey}&iDisplayLength=50&_=${ts}`;
    } else {
      return res.status(400).json({ error: "Invalid type. Use ?type=numbers or ?type=sms" });
    }

    const r = await axios.get(targetUrl, {
      headers: { ...COMMON_HEADERS, Cookie: cookies, "X-Requested-With": "XMLHttpRequest", Referer: referer },
      responseType: "json",
      timeout: 25000,
    });

    if (!r.data.aaData || r.data.aaData.length === 0) return res.json([]);

    if (type === "numbers") {
      // 🔹 Return raw aaData exactly as panel returns
      return res.json(r.data.aaData);
    } else {
      // 🔹 Map SMS
      return res.json(
        r.data.aaData.map((r) => ({
          time: r[0],
          number: r[2],
          service: r[3],
          message: r[4],
        }))
      );
    }
  } catch (e) {
    console.log("❌ Fetch error:", e.message);
    sesskey = "";
    return res.status(500).json({ error: e.message });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  login();
});
