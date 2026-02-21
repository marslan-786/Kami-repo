const express = require("express");
const axios = require("axios");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE = "http://167.114.117.67/ints"; // Goat panel base URL
const USER = "teamlegend097";
const PASS = "teamlegend097";

let cookie = "";

/* ================= AXIOS CLIENT ================= */
const client = axios.create({
  baseURL: BASE,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile Safari/537.36"
  },
  validateStatus: () => true
});

/* ================= LOGIN ================= */
async function login() {
  cookie = "";

  const page = await client.get("/login");
  const set = page.headers["set-cookie"];
  if (set) cookie = set.map(c => c.split(";")[0]).join("; ");

  const match = page.data.match(/What is (\d+) \+ (\d+)/i);
  const capt = match ? Number(match[1]) + Number(match[2]) : 0;

  const res = await client.post(
    "/signin",
    `username=${USER}&password=${PASS}&capt=${capt}`,
    {
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${BASE}/login`
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

  const ts = Date.now();
  const res = await client.get(
    `/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1&_=${ts}`,
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  const data = res.data;

  if (!data.aaData) return data;

  // Fix numbers structure
  data.aaData = data.aaData.map(r => [
    r[1],
    "",
    r[3],
    "Weekly",
    clean(r[4] || ""),
    clean(r[7] || "")
  ]);

  return data;
}

/* ================= FETCH SMS ================= */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getSMS() {
  if (!cookie) await login();

  const d = today();
  const ts = Date.now();

  const res = await client.get(
    `/agent/res/data_smscdr.php?fdate1=${d}%2000:00:00&fdate2=${d}%2023:59:59&iDisplayLength=5000&_=${ts}`,
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  const data = res.data;

  if (!data.aaData) return data;

  // Fix null/empty message fields
  data.aaData = data.aaData.map(r => {
    if (!r[4] && r[5]) {
      r[4] = r[5];
      r.splice(5, 1);
    }
    return r;
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
    res.json({ error: "Session expired — retry next request" });
  }
});

module.exports = router;
