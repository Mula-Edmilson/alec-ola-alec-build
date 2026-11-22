import assert from 'node:assert/strict';
import { conversationOnly, conversationPrompt, conversationHistory } from '../alec-modelmode.mjs';
assert.equal(conversationOnly('local', { supportsTools: true, supportsImages: true }), false);
assert.equal(conversationOnly('local', { supportsTools: false, supportsImages: false }), true);
assert.equal(conversationOnly('local', { supportsTools: true, supportsImages: false }), true);
assert.equal(conversationOnly('local', { supportsTools: false, supportsImages: true }), true);
assert.equal(conversationOnly('anthropic', { supportsTools: false, supportsImages: false }), false);
assert.deepEqual(conversationHistory([
{ role: 'user', content: 'Olá' },
{ role: 'assistant', content: [{ type: 'text', text: 'Resposta' }, { type: 'tool_call', id: 't' }] },
{ role: 'tool', content: 'Resultado' },
{ role: 'user', content: '[Summary] antigo' }
]), [{ role: 'user', content: 'Olá' }, { role: 'assistant', content: 'Resposta' }, { role: 'user', content: '[Summary] antigo' }]);
const prompt=conversationPrompt({ name: 'ALEC', user: 'Utilizador', facts: [{ text: 'Prefere português' }] });
assert.match(prompt, /SEM ferramentas/);
assert.match(prompt, /Prefere português/);
console.log('alec modelmode 0.1.49: ok');
