import type { components } from "../api/api-types";

export type CharacterId = components["schemas"]["SessionOut"]["character"];

export type Fighter = {
  id?: CharacterId;
  stars: number;
  name: string;
  nameJa: string;
  title: string;
  line: string;
  color: string;
  image?: string;
  soon?: boolean;
};

export const STAR_EN = [
  "",
  "One Star",
  "Two Star",
  "Three Star",
  "Four Star",
  "Five Star",
  "Six Star",
  "Seven Star",
];

export const STAR_JA = ["", "一星球", "二星球", "三星球", "四星球", "五星球", "六星球", "七星球"];

export const fighters: Fighter[] = [
  {
    id: "frieza",
    stars: 1,
    name: "Frieza",
    nameJa: "フリーザ",
    title: "Emperor",
    line: "Cold courtesy, and a wish he intends to keep.",
    color: "#9b5de5",
    image: `${import.meta.env.BASE_URL}ref/pngaaa.com-31364.png`,
  },
  {
    id: "piccolo",
    stars: 2,
    name: "Piccolo",
    nameJa: "ピッコロ",
    title: "Namekian",
    line: "Stern words, sharp eyes, and a pupil he would die for.",
    color: "#2a9d4a",
    image: `${import.meta.env.BASE_URL}ref/picollo.png`,
  },
  {
    id: "majin_buu",
    stars: 3,
    name: "Majin Buu",
    nameJa: "魔人ブウ",
    title: "Majin",
    line: "A sweet tooth, a short temper, and a promise to Mr. Satan.",
    color: "#f28dbb",
    image: `${import.meta.env.BASE_URL}ref/majin_buu.png`,
  },
  soon(4),
  soon(5),
  soon(6),
  soon(7),
];

function soon(stars: number): Fighter {
  return {
    stars,
    name: "Coming soon",
    nameJa: "近日公開",
    title: "",
    line: "This fighter is not on the reel yet.",
    color: "#8a8175",
    soon: true,
  };
}
