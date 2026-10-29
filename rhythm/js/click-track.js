const ATTACK_SECONDS = 0.0003;
const CLICK_SECONDS = 0.09;
const SILENT_GAIN = 0.0001;
const SOUNDS = {
  accent: { frequency: 1760, peak: 1, decaySeconds: 0.045 },
  normal: { frequency: 980, peak: 0.8, decaySeconds: 0.045 },
  back: { frequency: 1180, peak: 0.8, decaySeconds: 0.07 },
};

function triangle(cycles) {
  const phase = cycles - Math.floor(cycles);
  if (phase < 0.25) return 4 * phase;
  if (phase < 0.75) return 2 - 4 * phase;
  return 4 * phase - 4;
}

// Near-instant attack so the click's onset is exactly its beat time, like the calibration click.
function envelope(sound, age) {
  if (age < ATTACK_SECONDS)
    return SILENT_GAIN + (sound.peak - SILENT_GAIN) * (age / ATTACK_SECONDS);
  if (age >= sound.decaySeconds) return SILENT_GAIN;
  const progress = (age - ATTACK_SECONDS) / (sound.decaySeconds - ATTACK_SECONDS);
  return sound.peak * (SILENT_GAIN / sound.peak) ** progress;
}

// Metronome that runs on the audio thread, so main-thread jank or a hidden tab can't delay a click.
// Each beat is announced one beat ahead so the page can light it and grade strums against it.
export class ClickTrack {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.settings = { bpm: 96, countIn: 1, pattern: 'all', accent: true };
    this.takeId = 0;
    this.upcomingBeat = null;
    this.isAnnouncementDue = false;
    this.soundingClick = null;
    this.messages = [];
  }

  set(message) {
    if (message.settings) Object.assign(this.settings, message.settings);
    if (message.type === 'start') {
      this.takeId = message.takeId;
      this.upcomingBeat = this.planBeat(0, message.startFrame);
      this.isAnnouncementDue = true;
    }
    if (message.type === 'stop') this.upcomingBeat = null;
  }

  planBeat(beatNumber, exactFrame) {
    const beatIndex = beatNumber % 4;
    const { countIn, pattern, accent } = this.settings;
    let sound = 'normal';
    let isAudible = true;
    if (beatNumber < 4 * countIn) sound = beatIndex === 0 ? 'accent' : 'normal';
    else if (pattern === 'all') sound = beatIndex === 0 && accent ? 'accent' : 'normal';
    else {
      sound = 'back';
      isAudible = beatIndex === 1 || beatIndex === 3;
    }
    return { beatNumber, exactFrame, beatIndex, sound, isAudible };
  }

  announce(beat) {
    this.messages.push({
      type: 'beat',
      takeId: this.takeId,
      beatNumber: beat.beatNumber,
      time: beat.exactFrame / this.sampleRate,
      beatIndex: beat.beatIndex,
      isAudible: beat.isAudible,
    });
  }

  run(output, frame0) {
    const out = this.messages;
    out.length = 0;
    if (this.upcomingBeat && this.isAnnouncementDue) {
      this.announce(this.upcomingBeat);
      this.isAnnouncementDue = false;
    }
    for (let i = 0; i < output.length; i++) {
      const frame = frame0 + i;
      const beat = this.upcomingBeat;
      if (beat && frame >= beat.exactFrame) {
        if (beat.isAudible)
          this.soundingClick = { sound: SOUNDS[beat.sound], exactFrame: beat.exactFrame };
        const beatFrames = (60 / this.settings.bpm) * this.sampleRate;
        this.upcomingBeat = this.planBeat(beat.beatNumber + 1, beat.exactFrame + beatFrames);
        this.announce(this.upcomingBeat);
      }
      output[i] = this.sampleAt(frame);
    }
    return out;
  }

  sampleAt(frame) {
    if (!this.soundingClick) return 0;
    const { sound, exactFrame } = this.soundingClick;
    const age = (frame - exactFrame) / this.sampleRate;
    if (age >= CLICK_SECONDS) {
      this.soundingClick = null;
      return 0;
    }
    return envelope(sound, age) * triangle(sound.frequency * age);
  }
}
