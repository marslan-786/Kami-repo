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
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile",
  },
  validateStatus: () => true,
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
        "Content-Type": "application/x-www-form-urlencoded",
      },
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

/* ================= FIX NUMBERS ================= */
function fixNumbers(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => {
    const number = row[3] || "";
    let range = row[1] || "";

    // Auto-detect country from number prefix
    let country = "";
    if (number.startsWith("20")) country = "Egypt";
    else if (number.startsWith("221")) country = "Senegal";
    else if (number.startsWith("233")) country = "Ghana";
    else if (number.startsWith("60")) country = "Malaysia";
    else country = "";

    return [
      `${country} ${range}`.trim(), // Country + Range
      "", // blank column
      number,
      "Weekly",
      clean(row[4] || "Weekly$ 0.01"),
      clean(row[7] || "SD : 0 | SW : 0"),
    ];
  });

  return data;
}

/* ================= FETCH NUMBERS ================= */
async function getNumbers() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1",
    {
      headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
    }
  );

  return fixNumbers(res.data);
}

/* ================= FETCH SMS ================= */
async function getSMS() {
  if (!cookie) await login();

  const today = new Date();
  const fdate1 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")} 00:00:00`;
  const fdate2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")} 23:59:59`;

  const res = await client.get(
    `/agent/res/data_smscdr.php?fdate1=${encodeURIComponent(fdate1)}&fdate2=${encodeURIComponent(fdate2)}&iDisplayLength=5000`,
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  const data = res.data;

  data.aaData = data.aaData.map(r => {
    if ((!r[4] || r[4].trim() === "") && r[5]) {
      r[4] = r[5]; // Move OTP/message to 4th index
    }

    r[4] = (r[4] || "").replace(/legendhacker/gi, "").trim(); // remove unwanted text
    r[5] = r[5] || "";
    r[6] = r[6] || "$";
    r[7] = r[7] || 0;

    return r.slice(0,8);
  });

  return data;
}

/* ================= AUTO REFRESH ================= */
setInterval(() => login(), 10 * 60 * 1000); // every 10 min

/* ================= API ROUTE ================= */
router.get("/", async (req, res) => {
  const type = req.query.type;
  if (!type) return res.json({ error: "Use ?type=numbers OR ?type=sms" });

  try {
    if (!cookie) await login();

    if (type === "numbers") return res.json(await getNumbers());
    if (type === "sms") return res.json(await getSMS());

    res.json({ error: "Invalid type" });
  } catch (e) {
    cookie = "";
    res.json({ error: "Session expired — retrying next request" });
  }
});

module.exports = router;
