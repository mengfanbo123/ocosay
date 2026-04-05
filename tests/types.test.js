"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../src/core/types");
describe('TTS Types', () => {
    describe('TTSError', () => {
        it('should create error with correct properties', () => {
            const error = new types_1.TTSError('Test error', types_1.TTSErrorCode.AUTH, 'test-provider');
            expect(error.message).toBe('Test error');
            expect(error.code).toBe(types_1.TTSErrorCode.AUTH);
            expect(error.provider).toBe('test-provider');
            expect(error.name).toBe('TTSError');
        });
        it('should include details when provided', () => {
            const details = { extra: 'info' };
            const error = new types_1.TTSError('Error', types_1.TTSErrorCode.NETWORK, 'test', details);
            expect(error.details).toEqual(details);
        });
    });
    describe('Voice', () => {
        it('should have correct structure', () => {
            const voice = {
                id: 'test-voice',
                name: 'Test Voice',
                language: 'zh-CN',
                gender: 'male'
            };
            expect(voice.id).toBe('test-voice');
            expect(voice.name).toBe('Test Voice');
            expect(voice.language).toBe('zh-CN');
            expect(voice.gender).toBe('male');
        });
    });
    describe('SpeakOptions', () => {
        it('should accept all optional parameters', () => {
            const options = {
                voice: 'voice-1',
                model: 'sync',
                speed: 1.0,
                volume: 80,
                pitch: 1.2
            };
            expect(options.voice).toBe('voice-1');
            expect(options.model).toBe('sync');
            expect(options.speed).toBe(1.0);
        });
    });
    describe('AudioResult', () => {
        it('should have correct structure for buffer', () => {
            const result = {
                audioData: Buffer.from([1, 2, 3]),
                format: 'mp3',
                isStream: false,
                duration: 5.5
            };
            expect(Buffer.isBuffer(result.audioData)).toBe(true);
            expect(result.format).toBe('mp3');
            expect(result.isStream).toBe(false);
        });
    });
});
//# sourceMappingURL=types.test.js.map