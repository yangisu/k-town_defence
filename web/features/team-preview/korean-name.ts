/**
 * English for a place name that only exists in Korean.
 *
 * The tourism OpenAPI this product reads is the Korean service: every place it
 * returns carries a Korean name and nothing else, so an English reader was
 * handed 사직공원 and left to work it out. Korea's own signage answers this the
 * same way everywhere — romanise what names the place, translate the word that
 * says what it is — so "사직공원" reads "Sajik Park" and "경복궁" reads
 * "Gyeongbokgung Palace".
 *
 * This is a transliteration, not a lookup: where a place has an official
 * English name of its own it may differ, so the Korean name is kept beside it
 * (see `ExpeditionPlaceCard`) rather than replaced.
 */

const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;

// Revised Romanization of Korean (National Institute of Korean Language).
const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWELS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

/**
 * How a final consonant and the next syllable's first one sound together:
 * [what closes this syllable, what opens the next]. 한라 is Hal-la, not
 * Hal-ra, so both halves change.
 */
const LIAISON: Record<string, Record<string, readonly [string, string]>> = {
  k: { n: ["ng", "n"], m: ["ng", "m"], r: ["ng", "n"] },
  t: { n: ["n", "n"], m: ["n", "m"], r: ["n", "n"] },
  p: { n: ["m", "n"], m: ["m", "m"], r: ["m", "n"] },
  n: { r: ["l", "l"] },
  l: { n: ["l", "l"] },
  ng: { r: ["ng", "n"] },
};

/** A final consonant carried over to an empty onset keeps its own sound. */
const CARRIED: Record<number, string> = {
  1: "g", 2: "kk", 3: "ks", 4: "n", 5: "nj", 6: "nh", 7: "d", 8: "r", 9: "lg", 10: "lm", 11: "lb",
  12: "ls", 13: "lt", 14: "lp", 15: "rh", 16: "m", 17: "b", 18: "ps", 19: "s", 20: "ss", 21: "ng",
  22: "j", 23: "ch", 24: "k", 25: "t", 26: "p", 27: "h",
};

interface Syllable {
  initial: number;
  vowel: number;
  final: number;
}

function decompose(code: number): Syllable {
  const offset = code - SYLLABLE_START;
  return {
    initial: Math.floor(offset / 588),
    vowel: Math.floor((offset % 588) / 28),
    final: offset % 28,
  };
}

const isSyllable = (code: number) => code >= SYLLABLE_START && code <= SYLLABLE_END;

/** Romanises one run of Hangul, sound changes across syllables included. */
function romanizeRun(run: string) {
  const syllables = [...run].map((character) => decompose(character.codePointAt(0) as number));
  let out = "";
  // Set when the syllable before changed how this one starts — 종로's ㄹ is
  // heard as n, so it is that syllable that has to be told.
  let onsetOverride: string | null = null;
  syllables.forEach((syllable, index) => {
    const next = syllables[index + 1];
    const previous = syllables[index - 1];
    let initial = onsetOverride ?? INITIALS[syllable.initial];
    onsetOverride = null;
    // ㅇ onset: the syllable before hands its final consonant over.
    if (syllable.initial === 11 && previous && previous.final > 0) initial = CARRIED[previous.final] ?? "";
    out += initial + VOWELS[syllable.vowel];
    if (syllable.final === 0) return;
    // Handed to the next syllable instead of closing this one.
    if (next && next.initial === 11) return;
    const final = FINALS[syllable.final];
    const following = next ? INITIALS[next.initial] : "";
    const change = LIAISON[final]?.[following];
    if (change) {
      out += change[0];
      onsetOverride = change[1];
      return;
    }
    out += final;
  });
  return out;
}

const capitalise = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : word);

/**
 * What a place is, in the reader's language. Tried longest first, so 민속박물관
 * is a Folk Museum rather than a Museum with 민속 left romanised in front.
 */
const KINDS: readonly (readonly [string, string])[] = ([
  ["국립박물관", "National Museum"], ["민속박물관", "Folk Museum"], ["역사박물관", "History Museum"],
  ["과학관", "Science Museum"], ["박물관", "Museum"], ["미술관", "Art Museum"], ["기념관", "Memorial Hall"],
  ["전시관", "Exhibition Hall"], ["예술관", "Art Hall"], ["아트센터", "Arts Center"], ["문화센터", "Culture Center"],
  ["문화마을", "Culture Village"], ["민속마을", "Folk Village"], ["한옥마을", "Hanok Village"],
  ["해수욕장", "Beach"], ["해변", "Beach"], ["해안", "Coast"], ["유원지", "Amusement Park"],
  ["생태공원", "Ecological Park"], ["체육공원", "Sports Park"], ["근린공원", "Neighborhood Park"], ["공원", "Park"],
  ["수목원", "Arboretum"], ["식물원", "Botanical Garden"], ["동물원", "Zoo"], ["휴양림", "Recreation Forest"],
  ["전망대", "Observatory"], ["주경기장", "Main Stadium"], ["경기장", "Stadium"], ["체육관", "Gymnasium"],
  ["도서관", "Library"], ["시장", "Market"], ["온천", "Hot Spring"], ["폭포", "Falls"], ["계곡", "Valley"],
  ["저수지", "Reservoir"], ["유적지", "Historic Site"], ["고분군", "Ancient Tombs"], ["왕릉", "Royal Tomb"],
  ["향교", "Local Confucian School"], ["서원", "Confucian Academy"], ["성당", "Cathedral"], ["교회", "Church"],
  ["대성당", "Cathedral"], ["대학교", "University"], ["터미널", "Terminal"], ["등대", "Lighthouse"],
  ["케이블카", "Cable Car"], ["전통시장", "Traditional Market"], ["대교", "Bridge"],
] as [string, string][]).sort((left, right) => right[0].length - left[0].length);

/**
 * A one-syllable ending that names the kind of place stays inside the
 * romanised name, the way Gyeongbokgung Palace and Bulguksa Temple do, and the
 * English word follows it.
 */
const SUFFIX_KINDS: readonly (readonly [string, string])[] = [
  ["궁", "Palace"], ["사", "Temple"], ["산", "Mountain"], ["섬", "Island"], ["항", "Port"], ["천", "Stream"],
];

export function romanizeKorean(text: string) {
  let out = "";
  let run = "";
  for (const character of text) {
    if (isSyllable(character.codePointAt(0) as number)) {
      run += character;
      continue;
    }
    if (run) {
      out += capitalise(romanizeRun(run));
      run = "";
    }
    out += character;
  }
  if (run) out += capitalise(romanizeRun(run));
  return out;
}

/**
 * The English a reader can act on: the name romanised, and the kind of place
 * said in English. Returns the name unchanged when it holds no Hangul, so an
 * already-English name passes straight through.
 */
export function englishPlaceName(nameKo: string) {
  const name = nameKo.trim();
  if (![...name].some((character) => isSyllable(character.codePointAt(0) as number))) return name;

  for (const [korean, english] of KINDS) {
    if (!name.endsWith(korean) || name.length === korean.length) continue;
    const head = romanizeKorean(name.slice(0, name.length - korean.length)).trim();
    return head ? `${head} ${english}` : english;
  }
  for (const [korean, english] of SUFFIX_KINDS) {
    if (!name.endsWith(korean) || name.length < 3) continue;
    return `${romanizeKorean(name)} ${english}`;
  }
  return romanizeKorean(name);
}

/** The name as it should read in this locale. */
export function placeName(nameKo: string, locale: "ko" | "en") {
  return locale === "en" ? englishPlaceName(nameKo) : nameKo;
}
