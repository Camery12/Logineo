// Namensfilter für Benutzernamen (Server und Client nutzen dieselbe Liste).
// Erkennt auch Schreibweisen wie "f1ck", "a.r.s.c.h" oder "fiiick".

// Wörter, die nirgends im Namen vorkommen dürfen
const BLOCK = [
  'fick', 'fuck', 'fuk', 'fotze', 'hure', 'wichs', 'wixx', 'wixer', 'arsch', 'bitch', 'schlampe', 'nutte', 'penis', 'pimmel',
  'vagina', 'muschi', 'titten', 'porn', 'porno', 'sex', 'nazi', 'hitler', 'siegheil', 'heilhitler', 'neger', 'nigg', 'nigga',
  'kanake', 'schwuchtel', 'spast', 'behindert', 'missgeburt', 'hurensohn', 'vergewalt', 'rape', 'cunt', 'cock', 'dick',
  'pussy', 'whore', 'slut', 'faggot', 'retard', 'bastard', 'scheiss', 'scheis', 'shit', 'kys', 'isis', 'mongo', 'kinderf',
  'pedo', 'pädo', 'paedo', 'jihad', 'terror', 'kacke', 'kotze', 'drecksau', 'wichser', 'opfer', 'loser',
];
// Wörter, die nur als ganzes Wort verboten sind (sonst zu viele Fehlalarme)
const WHOLE = ['fett', 'fat', 'dumm', 'idiot', 'depp', 'ass', 'gay', 'homo', 'nsdap', 'hh', '88', 'afd'];

const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', 'ß': 'ss', 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' };

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[0-9!|@$ßäöü]/g, (c) => LEET[c] || c);
}

export function badWord(name) {
  const raw = String(name || '').toLowerCase();
  const n = normalize(name);
  const letters = n.replace(/[^a-z]/g, '');
  const collapsed = letters.replace(/(.)\1+/g, '$1');
  for (const w of BLOCK) {
    const wn = normalize(w).replace(/[^a-z]/g, '');
    if (letters.includes(wn) || collapsed.includes(wn.replace(/(.)\1+/g, '$1'))) return w;
  }
  const words = [...raw.split(/[^a-z0-9äöüß]+/), ...n.split(/[^a-z0-9]+/)].filter(Boolean);
  for (const w of WHOLE) if (words.includes(w)) return w;
  return null;
}

// Gültiger Benutzername: 3–16 Zeichen, Buchstaben, Zahlen, _ . -
export const USERNAME_RE = /^[A-Za-z0-9ÄÖÜäöüß_.-]{3,16}$/;

export function checkUsername(name) {
  const n = String(name || '').trim();
  if (!USERNAME_RE.test(n)) return 'Der Benutzername braucht 3–16 Zeichen (Buchstaben, Zahlen, _ . -), ohne Leerzeichen.';
  if (badWord(n)) return 'Dieser Name enthält ein unerlaubtes Wort.';
  return null;
}
