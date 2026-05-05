export class Cache {
    private static instance: Cache;
    private storage: Map<string, { data: any, expiry: number }> = new Map();

    private constructor() { }

    public static getInstance(): Cache {
        if (!Cache.instance) {
            Cache.instance = new Cache();
        }
        return Cache.instance;
    }

    public set(key: string, data: any, ttlMinutes: number = 5): void {
        const expiry = Date.now() + (ttlMinutes * 60 * 1000);
        this.storage.set(key, { data, expiry });
    }

    public get(key: string): any | null {
        const entry = this.storage.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiry) {
            this.storage.delete(key);
            return null;
        }

        return entry.data;
    }

    public clear(): void {
        this.storage.clear();
    }
}