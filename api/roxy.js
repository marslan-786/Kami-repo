const express = require("express");
const axios = require("axios");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE = "http://167.114.209.78/roxy";
const USER = "Kamibroken";
const PASS = "Kamran5.";

let cookie = "";

/* ================= AXIOS CLIENT ================= */
const client = axios.create({
  baseURL: BASE,
  headers: {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile"
  },
  validateStatus: () => true
});

/* ================= LOGIN ================= */
async function login() {
  cookie = "";

  const page = await client.get("/Login");
  const set = page.headers["set-cookie"];
  if (set) cookie = set.map(c => c.split(";")[0]).join("; ");

  const match = page.data.match(/What is (\d+) \+ (\d+)/i);
  const capt = match ? Number(match[1]) + Number(match[2]) : 6;

  const res = await client.post(
    "/signin",
    `username=${USER}&password=${PASS}&capt=${capt}`,
    {
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  if (res.headers["set-cookie"]) {
    cookie += "; " + res.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
  }
}

/* ================= CLEAN HTML ================= */
function clean(text = "") {
  return text.replace(/<[^>]+>/g, "").trim();
}

/* ================= FETCH NUMBERS ================= */
async function getNumbers() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1",
    {
      headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" }
    }
  );

  const data = res.data;

  // Roxy-style clean numbers
  data.aaData = data.aaData.map(r => [
    clean(r[0]),    // Service Name
    "",             // Blank column
    clean(r[2]),    // Number
    "Weekly",       // Type
    clean(r[4] || ""), // Extra info (if any)
    clean(r[5] || "")  // Price / other
  ]);

  return data;
}

/* ================= FETCH SMS / OTP ================= */
async function getSMS() {
  if (!cookie) await login();

  const today = new Date();
  const fdate1 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")} 00:00:00`;
  const fdate2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")} 23:59:59`;

  const res = await client.get(
    `/agent/res/data_smscdr.php?fdate1=${encodeURIComponent(fdate1)}&fdate2=${encodeURIComponent(fdate2)}&iDisplayLength=2000`,
    {
      headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" }
    }
  );

  const data = res.data;

  // Roxy-style clean SMS messages
  data.aaData = data.aaData.map(r => {
    // Ensure OTP message is column 4
    if ((!r[4] || r[4].trim() === "") && r[5]) {
      r[4] = r[5];
    }

    // Remove unwanted legendhacker text
    r[4] = (r[4] || "").replace(/legendhacker/gi, "").trim();

    // Optional: remove extra columns / fill blanks
    r[5] = r[5] || "";
    r[6] = r[6] || "$";
    r[7] = r[7] || 0;

    return r.slice(0, 8); // max 8 columns
  });

  return data;
}

/* ================= AUTO REFRESH ================= */
setInterval(() => login(), 10 * 60 * 1000); // every 10 minutes

/* ================= API ROUTE ================= */
router.get("/", async (req, res) => {
  const type = req.query.type;

  try {
    if (!cookie) await login();

    if (type === "numbers") return res.json(await getNumbers());
    if (type === "sms") return res.json(await getSMS());

    res.json({ error: "Use ?type=numbers OR ?type=sms" });
  } catch (e) {
    cookie = "";
    res.json({ error: "Session expired — retrying next request" });
  }
});

module.exports = router;
