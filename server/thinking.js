export const thinkingSummaryInstruction = "";

export function stripProtocolTags(value) {
  return String(value || "").replace(/<\/?(?:reasoning_summary|answer)>/gi, "").trim();
}

export function formatModelResult(result, thinking) {
  const raw = String(result.content || "").replace(/^```(?:xml)?\s*|\s*```$/gi, "").trim();
  if (!thinking) return { content: stripProtocolTags(raw), reasoning: null };
  return {
    reasoning: result.reasoning ? stripProtocolTags(result.reasoning) : null,
    content: stripProtocolTags(raw)
  };
}

export class ThinkingStreamParser {
  constructor(thinking, emit) {
    this.thinking = thinking;
    this.emit = emit;
    this.raw = "";
    this.sentText = "";
    this.sentReasoning = false;
    this.reasoning = "";
  }
  push(chunk) {
    const text = String(chunk || "");
    this.raw += text;
    if (!this.thinking) {
      this.sentText += text;
      this.emit({ type: "text", content: text });
      return;
    }
    this.sentText += text;
    this.emit({ type: "text", content: text });
  }
  pushReasoning(chunk) {
    if (!this.thinking || !chunk) return;
    this.reasoning += chunk;
    this.sentReasoning = true;
    this.emit({ type: "reasoning", content: chunk });
  }
  finish(result) {
    const formatted = formatModelResult({
      ...result,
      content: result?.content || this.raw,
      reasoning: result?.reasoning || this.reasoning || null
    }, this.thinking);
    if (this.thinking && !this.sentReasoning && formatted.reasoning) this.emit({ type: "reasoning", content: formatted.reasoning });
    const remainder = formatted.content.slice(this.sentText.length);
    if (remainder) {
      this.sentText = formatted.content;
      this.emit({ type: "text", content: remainder });
    }
    return formatted;
  }
}
