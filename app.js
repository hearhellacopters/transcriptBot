require('dotenv').config();
const {
    translate_google,
    translate_chatgpt,
    translate_deepl,
    transcribe
} = require('./src/translate');
const { 
    Client, 
    IntentsBitField, 
    REST, 
    Routes, 
    ApplicationCommandOptionType, 
} = require('discord.js');

const client = new Client({
	intents: [
		IntentsBitField.Flags.Guilds,
		IntentsBitField.Flags.GuildMembers,
		IntentsBitField.Flags.GuildMessages,
		IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildPresences,
        IntentsBitField.Flags.GuildIntegrations,
        IntentsBitField.Flags.GuildWebhooks,
        IntentsBitField.Flags.MessageContent
	],
});

/**
 * Cooldown check to prevent user command spam
 */
const cooldown = new Set();

/**
 * Call an async function with a maximum time limit (in milliseconds) for the timeout
 * 
 * This is to prevent the bot from never replying to a command.
 * 
 * @param {Promise<any>} asyncPromise An asynchronous promise to resolve
 * @param {number} timeLimit Time limit to attempt function in milliseconds
 * @returns {Promise<any> | undefined} Resolved promise for async function call, or an error if time limit reached
 */
const asyncCallWithTimeout = async (asyncPromise, timeLimit) => {
    let timeoutHandle;

    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(
            () => reject(new Error('Async call timeout limit reached')),
            timeLimit
        );
    });

    return Promise.race([asyncPromise, timeoutPromise]).then(result => {
        clearTimeout(timeoutHandle);
        return result;
    })
}

/**
 * Adds user to the cooldown list, cleared after 10 seconds.
 * 
 * @param {String|number} id - user id
 */
function cooldown_counter (id){
    cooldown.add(id);
    setTimeout(() => { 
        cooldown.delete(id); 
    }, 10000);
};

/**
 * Creates a timestamp for console logs
 * 
 * @returns {string}
 */
const timestamp =()=>{
    const ct = new Date()
    function ordinal(n) {
        var s = ["th", "st", "nd", "rd"];
        var v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    const months = ["Jan", "Feb", "March", "April", "May", "June", "July", "Aug", "Sep", "Oct", "Nov", "Dec"]

    var ampm = "AM"
    const set_hours = (time)=>{
        if(time == 0){
            return 12
        }
        if(time >12){
            ampm = "PM"
            time = time - 12
            return time
        } else {
            return time
        }
    }
    return `${months[ct.getMonth()]} ${ordinal(ct.getDate())} ${set_hours(ct.getHours())}:${ct.getMinutes().toString().padStart(2, '0')}${ampm}`
}

/**
 * List of slash commands
 */
const commands = [
    {
        name: 'transcribe_audio',
        description: "Transcribe & Translates Japanese audio to file to text",
        options:[
            {
                name: 'url',
                description: "File url of flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm ",
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    },
    {
        name: 'translate_text',
        description: "Translates Japanese text to English",
        options:[
            {
                name: 'text',
                description: "Japanese text",
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    }
];

/**
 * Discords rest params
 */
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

/**
 *  Set the Discord slash commands
 */
async function set_commands(){
    try {
        console.log(`\x1b[36m[${timestamp()}]\x1b[0m: Registering slash commands...`);


        await rest.put(
            Routes.applicationGuildCommands(
                process.env.DISCORD_CLIENT_ID,
                process.env.DISCORD_GUILD_ID
            ),
            { body: commands}
        );

        console.log(`\x1b[32m[${timestamp()}]\x1b[0m: Commands registering finished!`);
    } catch (error) {
        console.log(`\x1b[31m[${timestamp()}]\x1b[0m: There was an error: ${error}`);
    }
};

set_commands();

/**
 * Run when an interaction is created
 */
client.on('interactionCreate', async (interaction) =>{
    if(!interaction.isChatInputCommand()) return;
    
    if(interaction.commandName === "translate_text"){
        // Checks if user is on cooldown
        if (cooldown.has(interaction.user.id)){

            interaction.reply({content: 'Please wait 10 seconds between commands', ephemeral:true})

        } else {
            // Checks if bot channel replay is found
            var targetChannel = interaction.guild.channels.cache.get(process.env.BOT_CHANNEL_ID);

            if (!targetChannel) {
                await interaction.reply({ content: 'Target channel not found.', ephemeral: true });
                return;
            }

            // Adds user to cooldown
            cooldown_counter(interaction.user.id);
            
            // Gets text from command
            const totrans = interaction.options.get('text').value || "";

            // Command is sent to channel as hidden reply
            await interaction.deferReply({ ephemeral: true });

            // Reply with processing
            await interaction.editReply({ content: "Processing...", ephemeral: true });

            // Creates a log
            console.log(`\x1b[36m[${timestamp()}]\x1b[0m: pre translate\n\x1b[36m[${timestamp()}]\x1b[0m: ` + totrans);

            // Translates text from Google
            const text_google = await asyncCallWithTimeout(translate_google(totrans, {from: 'ja', to: 'en'}), 10000);

            // Translates text from ChatGPT
            const text_gpt = await asyncCallWithTimeout(translate_chatgpt(totrans), 10000);

            // Translates text from DeepL
            const text_deepl = await asyncCallWithTimeout(translate_deepl(totrans), 10000);

            // Logs translation
            console.log(`\x1b[32m[${timestamp()}]\x1b[0m: post translate\n\x1b[36m[${timestamp()}]\x1b[0m: ` + text_gpt);

            // Create bot replay in bot channel
            await targetChannel.send("<@"+interaction.user.id+"> - Translating: ``" + totrans + "``\nChatGPT:\n```" + text_gpt + "```[DeepL](<https://www.deepl.com/en/translator#ja/en-us/"+encodeURIComponent(totrans.trim())+">):\n```" + text_deepl + "```[Google](<https://translate.google.com/?sl=ja&tl=en&text="+encodeURIComponent(totrans.trim())+"&op=translate>):\n```" + text_google + "```");

            // Updates hidden reply
            await interaction.editReply({ content: "Your command has been processed in <#"+ process.env.BOT_CHANNEL_ID +">.", ephemeral: true });

        }
    } else
    if(interaction.commandName === "transcribe_audio"){
        // Checks if user is on cooldown
        if (cooldown.has(interaction.user.id)){
            interaction.reply({content: 'Please wait 10 seconds between commands', ephemeral:true})

        } else {
            // Checks if bot channel replay is found
            var targetChannel = interaction.guild.channels.cache.get(process.env.BOT_CHANNEL_ID);

            if (!targetChannel) {
                await interaction.reply({ content: 'Target channel not found.', ephemeral: true });
                return;
            }

            // Adds user to cooldown
            cooldown_counter(interaction.user.id)

            // Gets url from command
            const toscrib = interaction.options.get('url').value || "";

            // Command is sent to channel as hidden reply
            await interaction.deferReply({ ephemeral: true });

            // Reply with processing
            await interaction.editReply({ content: "Processing...", ephemeral: true });

            // Creates a log
            console.log(`\x1b[36m[${timestamp()}]\x1b[0m: URL to transcribe:\n\x1b[36m[${timestamp()}]\x1b[0m: ` + toscrib);
            
            // Gets text from url
            const totrans = await transcribe(toscrib);

            // Logs transcribed text
            console.log(`\x1b[32m[${timestamp()}]\x1b[0m: post transcribe\n\x1b[32m[${timestamp()}]\x1b[0m: ` + totrans);

            // Translates text from Google
            const text_google = await asyncCallWithTimeout(translate_google(totrans, {from: 'ja', to: 'en'}), 10000);

            // Translates text from ChatGPT
            const text_gpt = await asyncCallWithTimeout(translate_chatgpt(totrans), 10000);

            // Translates text from DeepL
            const text_deepl = await asyncCallWithTimeout(translate_deepl(totrans), 10000);

            // Create bot replay in bot channel
            console.log(`\x1b[32m[${timestamp()}]\x1b[0m: post translate\n\x1b[36m[${timestamp()}]\x1b[0m: ` + text_gpt);
            
            // Create bot replay in bot channel
            await targetChannel.send(toscrib + "\n<@"+interaction.user.id+"> Transcribed:\n```\n" + totrans + "\n```Translation:\n```" + text_gpt + "```[DeepL](<https://www.deepl.com/en/translator#ja/en-us/"+encodeURIComponent(totrans.trim())+">):\n```" + text_deepl + "```[Google](<https://translate.google.com/?sl=ja&tl=en&text="+encodeURIComponent(totrans.trim())+"&op=translate>):\n```" + text_google + "```");

            // Updates hidden reply
            await interaction.editReply({ content: "Your command has finished processed in <#"+ process.env.BOT_CHANNEL_ID +">.", ephemeral: true });
            
        }
    }
});

// Ready bot spam
client.on('ready', (c) => {
    console.log(`\x1b[32m[${timestamp()}]\x1b[0m: ${c.user.username} has started, with \x1b[33m${client.users.cache.size}\x1b[0m users, in \x1b[33m${client.channels.cache.size}\x1b[0m channels on \x1b[33m${client.guilds.cache.size}\x1b[0m servers.`);
});

client.login(process.env.DISCORD_TOKEN);