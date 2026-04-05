"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("../src/providers/base");
const types_1 = require("../src/core/types");
// 创建测试 Provider
class TestProvider extends base_1.BaseTTSProvider {
    name = 'test';
    capabilities = { speak: true };
    async doSpeak(text, voice, model) {
        return {
            audioData: Buffer.from([]),
            format: 'mp3',
            isStream: model === 'stream'
        };
    }
}
describe('Provider Registry', () => {
    beforeEach(() => {
        // 清理
        (0, base_1.unregisterProvider)('test');
    });
    it('should register provider', () => {
        const provider = new TestProvider();
        (0, base_1.registerProvider)('test', provider);
        expect((0, base_1.hasProvider)('test')).toBe(true);
    });
    it('should get registered provider', () => {
        const provider = new TestProvider();
        (0, base_1.registerProvider)('test', provider);
        const retrieved = (0, base_1.getProvider)('test');
        expect(retrieved).toBe(provider);
    });
    it('should throw when getting non-existent provider', () => {
        expect(() => (0, base_1.getProvider)('non-existent')).toThrow(types_1.TTSError);
    });
    it('should list all providers', () => {
        (0, base_1.registerProvider)('test', new TestProvider());
        const list = (0, base_1.listProviders)();
        expect(list).toContain('test');
    });
    it('should unregister provider', () => {
        (0, base_1.registerProvider)('test', new TestProvider());
        (0, base_1.unregisterProvider)('test');
        expect((0, base_1.hasProvider)('test')).toBe(false);
    });
    it('should throw when registering duplicate provider', () => {
        (0, base_1.registerProvider)('test', new TestProvider());
        expect(() => (0, base_1.registerProvider)('test', new TestProvider())).toThrow();
    });
});
describe('BaseTTSProvider', () => {
    let provider;
    beforeEach(() => {
        provider = new TestProvider();
    });
    it('should speak with options', async () => {
        const result = await provider.speak('Hello', { model: 'sync' });
        expect(result.format).toBe('mp3');
        expect(result.isStream).toBe(false);
    });
    it('should throw on empty text', async () => {
        await expect(provider.speak('')).rejects.toThrow(types_1.TTSError);
        await expect(provider.speak('   ')).rejects.toThrow(types_1.TTSError);
    });
    it('should stop without error', async () => {
        await expect(provider.stop()).resolves.toBeUndefined();
    });
});
//# sourceMappingURL=provider.test.js.map