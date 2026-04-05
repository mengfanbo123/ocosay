"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const speaker_1 = require("../src/core/speaker");
const types_1 = require("../src/core/types");
const base_1 = require("../src/providers/base");
// Mock Provider
class MockProvider extends base_1.BaseTTSProvider {
    name = 'mock';
    capabilities = { speak: true, stream: true };
    async doSpeak(text, voice, model) {
        return {
            audioData: Buffer.from([1, 2, 3]),
            format: 'mp3',
            isStream: model === 'stream',
            duration: 1.0
        };
    }
}
describe('Speaker', () => {
    let speaker;
    beforeEach(() => {
        (0, base_1.registerProvider)('mock', new MockProvider());
        speaker = new speaker_1.Speaker({ defaultProvider: 'mock' });
    });
    afterEach(() => {
        (0, base_1.unregisterProvider)('mock');
    });
    describe('initialization', () => {
        it('should create speaker with options', () => {
            const s = new speaker_1.Speaker({ defaultProvider: 'mock', defaultModel: 'sync' });
            expect(s.getProviders()).toContain('mock');
        });
    });
    describe('speak', () => {
        it('should throw on empty text', async () => {
            await expect(speaker.speak('')).rejects.toThrow(types_1.TTSError);
        });
    });
    describe('control methods', () => {
        it('should pause without error', () => {
            expect(() => speaker.pause()).not.toThrow();
        });
        it('should resume without error', () => {
            expect(() => speaker.resume()).not.toThrow();
        });
        it('should stop without error', async () => {
            await expect(speaker.stop()).resolves.toBeUndefined();
        });
    });
    describe('listVoices', () => {
        it('should return voices from provider', async () => {
            const voices = await speaker.listVoices('mock');
            expect(Array.isArray(voices)).toBe(true);
        });
    });
    describe('getCapabilities', () => {
        it('should return provider capabilities', () => {
            const caps = speaker.getCapabilities('mock');
            expect(caps.speak).toBe(true);
        });
    });
});
//# sourceMappingURL=speaker.test.js.map