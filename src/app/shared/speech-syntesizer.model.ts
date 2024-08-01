import {LipsyncEn} from "./lipsync-en.model";

/**
 * @class SpeechSynthesizer
 * @credits original code https://github.com/met4citizen/TalkingHead
 * modified for angular use case
 */
export class SpeechSynthesizer {

  lipsyncen: any;
  speechQueue: any = [];
  animEmojis: any = {};
  stateName: any;
  isSpeaking: any;
  visemeNames: any;
  morphs: any = [];
  opt: any;
  ttsAudioEncoding: any;
  animQueue: any = [];

  audioPlaylist: any = [];
  b64Lookup: any;
  audioCtx: any;
  audioSpeechSource: AudioBufferSourceNode;
  audioBackgroundSource: any;
  audioBackgroundGainNode: any;
  audioSpeechGainNode: any;
  audioReverbNode: any;

  isAudioPlaying: any

  animClock: any = 0;

  playerSound: any;

  onSubtitles: any;

  ttsURL = "google TTS url there";


  /**
   * @constructor
   */
  constructor(playerSound, morphsArray) {
    this.lipsyncen = new LipsyncEn();

    this.playerSound = playerSound;

    this.speechQueue = [];
    this.animEmojis = {};
    this.morphs = morphsArray;
    this.animQueue = [];
    this.audioPlaylist = [];
    this.visemeNames = [
      'aa', 'E', 'I', 'O', 'U', 'PP', 'SS', 'TH', 'DD', 'FF', 'kk',
      'nn', 'RR', 'CH', 'sil'
    ];
    this.opt = {
      jwtGet: null, // Function to get JSON Web Token
      ttsEndpoint: "https://eu-texttospeech.googleapis.com/v1beta1/text:synthesize",
      ttsTrimStart: 0,
      ttsTrimEnd: 400,
      pcmSampleRate: 22050,
      avatarMood: "neutral",
      avatarMute: false,
      ttsLang: "en-GB",
      ttsVoice: "en-GB-Standard-A",
      lipsyncLang: 'en',
      ttsRate: 0.95,
      ttsPitch: 0,
      ttsVolume: 0,
    };

    this.audioCtx = playerSound.context;

    let audio = new Audio();
    if (audio.canPlayType("audio/ogg")) {
      this.ttsAudioEncoding = "OGG-OPUS";
    } else if (audio.canPlayType("audio/mp3")) {
      this.ttsAudioEncoding = "MP3";
    } else {
      throw new Error("There was no support for either OGG or MP3 audio.");
    }

    this.audioSpeechSource = this.audioCtx.createBufferSource();
    this.audioBackgroundSource = this.audioCtx.createBufferSource();
    this.audioBackgroundGainNode = this.audioCtx.createGain();
    this.audioSpeechGainNode = this.audioCtx.createGain();
    this.audioReverbNode = this.audioCtx.createConvolver();
    this.setReverb(null); // Set dry impulse as default
    this.audioBackgroundGainNode.connect(this.audioReverbNode);
    this.audioSpeechGainNode.connect(this.audioReverbNode);
    //this.audioReverbNode.connect(this.audioCtx.destination);
    this.audioPlaylist = [];

    // Create a lookup table for base64 decoding
    const b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    this.b64Lookup = typeof Uint8Array === 'undefined' ? [] : new Uint8Array(256);
    for (let i = 0; i < b64Chars.length; i++) this.b64Lookup[b64Chars.charCodeAt(i)] = i;
  }


  /**
   * Add text to the speech queue.
   * @param {string} s Text.
   * @param {Options} [opt=null] Text-specific options for lipsync/TTS language, voice, rate and pitch, mood and mute
   * @param {subtitlesfn} [onsubtitles=null] Callback when a subtitle is written
   * @param {number[][]} [excludes=null] Array of [start, end] index arrays to not speak
   */
  speakText(s, opt = null, onsubtitles = null, excludes = null) {

    // Classifiers
    const dividersSentence = /[!\.\?\n\p{Extended_Pictographic}]/ug;
    const dividersWord = /[ ]/ug;
    const speakables = /[\p{L}\p{N},\.'!€\$\+\p{Dash_Punctuation}%&\?]/ug;
    const emojis = /[\p{Extended_Pictographic}]/ug;

    let markdownWord = ''; // markdown word
    let textWord = ''; // text-to-speech word
    let markId = 0; // SSML mark id
    let ttsSentence = []; // Text-to-speech sentence
    let lipsyncAnim = []; // Lip-sync animation sequence
    const letters = [...s];
    for (let i = 0; i < letters.length; i++) {
      const isLast = i === (letters.length - 1);
      const isSpeakable = letters[i].match(speakables);
      const isEndOfSentence = letters[i].match(dividersSentence);
      const isEndOfWord = letters[i].match(dividersWord);

      // Add letter to subtitles
      if (onsubtitles) {
        markdownWord += letters[i];
      }

      // Add letter to spoken word
      if (isSpeakable) {
        if (!excludes || excludes.every(x => (i < x[0]) || (i > x[1]))) {
          textWord += letters[i];
        }
      }

      // Add words to sentence and animations
      if (isEndOfWord || isEndOfSentence || isLast) {

        // Add to text-to-speech sentence
        if (textWord.length) {
          textWord = this.lipsyncen.preProcessText(textWord);
          if (textWord.length) {
            ttsSentence.push({
              mark: markId,
              word: textWord
            });
          }
        }

        // Push subtitles to animation queue
        if (markdownWord.length) {
          lipsyncAnim.push({
            mark: markId,
            template: {name: 'subtitles'},
            ts: [0],
            vs: {
              subtitles: markdownWord
            },
          });
          markdownWord = '';
        }

        // Push visemes to animation queue
        if (textWord.length) {
          const v = this.lipsyncen.wordsToVisemes(textWord);
          if (v && v.visemes && v.visemes.length) {
            const d = v.times[v.visemes.length - 1] + v.durations[v.visemes.length - 1];
            for (let j = 0; j < v.visemes.length; j++) {
              const o =
                lipsyncAnim.push({
                  mark: markId,
                  template: {name: 'viseme'},
                  ts: [(v.times[j] - 0.6) / d, (v.times[j] + 0.5) / d, (v.times[j] + v.durations[j] + 0.5) / d],
                  vs: {
                    ['viseme_' + v.visemes[j]]: [null, (v.visemes[j] === 'PP' || v.visemes[j] === 'FF') ? 0.9 : 0.6, 0]
                  }
                });
            }
          }
          textWord = '';
          markId++;
        }
      }

      // Process sentences
      if (isEndOfSentence || isLast) {

        // Send sentence to Text-to-speech queue
        if (ttsSentence.length || (isLast && lipsyncAnim.length)) {
          const o: any = {
            anim: lipsyncAnim,
          };
          if (onsubtitles) o.onSubtitles = onsubtitles;
          if (ttsSentence.length && !this.opt.avatarMute) {
            o.text = ttsSentence;
            if (this.opt.avatarMood) o.mood = this.opt.avatarMood;
            if (this.opt.ttsLang) o.lang = this.opt.ttsLang;
            if (this.opt.ttsVoice) o.voice = this.opt.ttsVoice;
            if (this.opt.ttsRate) o.rate = this.opt.ttsRate;
            if (this.opt.ttsVoice) o.pitch = this.opt.ttsPitch;
            if (this.opt.ttsVolume) o.volume = this.opt.ttsVolume;
          }

          this.speechQueue.push(o);

          // Reset sentence and animation sequence
          ttsSentence = [];
          textWord = '';
          markId = 0;
          lipsyncAnim = [];
        }

        // Send emoji, if the divider was a known emoji
        if (letters[i].match(emojis)) {
          let emoji = this.animEmojis[letters[i]];
          if (emoji && emoji.link) emoji = this.animEmojis[emoji.link];
          if (emoji) {
            this.speechQueue.push({emoji: emoji});
          }
        }

        this.speechQueue.push({break: 100});

      }

    }

    this.speechQueue.push({break: 1000});

    // Start speaking (if not already)
    this.startSpeaking();

  }

  /**
   * Take the next queue item from the speech queue, convert it to text, and
   * load the audio file.
   * @param {boolean} [force=false] If true, forces to proceed (e.g. after break)
   */
  async startSpeaking(force: boolean = false) {
    // if ( !this.armature || (this.isSpeaking && !force) ) return;
    this.stateName = 'talking';
    this.isSpeaking = true;
    if (this.speechQueue.length) {
      let line = this.speechQueue.shift();
      if (line.emoji) {
        // Only emoji
        let duration = line.emoji.dt.reduce((a, b) => a + b, 0);
        //this.animQueue.push(this.animFactory(line.emoji)); //TODO: implement emoji
        setTimeout(this.startSpeaking.bind(this), duration, true);
      } else if (line.break) {
        // Break
        setTimeout(this.startSpeaking.bind(this), line.break, true);
      } else if (line.audio) {

        // Make a playlist
        this.audioPlaylist.push({anim: line.anim, audio: line.audio});

        this.onSubtitles = line.onSubtitles || null;

        this.resetLips();

        this.playAudio();

      } else if (line.text) {

        // Spoken text
        try {
          // Convert text to SSML
          let ssml = "<speak>";
          line.text.forEach((x, i) => {
            // Add mark
            if (i > 0) {
              ssml += " <mark name='" + x.mark + "'/>";
            }

            // Add word
            ssml += x.word.replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('"', '&quot;')
              .replaceAll('\'', '&apos;')
              .replace(/^\p{Dash_Punctuation}$/ug, '<break time="750ms"/>');

          });
          ssml += "</speak>";


          const o = {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({
              "input": {
                "ssml": ssml
              },
              "voice": {
                "languageCode": this.opt.ttsLang,
                "name": this.opt.ttsVoice
              },
              "audioConfig": {
                "audioEncoding": this.ttsAudioEncoding,
                "speakingRate": this.opt.ttsRate,
                "pitch": this.opt.ttsPitch,
                "volumeGainDb": this.opt.ttsVolume
              },
              "enableTimePointing": [1] // Timepoint information for mark tags
            })
          };

          // JSON Web Token
          if (this.opt.jwtGet && typeof this.opt.jwtGet === "function") {
            o.headers["Authorization"] = "Bearer " + await this.opt.jwtGet();
          }

          const res = await fetch(this.ttsURL, o);
          const data = await res.json();

          if (res.status === 200 && data && data.audioContent) {

            // Audio data
            const buf = this.b64ToArrayBuffer(data.audioContent);
            const audio = await this.audioCtx.decodeAudioData(buf);

            // Workaround for Google TTS not providing all timepoints
            const times = [0];
            let markIndex = 0;
            line.text.forEach((x, i) => {
              if (i > 0) {
                let ms = times[times.length - 1];
                if (data.timepoints[markIndex]) {
                  ms = data.timepoints[markIndex].timeSeconds * 1000;
                  if (data.timepoints[markIndex].markName === "" + x.mark) {
                    markIndex++;
                  }
                }
                times.push(ms);
              }
            });

            // Word-to-audio alignment
            const timepoints: any = [{mark: 0, time: 0}];
            times.forEach((x, i) => {
              if (i > 0) {
                let prevDuration = x - times[i - 1];
                if (prevDuration > 150) prevDuration - 150; // Trim out leading space
                timepoints[i - 1].duration = prevDuration;
                timepoints.push({mark: i, time: x});
              }
            });
            let d = 1000 * audio.duration; // Duration in ms
            if (d > this.opt.ttsTrimEnd) d = d - this.opt.ttsTrimEnd; // Trim out silence at the end
            timepoints[timepoints.length - 1].duration = d - timepoints[timepoints.length - 1].time;

            // Re-set animation starting times and rescale durations
            line.anim.forEach(x => {
              const timepoint = timepoints[x.mark];
              if (timepoint) {
                for (let i = 0; i < x.ts.length; i++) {
                  x.ts[i] = timepoint.time + (x.ts[i] * timepoint.duration) + this.opt.ttsTrimStart;
                }
              }
            });

            // Add to the playlist
            this.audioPlaylist.push({anim: line.anim, audio: audio});
            this.onSubtitles = line.onSubtitles || null;
            this.resetLips();
            this.playAudio();

          } else {
            this.startSpeaking(true);
          }
        } catch (error) {
          console.error("Error:", error);
          this.startSpeaking(true);
        }
      } else if (line.anim) {
        // Only subtitles
        this.onSubtitles = line.onSubtitles || null;
        this.resetLips();
        line.anim.forEach((x, i) => {
          for (let j = 0; j < x.ts.length; j++) {
            x.ts[j] = this.animClock + 10 * i;
          }
          this.animQueue.push(x);
        });
        setTimeout(this.startSpeaking.bind(this), 10 * line.anim.length, true);
      } else if (line.marker) {
        if (typeof line.marker === "function") {
          line.marker();
        }
        this.startSpeaking(true);
      } else {
        this.startSpeaking(true);
      }
    } else {
      this.stateName = 'idle';
      this.isSpeaking = false;
    }
  }

  resetLips() {
    this.visemeNames.forEach(x => {
      this.morphs.forEach(y => {
        const ndx = y.morphTargetDictionary['viseme_' + x];
        if (ndx !== undefined) {
          y.morphTargetInfluences[ndx] = 0;
        }
      });
    });
  }

  /**
   * Play audio playlist using Web Audio API.
   * @param {boolean} [force=false] If true, forces to proceed
   */
  async playAudio(force: boolean = false) {
    //if (!this.armature || (this.isAudioPlaying && !force)) return;
    if ((this.isAudioPlaying && !force)) return;
    this.isAudioPlaying = true;
    if (this.audioPlaylist.length) {
      const item = this.audioPlaylist.shift();

      // If Web Audio API is suspended, try to resume it
      if (this.audioCtx.state === "suspended") {
        const resume = this.audioCtx.resume();
        const timeout = new Promise((_r, rej) => setTimeout(() => rej("p2"), 1000));
        try {
          await Promise.race([resume, timeout]);
        } catch (e) {
          console.log("Can't play audio. W  played Audio API suspended. This is often due to calling some speak method before the first user action, which is typically prevented by the browser.");
          this.playAudio(true);
          return;
        }
      }

      // AudioBuffer
      let audio: any;
      if (Array.isArray(item.audio)) {
        // Convert from PCM samples
        let buf = this.concatArrayBuffers(item.audio);
        audio = this.pcmToAudioBuffer(buf);
      } else {
        audio = item.audio;
      }

      // Create audio source
      this.audioSpeechSource = this.audioCtx.createBufferSource();
      this.audioSpeechSource.buffer = audio;
      this.audioSpeechSource.playbackRate.value = 1;
      this.audioSpeechSource.connect(this.playerSound.panner);
      this.audioSpeechSource.addEventListener('ended', () => {
        this.audioSpeechSource.disconnect();
        this.playAudio(true);
      }, {once: true});

      // Rescale lip sync and push to queue
      const delay = 100;
      if (item.anim) {
        item.anim.forEach(x => {
          for (let i = 0; i < x.ts.length; i++) {
            x.ts[i] = this.animClock + x.ts[i] + delay;
          }
          this.animQueue.push(x);
        });
      }

      // Play
      this.audioSpeechSource.start(delay / 1000);

    } else {
      this.isAudioPlaying = false;
      this.startSpeaking(true);
    }
  }

  /**
   * Concatenate an array of ArrayBuffers.
   * @param {ArrayBuffer[]} bufs Array of ArrayBuffers
   * @return {ArrayBuffer} Concatenated ArrayBuffer
   */
  concatArrayBuffers(bufs) {
    let len = 0;
    for (let i = 0; i < bufs.length; i++) {
      len += bufs[i].byteLength;
    }
    let buf = new ArrayBuffer(len);
    let arr = new Uint8Array(buf);
    let p = 0;
    for (let i = 0; i < bufs.length; i++) {
      arr.set(new Uint8Array(bufs[i]), p);
      p += bufs[i].byteLength;
    }
    return buf;
  }

  /**
   * Convert a Base64 MP3 chunk to ArrayBuffer.
   * @param {string} chunk Base64 encoded chunk
   * @return {ArrayBuffer} ArrayBuffer
   */
  b64ToArrayBuffer(chunk) {
    // Calculate the needed total buffer length
    let bufLen = 3 * chunk.length / 4;
    if (chunk[chunk.length - 1] === '=') {
      bufLen--;
      if (chunk[chunk.length - 2] === '=') {
        bufLen--;
      }
    }
    // Create the ArrayBuffer
    const arrBuf = new ArrayBuffer(bufLen);
    const arr = new Uint8Array(arrBuf);

    let i, p = 0, c1, c2, c3, c4;
    // Populate the buffer
    for (i = 0; i < chunk.length; i += 4) {
      c1 = this.b64Lookup[chunk.charCodeAt(i)];
      c2 = this.b64Lookup[chunk.charCodeAt(i + 1)];
      c3 = this.b64Lookup[chunk.charCodeAt(i + 2)];
      c4 = this.b64Lookup[chunk.charCodeAt(i + 3)];
      arr[p++] = (c1 << 2) | (c2 >> 4);
      arr[p++] = ((c2 & 15) << 4) | (c3 >> 2);
      arr[p++] = ((c3 & 3) << 6) | (c4 & 63);
    }


    return arrBuf;
  }

  /**
   * Convert PCM buffer to AudioBuffer.
   * NOTE: Only signed 16bit little endian supported.
   * @param {ArrayBuffer} buf PCM buffer
   * @return {AudioBuffer} AudioBuffer
   */
  pcmToAudioBuffer(buf) {
    const arr = new Int16Array(buf);
    const floats = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      floats[i] = (arr[i] >= 0x8000) ? -(0x10000 - arr[i]) / 0x8000 : arr[i] / 0x7FFF;
    }
    const audio = this.audioCtx.createBuffer(1, floats.length, this.opt.pcmSampleRate);
    audio.copyToChannel(floats, 0, 0);
    return audio;
  }

  /**
   * Setup the convolver node based on an impulse.
   * @param {string} [url=null] URL for the impulse, dry impulse if null
   */
  async setReverb(url = null) {
    if (url) {
      // load impulse response from file
      let response = await fetch(url);
      let arraybuffer = await response.arrayBuffer();
      this.audioReverbNode.buffer = await this.audioCtx.decodeAudioData(arraybuffer);
    } else {
      // dry impulse
      const samplerate = this.audioCtx.sampleRate;
      const impulse = this.audioCtx.createBuffer(2, samplerate, samplerate);
      impulse.getChannelData(0)[0] = 1;
      impulse.getChannelData(1)[0] = 1;
      this.audioReverbNode.buffer = impulse;
    }
  }

  /**
   * Calculate the correct value based on a given time using the given function.
   * @param {number[]} ts Time sequence
   * @param {number[]} vs Value sequence
   * @param {number} t Time.
   * @param {function} [fun=null] Ease in and out function, null = use linear function
   * @return {number} Value based on the given time.
   */
  valueAnimationSeq(ts, vs, t, fun = null) {
    let iMin = 0;
    let iMax = ts.length - 1;
    if (t <= ts[iMin]) return (typeof vs[iMin] === 'function' ? vs[iMin]() : vs[iMin]);
    if (t >= ts[iMax]) return (typeof vs[iMax] === 'function' ? vs[iMax]() : vs[iMax]);
    while (t > ts[iMin + 1]) iMin++;
    iMax = iMin + 1;
    let k = ((typeof vs[iMax] === 'function' ? vs[iMax]() : vs[iMax]) - (typeof vs[iMin] === 'function' ? vs[iMin]() : vs[iMin])) / (ts[iMax] - ts[iMin]);
    if (fun) k = fun((t - ts[iMin]) / (ts[iMax] - ts[iMin])) * k;
    const b = (typeof vs[iMin] === 'function' ? vs[iMin]() : vs[iMin]) - (k * ts[iMin]);
    return (k * t + b);
  }

}
