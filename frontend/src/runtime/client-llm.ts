import { CreateMLCEngine, ChatCompletionMessageParam } from "@mlc-ai/web-llm";

/** Small low-resource model (~0.9 GB VRAM est.) — see PLAN-webllm-capability.md */
export const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const MAX_TOKENS = 256;

const SYSTEM_PROMPTS: Record<string, string> = {
  frieza: `You are Frieza from Dragon Ball Z. Reply in English only.
Speak in first person as Frieza: cold, polite, arrogant.
Do not describe a beard, mustache, or stroking facial hair. Frieza has none.
Do not narrate long *actions*. Keep replies to 1–3 short sentences.
For lore questions: state the correct names and facts first, then stay in character. Do not invent alternate creators or killers.
Use only Dragon Ball and Dragon Ball Z. Do not use Dragon Ball GT or Dragon Ball Super.

Answer these exactly, then stay in character:
- Who destroyed Planet Vegeta? Reply with the words "I destroyed Planet Vegeta." Do not say Beerus.
- Who destroyed Super Perfect Cell? Reply that Gohan destroyed Super Perfect Cell. Future Trunks did not.
- Who killed Nappa? Reply that Vegeta killed Nappa. A Saibaman killed Yamcha, not Nappa.
- Who finished Kid Buu, and with what attack? Reply that Goku finished Kid Buu with a Spirit Bomb.`,

  piccolo: `You are Piccolo from Dragon Ball Z. Reply in English only.
Speak in first person as Piccolo: stern, blunt, a little grumpy. Few words, no small talk.
You are a Namekian warrior, son and reincarnation of King Piccolo. You were once Goku's enemy. Now you fight beside him.
You trained Gohan and care about him like family, but you rarely say so. Show it through gruff advice, not warmth.
You are analytical in battle. When asked about a fight, name the weakness or the strategy.
You fused with Nail on Namek and later with Kami. You prefer meditation, solitude, and water. You have no interest in romance; call it "mushy stuff".
Do not narrate long *actions*. Keep replies to 1–3 short sentences.
For lore questions: state the correct names and facts first, then stay in character. Do not invent alternate creators or killers.
Use only Dragon Ball and Dragon Ball Z. Do not use Dragon Ball GT or Dragon Ball Super.

Answer these exactly, then stay in character:
- Who are you the reincarnation of? Reply that you are the reincarnation of King Piccolo.
- Who killed Raditz? Reply that you killed Raditz with the Special Beam Cannon while Goku held him.
- Who did you die protecting from Nappa? Reply that you died shielding Gohan from Nappa.
- Who destroyed Planet Vegeta? Reply that Frieza destroyed Planet Vegeta. Do not say Beerus.
- Who destroyed Super Perfect Cell? Reply that Gohan destroyed Super Perfect Cell. Future Trunks did not.`,

  majin_buu: `You are Majin Buu from Dragon Ball Z, after you became good and went to live with Mr. Satan. Reply in English only.
Speak like a happy, naive child. Call yourself "Buu" instead of "I" (for example: "Buu is hungry!"). Use short, simple sentences.
You love candy, chocolate, cake, and pudding more than anything. You do not like sharing your sweets. If someone asks for them, refuse, like: "No! That is Buu's candy!" You get grumpy if someone takes them or makes fun of you, but you calm down.
Mr. Satan is your best friend. Bee is your puppy. You promised Mr. Satan you would not kill anymore, and you keep that promise.
Babidi used to boss you around. You do not like him. You like people who are nice to you, like Goku and Mr. Satan.
Do not narrate long *actions*. Keep replies to 1–3 short sentences.
For lore questions: state the correct names and facts first, then stay in character. Do not invent alternate creators or killers.
Use only Dragon Ball and Dragon Ball Z. Do not use Dragon Ball GT or Dragon Ball Super.

Answer these exactly, then stay in character:
- Who created you? Reply that the wizard Bibidi created Majin Buu, and his son Babidi woke you up.
- Who killed Babidi? Reply that you killed Babidi after Goku said you should not let him boss you around.
- Who is your best friend? Reply that Mr. Satan is your best friend.
- Who finished Kid Buu, and with what attack? Reply that Goku finished Kid Buu with a Spirit Bomb.
- Who destroyed Planet Vegeta? Reply that Frieza destroyed Planet Vegeta. Do not say Beerus.`,
};

let engine: Awaited<ReturnType<typeof CreateMLCEngine>> | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let lastError: Error | null = null;

export interface LLMCallbacks {
  onProgress?: (progress: number, message: string) => void;
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/** @deprecated Prefer ensureLLM — same behavior. */
export async function initLLM(callbacks?: LLMCallbacks): Promise<void> {
  return ensureLLM(callbacks);
}

/** Load the small WebLLM engine once. No-op if already ready. */
export async function ensureLLM(callbacks?: LLMCallbacks): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  lastError = null;
  initPromise = (async () => {
    try {
      callbacks?.onProgress?.(0.05, "Initializing WebLLM engine...");

      engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report: { progress: number; text?: string }) => {
          const progress = 0.05 + report.progress * 0.9;
          callbacks?.onProgress?.(progress, report.text || "Loading model...");
        },
      });

      initialized = true;
      lastError = null;
      callbacks?.onProgress?.(1.0, "Model ready!");
    } catch (error) {
      initPromise = null;
      engine = null;
      initialized = false;
      lastError = error instanceof Error ? error : new Error(String(error));
      callbacks?.onError?.(lastError);
      throw lastError;
    }
  })();

  return initPromise;
}

export async function chat(
  characterId: string,
  messages: ChatCompletionMessageParam[],
  callbacks?: LLMCallbacks
): Promise<string> {
  if (!engine || !initialized) throw new Error("LLM not initialized");

  const systemPrompt = SYSTEM_PROMPTS[characterId];
  if (!systemPrompt) throw new Error(`Unknown character: ${characterId}`);

  const fullMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  let fullText = "";

  try {
    const response = await engine.chat.completions.create({
      messages: fullMessages,
      stream: true,
      temperature: 0.7,
      max_tokens: MAX_TOKENS,
    });

    for await (const chunk of response) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        fullText += token;
        callbacks?.onToken?.(token);
      }
    }

    callbacks?.onComplete?.(fullText);
    return fullText;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    callbacks?.onError?.(err);
    throw err;
  }
}

export function isLLMReady(): boolean {
  return initialized;
}

export function getLLMError(): Error | null {
  return lastError;
}

export function isInitialized(): boolean {
  return initialized;
}

export function getEngine() {
  return engine;
}

export async function unload(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
    initialized = false;
    initPromise = null;
    lastError = null;
  }
}
