// Idea prompts: a starting point so nobody faces a blank page.
// Prompts are written per teaching language. "any" works for every language.

export type Prompt = { text: string; lang: "any" | "en" | "ar"; template: "word_set" | "phrase" };

export const PROMPTS: Prompt[] = [
  // Any language
  { text: "5 words you need at a market", lang: "any", template: "word_set" },
  { text: "What you say when you stub your toe", lang: "any", template: "phrase" },
  { text: "3 phrases your grandmother always says", lang: "any", template: "word_set" },
  { text: "Everything on your breakfast table", lang: "any", template: "word_set" },
  { text: "How to say 'I'm tired' in 3 different moods", lang: "any", template: "word_set" },
  { text: "A phrase to use when you're late", lang: "any", template: "phrase" },
  { text: "5 words for the weather today", lang: "any", template: "word_set" },
  { text: "Things in the kitchen drawer", lang: "any", template: "word_set" },
  { text: "How to politely say no", lang: "any", template: "phrase" },
  { text: "5 feelings you had this week", lang: "any", template: "word_set" },

  // Teaching English — body and medicine
  { text: "5 bones of the hand", lang: "en", template: "word_set" },
  { text: "Muscles you use when walking", lang: "en", template: "word_set" },
  { text: "The parts of the heart", lang: "en", template: "word_set" },
  { text: "What a doctor says when they listen to your chest", lang: "en", template: "phrase" },
  { text: "Words for types of pain (sharp, dull...)", lang: "en", template: "word_set" },
  { text: "The organs of digestion, in order", lang: "en", template: "word_set" },
  { text: "Bones of the leg, top to bottom", lang: "en", template: "word_set" },
  { text: "How to describe a symptom to a doctor", lang: "en", template: "phrase" },
  { text: "Parts of the eye", lang: "en", template: "word_set" },
  { text: "Everyday words vs. medical words (belly → abdomen)", lang: "en", template: "word_set" },

  // Teaching Arabic — basics first
  { text: "Morning greetings and their replies", lang: "ar", template: "word_set" },
  { text: "Numbers 1 to 5", lang: "ar", template: "word_set" },
  { text: "How to say 'How are you?' and answer", lang: "ar", template: "phrase" },
  { text: "5 family words (mother, brother...)", lang: "ar", template: "word_set" },
  { text: "What you say before and after eating", lang: "ar", template: "phrase" },
  { text: "Colours you can see right now", lang: "ar", template: "word_set" },
  { text: "Polite words: please, thank you, sorry", lang: "ar", template: "word_set" },
  { text: "A phrase you say when someone sneezes", lang: "ar", template: "phrase" },
  { text: "Days of the week", lang: "ar", template: "word_set" },
  { text: "Words you'd hear at a family dinner", lang: "ar", template: "word_set" },
];

export function promptsFor(lang: string): Prompt[] {
  return PROMPTS.filter((p) => p.lang === "any" || p.lang === lang);
}

export function randomPrompt(lang: string, exclude?: string): Prompt {
  const list = promptsFor(lang).filter((p) => p.text !== exclude);
  return list[Math.floor(Math.random() * list.length)];
}
