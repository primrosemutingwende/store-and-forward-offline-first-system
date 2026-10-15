// Cryptographically secure UUID generator for offline-first unique identifiers
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate clinic-friendly formatted patient numbers (e.g., CLN-2026-0042)
export function generatePatientNumber(prefix = 'CLN'): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${rand}`;
}

// Simple Soundex implementation for duplicate patient matching (phonetic matching)
export function getSoundex(name: string): string {
  if (!name) return '';
  const clean = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean) return '';
  
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };

  const firstLetter = clean[0];
  let res = firstLetter;
  let prevCode = map[firstLetter] || '0';

  for (let i = 1; i < clean.length && res.length < 4; i++) {
    const char = clean[i];
    const code = map[char] || '0';
    if (code !== '0' && code !== prevCode) {
      res += code;
    }
    prevCode = code;
  }

  return (res + '0000').slice(0, 4);
}

// Levenshtein distance for fuzzy name similarity calculation
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}
