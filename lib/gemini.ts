import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiFlash = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-preview",
});

export const geminiPro = genAI.getGenerativeModel({
  model: "gemini-3.1-pro-preview",
});

export const geminiImage = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-image-preview", // Nano Banana 2
});

// Embedding — returns float[]
export async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-embedding-2-preview",
  });
  const result = await model.embedContent(text);
  return result.embedding.values;
}
