const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

const cookieJar = new CookieJar();
const client = got.extend({
    cookieJar,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
    },
    retry: { limit: 2 }
});

const TARGET_HOST = 'http://139.99.63.204';
const LOGIN_URL = `${TARGET_HOST}/ints/login`;
const SIGNIN_URL = `${TARGET_HOST}/ints/signin`;
const DATA_URL = `${TARGET_HOST}/ints/agent/res/data_smsnumbers.php`;

const SMS_API_URL = 'http://51.77.216.195/crapi/dgroup/viewstats?token=Q1JQRzRSQopDbYh8U3iRWItnlGtpVVJehnJYQVaBmYJYU4tqaX-J==&records=100';

const USERNAME = process.env.PANEL_USER || 'teamlegend097';
const PASSWORD = process.env.PANEL_PASS || 'teamlegend097';

let numbersCache = null;
let numbersLastFetch = 0;
const NUMBERS_CACHE_TIME = 5 * 60 * 1000;

let smsCache = null;
let smsLastFetch = 0;
const SMS_CACHE_TIME = 5000;

// ---------------- HELPERS ----------------

function getCountryFromNumber(number) {
    try {
        const str = number.toString().startsWith('+') ? number.toString() : '+' + number;
        const phone = parsePhoneNumber(str);
        if (phone && phone.country) {
            const dn = new Intl.DisplayNames(['en'], { type: 'region' });
            return dn.of(phone.country);
        }
        return "International";
    } catch {
        return "International";
    }
}

function fixSmsMessage(msg) {
    if (!msg) return "";
    return msg.replace(/(\d)n/g, '$1 ').replace(/\n/g, ' ');
}

async function ensureLoggedIn() {
    const loginPage = await client.get(LOGIN_URL);
    const $ = cheerio.load(loginPage.body);
    const labelText = $('label:contains("What is")').text();
    const match = labelText.match(/(\d+)\s*\+\s*(\d+)/);
    const capt = match ? parseInt(match[1]) + parseInt(match[2]) : 0;

    await client.post(SIGNIN_URL, {
        form: { username: USERNAME, password: PASSWORD, capt },
        headers: { Referer: LOGIN_URL }
    });
}

// ---------------- ROUTES ----------------

app.get('/', (req, res) => {
    res.send('Panel Proxy Running');
});

// -------- NUMBERS API (UPDATED SYSTEM) --------

app.get('/api/numbers', async (req, res) => {
    try {
        const now = Date.now();
        if (numbersCache && now - numbersLastFetch < NUMBERS_CACHE_TIME) {
            return res.json(numbersCache);
        }

        await ensureLoggedIn();

        const searchParams = new URLSearchParams({
            frange: '',
            fclient: '',
            sEcho: 2,
            iColumns: 8,
            sColumns: ',,,,,,,',
            iDisplayStart: 0,
            iDisplayLength: -1,

            mDataProp_0: 0, sSearch_0: '', bRegex_0: false, bSearchable_0: true, bSortable_0: false,
            mDataProp_1: 1, sSearch_1: '', bRegex_1: false, bSearchable_1: true, bSortable_1: true,
            mDataProp_2: 2, sSearch_2: '', bRegex_2: false, bSearchable_2: true, bSortable_2: true,
            mDataProp_3: 3, sSearch_3: '', bRegex_3: false, bSearchable_3: true, bSortable_3: true,
            mDataProp_4: 4, sSearch_4: '', bRegex_4: false, bSearchable_4: true, bSortable_4: true,
            mDataProp_5: 5, sSearch_5: '', bRegex_5: false, bSearchable_5: true, bSortable_5: true,
            mDataProp_6: 6, sSearch_6: '', bRegex_6: false, bSearchable_6: true, bSortable_6: true,
            mDataProp_7: 7, sSearch_7: '', bRegex_7: false, bSearchable_7: true, bSortable_7: false,

            sSearch: '',
            bRegex: false,
            iSortCol_0: 0,
            sSortDir_0: 'asc',
            iSortingCols: 1,
            _: Date.now()
        });

        const response = await client.get(
            `${DATA_URL}?${searchParams.toString()}`,
            {
                headers: {
                    Referer: `${TARGET_HOST}/ints/agent/SMSNumberStats`,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                responseType: 'json'
            }
        );

        const rawData = response.body;

        if (rawData.aaData && Array.isArray(rawData.aaData)) {
            rawData.aaData = rawData.aaData.map(item => {
                const number = item[0];
                const country = getCountryFromNumber(number);
                const currency = item[2];
                const price = item[3];

                return [
                    country,
                    "",
                    number,
                    "OTP",
                    `${currency} ${price}`,
                    "SD : <b>0</b> | SW : <b>0</b>"
                ];
            });
        }

        numbersCache = rawData;
        numbersLastFetch = now;
        res.json(numbersCache);

    } catch (e) {
        if (numbersCache) return res.json(numbersCache);
        res.status(500).json({ error: 'Failed' });
    }
});

// -------- SMS API --------

app.get('/api/sms', async (req, res) => {
    try {
        const now = Date.now();
        if (smsCache && now - smsLastFetch < SMS_CACHE_TIME) {
            return res.json(smsCache);
        }

        const response = await got.get(SMS_API_URL, { responseType: 'text' });
        let raw = JSON.parse(response.body);

        const formatted = raw.map(item => ([
            item[3],
            getCountryFromNumber(item[1]),
            item[1],
            item[0],
            fixSmsMessage(item[2]),
            "$",
            "0.005",
            ""
        ]));

        formatted.push(["0,0.05,0,0,0,0,0,0.05,0,0,100%,0,9", 0, 0, 0, "", "$", 0, 0]);

        smsCache = {
            sEcho: 1,
            iTotalRecords: formatted.length.toString(),
            iTotalDisplayRecords: formatted.length.toString(),
            aaData: formatted
        };

        smsLastFetch = now;
        res.json(smsCache);

    } catch (e) {
        if (smsCache) return res.json(smsCache);
        res.json({ sEcho: 1, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
