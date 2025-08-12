import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

// --- Utilities ---
const ZWSP = "\u200B"; // zero width space
const ZWNJ = "\u200C"; // zero width non-joiner
const ZWJ = "\u200D"; // zero width joiner

const COMBINING_MARKS = [
  "\u0301", // acute
  "\u0300", // grave
  "\u0308", // diaeresis
  "\u0303", // tilde
  "\u0302", // circumflex
];

// Map of Latin -> array of homoglyph choices (Greek/Cyrillic lookalikes)
const HOMOGLYPHS: Record<string, string[]> = {
  A: ["Α", "А"], // Greek Alpha, Cyrillic A
  a: ["а", "α"],
  B: ["Β", "В"],
  E: ["Ε", "Е"],
  e: ["е", "ε"],
  H: ["Η", "Н"],
  I: ["Ι", "І"],
  i: ["і", "ι"],
  K: ["Κ", "К"],
  M: ["Μ", "М"],
  N: ["Ν", "N"], // Greek Nu looks like N
  O: ["Ο", "О"],
  o: ["ο", "о"],
  P: ["Ρ", "Р"],
  p: ["ρ", "р"],
  C: ["Ϲ", "С"],
  c: ["ϲ", "с"],
  T: ["Τ", "Т"],
  X: ["Χ", "Х"],
  Y: ["Υ", "Ү"],
};

const LEET: Record<string, string[]> = {
  a: ["@", "4"],
  e: ["3"],
  i: ["1", "!"],
  o: ["0"],
  s: ["$", "5"],
  t: ["7"],
};

// lightweight RNG with seed option
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function withProbability(rng: () => number, p: number) {
  return rng() < p;
}

// --- Transformations ---
function insertZeroWidth(input: string, rng: () => number, density = 0.25) {
  const zwChars = [ZWSP, ZWNJ, ZWJ];
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    out += ch;
    if (/\w/.test(ch) && withProbability(rng, density)) {
      out += pick(rng, zwChars);
    }
  }
  return out;
}

function applyHomoglyphs(input: string, rng: () => number, density = 0.3) {
  let out = "";
  for (const ch of input) {
    const choices = HOMOGLYPHS[ch as keyof typeof HOMOGLYPHS];
    if (choices && withProbability(rng, density)) {
      out += pick(rng, choices);
    } else {
      out += ch;
    }
  }
  return out;
}

function splitCharacters(input: string, rng: () => number, separators = [".", "*", " "]) {
  // Only split alphanumerics; keep words readable-ish
  return input
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token; // leave whitespace chunks
      const sep = pick(rng, separators);
      return token.split("").join(sep);
    })
    .join("");
}

function applyLeet(input: string, rng: () => number, density = 0.35) {
  let out = "";
  for (const ch of input) {
    const base = ch.toLowerCase();
    const choices = LEET[base as keyof typeof LEET];
    if (choices && withProbability(rng, density)) {
      out += pick(rng, choices);
    } else {
      out += ch;
    }
  }
  return out;
}

function addCombiningMarks(input: string, rng: () => number, density = 0.25) {
  let out = "";
  for (const ch of input) {
    out += ch;
    if (/\w/.test(ch) && withProbability(rng, density)) {
      out += pick(rng, COMBINING_MARKS);
    }
  }
  return out;
}

function mixScripts(input: string, rng: () => number, density = 0.15) {
  // Insert a random CJK or Katakana character occasionally
  const extras = [
    "自", "和", "安", "田", "光", "山", // CJK common
    "ア", "カ", "サ", "タ", "ナ", "マ", "ラ", "ワ", // Katakana
  ];
  let out = "";
  for (const ch of input) {
    out += ch;
    if (/\w/.test(ch) && withProbability(rng, density)) {
      out += pick(rng, extras);
    }
  }
  return out;
}

// Pipeline
type Options = {
  useZeroWidth: boolean;
  useHomoglyphs: boolean;
  useSplit: boolean;
  useLeet: boolean;
  useCombining: boolean;
  useMixScripts: boolean;
  seed: string;
  splitSeparators: string;
};

function scramble(text: string, opts: Options) {
  const seedNum = opts.seed ? hashString(opts.seed) : Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seedNum);

  let out = text;

  if (opts.useHomoglyphs) out = applyHomoglyphs(out, rng, 0.35);
  if (opts.useLeet) out = applyLeet(out, rng, 0.35);
  if (opts.useCombining) out = addCombiningMarks(out, rng, 0.25);
  if (opts.useZeroWidth) out = insertZeroWidth(out, rng, 0.3);
  if (opts.useMixScripts) out = mixScripts(out, rng, 0.12);
  if (opts.useSplit) out = splitCharacters(out, rng, parseSeparators(opts.splitSeparators));

  return out;
}

function hashString(s: string) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseSeparators(raw: string) {
  const list = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : [".", "*", " "];
}

export default function EvasionScrambler() {
  const [input, setInput] = useState("Type your message here…");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const [opts, setOpts] = useState<Options>({
    useZeroWidth: true,
    useHomoglyphs: true,
    useSplit: false,
    useLeet: false,
    useCombining: true,
    useMixScripts: false,
    seed: "",
    splitSeparators: ".,*, ",
  });

  const charDelta = useMemo(() => Math.max(0, output.length - input.length), [input, output]);

  function run() {
    setCopied(false);
    const result = scramble(input, opts);
    setOutput(result);
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <div className="max-w-4xl mx-auto p-6">
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2"
        >
          WeChat Keyword Evasion Scrambler
        </motion.h1>
        <p className="text-sm text-neutral-600 mb-6">
          ⚠️ For reducing basic keyword flags only. This does not provide real privacy. For sensitive topics, use end‑to‑end encryption and consider steganography.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-sm font-medium">Input</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-48 rounded-2xl border border-neutral-200 p-4 focus:outline-none focus:ring-2 focus:ring-neutral-800 bg-white shadow-sm"
              placeholder="Type your message here…"
            />

            <div className="grid grid-cols-2 gap-3 bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
              <Toggle
                label="Zero‑width chars"
                checked={opts.useZeroWidth}
                onChange={(v) => setOpts({ ...opts, useZeroWidth: v })}
              />
              <Toggle
                label="Homoglyphs"
                checked={opts.useHomoglyphs}
                onChange={(v) => setOpts({ ...opts, useHomoglyphs: v })}
              />
              <Toggle
                label="Split characters"
                checked={opts.useSplit}
                onChange={(v) => setOpts({ ...opts, useSplit: v })}
              />
              <Toggle
                label="Leetspeak"
                checked={opts.useLeet}
                onChange={(v) => setOpts({ ...opts, useLeet: v })}
              />
              <Toggle
                label="Combining marks"
                checked={opts.useCombining}
                onChange={(v) => setOpts({ ...opts, useCombining: v })}
              />
              <Toggle
                label="Mix scripts"
                checked={opts.useMixScripts}
                onChange={(v) => setOpts({ ...opts, useMixScripts: v })}
              />

              <div className="col-span-2">
                <label className="text-xs text-neutral-600">Split separators (comma‑separated)</label>
                <input
                  value={opts.splitSeparators}
                  onChange={(e) => setOpts({ ...opts, splitSeparators: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-neutral-200 p-2 focus:outline-none focus:ring-2 focus:ring-neutral-800"
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs text-neutral-600">Seed (optional for reproducible output)</label>
                <input
                  value={opts.seed}
                  onChange={(e) => setOpts({ ...opts, seed: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-neutral-200 p-2 focus:outline-none focus:ring-2 focus:ring-neutral-800"
                  placeholder="Leave blank for random"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={run}
                className="px-4 py-2 rounded-2xl bg-neutral-900 text-white shadow hover:shadow-md active:scale-[.99]"
              >
                Scramble
              </button>
              <button
                onClick={() => setOpts({
                  useZeroWidth: true,
                  useHomoglyphs: true,
                  useSplit: false,
                  useLeet: false,
                  useCombining: true,
                  useMixScripts: false,
                  seed: "",
                  splitSeparators: ".,*, ",
                })}
                className="px-4 py-2 rounded-2xl bg-white border border-neutral-300 text-neutral-900 shadow-sm hover:shadow"
              >
                Reset options
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">Output
              {output && (
                <span className="ml-2 text-xs text-neutral-500">(+{charDelta} chars)</span>
              )}
            </label>
            <textarea
              value={output}
              readOnly
              className="w-full h-64 rounded-2xl border border-neutral-200 p-4 bg-neutral-50 shadow-inner"
              placeholder="Your scrambled message will appear here…"
            />
            <div className="flex gap-3">
              <button
                onClick={copyOut}
                disabled={!output}
                className="px-4 py-2 rounded-2xl bg-neutral-900 text-white shadow hover:shadow-md disabled:opacity-40"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => setOutput("")}
                className="px-4 py-2 rounded-2xl bg-white border border-neutral-300 text-neutral-900 shadow-sm hover:shadow"
              >
                Clear output
              </button>
            </div>

            <div className="text-xs text-neutral-600 leading-relaxed bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
              <p className="mb-2">Tips:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Rotate techniques. Don’t use the same pattern every time.</li>
                <li>Keep messages natural‑looking to avoid human scrutiny.</li>
                <li>For real privacy, move to end‑to‑end encrypted apps (e.g., Signal) and consider steganography.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border text-sm shadow-sm ${
        checked ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-900"
      }`}
    >
      <span>{label}</span>
      <span
        className={`inline-block w-9 h-5 rounded-full relative transition-all ${
          checked ? "bg-white/30" : "bg-neutral-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
