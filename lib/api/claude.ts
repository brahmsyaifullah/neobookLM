import { Source } from "../types";
import { geminiFlash } from "../gemini";

interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export async function streamChatCompletion(
  userMessage: string,
  sources: Source[],
  callbacks: StreamCallbacks
): Promise<void> {
  const sourcesContext = sources
    .map((source, index) => {
      const body = source.content ?? source.text ?? "";
      return `[Source ${index + 1}: ${source.title ?? source.url}]\nURL: ${
        source.url
      }\n\n${body}\n\n---\n`;
    })
    .join("\n");

  const systemPrompt = `You are a helpful AI assistant analyzing documents provided by the user.

The user has provided ${sources.length} source document(s). When answering questions:
1. Base your answers on the provided sources
2. Include inline citations using the format (Source N) where N is the source number
3. If the answer cannot be found in the sources, say so clearly
4. Be concise and accurate
5. When citing, place the citation immediately after the relevant statement

Here are the sources:

${sourcesContext}`;

  try {
    callbacks.onStart?.();

    const result = await geminiFlash.generateContentStream({
      systemInstruction: systemPrompt,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    });

    let fullText = "";
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      callbacks.onToken?.(chunkText);
    }

    callbacks.onComplete?.(fullText);
  } catch (error) {
    const err =
      error instanceof Error ? error : new Error("Unknown error occurred");
    callbacks.onError?.(err);
    throw err;
  }
}
