const { Client, Intents } = require('discord.js');
const {
	joinVoiceChannel,
	VoiceConnectionStatus,
	createAudioPlayer,
	NoSubscriberBehavior,
	createAudioResource,
	getVoiceConnection,
	EndBehaviorType,
	StreamType,
	AudioPlayerStatus,
} = require('@discordjs/voice');
const { join } = require('path');
const { token } = require('./config.json');
const vosk = require('vosk');
const prism = require('prism-media');
const ytdl = require('discord-ytdl-core');


const clips = [
	'assets/sounds/pull_up_01.mp3',
	'assets/sounds/pull_up_02.mp3',
	'assets/sounds/lets_go_01.mp3',
	'assets/sounds/lets_go_02.mp3',
	'assets/sounds/lets_go_03.mp3',
];

const gifs = [
	'https://media.giphy.com/media/o8LdjpIPAsxDNMQufy/giphy.gif',
	'https://media.giphy.com/media/zSgSfdFiNmO3NDpeuJ/giphy.gif',
	'https://media.giphy.com/media/hiqN1W51i7LRr4dJ84/giphy.gif',
	'https://media.giphy.com/media/jr1WiDQ2ldZJeuPQax/giphy.gif',
	'https://media.giphy.com/media/nA54924lqprMREnGlk/giphy.gif',
	'https://media.giphy.com/media/Dsl4yH6yIdFnMUgex5/giphy.gif',
	'https://media.giphy.com/media/tOnD3YGfeMutwbVEcK/giphy.gif',
	'https://media.giphy.com/media/qTh0fyIymGZtP9OKrk/giphy.gif',
];

const urlsHype = [
	'https://www.youtube.com/watch?v=G0lKzUnJUpA',
	'https://www.youtube.com/watch?v=G0lKzUnJUpA',
	'https://www.youtube.com/watch?v=G0lKzUnJUpA',
	'https://www.youtube.com/watch?v=NBG3HF5l8jU',
	'https://www.youtube.com/watch?v=NBG3HF5l8jU',
	'https://www.youtube.com/watch?v=tLyRpGKWXRs',
];

const urlsSad = [
	'https://www.youtube.com/watch?v=7ODcC5z6Ca0',
	'https://www.youtube.com/watch?v=7ODcC5z6Ca0',
	'https://www.youtube.com/watch?v=qqghbvavKKg',
	'https://www.youtube.com/watch?v=qqghbvavKKg',
	'https://www.youtube.com/watch?v=qqghbvavKKg',
];

// Load vosk models
const model = new vosk.Model('assets/models/en');
const rec = new vosk.Recognizer({ model: model, sampleRate: 48000 });
vosk._rec_ = rec;


let resource;
let playing = false;
const player = createAudioPlayer({
	behaviors: {
		noSubscriber: NoSubscriberBehavior.Pause,
	},
});

player.on(AudioPlayerStatus.Bufferring, () => {
	playing = true;
});

player.on(AudioPlayerStatus.Playing, () => {
	playing = true;
});

player.on(AudioPlayerStatus.Idle, () => {
	playing = false;
});


// Needed in order to disconnect bot from server on shutdown
let serverId = null;

const client = new Client({
	intents: [
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
		Intents.FLAGS.GUILD_VOICE_STATES,
	],
});

client.once('ready', () => {
	console.log('DaBaby pullin\' up');
	client.user.setActivity('and Pullin\' up');
	playRandomClip();
});


const CMD_PREFIX = '!';
const CMD_JOIN = 'join';
const CMD_LEAVE = 'leave';
const CMD_PLAY = 'play';

client.on('messageCreate', async (message) => {
	if (message.author.bot) return;

	const text = message.content.trim().toLowerCase();
	serverId = message.guild.id;

	const gif = gifs[Math.floor(Math.random() * gifs.length)];
	if (text.includes('let\'s go')
		|| text.includes('lets go')
		|| text.includes('pull up')) {
		message.channel.send(gif);
		const connection = getVoiceConnection(message.guild.id);
		if (connection) {
			playRandomClip();
		}
	}

	if (text.startsWith(CMD_PREFIX)
		&& text.includes(CMD_JOIN)) {
		if (!message.member.voice.channelId) { message.reply('Error: please join a voice channel first!'); }
		else {
			connectToVoice(message);
		}
	}

	if (text.startsWith(CMD_PREFIX)
		&& text.includes(CMD_LEAVE)) {
		if (!message.member.voice.channelId) { message.reply('Error: please join a voice channel first!'); }
		else {
			const connection = getVoiceConnection(message.guild.id);
			if (!connection) {
				message.reply('Error: DaBaby not connected to a voice channel!');
				return;
			}
			connection.destroy();
		}
	}

	if (text.startsWith(CMD_PREFIX)
		&& text.includes(CMD_PLAY)) {
		if (!message.member.voice.channelId) { message.reply('Error: please join a voice channel first!'); }
		else {
			const connection = getVoiceConnection(message.guild.id);
			if (!connection) {
				message.reply('Error: DaBaby not connected to a voice channel!');
				return;
			}
			playRandomClip();
			// resource = createAudioResource();
		}
	}
});

client.login(token);

async function connectToVoice(message) {
	try {
		const connection = joinVoiceChannel({
			channelId: message.member.voice.channel.id,
			guildId: message.guild.id,
			adapterCreator: message.guild.voiceAdapterCreator,
			selfDeaf: false,
		});

		connection.on(VoiceConnectionStatus.Ready, () => {
			console.log('The connection has entered the Ready state!');
		});

		connection.receiver.speaking.on('start', userId => {
			const opusStream = connection.receiver.subscribe(userId, {
				end: {
					behavior: EndBehaviorType.AfterSilence,
					duration: 100,
				},
			});

			const rawStream = opusStream.pipe(new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 }));
			rawStream.on('error', (e) => {
				console.log('rawSteam: ' + e);
			});

			let buffer = [];
			rawStream.on('data', (data) => {
				buffer.push(data);
			});

			rawStream.on('end', async () => {
				buffer = Buffer.concat(buffer);
				try {
					const new_buffer = await convert_audio(buffer);
					const out = await transcribe(new_buffer);
					if (out != null) {
						handleSpeech(out, message.guild.id);
					}
				}
				catch (e) {
					console.log('tmpraw rename: ' + e);
				}
			});
		});

		connection.on(VoiceConnectionStatus.Destroyed, () => {
			console.log('The connection has entered the Destroyed state!');
		});
		connection.subscribe(player);
	}
	catch (e) {
		console.log('connect: ' + e);
		message.reply('Error: unable to join your voice channel.');
		throw e;
	}
}

function playRandomClip() {
	if (playing) return;
	const clip = clips[Math.floor(Math.random() * clips.length)];
	resource = createAudioResource(join(__dirname, clip), { inlineVolume: true });
	player.play(resource);
}

function playURL(url) {
	const stream = ytdl(url, {
		filter: 'audioonly',
		opusEncoded: true,
		encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200'],
	});

	resource = createAudioResource(stream, {
		inputType: StreamType.Opus,
		inlineVolume: true,
	});
	player.stop();
	player.play(resource);
}

// Handles the results returned from vosk
function handleSpeech(text) {
	// Short audio clips
	if (text.includes('let\'s go')
		|| text.includes('lets go')
		|| text.includes('let go')
		|| (text.includes('let\'s') && text.includes('go'))
		|| (text.includes('pull') && text.includes('up'))
		|| text.includes('pull up')
		|| text.includes('pulled up')
		|| text.includes('i pull up')
		|| text.includes('i\'m pull up')
		|| text.includes('i\'m paula')
		|| text.includes('i paul')
		|| text.includes('a paula')
		|| text.includes('paul')
		|| text.includes('apollo')
		|| text.includes('paula')) {
		playRandomClip();
	}

	// Dababy hype song
	if (text.includes('turn up')
		|| text.includes('turn') && text.includes('up')
		|| text.includes('high') && text.includes('time')
		|| text.includes('hype') && text.includes('time')) {
		const url = urlsHype[Math.floor(Math.random() * urlsHype.length)];
		playURL(url);
	}

	// Sad songs
	if (text.includes('sad boy')
		|| text.includes('sad') && text.includes('boy')
		|| text.includes('sad') && text.includes('time')
		|| text.includes('bad') && text.includes('time')
		|| text.includes('mad') && text.includes('time')) {
		const url = urlsSad[Math.floor(Math.random() * urlsSad.length)];
		playURL(url);
	}

	// Stop audio
	if (text.includes('stop audio')
		|| text.includes('drop') && text.includes('audio')
		|| text.includes('stop') && text.includes('audio')) {
		player.stop();
	}
}

// Converts stereo audio buffer to mono
async function convert_audio(input) {
	try {
		const data = new Int16Array(input);
		const ndata = new Int16Array(data.length / 2);
		for (let i = 0, j = 0; i < data.length; i += 4) {
			ndata[j++] = data[i];
			ndata[j++] = data[i + 1];
		}
		return Buffer.from(ndata);
	}
	catch (e) {
		console.log(e);
		console.log('convert_audio: ' + e);
		throw e;
	}
}

// Feeds buffer to vosk
async function transcribe(buffer) {
	vosk._rec_.acceptWaveform(buffer);
	const ret = vosk._rec_.result().text;
	console.log('vosk:', ret);
	return ret;
}

// Clean up any open connections
if (process.platform === 'win32') {
	const rl = require('readline').createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	rl.on('SIGINT', () => {
		process.emit('SIGINT');
	});
}

process.on('SIGINT', () => {
	// graceful shutdown
	if (serverId) {
		const connection = getVoiceConnection(serverId);
		if (connection) connection.destroy();
	}
	process.exit();
});