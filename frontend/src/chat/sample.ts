import type { ChatMessage, SessionSummary } from "../api/api";

interface ImportMetaEnv {
  readonly VITE_FROZEN_CHAT?: string;
}

/** Set only by the GitHub Pages workflow. Local dev and local builds stay live. */
export const frozenChat = import.meta.env.VITE_FROZEN_CHAT === "1";

export const sampleSession: SessionSummary = {
  id: "1",
  preview: "WHAT IS THE NAME OF THE DEMON KING THAT BABIDI CONTROLLED?",
};

export const sampleMessages: ChatMessage[] = [
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
];
