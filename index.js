const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

const CREDENTIALS = {
    username: "Kami521",
    password: "Kami526"
};

const BASE_URL = "http://51.89.99.105/NumberPanel";
const STATS_PAGE_URL = `${BASE_URL}/client/SMSCDRStats`;

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE_URL
};

let STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false,
    lastLogin: 0
};

function extractKey(html) {
    let match = html.match(/sesskey=([^&"']+)/);
    if (match) return match[1];
    return null;
}

async function performLogin() {
    if (STATE.isLoggingIn) return;
    STATE.isLoggingIn = true;

    console.log("🔄 Performing Login...");

    try {
        const instance = axios.create({ headers: COMMON_HEADERS });

        const r1 = await instance.get(`${BASE_URL}/login`);

        let cookie = r1.headers['set-cookie']
            ?.find(c => c.includes('PHPSESSID'))
            ?.split(';')[0];

        const match = r1.data.match(/What is (\d+) \+ (\d+)/);
        const ans = parseInt(match[1]) + parseInt(match[2]);

        const params = new URLSearchParams();
        params.append('username', CREDENTIALS.username);
        params.append('password', CREDENTIALS.password);
        params.append('capt', ans);

        const r2 = await instance.post(`${BASE_URL}/signin`, params, {
            headers: { Cookie: cookie }
        });

        if (r2.headers['set-cookie']) {
            cookie = r2.headers['set-cookie']
                .find(c => c.includes('PHPSESSID'))
                ?.split(';')[0];
        }

        STATE.cookie = cookie;
        STATE.lastLogin = Date.now();

        console.log("✅ Login success");

        const r3 = await axios.get(STATS_PAGE_URL, {
            headers: { Cookie: STATE.cookie }
        });

        STATE.sessKey = extractKey(r3.data);

        console.log("🔥 SessKey:", STATE.sessKey);

    } catch (e) {
        console.log("❌ Login failed:", e.message);
    }

    STATE.isLoggingIn = false;
}

async function ensureLogin() {
    if (!STATE.cookie || !STATE.sessKey) {
        await performLogin();
    }
}

async function fetchWithAutoRelogin(url, referer) {
    await ensureLogin();

    try {
        const res = await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                Cookie: STATE.cookie,
                Referer: referer
            },
            responseType: 'arraybuffer'
        });

        const text = res.data.subarray(0, 500).toString();

        // SESSION EXPIRED DETECT
        if (text.includes("<html") || text.includes("login")) {
            console.log("⚠️ Session expired -> re-login");

            await performLogin();

            // retry once
            return await axios.get(url, {
                headers: {
                    ...COMMON_HEADERS,
                    Cookie: STATE.cookie,
                    Referer: referer
                }
            });
        }

        return res;

    } catch (e) {
        console.log("⚠️ Request error -> re-login");

        await performLogin();

        return await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                Cookie: STATE.cookie,
                Referer: referer
            }
        });
    }
}

app.get('/api', async (req, res) => {
    const type = req.query.type;
    const ts = Date.now();

    let url, referer;

    if (type === "numbers") {
        referer = `${BASE_URL}/client/MySMSNumbers`;
        url = `${BASE_URL}/client/res/data_smsnumbers.php?_=${ts}`;
    }
    else if (type === "sms") {
        referer = `${BASE_URL}/client/SMSCDRStats`;
        url = `${BASE_URL}/client/res/data_smscdr.php?sesskey=${STATE.sessKey}&_=${ts}`;
    }
    else {
        return res.send("Use ?type=sms or numbers");
    }

    try {
        const response = await fetchWithAutoRelogin(url, referer);

        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(PORT, async () => {
    console.log("🚀 Server Started");
    await performLogin();
});            headers: { 'Referer': `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`, 'X-Requested-With': 'XMLHttpRequest' },
            responseType: 'json' 
        });

        const rawData = response.body;

        // Transformation
        if (rawData.aaData && Array.isArray(rawData.aaData)) {
            rawData.aaData = rawData.aaData.map(item => {
                const number = item[0];
                const countryName = getCountryFromNumber(number);
                const currency = item[2];
                const price = item[3];
                
                return [
                    countryName,                            // 0
                    "",                                     // 1
                    number,                                 // 2
                    "OTP",                                  // 3
                    `${currency} ${price}`,                 // 4
                    "SD : <b>0</b> | SW : <b>0</b> "        // 5
                ];
            });
        }

        // Cache Update
        numbersCache = rawData;
        numbersLastFetch = currentTime;
        
        res.json(numbersCache);

    } catch (error) {
        console.error('Numbers API Error:', error.message);
        // اگر ایرر آئے تو کوشش کرو کہ پرانا کیش ہی بھیج دو تاکہ ایپ کریش نہ ہو
        if (numbersCache) return res.json(numbersCache);
        res.status(500).json({ error: 'Failed' });
    }
});

// 2. SMS API (5 Second Cache Logic)
app.get('/api/sms', async (req, res) => {
    try {
        const currentTime = Date.now();

        // ** Strict 5 Second Lock **
        // اگر ڈیٹا موجود ہے اور 5 سیکنڈ نہیں گزرے تو فورا پرانا ڈیٹا بھیجو
        // پیچھے ریکویسٹ بھیجنے کی ضرورت ہی نہیں
        if (smsCache && (currentTime - smsLastFetch < SMS_CACHE_TIME)) {
            // console.log('Serving SMS from Cache (Saving Spam)');
            return res.json(smsCache);
        }

        // اگر 5 سیکنڈ گزر گئے، تبھی نئی ریکویسٹ بھیجو
        const response = await got.get(SMS_API_URL, { responseType: 'text' });
        
        let rawData;
        try {
            rawData = JSON.parse(response.body);
        } catch (e) {
            console.error("Non-JSON Response from SMS API");
            // اگر JSON خراب ہے اور ہمارے پاس پرانا Cache ہے، تو وہی بھیج دو
            if (smsCache) return res.json(smsCache);
            return res.send(response.body);
        }

        if (!Array.isArray(rawData)) {
            if (smsCache) return res.json(smsCache);
            return res.json(rawData);
        }

        // Formatting
        const formattedData = rawData.map(item => {
            const cleanMessage = fixSmsMessage(item[2]);
            const country = getCountryFromNumber(item[1]);

            return [
                item[3],        // 0. Date
                country,        // 1. Country
                item[1],        // 2. Phone
                item[0],        // 3. Service
                cleanMessage,   // 4. Message
                "$",            // 5. Currency
                "0.005",        // 6. Price
                ""              // 7. Extra
            ];
        });

        // Footer
        formattedData.push([ "0,0.05,0,0,0,0,0,0.05,0,0,100%,0,9", 0, 0, 0, "", "$", 0, 0 ]);

        const finalResponse = {
            "sEcho": 1,
            "iTotalRecords": formattedData.length.toString(),
            "iTotalDisplayRecords": formattedData.length.toString(),
            "aaData": formattedData
        };

        // Cache Update
        smsCache = finalResponse;
        smsLastFetch = currentTime;

        res.json(smsCache);

    } catch (error) {
        console.error('SMS API Logic Error:', error.message);
        // Fallback: اگر ایرر آئے تو پرانا ڈیٹا زندہ باد
        if (smsCache) return res.json(smsCache);
        res.status(500).json({ "sEcho": 1, "iTotalRecords": 0, "iTotalDisplayRecords": 0, "aaData": [] });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
