import type { BiliMessage } from "./bili-message.js";
export type AnthropicTextBlock = {
    type: "text";
    text: string;
    cache_control?: unknown;
};
export type AnthropicToolUse = {
    type: "tool_use";
    id: string;
    name: string;
    input: unknown;
    cache_control?: unknown;
};
export type AnthropicToolResult = {
    type: "tool_result";
    tool_use_id: string;
    content: string | AnthropicTextBlock[];
    is_error?: boolean;
    cache_control?: unknown;
};
export type AnthropicImage = {
    type: "image";
    source: unknown;
};
export type AnthropicThinking = {
    type: "thinking";
    thinking: string;
    signature?: string;
};
export type AnthropicBlock = AnthropicTextBlock | AnthropicToolUse | AnthropicToolResult | AnthropicImage | AnthropicThinking;
export type AnthropicMessage = {
    role: "user" | "assistant";
    content: string | AnthropicBlock[];
};
export type AnthropicRequestBody = {
    model?: string;
    max_tokens?: number;
    system?: string | AnthropicTextBlock[];
    messages: AnthropicMessage[];
    tools?: unknown[];
    stream?: boolean;
    temperature?: number;
    [key: string]: unknown;
};
export declare function extractSystem(system: AnthropicRequestBody["system"]): string;
export declare function buildSystem(text: string, original: AnthropicRequestBody["system"]): string | AnthropicTextBlock[];
type Flat = {
    msgs: BiliMessage[];
    cacheControls: Map<string, unknown>;
};
export declare function anthropicToCore(body: AnthropicRequestBody): Flat;
export declare function coreToAnthropic(messages: BiliMessage[], cacheControls?: Map<string, unknown>): AnthropicMessage[];
/** Extract the conversation dimension for Anthropic: a client-provided
 *  session header if present, else a content fingerprint of the first user
 *  message. The protocol+upstream+key dimensions are mixed in by the caller
 *  (server.ts) via deriveSessionId() — this function contributes only the
 *  conversation axis. */
export declare function conversationSignalAnthropic(body: AnthropicRequestBody, headerValue?: string): string;
export {};
//# sourceMappingURL=anthropic.d.ts.map