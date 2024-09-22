var querystring = require('querystring');
const axios = require('axios');
const { OpenAI } = require('openai');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const deepl = require('deepl-node');
const translator = new deepl.Translator(process.env.DEEPL_KEY);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Google request helper
 * 
 * @param {{ url: string, message: string }} data 
 * @returns {Promise<{data: Buffer, headers: string}>}
 */
async function request(data){
    const { url, headers, message, agent, proxy } = data;
    const data_return = await axios.post(url,
        message,
        {
            responseType: "arraybuffer",
            headers: headers,
            httpsAgent: agent,
            proxy: proxy
        })
        .catch(error => {
            // Handle Error Here
            console.log(error);
            console.log(`\x1b[31m[Error]\x1b[39m on creating request to ${url}.`);
            return { data: "[[]]", headers: "" };
        });
    const buff_data = Buffer.from(data_return.data);
    return { data: buff_data, headers: data_return.headers };
}

/**
 * Google language code to ISO 639-1
 * @enum {string}
 */
const languages = {
    'auto': 'Automatic',
    'af': 'Afrikaans',
    'sq': 'Albanian',
    'am': 'Amharic',
    'ar': 'Arabic',
    'hy': 'Armenian',
    'az': 'Azerbaijani',
    'eu': 'Basque',
    'be': 'Belarusian',
    'bn': 'Bengali',
    'bs': 'Bosnian',
    'bg': 'Bulgarian',
    'ca': 'Catalan',
    'ceb': 'Cebuano',
    'ny': 'Chichewa',
    'zh-cn': 'Chinese Simplified',
    'zh-tw': 'Chinese Traditional',
    'co': 'Corsican',
    'hr': 'Croatian',
    'cs': 'Czech',
    'da': 'Danish',
    'nl': 'Dutch',
    'en': 'English',
    'eo': 'Esperanto',
    'et': 'Estonian',
    'tl': 'Filipino',
    'fi': 'Finnish',
    'fr': 'French',
    'fy': 'Frisian',
    'gl': 'Galician',
    'ka': 'Georgian',
    'de': 'German',
    'el': 'Greek',
    'gu': 'Gujarati',
    'ht': 'Haitian Creole',
    'ha': 'Hausa',
    'haw': 'Hawaiian',
    'iw': 'Hebrew',
    'hi': 'Hindi',
    'hmn': 'Hmong',
    'hu': 'Hungarian',
    'is': 'Icelandic',
    'ig': 'Igbo',
    'id': 'Indonesian',
    'ga': 'Irish',
    'it': 'Italian',
    'ja': 'Japanese',
    'jw': 'Javanese',
    'kn': 'Kannada',
    'kk': 'Kazakh',
    'km': 'Khmer',
    'ko': 'Korean',
    'ku': 'Kurdish (Kurmanji)',
    'ky': 'Kyrgyz',
    'lo': 'Lao',
    'la': 'Latin',
    'lv': 'Latvian',
    'lt': 'Lithuanian',
    'lb': 'Luxembourgish',
    'mk': 'Macedonian',
    'mg': 'Malagasy',
    'ms': 'Malay',
    'ml': 'Malayalam',
    'mt': 'Maltese',
    'mi': 'Maori',
    'mr': 'Marathi',
    'mn': 'Mongolian',
    'my': 'Myanmar (Burmese)',
    'ne': 'Nepali',
    'no': 'Norwegian',
    'ps': 'Pashto',
    'fa': 'Persian',
    'pl': 'Polish',
    'pt': 'Portuguese',
    'ma': 'Punjabi',
    'ro': 'Romanian',
    'ru': 'Russian',
    'sm': 'Samoan',
    'gd': 'Scots Gaelic',
    'sr': 'Serbian',
    'st': 'Sesotho',
    'sn': 'Shona',
    'sd': 'Sindhi',
    'si': 'Sinhala',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'so': 'Somali',
    'es': 'Spanish',
    'su': 'Sundanese',
    'sw': 'Swahili',
    'sv': 'Swedish',
    'tg': 'Tajik',
    'ta': 'Tamil',
    'te': 'Telugu',
    'th': 'Thai',
    'tr': 'Turkish',
    'uk': 'Ukrainian',
    'ur': 'Urdu',
    'uz': 'Uzbek',
    'vi': 'Vietnamese',
    'cy': 'Welsh',
    'xh': 'Xhosa',
    'yi': 'Yiddish',
    'yo': 'Yoruba',
    'zu': 'Zulu'
};

/**
 * Google language code to ISO 639-1
 * @param {string} desiredLang - 2 letter languages code
 * @returns 
 */
function _getCode(desiredLang) {
    if (!desiredLang) {
        return false;
    }
    desiredLang = desiredLang.toLowerCase();

    if (languages[desiredLang]) {
        return desiredLang;
    }

    var keys = Object.keys(languages).filter(function (key) {
        if (typeof languages[key] !== 'string') {
            return false;
        }

        return languages[key].toLowerCase() === desiredLang;
    });

    return keys[0] || false;
}

/**
 * Hacky function to pull translation from Google
 * 
 * @param {string} text 
 * @param {object} opts 
 * @returns 
 */
async function translate_google(text, opts = {}) {
    const prev_trans = JSON.parse(fs.readFileSync(__dirname + '/trans/trans_google.json'))
    if (prev_trans[text]) {
        return prev_trans[text];
    }

    function isSupported(desiredLang) {
        return Boolean(_getCode(desiredLang));
    }

    var e;
    [opts.from, opts.to].forEach(function (lang) {
        if (lang && !isSupported(lang)) {
            e = new Error();
            e.code = 400;
            e.message = 'The language \'' + lang + '\' is not supported';
        }
    });
    if (e) {
        return e;
    }

    opts.from = opts.from || 'auto';
    opts.to = opts.to || 'en';

    opts.from = _getCode(opts.from);
    opts.to = _getCode(opts.to);
    var url = 'https://translate.google.com/translate_a/single';
    var data = {
        client: 'gtx',
        sl: opts.from,
        tl: opts.to,
        hl: opts.to,
        dt: ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'],
        ie: 'UTF-8',
        oe: 'UTF-8',
        otf: 1,
        ssel: 0,
        tsel: 0,
        kc: 7
    };
    url = url + '?' + querystring.stringify(data);
    var body = querystring.stringify({ q: text });
    const res = await request({ url: url, message: body });

    var result = {
        text: '',
        from: {
            language: {
                didYouMean: false,
                iso: ''
            },
            text: {
                autoCorrected: false,
                value: '',
                didYouMean: false
            }
        },
        raw: ''
    };

    if (opts.raw) {
        result.raw = res.body;
    }

    var body = [];

    try {
        body = JSON.parse(res.data.toString());
    } catch (err) {
        body = [];
    }

    body[0] && body[0].forEach(function (obj) {
        if (obj[0]) {
            result.text += obj[0];
        }
    });

    if (result.text != "") {
        prev_trans[text] = result.text
        fs.writeFileSync(__dirname + '/trans/trans_google.json', JSON.stringify(prev_trans, null, 4), function (err) {
            if (err) {
                console.log(`\x1b[31m[Error]\x1b[39m saving trans_google.json'. Please check folder`);
                console.log(err);
            }
        });
    }
    return result.text || "Error";
};

/**
 * Download a file from a URL and save it locally.
 *
 * @param {string} url - The URL of the file to download.
 * @param {string} dest - The destination path to save the file.
 * @returns {Promise<string>} - A promise that resolves with the destination path.
 */
async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(dest));
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
};

/**
 * Transcribe an audio file using OpenAI's API.
 *
 * @param {string} filePath - The path of the audio file to transcribe.
 * @param {string} language - The language of the audio file.
 * @returns {Promise<string>} - A promise that resolves with the transcription result.
 */
async function transcribeAudio(filePath, language = "ja") {
    try {
        const transcription = await client.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-1',
            language: language
        });

        return transcription.text;
    } catch (error) {
        console.error('Error', error);
        return "Error";
    }
};

/**
 * Check if a file exist.
 * 
 * @param {string} filePath - Path to file to check.
 * @returns {boolean} if exists
 */
function _file_exists(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;  // File exists
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;  // File does not exist
        } else {
            Logger.error(error); // Other errors
            return false;
        }
    }
};

/**
 * Main function to download and transcribe an audio file.
 *
 * @param {string} url - The URL of the audio file to transcribe.
 */
async function transcribe(url) {
    const prev_trans = JSON.parse(fs.readFileSync(__dirname + '/trans/trans_gpt.json'));
    if (prev_trans[url]) {
        return prev_trans[url];
    }
    const fileName = path.basename(url);
    const filePath = path.join(__dirname, fileName);

    try {
        // Download the audio file
        await downloadFile(url, filePath);

        // Transcribe the downloaded audio file
        const transcription = await transcribeAudio(filePath);

        // Optionally, delete the downloaded file
        if (_file_exists(filePath)) {
            fs.unlinkSync(filePath);
        }

        if (transcription != "") {
            prev_trans[url] = transcription
            fs.writeFileSync(__dirname + '/trans/trans_gpt.json', JSON.stringify(prev_trans, null, 4), function (err) {
                if (err) {
                    console.log(`\x1b[31m[Error]\x1b[39m saving trans_gpt.json'. Please check folder`);
                    console.log(err);
                }
            });
        }

        return transcription;
    } catch (error) {
        console.error('Error', error);
        return "Error";
    }
};


/**
 * Translate Japanese text to English using OpenAI's API.
 *
 * @param {string} text - The Japanese text to translate.
 * @returns {Promise<string>} - A promise that resolves with the translated text.
 */
async function translateText(text) {
    try {
        const prompt = `Translate the following Japanese text to English: ${text}`;
        
        const response = await client.completions.create({
            model: 'gpt-3.5-turbo-instruct',
            prompt: prompt,
            max_tokens: 100,
            temperature: 0.7,
        });

        return response.choices[0].text.trim();
    } catch (error) {
        console.error('Error', error);
        return "Error";
    }
};

/**
 * Main function to translate text from ChatGPT.
 *
 * @param {string} text - Text to translate.
 */
async function translate_chatgpt(text) {
    const prev_trans = JSON.parse(fs.readFileSync(__dirname + '/trans/trans_gpt.json'));
    if (prev_trans[text]) {
        return prev_trans[text];
    }

    try {
        // translate the text
        const translation = await translateText(text);

        if (translation.text != "") {
            prev_trans[text] = translation;
            fs.writeFileSync(__dirname + '/trans/trans_gpt.json', JSON.stringify(prev_trans, null, 4), function (err) {
                if (err) {
                    console.log(`\x1b[31m[Error]\x1b[39m saving trans_gpt.json'. Please check folder`);
                    console.log(err);
                }
            });
        };

        return translation;
    } catch (error) {
        console.error('Error', error);
        return "Error";
    }
};

/**
 * Main function to translate text from DeepL.
 *
 * @param {string} text - Text to translate.
 */
async function translate_deepl(text) {
    const prev_trans = JSON.parse(fs.readFileSync(__dirname + '/trans/trans_deepl.json'));
    if (prev_trans[text]) {
        return prev_trans[text];
    }

    try{
        const translation = await translator.translateText(text, null, 'en-US');

        if (translation.text != "") {
            prev_trans[text] = translation.text;
            fs.writeFileSync(__dirname + '/trans/trans_deepl.json', JSON.stringify(prev_trans, null, 4), function (err) {
                if (err) {
                    console.log(`\x1b[31m[Error]\x1b[39m saving trans_deepl.json'. Please check folder`);
                    console.log(err);
                }
            });
        };

        return translation.text;

    } catch (error) {
        console.error('Error', error);
        return "Error";
    }

};

module.exports = {
    translate_google,
    translate_chatgpt,
    translate_deepl,
    transcribe
};