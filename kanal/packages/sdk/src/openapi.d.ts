export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                            service: string;
                            uptime: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ai/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    provider?: "anthropic" | "google";
                    includeDeprecated?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            models: {
                                id: string;
                                /** @enum {string} */
                                provider: "anthropic" | "google";
                                displayName: string;
                                /** @enum {string} */
                                tier: "top" | "balanced" | "fast" | "cheap" | "legacy";
                                contextWindow: number;
                                capabilities: string[];
                                inputPricePer1M: number;
                                outputPricePer1M: number;
                                cachedInputPricePer1M?: number;
                                supportsByok: boolean;
                                deprecated?: boolean;
                                replacement?: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        inboxId?: string;
                        inboxSlug?: string;
                        /**
                         * @default api
                         * @enum {string}
                         */
                        channelKind?: "whatsapp" | "email" | "api" | "web" | "mcp";
                        sender?: {
                            name?: string;
                            /** Format: email */
                            email?: string;
                            phone?: string;
                        };
                        contentText?: string;
                        contentHtml?: string;
                        contentJson?: {
                            [key: string]: unknown;
                        };
                        subject?: string;
                        metadata?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            status: "queued";
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                };
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            messages: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                inboxId: string;
                                /** Format: uuid */
                                channelId: string | null;
                                externalId: string | null;
                                /** @enum {string} */
                                direction: "inbound" | "outbound";
                                /** @enum {string} */
                                status: "received" | "processing" | "processed" | "failed" | "dead";
                                sender: {
                                    [key: string]: unknown;
                                } | null;
                                contentText: string | null;
                                contentHtml: string | null;
                                contentJson: {
                                    [key: string]: unknown;
                                } | null;
                                subject: string | null;
                                aiSummary: string | null;
                                aiClassification: {
                                    [key: string]: unknown;
                                } | null;
                                /** Format: date-time */
                                receivedAt: string;
                                /** Format: date-time */
                                processedAt: string | null;
                            }[];
                            /** Format: date-time */
                            nextCursor: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/messages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            /** Format: uuid */
                            channelId: string | null;
                            externalId: string | null;
                            /** @enum {string} */
                            direction: "inbound" | "outbound";
                            /** @enum {string} */
                            status: "received" | "processing" | "processed" | "failed" | "dead";
                            sender: {
                                [key: string]: unknown;
                            } | null;
                            contentText: string | null;
                            contentHtml: string | null;
                            contentJson: {
                                [key: string]: unknown;
                            } | null;
                            subject: string | null;
                            aiSummary: string | null;
                            aiClassification: {
                                [key: string]: unknown;
                            } | null;
                            /** Format: date-time */
                            receivedAt: string;
                            /** Format: date-time */
                            processedAt: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/messages/{id}/deliveries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            deliveries: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                destinationId: string;
                                attemptNo: number;
                                /** @enum {string} */
                                status: "pending" | "success" | "failed" | "dlq";
                                errorCode: string | null;
                                errorMessage: string | null;
                                response: {
                                    [key: string]: unknown;
                                } | null;
                                /** Format: date-time */
                                startedAt: string;
                                /** Format: date-time */
                                finishedAt: string | null;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            inboxes: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                slug: string;
                                description: string | null;
                                language: string;
                                timezone: string;
                                aiEnabled: boolean;
                                aiConfig: {
                                    modelId: string;
                                    systemPrompt?: string;
                                    maxTokens?: number;
                                    /** Format: uuid */
                                    byokSecretId?: string;
                                } | null;
                                retentionDays: number;
                                redactPii: boolean;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                archivedAt: string | null;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        slug: string;
                        description?: string;
                        /** @default en */
                        language?: string;
                        /** @default UTC */
                        timezone?: string;
                        /** @default false */
                        aiEnabled?: boolean;
                        aiConfig?: {
                            modelId: string;
                            systemPrompt?: string;
                            maxTokens?: number;
                            /** Format: uuid */
                            byokSecretId?: string;
                        };
                        /** @default 90 */
                        retentionDays?: number;
                        /** @default false */
                        redactPii?: boolean;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            slug: string;
                            description: string | null;
                            language: string;
                            timezone: string;
                            aiEnabled: boolean;
                            aiConfig: {
                                modelId: string;
                                systemPrompt?: string;
                                maxTokens?: number;
                                /** Format: uuid */
                                byokSecretId?: string;
                            } | null;
                            retentionDays: number;
                            redactPii: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            archivedAt: string | null;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            slug: string;
                            description: string | null;
                            language: string;
                            timezone: string;
                            aiEnabled: boolean;
                            aiConfig: {
                                modelId: string;
                                systemPrompt?: string;
                                maxTokens?: number;
                                /** Format: uuid */
                                byokSecretId?: string;
                            } | null;
                            retentionDays: number;
                            redactPii: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            archivedAt: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": "null" | null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: string;
                        description?: string;
                        /** @default en */
                        language?: string;
                        /** @default UTC */
                        timezone?: string;
                        /** @default false */
                        aiEnabled?: boolean;
                        aiConfig?: {
                            modelId: string;
                            systemPrompt?: string;
                            maxTokens?: number;
                            /** Format: uuid */
                            byokSecretId?: string;
                        };
                        /** @default 90 */
                        retentionDays?: number;
                        /** @default false */
                        redactPii?: boolean;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            slug: string;
                            description: string | null;
                            language: string;
                            timezone: string;
                            aiEnabled: boolean;
                            aiConfig: {
                                modelId: string;
                                systemPrompt?: string;
                                maxTokens?: number;
                                /** Format: uuid */
                                byokSecretId?: string;
                            } | null;
                            retentionDays: number;
                            redactPii: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            archivedAt: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/inboxes/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            slug: string;
                            description: string | null;
                            language: string;
                            timezone: string;
                            aiEnabled: boolean;
                            aiConfig: {
                                modelId: string;
                                systemPrompt?: string;
                                maxTokens?: number;
                                /** Format: uuid */
                                byokSecretId?: string;
                            } | null;
                            retentionDays: number;
                            redactPii: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            archivedAt: string | null;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/channels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            channels: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                inboxId: string;
                                /** @enum {string} */
                                kind: "whatsapp" | "email" | "api" | "web" | "mcp";
                                config: {
                                    [key: string]: unknown;
                                };
                                enabled: boolean;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        kind: "whatsapp" | "email" | "api" | "web" | "mcp";
                        /** @default {} */
                        config?: {
                            [key: string]: unknown;
                        };
                        /** @default true */
                        enabled?: boolean;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            /** @enum {string} */
                            kind: "whatsapp" | "email" | "api" | "web" | "mcp";
                            config: {
                                [key: string]: unknown;
                            };
                            enabled: boolean;
                            /** Format: date-time */
                            createdAt: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/channels/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": "null" | null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        config?: {
                            [key: string]: unknown;
                        };
                        enabled?: boolean;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            /** @enum {string} */
                            kind: "whatsapp" | "email" | "api" | "web" | "mcp";
                            config: {
                                [key: string]: unknown;
                            };
                            enabled: boolean;
                            /** Format: date-time */
                            createdAt: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            rules: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                inboxId: string;
                                name: string;
                                enabled: boolean;
                                priority: number;
                                definition: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                updatedAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        /** @default true */
                        enabled?: boolean;
                        /** @default 0 */
                        priority?: number;
                        definition: {
                            /** @enum {number} */
                            version: 1;
                            name: string;
                            /** @enum {string} */
                            trigger: "message.received";
                            pipeline: ({
                                id?: string;
                                match: {
                                    cel: string;
                                } | {
                                    all: unknown[];
                                } | {
                                    any: unknown[];
                                };
                                /**
                                 * @default skip
                                 * @enum {string}
                                 */
                                else?: "skip" | "stop";
                            } | {
                                transform: ({
                                    /** @enum {string} */
                                    op: "set";
                                    path: string;
                                    value?: unknown;
                                } | {
                                    /** @enum {string} */
                                    op: "redact";
                                    paths: string[];
                                } | {
                                    /** @enum {string} */
                                    op: "ai.classify";
                                    modelId?: string;
                                    schema: {
                                        [key: string]: string;
                                    };
                                    out: string;
                                } | {
                                    /** @enum {string} */
                                    op: "ai.extract";
                                    modelId?: string;
                                    schema: {
                                        [key: string]: string;
                                    };
                                    out: string;
                                } | {
                                    /** @enum {string} */
                                    op: "ai.summarize";
                                    modelId?: string;
                                    maxWords?: number;
                                    /** @default summary */
                                    out?: string;
                                })[];
                            } | {
                                route: {
                                    fanout: {
                                        destination: string;
                                        with?: {
                                            [key: string]: unknown;
                                        };
                                    }[];
                                    /**
                                     * @default fallback
                                     * @enum {string}
                                     */
                                    on_failure?: "fallback" | "continue" | "stop";
                                };
                            })[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            name: string;
                            enabled: boolean;
                            priority: number;
                            definition: {
                                [key: string]: unknown;
                            };
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/rules/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": "null" | null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: string;
                        enabled?: boolean;
                        priority?: number;
                        definition?: {
                            /** @enum {number} */
                            version: 1;
                            name: string;
                            /** @enum {string} */
                            trigger: "message.received";
                            pipeline: ({
                                id?: string;
                                match: {
                                    cel: string;
                                } | {
                                    all: unknown[];
                                } | {
                                    any: unknown[];
                                };
                                /**
                                 * @default skip
                                 * @enum {string}
                                 */
                                else?: "skip" | "stop";
                            } | {
                                transform: ({
                                    /** @enum {string} */
                                    op: "set";
                                    path: string;
                                    value?: unknown;
                                } | {
                                    /** @enum {string} */
                                    op: "redact";
                                    paths: string[];
                                } | {
                                    /** @enum {string} */
                                    op: "ai.classify";
                                    modelId?: string;
                                    schema: {
                                        [key: string]: string;
                                    };
                                    out: string;
                                } | {
                                    /** @enum {string} */
                                    op: "ai.extract";
                                    modelId?: string;
                                    schema: {
                                        [key: string]: string;
                                    };
                                    out: string;
                                } | {
                                    /** @enum {string} */
                                    op: "ai.summarize";
                                    modelId?: string;
                                    maxWords?: number;
                                    /** @default summary */
                                    out?: string;
                                })[];
                            } | {
                                route: {
                                    fanout: {
                                        destination: string;
                                        with?: {
                                            [key: string]: unknown;
                                        };
                                    }[];
                                    /**
                                     * @default fallback
                                     * @enum {string}
                                     */
                                    on_failure?: "fallback" | "continue" | "stop";
                                };
                            })[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            name: string;
                            enabled: boolean;
                            priority: number;
                            definition: {
                                [key: string]: unknown;
                            };
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/rules/{id}/dry-run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        message: {
                            /** @enum {string} */
                            channel: "whatsapp" | "email" | "api" | "web" | "mcp";
                            /** @default null */
                            subject?: string | null;
                            /** @default null */
                            contentText?: string | null;
                            /** @default null */
                            sender?: {
                                name?: string;
                                email?: string;
                                phone?: string;
                            } | null;
                            /** @default {} */
                            metadata?: {
                                [key: string]: unknown;
                            };
                            /** @default [] */
                            attachments?: {
                                filename: string;
                                mimeType: string;
                                sizeBytes: number;
                            }[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            matched: boolean;
                            derived: {
                                [key: string]: unknown;
                            };
                            tags: string[];
                            fanout: {
                                destination: string;
                                with?: {
                                    [key: string]: unknown;
                                };
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/destinations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            destinations: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                inboxId: string;
                                /** @enum {string} */
                                kind: "webhook" | "notion" | "drive" | "slack" | "discord" | "github_issue" | "email_forward" | "mcp_client" | "internal" | "api_passthrough";
                                name: string;
                                config: {
                                    [key: string]: unknown;
                                };
                                enabled: boolean;
                                retryPolicy: {
                                    maxAttempts: number;
                                    /** @enum {string} */
                                    backoff: "fixed" | "exponential";
                                    baseMs: number;
                                    maxMs: number;
                                } | null;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        kind: "webhook" | "notion" | "drive" | "slack" | "discord" | "github_issue" | "email_forward" | "mcp_client" | "internal" | "api_passthrough";
                        name: string;
                        config: {
                            [key: string]: unknown;
                        };
                        /** @default true */
                        enabled?: boolean;
                        retryPolicy?: {
                            maxAttempts: number;
                            /** @enum {string} */
                            backoff: "fixed" | "exponential";
                            baseMs: number;
                            maxMs: number;
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            /** @enum {string} */
                            kind: "webhook" | "notion" | "drive" | "slack" | "discord" | "github_issue" | "email_forward" | "mcp_client" | "internal" | "api_passthrough";
                            name: string;
                            config: {
                                [key: string]: unknown;
                            };
                            enabled: boolean;
                            retryPolicy: {
                                maxAttempts: number;
                                /** @enum {string} */
                                backoff: "fixed" | "exponential";
                                baseMs: number;
                                maxMs: number;
                            } | null;
                            /** Format: date-time */
                            createdAt: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/destinations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": "null" | null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: string;
                        config?: {
                            [key: string]: unknown;
                        };
                        enabled?: boolean;
                        retryPolicy?: {
                            maxAttempts: number;
                            /** @enum {string} */
                            backoff: "fixed" | "exponential";
                            baseMs: number;
                            maxMs: number;
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            inboxId: string;
                            /** @enum {string} */
                            kind: "webhook" | "notion" | "drive" | "slack" | "discord" | "github_issue" | "email_forward" | "mcp_client" | "internal" | "api_passthrough";
                            name: string;
                            config: {
                                [key: string]: unknown;
                            };
                            enabled: boolean;
                            retryPolicy: {
                                maxAttempts: number;
                                /** @enum {string} */
                                backoff: "fixed" | "exponential";
                                baseMs: number;
                                maxMs: number;
                            } | null;
                            /** Format: date-time */
                            createdAt: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/inboxes/{inboxId}/destinations/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inboxId: string;
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * @default {
                         *       "subject": null,
                         *       "contentText": null,
                         *       "derived": {},
                         *       "tags": []
                         *     }
                         */
                        payload?: {
                            /** @default null */
                            subject?: string | null;
                            /** @default null */
                            contentText?: string | null;
                            /** @default {} */
                            derived?: {
                                [key: string]: unknown;
                            };
                            /** @default [] */
                            tags?: string[];
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "success" | "failed";
                            errorCode?: string;
                            errorMessage?: string;
                            response: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            apiKeys: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                keyPrefix: string;
                                scopes: ("inboxes:read" | "inboxes:write" | "messages:read" | "messages:write" | "rules:read" | "rules:write" | "destinations:read" | "destinations:write" | "ai:read" | "ai:write" | "billing:read" | "audit:read" | "admin")[];
                                /** Format: date-time */
                                lastUsedAt: string | null;
                                /** Format: date-time */
                                expiresAt: string | null;
                                /** Format: date-time */
                                revokedAt: string | null;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        /**
                         * @default [
                         *       "inboxes:read",
                         *       "inboxes:write",
                         *       "messages:read",
                         *       "messages:write",
                         *       "rules:read",
                         *       "rules:write",
                         *       "destinations:read",
                         *       "destinations:write",
                         *       "ai:read",
                         *       "ai:write",
                         *       "billing:read",
                         *       "audit:read",
                         *       "admin"
                         *     ]
                         */
                        scopes?: ("inboxes:read" | "inboxes:write" | "messages:read" | "messages:write" | "rules:read" | "rules:write" | "destinations:read" | "destinations:write" | "ai:read" | "ai:write" | "billing:read" | "audit:read" | "admin")[];
                        /**
                         * @default live
                         * @enum {string}
                         */
                        env?: "live" | "test";
                        /** Format: date-time */
                        expiresAt?: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            keyPrefix: string;
                            scopes: ("inboxes:read" | "inboxes:write" | "messages:read" | "messages:write" | "rules:read" | "rules:write" | "destinations:read" | "destinations:write" | "ai:read" | "ai:write" | "billing:read" | "audit:read" | "admin")[];
                            /** Format: date-time */
                            lastUsedAt: string | null;
                            /** Format: date-time */
                            expiresAt: string | null;
                            /** Format: date-time */
                            revokedAt: string | null;
                            /** Format: date-time */
                            createdAt: string;
                            apiKey: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/api-keys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            keyPrefix: string;
                            scopes: ("inboxes:read" | "inboxes:write" | "messages:read" | "messages:write" | "rules:read" | "rules:write" | "destinations:read" | "destinations:write" | "ai:read" | "ai:write" | "billing:read" | "audit:read" | "admin")[];
                            /** Format: date-time */
                            lastUsedAt: string | null;
                            /** Format: date-time */
                            expiresAt: string | null;
                            /** Format: date-time */
                            revokedAt: string | null;
                            /** Format: date-time */
                            createdAt: string;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/secrets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            secrets: {
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                purpose: "byok_anthropic" | "byok_google" | "byok_openai" | "wa_token" | "notion_token" | "slack_token" | "generic_oauth" | "signing_secret";
                                metadata: {
                                    [key: string]: unknown;
                                } | null;
                                kmsKeyId: string;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                rotatedAt: string | null;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        purpose: "byok_anthropic" | "byok_google" | "byok_openai" | "wa_token" | "notion_token" | "slack_token" | "generic_oauth" | "signing_secret";
                        value: string;
                        metadata?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            purpose: "byok_anthropic" | "byok_google" | "byok_openai" | "wa_token" | "notion_token" | "slack_token" | "generic_oauth" | "signing_secret";
                            metadata: {
                                [key: string]: unknown;
                            } | null;
                            kmsKeyId: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            rotatedAt: string | null;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/secrets/{id}/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        value: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            purpose: "byok_anthropic" | "byok_google" | "byok_openai" | "wa_token" | "notion_token" | "slack_token" | "generic_oauth" | "signing_secret";
                            metadata: {
                                [key: string]: unknown;
                            } | null;
                            kmsKeyId: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            rotatedAt: string | null;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/secrets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": "null" | null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/whatsapp/{appId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    "hub.mode"?: string;
                    "hub.verify_token"?: string;
                    "hub.challenge"?: string;
                };
                header?: never;
                path: {
                    appId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhooks/inbound/postmark/{secret}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    secret: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        MessageID: string;
                        From: string;
                        FromName?: string;
                        FromFull?: {
                            Email: string;
                            Name?: string;
                        };
                        To?: string;
                        ToFull?: {
                            Email: string;
                            MailboxHash?: string;
                        }[];
                        Subject?: string;
                        TextBody?: string;
                        HtmlBody?: string;
                        Date?: string;
                        MailboxHash?: string;
                        OriginalRecipient?: string;
                        Headers?: {
                            Name: string;
                            Value: string;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
