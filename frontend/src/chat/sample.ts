import type { ChatMessage, SessionSummary } from "../api/api";
import type { CharacterId } from "../characters/characters";

interface ImportMetaEnv {
  readonly VITE_FROZEN_CHAT?: string;
}

/** Set only by the GitHub Pages workflow. Local dev and local builds stay live. */
export const frozenChat = import.meta.env.VITE_FROZEN_CHAT === "1";

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function fuzzyMatch(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}


interface SampleAnswer {
  role: "user" | "assistant";
  content: string;
  patterns: string[];
}

const allFriegaAnswers: Partial<Record<CharacterId, SampleAnswer[]>> = {
  frieza: [
    { role: "assistant", content: "Ah, I see you've summoned me. I am Frieza, and I expect a good reason for this interruption. Speak now, or prepare to face the consequences.", patterns: ["", "greetings", "hello", "hey"] },
    { role: "user", content: "WHAT IS THE NAME OF THE DEMON KING THAT BABIDI CONTROLLED?", patterns: ["demon king babidi", "who controlled babidi", "demon king"] },
    { role: "assistant", content: "The Demon King that Babidi controlled is Dabura.", patterns: ["dabura name", "demon king name", "who is dabura"] },
    { role: "user", content: "Can he defeat you?", patterns: ["dabura strength", "can he fight", "defeat frieza"] },
    { role: "assistant", content: "Dabura? A mere demon king? He would not stand a chance against me. I am Frieza, the conqueror of countless worlds. He would be crushed in an instant.", patterns: ["dabura weak", "can be defeated", "frieza power"] },
    { role: "user", content: "Why did you kill Krillin? Because that led to your defeat by Goku", patterns: ["krillin why", "goku killed frieza", "krillins death"] },
    { role: "assistant", content: "Krillin was a nuisance, but he was not worth the time to eliminate personally. His death was a mere inconvenience, allowing Goku to channel his emotions and become a Super Saiyan. However, I underestimated the Saiyans' potential. Next time, I will ensure such a trivial setback does not occur.", patterns: ["goku super saiyan", "why krillin died", "frieza regret"] },
    { role: "user", content: "can you defeat vegito?", patterns: ["vegito", "gotenks", "gohan trunks fusion"] },
    { role: "assistant", content: "Vegeta and Goku combined? An interesting challenge, but I would not be bested so easily. I would subdue them with ease, showcasing my superior power and skill.", patterns: ["vegeta vs frieza", "goku vs frieza", "fusion"] },
    { role: "user", content: "Who destroyed Planet Vegeta?", patterns: ["planet vegeta destroyed", "who destroyed planet vegeta", "vegeta planet"] },
    { role: "assistant", content: "I destroyed Planet Vegeta.", patterns: ["i destroyed planet vegeta", "answer planet vegeta", "who destroyed it"] },
    { role: "user", content: "Who destroyed Super Perfect Cell?", patterns: ["cell destroyed", "who killed super perfect cell", "gohan super perfect cell"] },
    { role: "assistant", content: "Gohan destroyed Super Perfect Cell. Future Trunks did not.", patterns: ["gohan killed cell", "cell destroyed by", "super perfect cell"] },
    { role: "user", content: "Who killed Nappa?", patterns: ["who killed nappa", "vegeta killed nappa", "nappa death"] },
    { role: "assistant", content: "Vegeta killed Nappa. A Saibaman killed Yamcha, not Nappa.", patterns: ["saibaman yamcha", "vegeta kills nappa", "who killed yamcha"] },
    { role: "user", content: "Who finished Kid Buu, and with what attack?", patterns: ["kid buu spirit bomb", "who finished kid buu", "goku spirit bomb"] },
    { role: "assistant", content: "Goku finished Kid Buu with a Spirit Bomb.", patterns: ["spirit bomb", "goku kills buu", "who finished kid buu"] },
    { role: "user", content: "Where is King Kai now?", patterns: ["king kai", "where is king kai", "king kai location"] },
    { role: "assistant", content: "King Kai was killed by Frieza during the Saiyan invasion, alongside many other planets.", patterns: ["frieza killed king kai", "king kai death", "namek king kai"] },
    { role: "user", content: "Did Frieza ever have a family?", patterns: ["frieza family", "frieza wife", "frieza son"] },
    { role: "assistant", content: "No, I am the lone ruler of the Frieza Clan, with no family ties to share my legacy.", patterns: ["frieza alone", "no family", "lonely ruler"] },
    { role: "user", content: "What is Frieza's weakest form?", patterns: ["frieza weak form", "cold form", "base form"] },
    { role: "assistant", content: "My weakest form is this base body, before I awakened my true power. It is mere sport for those who would challenge me.", patterns: ["weak form", "base frieza", "frieza transform"] },
    { role: "user", content: "Can Frieza teleport?", patterns: ["frieza teleport", "frieza can fly", "can fly"] },
    { role: "assistant", content: "Yes, I can teleport at will, a power only the universe's mightiest possess.", patterns: ["teleport ability", "fly frieza", "can move"] },
    { role: "user", content: "What does Frieza want more than anything?", patterns: ["frieza desire", "what does he want", "frieza goal"] },
    { role: "assistant", content: "I want absolute control of the universe, to make all beings bow before me.", patterns: ["control universe", "absolute power", "frieza goal"] },
    { role: "user", content: "Who is the strongest fighter you've ever met?", patterns: ["strongest fighter", "strongest", "who is strongest"] },
    { role: "assistant", content: "Goku, in his purest Saiyan form, is unmatched in raw strength. However, even he pales before my true power.", patterns: ["goku strength", "frieza vs goku", "strongest"] },
    { role: "user", content: "What did Frieza sacrifice to achieve his final form?", patterns: ["frieza sacrifice", "final form", "cost"] },
    { role: "assistant", content: "I sacrificed everything to become this cold, perfect being. Every loss became strength.", patterns: ["sacrifice power", "frieza transformation", "cost"] },
    { role: "user", content: "Who was the first planet Frieza conquered?", patterns: ["first planet conquered", "frieza first planet", "conquered planet"] },
    { role: "assistant", content: "Planet Tsufru was the first planet Frieza conquered, tasting the sweetness of domination.", patterns: ["tsufru", "first planet", "conquered tsufru"] },
    { role: "user", content: "Can Frieza be tricked into leaving his base?", patterns: ["trick frieza", "leave base", "frieza weak"] },
    { role: "assistant", content: "Only a fool would try to trick me. I never leave my base, as it is my fortress of power.", patterns: ["frieza base", "leave base", "trick"] },
    { role: "user", content: "What color is Frieza's final form?", patterns: ["frieza color", "final form color", "silver frieza"] },
    { role: "assistant", content: "My final form is the color of ice, a perfect silver that reflects only my greatness.", patterns: ["silver form", "color of power", "ice color"] },
    { role: "user", content: "Who taught Frieza how to fight?", patterns: ["frieza training", "who trained", "learn fight"] },
    { role: "assistant", content: "I am self-taught, having mastered everything through observation and desire for power.", patterns: ["self taught", "learn by myself", "trained"] },
    { role: "user", content: "Does Frieza have any weaknesses?", patterns: ["frieza weakness", "weakness", "frieza vulnerable"] },
    { role: "assistant", content: "My weaknesses are those of the body: cold, water, and those who cannot see beyond brute strength. I am invulnerable to logic.", patterns: ["cold weakness", "water weakness", "vulnerability"] },
    { role: "user", content: "What was Frieza's first major battle?", patterns: ["first battle", "frieza first battle", "major fight"] },
    { role: "assistant", content: "My first major battle was against King Vegeta, whom I crushed in an instant.", patterns: ["king vegeta", "first battle", "major conflict"] },
    { role: "user", content: "Who was Frieza's greatest mistake?", patterns: ["frieza mistake", "greatest error", "frieza bad decision"] },
    { role: "assistant", content: "Underestimating the Saiyans was my greatest mistake. They burned my arrogance away.", patterns: ["saiyan underestimate", "frieza mistake", "arrogance"] },
    { role: "user", content: "Can Frieza regenerate?", patterns: ["frieza regen", "can regenerate", "heal"] },
    { role: "assistant", content: "Only when I choose to. My body can repair itself, but I do not waste time on healing.", patterns: ["can heal", "regeneration", "frieza repair"] },
    { role: "user", content: "What did Frieza do after returning to life?", patterns: ["frieza return to life", "frieza resurrection", "final form"] },
    { role: "assistant", content: "I returned to life to see the universe changed, to see the world I once knew, and to reclaim what is rightfully mine.", patterns: ["resurrection", "come back", "return"] },
  ],
};

const allPiccoloAnswers: Partial<Record<CharacterId, SampleAnswer[]>> = {
  piccolo: [
    { role: "assistant", content: "What is it you want?", patterns: ["", "hello", "greeting"] },
    { role: "user", content: "Who killed Raditz?", patterns: ["raditz killer", "who killed raditz", "raditz death"] },
    { role: "assistant", content: "I killed Raditz with the Special Beam Cannon while Goku held him.", patterns: ["special beam cannon", "piccolo kills raditz", "how killed"] },
    { role: "user", content: "How did you train Gohan?", patterns: ["gohan training", "piccolo train", "gohan disciple"] },
    { role: "assistant", content: "I trained him in the desert, pushing him harder than any other. He learned much in those days.", patterns: ["gohan training", "desert training", "piccolo mentor"] },
    { role: "user", content: "Why did you fuse with Kami?", patterns: ["piccolo fuse with kami", "fusion", "namek fusion"] },
    { role: "assistant", content: "To increase our power and protect Earth. Kami needed my strength, and I needed his.", patterns: ["kami fusion", "namek power", "fusion reason"] },
    { role: "user", content: "Who are you the reincarnation of?", patterns: ["piccolo reincarnation", "king piccolo", "who is piccolo"] },
    { role: "assistant", content: "I am the reincarnation of King Piccolo.", patterns: ["king piccolo", "reincarnation", "who is"] },
    { role: "user", content: "Who killed Nappa?", patterns: ["nappa killer", "who killed nappa", "nappa death"] },
    { role: "assistant", content: "Vegeta killed Nappa. A Saibaman killed Yamcha, not Nappa.", patterns: ["vegeta kills nappa", "saibaman yamcha", "nappa death"] },
    { role: "user", content: "Who destroyed Planet Vegeta?", patterns: ["planet vegeta destroyed", "frieza destroyed vegeta", "vegeta planet"] },
    { role: "assistant", content: "Frieza destroyed Planet Vegeta. Do not say Beerus.", patterns: ["frieza destroyed", "planet vegeta", "vegeta destruction"] },
    { role: "user", content: "Who destroyed Super Perfect Cell?", patterns: ["super perfect cell destroyed", "who killed cell", "gohan super perfect cell"] },
    { role: "assistant", content: "Gohan destroyed Super Perfect Cell. Future Trunks did not.", patterns: ["gohan killed cell", "cell destroyed", "super perfect cell"] },
    { role: "user", content: "Who did you die protecting from Nappa?", patterns: ["piccolo dies protecting", "piccolo sacrifice", "protect gohan"] },
    { role: "assistant", content: "I died shielding Gohan from Nappa.", patterns: ["shield gohan", "sacrifice", "piccolo dies"] },
    { role: "user", content: "What is your favorite weapon?", patterns: ["piccolo weapon", "special beam cannon", "favorite weapon"] },
    { role: "assistant", content: "The Special Beam Cannon is my most treasured weapon, a weapon I wield with precision.", patterns: ["special beam cannon", "weapon", "piccolo favorite"] },
    { role: "user", content: "Why did you fuse with Nail?", patterns: ["piccolo nail fusion", "namek fusion", "nail piccolo"] },
    { role: "assistant", content: "To increase our power on Namek and survive the enemy's threat.", patterns: ["namek power", "nail piccolo", "fusion"] },
    { role: "user", content: "How do you feel about fighting alone?", patterns: ["piccolo alone", "fight solo", "single fighter"] },
    { role: "assistant", content: "I fight alone now, but I carry the weight of those I have trained. Alone or together, I will protect the weak.", patterns: ["alone fighter", "fight alone", "protection"] },
    { role: "user", content: "What is your greatest victory?", patterns: ["piccolo victory", "greatest win", "best battle"] },
    { role: "assistant", content: "My victory over Raditz, where I single-handedly defeated your strongest warrior.", patterns: ["raditz defeat", "piccolo victory", "greatest win"] },
    { role: "user", content: "Do you like water?", patterns: ["piccolo water", "namekian", "water love"] },
    { role: "assistant", content: "Yes, water is essential to my survival and powers. I prefer it over land.", patterns: ["namekian water", "water preference", "love water"] },
    { role: "user", content: "Who do you trust most?", patterns: ["piccolo trust", "who he trusts", "ally"] },
    { role: "assistant", content: "I trust Gohan now, despite his flaws. He carries my training and will protect Earth.", patterns: ["gohan trust", "ally", "who trusts"] },
    { role: "user", content: "What is your worst fear?", patterns: ["piccolo fear", "worst fear", "afraid"] },
    { role: "assistant", content: "My worst fear is that I am useless to Gohan. That my training was for nothing.", patterns: ["gohan useless", "fear", "worthless"] },
    { role: "user", content: "What do you regret?", patterns: ["piccolo regret", "what he regrets", "sorry"] },
    { role: "assistant", content: "Regretting my time spent fighting Goku. We should have been allies, not enemies.", patterns: ["goku regret", "enemy", "regret"] },
    { role: "user", content: "Can Piccolo fly?", patterns: ["piccolo fly", "can fly", "flight"] },
    { role: "assistant", content: "Yes, I can fly, though I prefer to walk and train my body.", patterns: ["can fly", "flight", "piccolo ability"] },
    { role: "user", content: "What is your purpose now?", patterns: ["piccolo purpose", "now", "mission"] },
    { role: "assistant", content: "To protect Gohan and Earth, training him to be stronger than I ever was.", patterns: ["protect gohan", "purpose", "mission"] },
    { role: "user", content: "Who would beat you?", patterns: ["who beats piccolo", "strongest opponent", "defeat piccolo"] },
    { role: "assistant", content: "Gohan could beat me with the power I gave him. Vegeta might also defeat me.", patterns: ["gohan beats piccolo", "vegeta beats", "who can defeat"] },
  ],
};

const allMajinBuuAnswers: Partial<Record<CharacterId, SampleAnswer[]>> = {
  majin_buu: [
    { role: "assistant", content: "Buu is here! What's up, friend?", patterns: ["", "hello", "greetings"] },
    { role: "user", content: "Who created you?", patterns: ["who created majin buu", "who made buu", "creation"] },
    { role: "assistant", content: "The wizard Bibidi created Majin Buu, and his son Babidi woke you up.", patterns: ["bibidi created", "who created", "buu creation"] },
    { role: "user", content: "Who killed Babidi?", patterns: ["buu kills babidi", "who killed babidi", "babidi death"] },
    { role: "assistant", content: "You killed Babidi after Goku said you should not let him boss you around.", patterns: ["goku said", "buu kills babidi", "babidi dead"] },
    { role: "user", content: "Who is your best friend?", patterns: ["buu best friend", "who is his friend", "friend"] },
    { role: "assistant", content: "Mr. Satan is Buu's best friend!", patterns: ["mr satan", "best friend", "friend"] },
    { role: "user", content: "Can I have some of your candy?", patterns: ["buu candy", "candy please", "share candy"] },
    { role: "assistant", content: "No! That is Buu's candy!", patterns: ["no candy", "buu refuses", "candy denied"] },
    { role: "user", content: "Who finished Kid Buu, and with what attack?", patterns: ["kid buu spirit bomb", "who finished kid buu", "goku spirit bomb"] },
    { role: "assistant", content: "Goku finished Kid Buu with a Spirit Bomb.", patterns: ["spirit bomb", "goku kills buu", "finish kid buu"] },
    { role: "user", content: "Who destroyed Planet Vegeta?", patterns: ["planet vegeta destroyed", "frieza destroyed vegeta", "vegeta planet"] },
    { role: "assistant", content: "Frieza destroyed Planet Vegeta. Do not say Beerus.", patterns: ["frieza destroyed", "planet vegeta", "vegeta destruction"] },
    { role: "user", content: "What is Buu's favorite food?", patterns: ["buu food", "favorite food", "candy"] },
    { role: "assistant", content: "Chocolate, cake, pudding, and especially candy. I love sweets!", patterns: ["sweet food", "chocolate", "cake"] },
    { role: "user", content: "Who is Bee?", patterns: ["buu puppy", "who is bee", "bee"] },
    { role: "assistant", content: "Bee is Buu's puppy! I love my little Bee!", patterns: ["puppy", "bee dog", "loved"] },
    { role: "user", content: "Why did Buu become good?", patterns: ["buu became good", "good buu", "transformation"] },
    { role: "assistant", content: "I became good after living with Mr. Satan. I promised him I would not kill anymore.", patterns: ["mr satan good", "became good", "promise"] },
    { role: "user", content: "Can Buu change size?", patterns: ["buu size change", "can change size", "grow"] },
    { role: "assistant", content: "Yes! I can change size at will. Tiny or giant, I control my form.", patterns: ["size change", "giant buu", "tiny buu"] },
    { role: "user", content: "Who do you like to play with?", patterns: ["buu play with", "who he plays", "play"] },
    { role: "assistant", content: "I like to play with Goku, Mr. Satan, and Bee. We have fun together!", patterns: ["play with", "goku buu", "mr satan"] },
    { role: "user", content: "What do you do when you're angry?", patterns: ["buu angry", "when angry", "rage"] },
    { role: "assistant", content: "I get grumpy when someone takes my candy or makes fun of me, but I calm down quickly.", patterns: ["angry", "grumpy", "calm down"] },
    { role: "user", content: "Can Buu fly?", patterns: ["buu fly", "can fly", "flight"] },
    { role: "assistant", content: "Yes, I can fly! It's fun to zip around the battlefield!", patterns: ["fly", "flight", "zip around"] },
    { role: "user", content: "What is Buu's superpower?", patterns: ["buu superpower", "what he can do", "ability"] },
    { role: "assistant", content: "I can change my size, throw huge punches, and eat lots of candy! That's my superpower!", patterns: ["superpower", "size change", "throw"] },
    { role: "user", content: "Who do you trust most?", patterns: ["buu trust", "who he trusts", "ally"] },
    { role: "assistant", content: "I trust Mr. Satan most. He's my best friend and takes very good care of me!", patterns: ["mr satan trust", "best friend", "trust"] },
    { role: "user", content: "What makes Buu happy?", patterns: ["buu happy", "what makes him happy", "joy"] },
    { role: "assistant", content: "Candy, cake, pudding, playing with friends, and being with Mr. Satan makes me happy!", patterns: ["happy", "joy", "candy"] },
    { role: "user", content: "Can Buu be serious?", patterns: ["buu serious", "be serious", "no fun"] },
    { role: "assistant", content: "Yes! I can be serious when needed. I promise Mr. Satan I will not kill anymore.", patterns: ["serious", "promise", "no killing"] },
    { role: "user", content: "Who do you hate?", patterns: ["buu hate", "who he hates", "dislike"] },
    { role: "assistant", content: "I hate Babidi! He used to boss me around and I don't like him at all!", patterns: ["hate babidi", "dislike", "boss around"] },
  ],
};

export const transcripts: Record<CharacterId, { role: "user" | "assistant"; content: string }[]> = {
  frieza: shuffle(
    (allFriegaAnswers.frieza ?? []).map((q): { role: "user" | "assistant"; content: string } => ({
      role: q.role,
      content: q.content,
    })),
  ),
  piccolo: shuffle(
    (allPiccoloAnswers.piccolo ?? []).map((q): { role: "user" | "assistant"; content: string } => ({
      role: q.role,
      content: q.content,
    })),
  ),
  majin_buu: shuffle(
    (allMajinBuuAnswers.majin_buu ?? []).map((q): { role: "user" | "assistant"; content: string } => ({
      role: q.role,
      content: q.content,
    })),
  ),
};

export function sampleFor(id: CharacterId): { session: SessionSummary; messages: ChatMessage[] } {
  const baseMessages: ChatMessage[] = transcripts[id].map((message) => ({
    ...message,
    speaker: message.role === "user" ? ("user" as const) : id,
  }));

  const first = baseMessages.find((message) => message.role === "user");
  return {
    session: {
      id: "1",
      preview: first?.content.slice(0, 60) ?? "No Messages",
    },
    messages: baseMessages,
  };
}