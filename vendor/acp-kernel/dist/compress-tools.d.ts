/**
 * ACP tool surface: the tool schemas (Anthropic / OpenAI chat / Responses
 * flat), the system-prompt builders for the three protocols (function tools,
 * text triggers, hybrid), and the lenient compress-argument parser.
 *
 * Single source for every downstream that injects the ACP tools into a
 * request (the billion-context proxy on the wire; hosts via their own tool
 * registration). The content is static — no transport, no state, no host
 * types. Moved from billion-context `src/compress-tool.ts` (Phase K1).
 */
import { type Prompts } from "./prompts.js";
export declare const COMPRESS_TOOL_NAME = "compress";
export declare const DECOMPRESS_TOOL_NAME = "decompress";
export declare const SEARCH_CONTEXT_TOOL_NAME = "search_context";
export declare const ACP_STATUS_TOOL_NAME = "acp_status";
export declare const ABSORB_TOOL_NAME = "absorb";
/** Text-protocol trigger tags. The model emits these in its text output to
 *  request compression (used when host client tools cannot coexist with a
 *  declared `tools` field — e.g. OpenAI Codex code_mode). Distinct from the
 *  `<acp tokens=...>` history tags so they never collide. */
export declare const ACP_TEXT_OPEN = "<acp_compress>";
export declare const ACP_TEXT_CLOSE = "</acp_compress>";
export declare const ACP_STATUS_OPEN = "<acp_status>";
export declare const ACP_STATUS_CLOSE = "</acp_status>";
export declare const ACP_SEARCH_OPEN = "<acp_search>";
export declare const ACP_SEARCH_CLOSE = "</acp_search>";
export declare const ACP_DECOMPRESS_OPEN = "<acp_decompress>";
export declare const ACP_DECOMPRESS_CLOSE = "</acp_decompress>";
export declare const COMPRESS_TOOL: {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        topic: {
                            type: string;
                        };
                        startId: {
                            type: string;
                            description: string;
                        };
                        endId: {
                            type: string;
                            description: string;
                        };
                        summary: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
};
export type ParsedRange = {
    startRef: string;
    endRef: string;
    summary: string;
    topic?: string;
    compressCallId?: string;
};
/** Lenient parse of a compress tool-call argument object into ranges.
 *  Accepts `content` as an array or a JSON-encoded string (non-strict-tool
 *  providers stringify array args, e.g. vLLM openai-completions), a single
 *  range object at the top level, and both startId/startRef spellings.
 *  `onWarn` receives diagnostics for rejected shapes — the kernel stays
 *  side-effect free, downstream wires its logger. */
export declare function parseCompressInput(input: unknown, callId?: string, onWarn?: (message: string) => void): ParsedRange[];
export declare const COMPRESS_TOOL_OPENAI: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                topic: {
                    type: string;
                    description: string;
                };
                content: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                        properties: {
                            topic: {
                                type: string;
                            };
                            startId: {
                                type: string;
                                description: string;
                            };
                            endId: {
                                type: string;
                                description: string;
                            };
                            summary: {
                                type: string;
                                description: string;
                            };
                        };
                        required: string[];
                    };
                };
            };
            required: string[];
        };
    };
};
export declare function buildCompressSystemPrompt(prompts?: Prompts): string;
/** Text-protocol compress prompt. Used when the host (e.g. OpenAI Codex
 *  code_mode) cannot coexist with a declared `tools` array. The model emits
 *  the trigger tags in its text output instead of calling a function tool.
 *  Only compress is available via this protocol (decompress/search/status
 *  require real tools). */
export declare function buildCompressTextSystemPrompt(prompts?: Prompts): string;
/** Hybrid protocol prompt (codex): compress stays a text marker (batch + STOP
 *  is a poor fit for a single function call), while decompress/search_context/
 *  acp_status are real function tools the model calls directly. The compress
 *  loop already merges text triggers and function tool_calls, so both paths
 *  coexist in one turn. */
export declare function buildCompressHybridSystemPrompt(prompts?: Prompts): string;
export declare const DECOMPRESS_TOOL_OPENAI: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                blockId: {
                    type: string;
                    description: string;
                };
                toFile: {
                    type: string;
                    description: string;
                };
                full: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
};
export declare const SEARCH_CONTEXT_TOOL_OPENAI: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                query: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
};
export declare const ACP_STATUS_TOOL_OPENAI: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
    };
};
export declare const ACP_TOOLS_OPENAI: readonly [{
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                topic: {
                    type: string;
                    description: string;
                };
                content: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                        properties: {
                            topic: {
                                type: string;
                            };
                            startId: {
                                type: string;
                                description: string;
                            };
                            endId: {
                                type: string;
                                description: string;
                            };
                            summary: {
                                type: string;
                                description: string;
                            };
                        };
                        required: string[];
                    };
                };
            };
            required: string[];
        };
    };
}, {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                blockId: {
                    type: string;
                    description: string;
                };
                toFile: {
                    type: string;
                    description: string;
                };
                full: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
}, {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                query: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
}, {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
    };
}];
/** Anthropic-format tools (name + description + input_schema). The Anthropic
 *  request path (ZCode, Claude Code) injects all four so the model can
 *  actually call compress/decompress/search_context/acp_status — the system
 *  prompt describes all four, so declaring only COMPRESS_TOOL left the model
 *  able to see the docs but unable to call the rest. */
export declare const DECOMPRESS_TOOL: {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            blockId: {
                type: string;
                description: string;
            };
            toFile: {
                type: string;
                description: string;
            };
            full: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const SEARCH_CONTEXT_TOOL: {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const ACP_STATUS_TOOL: {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {};
    };
};
export declare const ACP_TOOLS_ANTHROPIC: readonly [{
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        topic: {
                            type: string;
                        };
                        startId: {
                            type: string;
                            description: string;
                        };
                        endId: {
                            type: string;
                            description: string;
                        };
                        summary: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
}, {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            blockId: {
                type: string;
                description: string;
            };
            toFile: {
                type: string;
                description: string;
            };
            full: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}, {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}, {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {};
    };
}];
export declare const COMPRESS_TOOL_RESPONSES: {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        topic: {
                            type: string;
                        };
                        startId: {
                            type: string;
                            description: string;
                        };
                        endId: {
                            type: string;
                            description: string;
                        };
                        summary: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
};
export declare const DECOMPRESS_TOOL_RESPONSES: {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            blockId: {
                type: string;
                description: string;
            };
            toFile: {
                type: string;
                description: string;
            };
            full: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const SEARCH_CONTEXT_TOOL_RESPONSES: {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const ACP_STATUS_TOOL_RESPONSES: {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {};
    };
};
/** All ACP tools in Responses API flat format, matching ACP_TOOL_NAMES. */
export declare const ACP_TOOLS_RESPONSES: readonly [{
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            topic: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        topic: {
                            type: string;
                        };
                        startId: {
                            type: string;
                            description: string;
                        };
                        endId: {
                            type: string;
                            description: string;
                        };
                        summary: {
                            type: string;
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
}, {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            blockId: {
                type: string;
                description: string;
            };
            toFile: {
                type: string;
                description: string;
            };
            full: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}, {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}, {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {};
    };
}];
/** Read-only ACP tools (no compress) in Responses flat format. Used for the
 *  hybrid protocol (codex): compress stays a text marker (batch + STOP), while
 *  decompress/search_context/acp_status are injected as real function tools so
 *  the model can call them directly instead of emitting text triggers.
 *  Empirically (direct comfly A/B) declaring these tools does NOT disable
 *  codex code_mode — the earlier "tools can't coexist" assumption was wrong. */
export declare const ACP_READONLY_TOOLS_RESPONSES: readonly [{
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            blockId: {
                type: string;
                description: string;
            };
            toFile: {
                type: string;
                description: string;
            };
            full: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}, {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}, {
    type: "function";
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {};
    };
}];
/** All ACP tool names (dynamic membership — Set, not a static record). Does
 *  NOT include absorb: it is opt-in (config.absorb.enabled) and hosts only
 *  register/inject it when the feature is on. */
export declare const ACP_TOOL_NAMES: ReadonlySet<string>;
/** compress/decompress: mutate history → must drive the compress loop (their
 *  result is folded into the request before the model continues). */
export declare const ACP_MUTATING_TOOLS: ReadonlySet<string>;
/** acp_status/search_context: read-only → must NOT loop. Looping them made the
 *  model re-call until the 5× limit and discarded the whole turn. */
export declare const ACP_READONLY_TOOLS: ReadonlySet<string>;
/** Opt-in absorb tool (instant tool-result absorption). Inject/register only
 *  when config.absorb.enabled — NOT part of ACP_TOOLS_* arrays. */
export declare const ABSORB_TOOL_DESCRIPTION = "Distill a tool result into a compact summary you write. REQUIRED immediately after a tool result ends with an [ACP absorb] instruction: pass its ref and the distilled essentials (outcome, key values, paths:lines, errors, decisions). The original output is then removed from context; your summary is the durable record.";
export declare const ABSORB_TOOL: {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            ref: {
                type: string;
                description: string;
            };
            summary: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const ABSORB_TOOL_OPENAI: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: {
                ref: {
                    type: string;
                    description: string;
                };
                summary: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
};
//# sourceMappingURL=compress-tools.d.ts.map