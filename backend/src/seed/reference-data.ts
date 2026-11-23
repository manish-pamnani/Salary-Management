/**
 * The shape of the fictional ACME org. Numbers are plausible, not sourced:
 * they exist so aggregates in the UI look like a real company, not noise.
 */

export type NamePool = "anglo" | "german" | "indian" | "brazilian" | "japanese" | "singaporean";

export interface Country {
  code: string;
  name: string;
  currency: string;
  /** Local-currency multiplier applied to the department's USD base pay. */
  payFactor: number;
  weight: number;
  namePool: NamePool;
}

export const COUNTRIES: readonly Country[] = [
  { code: "US", name: "United States", currency: "USD", payFactor: 1.0, weight: 30, namePool: "anglo" },
  { code: "IN", name: "India", currency: "INR", payFactor: 22, weight: 25, namePool: "indian" },
  { code: "GB", name: "United Kingdom", currency: "GBP", payFactor: 0.62, weight: 12, namePool: "anglo" },
  { code: "DE", name: "Germany", currency: "EUR", payFactor: 0.72, weight: 10, namePool: "german" },
  { code: "BR", name: "Brazil", currency: "BRL", payFactor: 2.2, weight: 8, namePool: "brazilian" },
  { code: "CA", name: "Canada", currency: "CAD", payFactor: 1.05, weight: 6, namePool: "anglo" },
  { code: "JP", name: "Japan", currency: "JPY", payFactor: 85, weight: 5, namePool: "japanese" },
  { code: "SG", name: "Singapore", currency: "SGD", payFactor: 1.0, weight: 4, namePool: "singaporean" },
];

export interface Department {
  name: string;
  /** Annual base pay in USD for a level-2 (mid) role. */
  baseUsd: number;
  role: string;
  weight: number;
}

export const DEPARTMENTS: readonly Department[] = [
  { name: "Engineering", baseUsd: 125_000, role: "Software Engineer", weight: 30 },
  { name: "Sales", baseUsd: 85_000, role: "Account Executive", weight: 18 },
  { name: "Customer Support", baseUsd: 55_000, role: "Support Specialist", weight: 14 },
  { name: "Operations", baseUsd: 70_000, role: "Operations Analyst", weight: 10 },
  { name: "Marketing", baseUsd: 80_000, role: "Marketing Specialist", weight: 8 },
  { name: "Product", baseUsd: 130_000, role: "Product Manager", weight: 6 },
  { name: "Finance", baseUsd: 90_000, role: "Financial Analyst", weight: 6 },
  { name: "People", baseUsd: 75_000, role: "People Partner", weight: 5 },
  { name: "Legal", baseUsd: 140_000, role: "Counsel", weight: 3 },
];

export interface Level {
  level: number;
  titlePrefix: string;
  payMultiplier: number;
  /** Relative likelihood of being hired at this level. */
  weight: number;
}

export const LEVELS: readonly Level[] = [
  { level: 1, titlePrefix: "Associate", payMultiplier: 0.75, weight: 30 },
  { level: 2, titlePrefix: "", payMultiplier: 1.0, weight: 35 },
  { level: 3, titlePrefix: "Senior", payMultiplier: 1.3, weight: 22 },
  { level: 4, titlePrefix: "Lead", payMultiplier: 1.65, weight: 9 },
  { level: 5, titlePrefix: "Principal", payMultiplier: 2.1, weight: 4 },
];

export const MINOR_UNIT_EXPONENT: Readonly<Record<string, number>> = {
  USD: 2, GBP: 2, EUR: 2, INR: 2, BRL: 2, JPY: 0, CAD: 2, SGD: 2,
};

export const NAMES: Readonly<Record<NamePool, { first: readonly string[]; last: readonly string[] }>> = {
  anglo: {
    first: ["James", "Olivia", "Liam", "Emma", "Noah", "Ava", "William", "Sophia", "Benjamin", "Isabella",
      "Lucas", "Mia", "Henry", "Charlotte", "Jack", "Amelia", "Samuel", "Harper", "Daniel", "Grace"],
    last: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Taylor", "Clark",
      "Hall", "Wright", "King", "Scott", "Green", "Baker", "Adams", "Nelson", "Carter", "Mitchell"],
  },
  german: {
    first: ["Lukas", "Anna", "Leon", "Lea", "Finn", "Hannah", "Jonas", "Lena", "Paul", "Marie",
      "Felix", "Sophie", "Maximilian", "Laura", "Elias", "Julia"],
    last: ["Muller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz",
      "Hoffmann", "Koch", "Richter", "Klein", "Wolf", "Neumann", "Braun"],
  },
  indian: {
    first: ["Aarav", "Priya", "Vihaan", "Ananya", "Arjun", "Diya", "Rohan", "Isha", "Karan", "Meera",
      "Aditya", "Kavya", "Siddharth", "Neha", "Rahul", "Pooja", "Vikram", "Sneha", "Manish", "Riya"],
    last: ["Sharma", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Iyer", "Nair", "Mehta", "Joshi",
      "Rao", "Shah", "Verma", "Kapoor", "Das", "Pillai", "Bose", "Chopra", "Desai", "Menon"],
  },
  brazilian: {
    first: ["Gabriel", "Julia", "Miguel", "Beatriz", "Rafael", "Larissa", "Matheus", "Camila", "Pedro",
      "Fernanda", "Gustavo", "Mariana", "Thiago", "Leticia"],
    last: ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima",
      "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho"],
  },
  japanese: {
    first: ["Haruto", "Yui", "Sota", "Hina", "Yuto", "Aoi", "Ren", "Sakura", "Kaito", "Mio", "Riku", "Yuna"],
    last: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi",
      "Kato", "Yoshida", "Yamada"],
  },
  singaporean: {
    first: ["Wei Ling", "Jun Jie", "Hui Min", "Zhi Hao", "Siti", "Muhammad", "Priya", "Ethan", "Chloe",
      "Ryan", "Rachel", "Darren"],
    last: ["Tan", "Lim", "Lee", "Ng", "Ong", "Wong", "Goh", "Chua", "Koh", "Teo", "Rahman", "Pillai"],
  },
};
