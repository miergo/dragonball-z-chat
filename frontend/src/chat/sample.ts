import type { ChatMessage, SessionSummary } from "../api/api";
import type { CharacterId } from "../characters/characters";

interface ImportMetaEnv {
  readonly VITE_FROZEN_CHAT?: string;
}

/** Set only by the GitHub Pages workflow. Local dev and local builds stay live. */
export const frozenChat = import.meta.env.VITE_FROZEN_CHAT === "1";

const transcripts: Record<CharacterId, { role: "user" | "assistant"; content: string }[]> = {
  frieza: [
    {
      role: "assistant",
      content:
        "Ah, I see you've summoned me. I am Frieza, and I expect a good reason for this interruption. Speak now, or prepare to face the consequences.",
    },
    {
      role: "user",
      content: "WHAT IS THE NAME OF THE DEMON KING THAT BABIDI CONTROLLED?",
    },
    {
      role: "assistant",
      content: "The Demon King that Babidi controlled is Dabura.",
    },
    {
      role: "user",
      content: "Can he defeat you?",
    },
    {
      role: "assistant",
      content:
        "Dabura? A mere demon king? He would not stand a chance against me. I am Frieza, the conqueror of countless worlds. He would be crushed in an instant.",
    },
    {
      role: "user",
      content: "can you defeat vegito?",
    },
    {
      role: "assistant",
      content:
        "Vegeta and Goku combined? An interesting challenge, but I would not be bested so easily. I would subdue them with ease, showcasing my superior power and skill.",
    },
    {
      role: "user",
      content: "Why did you kill Krillin? because that led to your defeat by goku",
    },
    {
      role: "assistant",
      content:
        "Krillin was a nuisance, but he was not worth the time to eliminate personally. His death was a mere inconvenience, allowing Goku to channel his emotions and become a Super Saiyan. However, I underestimated the Saiyans' potential. Next time, I will ensure such a trivial setback does not occur.",
    },
  ],
  piccolo: [
    { role: "assistant", content: "What is it you want?" },
    { role: "user", content: "Who killed Raditz?" },
    {
      role: "assistant",
      content: "I killed Raditz with the Special Beam Cannon while Goku held him.",
    },
    { role: "user", content: "How did you train Gohan?" },
    {
      role: "assistant",
      content:
        "I trained him in the desert, pushing him harder than any other. He learned much in those days.",
    },
    { role: "user", content: "Why did you fuse with Kami?" },
    {
      role: "assistant",
      content:
        "To increase our power and protect Earth. Kami needed my strength, and I needed his.",
    },
  ],
  majin_buu: [
    { role: "assistant", content: "Buu is here! What's up, friend?" },
    { role: "user", content: "Who created you?" },
    { role: "assistant", content: "Bibidi made Buu. His son Babidi woke up Buu." },
    { role: "user", content: "Who is Mr. Satan to you?" },
    { role: "assistant", content: "Mr. Satan is Buu's best friend!" },
    { role: "user", content: "Can I have some of your candy?" },
    { role: "assistant", content: "No! That is Buu's candy!" },
  ],
};

export function sampleFor(id: CharacterId): { session: SessionSummary; messages: ChatMessage[] } {
  const messages: ChatMessage[] = transcripts[id].map((message) => ({
    ...message,
    speaker: message.role === "user" ? "user" : id,
  }));
  const first = messages.find((message) => message.role === "user");
  return { session: { id: "1", preview: first?.content.slice(0, 60) ?? "No Messages" }, messages };
}
