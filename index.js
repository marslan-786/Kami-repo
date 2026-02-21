const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

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

/* ================= NUMBERS ================= */

async function getNumbers() {
  const res = await client.get(
    "/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1",
    {
      headers: {
        Cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
      },
    }
  );

  const data = res.data;

  data.aaData = data.aaData.map(r => [
    r[1],
    "",
    r[3],
    "Weekly",
    (r[4] || "").replace(/<[^>]+>/g, "").trim(),
    (r[7] || "").replace(/<[^>]+>/g, "").trim(),
  ]);

  return data;
}

/* ================= SMS ================= */

async function getSMS() {
  const res = await client.get(
    "/agent/res/data_smscdr.php?fdate1=2020-01-01%2000:00:00&fdate2=2099-12-31%2023:59:59&iDisplayLength=2000",
    {
      headers: {
        Cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
      },
    }
  );

  const data = res.data;

  data.aaData = data.aaData.map(r => {
    if (r[4] === null && r[5]) {
      r[4] = r[5];
      r.splice(5, 1);
    }
    return r;
  });

  return data;
}

/* ================= AUTO REFRESH LOGIN ================= */

setInterval(login, 10 * 60 * 1000);

/* ================= API ================= */

app.get("/api", async (req, res) => {
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

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("🚀 AUTO PANEL RUNNING");
});
