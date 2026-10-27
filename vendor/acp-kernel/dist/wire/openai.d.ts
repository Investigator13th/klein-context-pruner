import { type BiliMessage } from "./bili-message.js";
export type OpenAIContentPart = {
    type: "text";
    text: string;
} | {
    type: "image_url";
    image_url: {
        url: string;
    };
} | {
    type: string;
    [k: string]: unknown;
};
export type OpenAIToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
};
export type OpenAIMessage = {
    role: "system" | "developer" | "user" | "assistant" | "tool";
    content?: string | null | OpenAIContentPart[];
    reasoning_content?: string | null;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
};
export type OpenAITool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters?: unknown;
    };
};
export type OpenAIRequestBody = {
    model?: string;
    messages: OpenAIMessage[];
    tools?: OpenAITool[];
    stream?: boolean;
    [key: string]: unknown;
};
type Flat = {
    msgs: BiliMessage[];
    systemText: string;
};
/** Hoist the contiguous leading system/developer prefix out of the fold
 *  space (openai-chat variant of the responses codec's systemParts and the
 *  anthropic codec's top-level `system` field). The system prompt is host
 *  runtime state: its content varies across restarts (injected reminders,
 *  host-composed instructions), so keeping it inside the id space made every
 *  downstream fingerprint spanning it unstable, and a compress range that
 *  covered it removed the model's system prompt from the rebuilt wire
 *  entirely. Mid-conversation system messages (rare, host-synthetic) stay in
 *  the fold space unchanged. */
export declare function openaiToCore(body: OpenAIRequestBody): Flat;
export declare function coreToOpenai(messages: BiliMessage[]): OpenAIMessage[];
export declare function injectOpenaiSystem(messages: OpenAIMessage[], parts: string[]): OpenAIMessage[];
/** Extract the conversation dimension for OpenAI Chat: a client-provided
 *  session header if present, else a content fingerprint of the first user
 *  message. See conversationSignalAnthropic for the full rationale. */
export declare function conversationSignalOpenai(body: OpenAIRequestBody, headerValue?: string): string;
export {};
//# sourceMappingURL=openai.d.ts.map