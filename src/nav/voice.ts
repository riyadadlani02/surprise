// Speech in and out. Every spoken sentence is mirrored into an ARIA live region so screen readers hear it too.
export type CommandKind = 'forward' | 'back' | 'left' | 'right' | 'stop' | 'where_am_i' | 'around' | 'where_is' | 'take_me' | 'guide' | 'next' | 'repeat' | 'help' | 'mute' | 'unmute' | 'look' | 'clear' | 'bumped' | 'unknown'
export interface Command { kind: CommandKind; obj?: string; goal?: string; raw: string }

export const OBJECT_WORDS: [RegExp, string][] = [
  [/red/, 'red'], [/blue/, 'blue'], [/green/, 'green'], [/ball/, 'ball'], [/cup|mug/, 'cup'], [/box|crate/, 'box'], [/ramp|slope/, 'ramp'], [/lid/, 'lid'],
]
export const objectWord = (t: string) => OBJECT_WORDS.find(([re]) => re.test(t))?.[1]

const GOAL_PREFIX = /^.*?\b(guide me to|route to|lead me to|how do i get to|directions to|take me to|go to the|go to|walk to|navigate to)\s*/
const GRAMMAR: [RegExp, CommandKind][] = [
  [/guide me to|route to|lead me to|how do i get to|directions to/, 'guide'],
  [/take me to|go to the|walk to|navigate to/, 'take_me'],
  [/where is|where'?s the|find the/, 'where_is'],
  [/where am i|my position|which way am i/, 'where_am_i'],
  [/what'?s ahead|what is ahead|around me|describe|look around|what do you see/, 'around'],
  [/^look$|take a look|camera/, 'look'],
  [/\b(stop|halt|wait|pause)\b/, 'stop'],
  [/\b(next|done|moved|continue|go on|carry on)\b/, 'next'],
  [/\b(back|backward|backwards|reverse)\b/, 'back'],
  [/\bleft\b/, 'left'],
  [/\bright\b/, 'right'],
  [/\b(forward|forwards|ahead|go|step|walk)\b/, 'forward'],
  [/\b(repeat|again|say that again)\b/, 'repeat'],
  [/\bhelp\b|what can i say/, 'help'],
  [/\bunmute\b|speak again|sound on/, 'unmute'],
  [/\bmute\b|be quiet|silence/, 'mute'],
  [/\b(clear|nothing|fine|ok|okay|yes)\b/, 'clear'],
  [/\b(bump|bumped|blocked|hit|touched|no)\b/, 'bumped'],
]
export function parseCommand(raw: string): Command {
  const t = raw.toLowerCase().trim().replace(/[.,!?]/g, '')
  for (const [re, kind] of GRAMMAR) if (re.test(t)) return { kind, obj: kind === 'where_is' || kind === 'take_me' || kind === 'guide' ? objectWord(t) : undefined, goal: kind === 'take_me' || kind === 'guide' ? t.replace(GOAL_PREFIX, '').trim() || undefined : undefined, raw }
  return { kind: 'unknown', raw }
}

// lib.dom has no SpeechRecognition constructor typing; declare the little we use.
interface Recognition { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: ((e: Event & { error?: string }) => void) | null }
type RecognitionCtor = new () => Recognition
const recognitionCtor = (): RecognitionCtor | undefined => (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition

export class Voice {
  muted = false
  listening = false
  everSpoke = false
  last = ''
  onSpoken?: (text: string) => void
  onHeard?: (text: string) => void
  /** Listening stopped on its own (microphone denied or missing). */
  onError?: (reason: string) => void
  private rec?: Recognition
  private queue: string[] = []
  private speaking = false

  constructor(private live: HTMLElement) {}

  parse = parseCommand
  get canListen() { return !!recognitionCtor() }
  get canSpeak() { return 'speechSynthesis' in window }

  /** Speak (queued) and mirror to the live region. */
  say(text: string) {
    if (!text) return
    this.last = text
    this.live.textContent = text
    this.onSpoken?.(text)
    if (this.muted || !this.canSpeak) return
    this.queue.push(text); this.drain()
  }
  private drain() {
    if (this.speaking || !this.queue.length) return
    const u = new SpeechSynthesisUtterance(this.queue.shift()!)
    u.rate = 1.05
    this.speaking = true
    u.onstart = () => { this.everSpoke = true }
    u.onend = u.onerror = () => { this.speaking = false; this.drain() }
    speechSynthesis.speak(u)
  }
  /** Resolves once everything queued has been spoken (or at once when muted). */
  settled() { return new Promise<void>(res => { const t = () => (this.speaking || this.queue.length) ? setTimeout(t, 80) : res(); t() }) }
  stopSpeaking() { this.queue = []; if (this.canSpeak) speechSynthesis.cancel(); this.speaking = false }

  /** Continuous listening; each final transcript becomes a command. Returns false when unsupported. */
  startListening(onCommand: (c: Command) => void) {
    const Ctor = recognitionCtor(); if (!Ctor) return false
    this.rec ??= new Ctor()
    const r = this.rec
    r.continuous = true; r.interimResults = false; r.lang = 'en-GB'
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const t = e.results[i][0].transcript; this.onHeard?.(t); onCommand(parseCommand(t)) }
    }
    r.onend = () => { if (this.listening) try { r.start() } catch { /* already started */ } }
    r.onerror = e => {
      if (!['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error ?? '')) return   // transient: onend restarts
      this.listening = false; r.stop()
      this.onError?.(e.error === 'audio-capture' ? 'No microphone was found.' : 'Microphone access was denied.')
    }
    this.listening = true
    try { r.start() } catch { /* already started */ }
    return true
  }
  stopListening() { this.listening = false; this.rec?.stop() }
}
