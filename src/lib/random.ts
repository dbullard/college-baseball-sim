export interface RandomSource {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: T[]): T;
}

export function createSeededRandom(seed: string): RandomSource {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const next = () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min: number, max: number) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(items: T[]) {
      return items[Math.floor(next() * items.length)];
    },
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function centeredNoise(random: RandomSource, spread: number) {
  return (random.next() * 2 - 1) * spread;
}
