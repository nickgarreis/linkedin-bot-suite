export declare const CONFIG: {
    readonly server: {
        readonly port: number;
        readonly host: string;
        readonly env: string;
    };
    readonly auth: {
        readonly jwtSecret: string;
        readonly apiKeyHeader: string;
    };
    readonly redis: {
        readonly url: string;
    };
    readonly bullmq: {
        readonly queueName: string;
        readonly prefix: string;
    };
    readonly supabase: {
        readonly url: string;
        readonly serviceRoleKey: string;
    };
    readonly cors: {
        readonly origin: string[];
        readonly credentials: true;
    };
    readonly logging: {
        readonly level: string;
    };
};
export declare const validateConfig: () => void;
